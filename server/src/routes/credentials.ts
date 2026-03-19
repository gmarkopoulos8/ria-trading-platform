import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { credentialService } from '../services/credentials/CredentialService';
import { loadDefaultCredentials } from '../services/credentials/CredentialLoader';
import { setHLRuntimeCredentials, clearHLRuntimeCredentials } from '../services/hyperliquid/hyperliquidConfig';
import { setTOSRuntimeCredentials, clearTOSRuntimeCredentials } from '../services/tos/tosConfig';
import { isEncryptionConfigured } from '../lib/encryption';

const router = Router();

async function getUserState() {
  const { getUserState: _getUserState } = await import('../services/hyperliquid/hyperliquidInfoService');
  return _getUserState();
}

async function getPrimaryAccount() {
  try {
    const { getPrimaryAccount: _get } = await import('../services/tos/tosAccountService');
    return _get();
  } catch {
    return null;
  }
}

async function exchangeCodeForTokens(code: string) {
  const { exchangeCodeForTokens: _exchange } = await import('../services/tos/tosAuthService');
  return _exchange(code);
}

router.post('/hl/connect', requireAuth, async (req, res) => {
  const {
    walletAddress,
    agentPrivateKey,
    isMainnet = true,
    dryRun = true,
    maxDrawdownPct = 8,
    defaultLeverage = 2,
  } = req.body;

  if (!walletAddress?.startsWith('0x') || walletAddress.length !== 42) {
    return res.status(400).json({ success: false, error: 'Invalid wallet address. Must be a 42-character address starting with 0x.' });
  }
  if (!agentPrivateKey?.startsWith('0x') || agentPrivateKey.length !== 66) {
    return res.status(400).json({ success: false, error: 'Invalid private key. Must be 66 characters starting with 0x.' });
  }

  try {
    setHLRuntimeCredentials({ walletAddress, agentPrivateKey, isMainnet, dryRun: true });

    let accountValue = 0;
    try {
      const userState = await getUserState();
      accountValue = parseFloat((userState as any)?.marginSummary?.accountValue ?? '0') || 0;
    } catch (verifyErr) {
      clearHLRuntimeCredentials();
      await loadDefaultCredentials();
      const msg = verifyErr instanceof Error ? verifyErr.message : 'Could not verify connection to Hyperliquid';
      return res.status(400).json({ success: false, error: `Connection failed: ${msg}` });
    }

    await credentialService.saveHLCredentials(req.session.userId!, {
      walletAddress, agentPrivateKey, isMainnet, dryRun, maxDrawdownPct, defaultLeverage,
    });

    await loadDefaultCredentials();
    await credentialService.markConnected(req.session.userId!, 'hyperliquid');

    return res.json({
      success: true,
      data: {
        message: 'Hyperliquid connected successfully',
        accountValue,
        walletAddress: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
        isMainnet,
        dryRun,
      },
    });
  } catch (err) {
    clearHLRuntimeCredentials();
    await loadDefaultCredentials();
    const msg = err instanceof Error ? err.message : 'Connection failed';
    await credentialService.markConnected(req.session.userId!, 'hyperliquid', msg).catch(() => {});
    return res.status(400).json({ success: false, error: `Connection failed: ${msg}` });
  }
});

