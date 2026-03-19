/**
 * Schwab OAuth 2.0 Token Manager
 *
 * Access tokens expire in 30 minutes.
 * Refresh tokens expire in 7 days.
 *
 * This service auto-refreshes the access token before every API call.
 * Store SCHWAB_REFRESH_TOKEN in Replit Secrets after completing the
 * one-time OAuth flow (see GET /api/tos/auth/url to start it).
 */

import axios from 'axios';
import { TOS_CONFIG } from './tosConfig';

interface TokenSet {
  accessToken:  string;
  tokenType:    string;
  expiresAt:    number;
  scope:        string;
  refreshToken?: string;
}

let _tokenSet: TokenSet | null = null;

function basicAuth(): string {
  const encoded = Buffer.from(`${TOS_CONFIG.CLIENT_ID}:${TOS_CONFIG.CLIENT_SECRET}`).toString('base64');
  return `Basic ${encoded}`;
}

export async function refreshAccessToken(): Promise<string> {
  const refreshToken = TOS_CONFIG.REFRESH_TOKEN;
  if (!refreshToken) throw new Error('SCHWAB_REFRESH_TOKEN not configured. Complete OAuth flow first via GET /api/tos/auth/url');

  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
  });

  const { data } = await axios.post(TOS_CONFIG.TOKEN_URL, params.toString(), {
    headers: {
      Authorization:  basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: TOS_CONFIG.REQUEST_TIMEOUT_MS,
  });

  _tokenSet = {
    accessToken:  data.access_token,
    tokenType:    data.token_type,
    expiresAt:    Date.now() + (data.expires_in - 60) * 1000,
    scope:        data.scope ?? '',
    refreshToken: data.refresh_token ?? undefined,
  };

  if (data.refresh_token) {
    console.info('[TOS-Auth] Received new refresh token — persisting to database');
    try {
      const { prisma } = await import('../../lib/prisma');
      const { encryptIfPresent } = await import('../../lib/encryption');
      const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
      if (firstUser) {
        await prisma.exchangeCredential.updateMany({
          where: { userId: firstUser.id, exchange: 'tos' },
          data: { encryptedRefreshToken: encryptIfPresent(data.refresh_token) },
        });
      }
    } catch (persistErr) {
      console.warn('[TOS-Auth] Could not persist refresh token:', (persistErr as Error).message);
    }
  }

  console.info('[TOS-Auth] Access token refreshed, valid for ~30m');
  return _tokenSet.accessToken;
}

export async function getValidAccessToken(): Promise<string> {
  if (_tokenSet && Date.now() < _tokenSet.expiresAt) {
    return _tokenSet.accessToken;
  }
  return refreshAccessToken();
}

export function buildAuthUrl(): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     TOS_CONFIG.CLIENT_ID,
    redirect_uri:  TOS_CONFIG.REDIRECT_URI,
    scope:         'readonly',
  });
  return `https://api.schwabapi.com/v1/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{ accessToken: string; refreshToken: string }> {
  const params = new URLSearchParams({
    grant_type:   'authorization_code',
    code,
    redirect_uri: TOS_CONFIG.REDIRECT_URI,
  });

  const { data } = await axios.post(TOS_CONFIG.TOKEN_URL, params.toString(), {
    headers: {
      Authorization:  basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: TOS_CONFIG.REQUEST_TIMEOUT_MS,
  });

  _tokenSet = {
    accessToken:  data.access_token,
    tokenType:    data.token_type,
    expiresAt:    Date.now() + (data.expires_in - 60) * 1000,
    scope:        data.scope ?? '',
    refreshToken: data.refresh_token,
  };

  console.info('[TOS-Auth] Tokens obtained via code exchange. Store the refresh_token as SCHWAB_REFRESH_TOKEN.');
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

export function getTokenInfo() {
  if (!_tokenSet) return { hasToken: false };
  return {
    hasToken:    true,
    expiresIn:   Math.max(0, Math.round((_tokenSet.expiresAt - Date.now()) / 1000)),
    scope:       _tokenSet.scope,
    tokenType:   _tokenSet.tokenType,
  };
}
