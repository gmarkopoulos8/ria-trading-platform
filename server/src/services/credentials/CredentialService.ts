import { prisma } from '../../lib/prisma';
import { encryptIfPresent, decryptIfPresent } from '../../lib/encryption';

export interface HLCredentials {
  walletAddress: string;
  agentPrivateKey: string | null;
  isMainnet: boolean;
  dryRun: boolean;
  maxDrawdownPct: number;
  defaultLeverage: number;
  source: 'database' | 'env';
}

export interface TOSCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken: string;
  accountNumber: string;
  dryRun: boolean;
  maxDrawdownPct: number;
  source: 'database' | 'env';
}

export interface ConnectionStatus {
  isConnected: boolean;
  lastVerifiedAt: Date | null;
  lastError: string | null;
  source: 'database' | 'env' | 'none';
  dryRun: boolean;
  walletAddress?: string;
  accountNumber?: string;
  isMainnet?: boolean;
}

class CredentialService {
  async getHLCredentials(userId: string): Promise<HLCredentials | null> {
    try {
      const rec = await prisma.exchangeCredential.findUnique({
        where: { userId_exchange: { userId, exchange: 'hyperliquid' } },
      });

      if (rec && rec.walletAddress) {
        return {
          walletAddress: rec.walletAddress,
          agentPrivateKey: decryptIfPresent(rec.encryptedAgentKey),
          isMainnet: rec.isMainnet,
          dryRun: rec.dryRun,
          maxDrawdownPct: rec.maxDrawdownPct,
          defaultLeverage: rec.defaultLeverage,
          source: 'database',
        };
      }
    } catch (err) {
      console.warn('[CredentialService] Error reading HL credentials from DB:', (err as Error).message);
    }

    const walletAddress = process.env.HL_WALLET_ADDRESS;
    if (walletAddress) {
      return {
        walletAddress,
        agentPrivateKey: process.env.HL_AGENT_PRIVATE_KEY ?? null,
        isMainnet: process.env.HL_TESTNET !== 'true',
        dryRun: process.env.HL_DRY_RUN !== 'false',
        maxDrawdownPct: parseFloat(process.env.HL_MAX_DRAWDOWN_PCT ?? '5'),
        defaultLeverage: parseInt(process.env.HL_DEFAULT_LEVERAGE ?? '3'),
        source: 'env',
      };
    }

    return null;
  }

  async getTOSCredentials(userId: string): Promise<TOSCredentials | null> {
    try {
      const rec = await prisma.exchangeCredential.findUnique({
        where: { userId_exchange: { userId, exchange: 'tos' } },
      });

      if (rec && rec.clientId) {
        return {
          clientId: rec.clientId,
          clientSecret: decryptIfPresent(rec.encryptedSecret) ?? '',
          redirectUri: rec.redirectUri ?? 'https://127.0.0.1',
          refreshToken: decryptIfPresent(rec.encryptedRefreshToken) ?? '',
          accountNumber: rec.accountNumber ?? '',
          dryRun: rec.dryRun,
          maxDrawdownPct: rec.maxDrawdownPct,
          source: 'database',
        };
      }
    } catch (err) {
      console.warn('[CredentialService] Error reading TOS credentials from DB:', (err as Error).message);
    }

    const clientId = process.env.SCHWAB_CLIENT_ID;
    if (clientId) {
      return {
        clientId,
        clientSecret: process.env.SCHWAB_CLIENT_SECRET ?? '',
        redirectUri: process.env.SCHWAB_REDIRECT_URI ?? 'https://127.0.0.1',
        refreshToken: process.env.SCHWAB_REFRESH_TOKEN ?? '',
        accountNumber: process.env.SCHWAB_ACCOUNT_NUMBER ?? '',
        dryRun: process.env.SCHWAB_DRY_RUN !== 'false',
        maxDrawdownPct: parseFloat(process.env.SCHWAB_MAX_DRAWDOWN_PCT ?? '5'),
        source: 'env',
      };
    }

    return null;
  }

  async saveHLCredentials(userId: string, creds: {
    walletAddress: string;
    agentPrivateKey: string;
    isMainnet: boolean;
    dryRun?: boolean;
    maxDrawdownPct?: number;
    defaultLeverage?: number;
  }): Promise<void> {
    await prisma.exchangeCredential.upsert({
      where: { userId_exchange: { userId, exchange: 'hyperliquid' } },
      create: {
        userId,
        exchange: 'hyperliquid',
        walletAddress: creds.walletAddress,
        encryptedAgentKey: encryptIfPresent(creds.agentPrivateKey),
        isMainnet: creds.isMainnet,
        dryRun: creds.dryRun ?? true,
        maxDrawdownPct: creds.maxDrawdownPct ?? 5,
        defaultLeverage: creds.defaultLeverage ?? 2,
        isConnected: false,
      },
      update: {
        walletAddress: creds.walletAddress,
        encryptedAgentKey: encryptIfPresent(creds.agentPrivateKey),
        isMainnet: creds.isMainnet,
        dryRun: creds.dryRun ?? true,
        maxDrawdownPct: creds.maxDrawdownPct ?? 5,
        defaultLeverage: creds.defaultLeverage ?? 2,
        isConnected: false,
      },
    });
  }

