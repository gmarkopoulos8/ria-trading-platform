import { prisma } from '../../lib/prisma';
import { credentialService } from './CredentialService';
import { setHLRuntimeCredentials } from '../hyperliquid/hyperliquidConfig';
import { setTOSRuntimeCredentials } from '../tos/tosConfig';
import { setAlpacaRuntimeCredentials } from '../alpaca/alpacaConfig';

async function attemptLoad(): Promise<boolean> {
  const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!firstUser) return false;

  const [hlCreds, tosCreds, alpacaCreds] = await Promise.allSettled([
    credentialService.getHLCredentials(firstUser.id),
    credentialService.getTOSCredentials(firstUser.id),
    credentialService.getAlpacaCredentials(firstUser.id),
  ]);

  if (hlCreds.status === 'fulfilled' && hlCreds.value && hlCreds.value.source === 'database') {
    const v = hlCreds.value;
    setHLRuntimeCredentials({
      walletAddress:  v.walletAddress,
      agentPrivateKey: v.agentPrivateKey ?? undefined,
      isMainnet:      v.isMainnet,
      dryRun:         v.dryRun,
      maxDrawdownPct: v.maxDrawdownPct,
      defaultLeverage: v.defaultLeverage,
    });
  }

  if (tosCreds.status === 'fulfilled' && tosCreds.value && tosCreds.value.source === 'database') {
    const v = tosCreds.value;
    const tosRec = await prisma.exchangeCredential.findUnique({
      where: { userId_exchange: { userId: firstUser.id, exchange: 'tos' } },
    });
    setTOSRuntimeCredentials({
      clientId:               v.clientId,
      clientSecret:           v.clientSecret,
      redirectUri:            v.redirectUri,
      refreshToken:           v.refreshToken,
      accountNumber:          v.accountNumber,
      dryRun:                 v.dryRun,
      maxDrawdownPct:         v.maxDrawdownPct,
      viewAccountNumber:      tosRec?.viewAccountNumber ?? undefined,
      autoTradeAccountNumber: tosRec?.autoTradeAccountNumber ?? undefined,
    });
  }

  if (alpacaCreds.status === 'fulfilled' && alpacaCreds.value) {
    setAlpacaRuntimeCredentials(alpacaCreds.value);
    console.info('[CredentialLoader] ✅ Alpaca credentials loaded');
  }

  return true;
}

export async function loadDefaultCredentials(): Promise<void> {
  const MAX_ATTEMPTS = 5;
  const DELAY_MS     = 2_000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const loaded = await attemptLoad();
      if (loaded) {
        console.info('[CredentialLoader] Exchange credentials loaded from database');
        return;
      }
      console.info('[CredentialLoader] No users found — skipping credential load');
      return;
    } catch (err: any) {
      if (attempt === MAX_ATTEMPTS) {
        console.warn(`[CredentialLoader] Could not load credentials after ${MAX_ATTEMPTS} attempts:`, err?.message);
        return;
      }
      console.warn(`[CredentialLoader] Attempt ${attempt} failed, retrying in ${DELAY_MS}ms:`, err?.message);
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
}