router.post('/hl/disconnect', requireAuth, async (req, res) => {
  try {
    await credentialService.deleteCredentials(req.session.userId!, 'hyperliquid');
    clearHLRuntimeCredentials();
    await loadDefaultCredentials();
    return res.json({ success: true, data: { message: 'Hyperliquid disconnected' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/hl/status', requireAuth, async (req, res) => {
  try {
    const status = await credentialService.getConnectionStatus(req.session.userId!);
    return res.json({ success: true, data: status.hl });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.patch('/hl/settings', requireAuth, async (req, res) => {
  try {
    const { dryRun, maxDrawdownPct, defaultLeverage } = req.body;
    await credentialService.updateHLSettings(req.session.userId!, { dryRun, maxDrawdownPct, defaultLeverage });
    await loadDefaultCredentials();
    return res.json({ success: true, data: { message: 'Settings updated' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.post('/tos/auth-url', requireAuth, async (req, res) => {
  const { clientId, clientSecret, redirectUri = 'https://127.0.0.1' } = req.body;

  if (!clientId || !clientSecret) {
    return res.status(400).json({ success: false, error: 'App Key and App Secret are required' });
  }

  (req.session as any).pendingTosAuth = { clientId, clientSecret, redirectUri };

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'readonly trader',
  });
  const authUrl = `https://api.schwabapi.com/v1/oauth/authorize?${params.toString()}`;

  return res.json({ success: true, data: { authUrl } });
});

router.post('/tos/connect', requireAuth, async (req, res) => {
  const { authorizationCode, accountNumber } = req.body;
  const pending = (req.session as any).pendingTosAuth;

  if (!pending) {
    return res.status(400).json({ success: false, error: 'Start the OAuth flow first via /tos/auth-url' });
  }
  if (!authorizationCode) {
    return res.status(400).json({ success: false, error: 'Authorization code is required' });
  }
  if (!accountNumber) {
    return res.status(400).json({ success: false, error: 'Account number is required' });
  }

  try {
    setTOSRuntimeCredentials({
      clientId: pending.clientId,
      clientSecret: pending.clientSecret,
      redirectUri: pending.redirectUri,
      refreshToken: '',
      accountNumber,
      dryRun: true,
    });

    const tokens = await exchangeCodeForTokens(authorizationCode);

    let equity = 0;
    try {
      const account = await getPrimaryAccount();
      equity = (account as any)?.securitiesAccount?.currentBalances?.equity ?? 0;
    } catch {}

    await credentialService.saveTOSCredentials(req.session.userId!, {
      clientId: pending.clientId,
      clientSecret: pending.clientSecret,
      redirectUri: pending.redirectUri,
      refreshToken: tokens.refreshToken,
      accountNumber,
      dryRun: true,
    });

    delete (req.session as any).pendingTosAuth;

    await loadDefaultCredentials();
    await credentialService.markConnected(req.session.userId!, 'tos');

    return res.json({
      success: true,
      data: {
        message: 'ThinkorSwim connected successfully',
        accountNumber: `...${accountNumber.slice(-4)}`,
        equity,
        dryRun: true,
      },
    });
  } catch (err) {
    clearTOSRuntimeCredentials();
    await loadDefaultCredentials();
    const msg = err instanceof Error ? err.message : 'Connection failed';
    await credentialService.markConnected(req.session.userId!, 'tos', msg).catch(() => {});
    return res.status(400).json({ success: false, error: `Connection failed: ${msg}` });
  }
});

router.post('/tos/disconnect', requireAuth, async (req, res) => {
  try {
    await credentialService.deleteCredentials(req.session.userId!, 'tos');
    clearTOSRuntimeCredentials();
    await loadDefaultCredentials();
    return res.json({ success: true, data: { message: 'ThinkorSwim disconnected' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/tos/status', requireAuth, async (req, res) => {
  try {
    const status = await credentialService.getConnectionStatus(req.session.userId!);
    return res.json({ success: true, data: status.tos });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.patch('/tos/settings', requireAuth, async (req, res) => {
  try {
    const { dryRun, maxDrawdownPct } = req.body;
    await credentialService.updateTOSSettings(req.session.userId!, { dryRun, maxDrawdownPct });
    await loadDefaultCredentials();
    return res.json({ success: true, data: { message: 'Settings updated' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/status', requireAuth, async (req, res) => {
  try {
    const status = await credentialService.getConnectionStatus(req.session.userId!);

    let hlBalance: number | null = null;
    let tosBalance: number | null = null;

    if (status.hl.isConnected) {
      try {
        const userState = await getUserState();
        hlBalance = parseFloat((userState as any)?.marginSummary?.accountValue ?? '0') || null;
      } catch {}
    }

    if (status.tos.isConnected) {
      try {
        const account = await getPrimaryAccount();
        tosBalance = (account as any)?.securitiesAccount?.currentBalances?.equity ?? null;
      } catch {}
    }

    return res.json({
      success: true,
      data: {
        hyperliquid: { ...status.hl, accountValue: hlBalance },
        tos: { ...status.tos, equity: tosBalance },
        encryptionConfigured: isEncryptionConfigured(),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