  async saveTOSCredentials(userId: string, creds: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    refreshToken: string;
    accountNumber: string;
    dryRun?: boolean;
    maxDrawdownPct?: number;
  }): Promise<void> {
    await prisma.exchangeCredential.upsert({
      where: { userId_exchange: { userId, exchange: 'tos' } },
      create: {
        userId,
        exchange: 'tos',
        clientId: creds.clientId,
        encryptedSecret: encryptIfPresent(creds.clientSecret),
        redirectUri: creds.redirectUri,
        encryptedRefreshToken: encryptIfPresent(creds.refreshToken),
        accountNumber: creds.accountNumber,
        dryRun: creds.dryRun ?? true,
        maxDrawdownPct: creds.maxDrawdownPct ?? 5,
        isConnected: false,
      },
      update: {
        clientId: creds.clientId,
        encryptedSecret: encryptIfPresent(creds.clientSecret),
        redirectUri: creds.redirectUri,
        encryptedRefreshToken: encryptIfPresent(creds.refreshToken),
        accountNumber: creds.accountNumber,
        dryRun: creds.dryRun ?? true,
        maxDrawdownPct: creds.maxDrawdownPct ?? 5,
        isConnected: false,
      },
    });
  }

  async updateTOSRefreshToken(userId: string, newRefreshToken: string): Promise<void> {
    await prisma.exchangeCredential.updateMany({
      where: { userId, exchange: 'tos' },
      data: { encryptedRefreshToken: encryptIfPresent(newRefreshToken) },
    });
  }

  async markConnected(userId: string, exchange: string, error?: string): Promise<void> {
    await prisma.exchangeCredential.updateMany({
      where: { userId, exchange },
      data: {
        isConnected: !error,
        lastVerifiedAt: new Date(),
        lastError: error ?? null,
      },
    });
  }

  async deleteCredentials(userId: string, exchange: string): Promise<void> {
    await prisma.exchangeCredential.deleteMany({
      where: { userId, exchange },
    });
  }

  async updateHLSettings(userId: string, settings: { dryRun?: boolean; maxDrawdownPct?: number; defaultLeverage?: number }): Promise<void> {
    await prisma.exchangeCredential.updateMany({
      where: { userId, exchange: 'hyperliquid' },
      data: settings,
    });
  }

  async updateTOSSettings(userId: string, settings: { dryRun?: boolean; maxDrawdownPct?: number }): Promise<void> {
    await prisma.exchangeCredential.updateMany({
      where: { userId, exchange: 'tos' },
      data: settings,
    });
  }

  async getConnectionStatus(userId: string): Promise<{ hl: ConnectionStatus; tos: ConnectionStatus }> {
    const [hlRec, tosRec] = await Promise.all([
      prisma.exchangeCredential.findUnique({ where: { userId_exchange: { userId, exchange: 'hyperliquid' } } }).catch(() => null),
      prisma.exchangeCredential.findUnique({ where: { userId_exchange: { userId, exchange: 'tos' } } }).catch(() => null),
    ]);

    const hlEnv = process.env.HL_WALLET_ADDRESS;
    const tosEnv = process.env.SCHWAB_CLIENT_ID;

    const hl: ConnectionStatus = hlRec
      ? {
          isConnected: hlRec.isConnected,
          lastVerifiedAt: hlRec.lastVerifiedAt,
          lastError: hlRec.lastError,
          source: 'database',
          dryRun: hlRec.dryRun,
          walletAddress: hlRec.walletAddress ? `...${hlRec.walletAddress.slice(-6)}` : undefined,
          isMainnet: hlRec.isMainnet,
        }
      : hlEnv
      ? {
          isConnected: true,
          lastVerifiedAt: null,
          lastError: null,
          source: 'env',
          dryRun: process.env.HL_DRY_RUN !== 'false',
          walletAddress: `...${hlEnv.slice(-6)}`,
          isMainnet: process.env.HL_TESTNET !== 'true',
        }
      : { isConnected: false, lastVerifiedAt: null, lastError: null, source: 'none', dryRun: true };

    const tos: ConnectionStatus = tosRec
      ? {
          isConnected: tosRec.isConnected,
          lastVerifiedAt: tosRec.lastVerifiedAt,
          lastError: tosRec.lastError,
          source: 'database',
          dryRun: tosRec.dryRun,
          accountNumber: tosRec.accountNumber ? `...${tosRec.accountNumber.slice(-4)}` : undefined,
        }
      : tosEnv
      ? {
          isConnected: true,
          lastVerifiedAt: null,
          lastError: null,
          source: 'env',
          dryRun: process.env.SCHWAB_DRY_RUN !== 'false',
          accountNumber: process.env.SCHWAB_ACCOUNT_NUMBER ? `...${process.env.SCHWAB_ACCOUNT_NUMBER.slice(-4)}` : undefined,
        }
      : { isConnected: false, lastVerifiedAt: null, lastError: null, source: 'none', dryRun: true };

    return { hl, tos };
  }
}

export const credentialService = new CredentialService();
