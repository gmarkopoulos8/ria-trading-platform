import { prisma } from '../../lib/prisma';
import { credentialService } from './CredentialService';
import { setHLRuntimeCredentials } from '../hyperliquid/hyperliquidConfig';
import { setTOSRuntimeCredentials } from '../tos/tosConfig';

export async function loadDefaultCredentials(): Promise<void> {
  try {
    const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!firstUser) return;

    const hlCreds = await credentialService.getHLCredentials(firstUser.id);
    if (hlCreds && hlCreds.source === 'database') {
      setHLRuntimeCredentials({
        walletAddress: hlCreds.walletAddress,
        agentPrivateKey: hlCreds.agentPrivateKey ?? undefined,
        isMainnet: hlCreds.isMainnet,
        dryRun: hlCreds.dryRun,
        maxDrawdownPct: hlCreds.maxDrawdownPct,
        defaultLeverage: hlCreds.defaultLeverage,
      });
    }

    const tosCreds = await credentialService.getTOSCredentials(firstUser.id);
    if (tosCreds && tosCreds.source === 'database') {
      const tosRec = await prisma.exchangeCredential.findUnique({
        where: { userId_exchange: { userId: firstUser.id, exchange: 'tos' } },
      });
      setTOSRuntimeCredentials({
        clientId: tosCreds.clientId,
        clientSecret: tosCreds.clientSecret,
        redirectUri: tosCreds.redirectUri,
        refreshToken: tosCreds.refreshToken,
        accountNumber: tosCreds.accountNumber,
        dryRun: tosCreds.dryRun,
        maxDrawdownPct: tosCreds.maxDrawdownPct,
        viewAccountNumber: tosRec?.viewAccountNumber ?? undefined,
        autoTradeAccountNumber: tosRec?.autoTradeAccountNumber ?? undefined,
      });
    }

    console.info('[CredentialLoader] Exchange credentials loaded from database');
  } catch (err) {
    console.warn('[CredentialLoader] Could not load credentials from DB:', (err as Error).message);
  }
}
