/**
 * Schwab / ThinkorSwim REST API Routes
 *
 * All routes require authentication (session cookie).
 * Base path: /api/tos
 *
 * Endpoints:
 *   GET  /auth/url            → OAuth authorization URL (one-time setup)
 *   POST /auth/callback        → Exchange code for tokens
 *   GET  /auth/token           → Token info (expiry, scope)
 *   GET  /status               → Account summary + killswitch state
 *   GET  /account              → Full account detail (balances, positions, orders)
 *   GET  /positions            → Open positions only
 *   GET  /orders               → Open orders
 *   GET  /orders/all           → All orders (last 30 days)
 *   GET  /quotes               → Real-time quotes for comma-separated symbols
 *   POST /orders               → Place order (market/limit/stop/stop_limit/bracket)
 *   DELETE /orders/:id         → Cancel order
 *   POST /positions/:symbol/close → Close position at market
 *   POST /killswitch           → Activate killswitch
 *   DELETE /killswitch         → Deactivate killswitch
 *   GET  /order-history        → Logged order history (DB)
 *   GET  /scheduler/strategies → List registered strategies
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  buildAuthUrl, exchangeCodeForTokens, getTokenInfo,
} from '../services/tos/tosAuthService';
import {
  getPrimaryAccount, getOpenOrders, getAllOrders,
  getQuotes, computeDrawdownPct, computeUnrealizedPnl,
} from '../services/tos/tosInfoService';
import {
  placeOrder, cancelOrder, closePosition, getOrderHistory,
  type TosOrderRequest,
} from '../services/tos/tosExchangeService';
import {
  executeKillswitch, resetKillswitch, getKillswitchStatus,
  startDrawdownMonitor, startScheduler, listStrategies,
} from '../services/tos/tosKillswitchService';
import {
  TOS_CONFIG, isKillswitchActive, hasCredentials, hasAccountNumber,
} from '../services/tos/tosConfig';

const router = Router();
router.use(requireAuth);

// Start risk monitor and scheduler if credentials are present
if (hasCredentials()) {
  startDrawdownMonitor(60_000);
  startScheduler();
}

// ─── Auth ─────────────────────────────────────────────────────────

router.get('/auth/url', (_req: Request, res: Response) => {
  if (!TOS_CONFIG.CLIENT_ID) {
    return res.status(400).json({ success: false, error: 'SCHWAB_CLIENT_ID not configured' });
  }
  res.json({ success: true, data: { url: buildAuthUrl() } });
});

router.post('/auth/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'code is required' });
    const tokens = await exchangeCodeForTokens(code);
    res.json({
      success: true,
      data: {
        message:      'Tokens obtained. Store refresh_token as SCHWAB_REFRESH_TOKEN in Replit Secrets.',
        refreshToken: tokens.refreshToken,
        tokenInfo:    getTokenInfo(),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Auth failed' });
  }
});

router.get('/auth/token', (_req: Request, res: Response) => {
  res.json({ success: true, data: getTokenInfo() });
});

// ─── Status ───────────────────────────────────────────────────────

router.get('/status', async (req: Request, res: Response) => {
  try {
    const killswitch = getKillswitchStatus();
    const tokenInfo  = getTokenInfo();

    const [account, openOrders] = hasCredentials()
      ? await Promise.all([getPrimaryAccount(), getOpenOrders()])
      : [null, []];

    const drawdownPct    = await computeDrawdownPct(account);
    const unrealizedPnl  = await computeUnrealizedPnl(account);
    const balances       = account?.securitiesAccount?.currentBalances ?? null;

    res.json({
      success: true,
      data: {
        hasCredentials:  hasCredentials(),
        hasAccountNumber: hasAccountNumber(),
        dryRun:          TOS_CONFIG.DRY_RUN,
        accountNumber:   TOS_CONFIG.ACCOUNT_NUMBER || null,
        killswitch,
        tokenInfo,
        drawdownPct,
        maxDrawdownPct:  TOS_CONFIG.MAX_DRAWDOWN_PCT,
        unrealizedPnl,
        balances,
        positionCount:   account?.securitiesAccount?.positions?.filter((p) => p.longQuantity > 0 || p.shortQuantity > 0).length ?? 0,
        openOrderCount:  openOrders.length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

// ─── Account ─────────────────────────────────────────────────────

router.get('/account', async (_req: Request, res: Response) => {
  try {
    const account = await getPrimaryAccount();
    if (!account) return res.json({ success: true, data: { account: null } });

    const [drawdownPct, unrealizedPnl, openOrders] = await Promise.all([
      computeDrawdownPct(account),
      computeUnrealizedPnl(account),
      getOpenOrders(),
    ]);

    res.json({ success: true, data: { account, drawdownPct, unrealizedPnl, openOrders } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.get('/positions', async (_req: Request, res: Response) => {
  try {
    const account = await getPrimaryAccount();
    const positions = account?.securitiesAccount?.positions?.filter(
      (p) => p.longQuantity > 0 || p.shortQuantity > 0,
    ) ?? [];
    res.json({ success: true, data: { positions } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

// ─── Orders ───────────────────────────────────────────────────────

router.get('/orders', async (_req: Request, res: Response) => {
  try {
    const orders = await getOpenOrders();
    res.json({ success: true, data: { orders } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.get('/orders/all', async (req: Request, res: Response) => {
  try {
    const limit  = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const orders = await getAllOrders(undefined, limit);
    res.json({ success: true, data: { orders } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

// ─── Quotes ───────────────────────────────────────────────────────

router.get('/quotes', async (req: Request, res: Response) => {
  try {
    const raw = (req.query.symbols as string) ?? '';
    if (!raw) return res.status(400).json({ success: false, error: 'symbols query param required' });
    const symbols = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const quotes  = await getQuotes(symbols);
    res.json({ success: true, data: { quotes } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

// ─── Trading ─────────────────────────────────────────────────────

router.post('/orders', async (req: Request, res: Response) => {
  if (isKillswitchActive()) {
    return res.status(403).json({ success: false, error: 'KILLSWITCH ACTIVE — all trading halted' });
  }
  try {
    const { symbol, instruction, quantity, orderType, price, stopPrice, duration, session, assetType, takeProfitPct, stopLossPct } = req.body;

    if (!symbol || !instruction || !quantity || !orderType) {
      return res.status(400).json({ success: false, error: 'Required: symbol, instruction, quantity, orderType' });
    }
    if (parseFloat(quantity) <= 0) {
      return res.status(400).json({ success: false, error: 'quantity must be > 0' });
    }

    const reqBody: TosOrderRequest = {
      symbol,
      instruction,
      quantity: parseFloat(quantity),
      orderType,
      price:         price         ? parseFloat(price)         : undefined,
      stopPrice:     stopPrice     ? parseFloat(stopPrice)     : undefined,
      takeProfitPct: takeProfitPct ? parseFloat(takeProfitPct) : undefined,
      stopLossPct:   stopLossPct   ? parseFloat(stopLossPct)   : undefined,
      duration:      duration  ?? 'DAY',
      session:       session   ?? 'NORMAL',
      assetType:     assetType ?? 'EQUITY',
      userId:        req.session.userId,
    };

    const result = await placeOrder(reqBody);
    res.status(result.success ? 201 : 500).json({ success: result.success, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Order failed' });
  }
});

router.delete('/orders/:id', async (req: Request, res: Response) => {
  if (isKillswitchActive()) {
    return res.status(403).json({ success: false, error: 'KILLSWITCH ACTIVE' });
  }
  try {
    const result = await cancelOrder(req.params.id, TOS_CONFIG.ACCOUNT_NUMBER);
    res.json({ success: result.success, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.post('/positions/:symbol/close', async (req: Request, res: Response) => {
  if (isKillswitchActive()) {
    return res.status(403).json({ success: false, error: 'KILLSWITCH ACTIVE' });
  }
  try {
    const { longQuantity, shortQuantity, assetType } = req.body;
    if (longQuantity == null && shortQuantity == null) {
      return res.status(400).json({ success: false, error: 'Required: longQuantity or shortQuantity' });
    }
    const result = await closePosition({
      symbol:        req.params.symbol.toUpperCase(),
      longQuantity:  parseFloat(longQuantity  ?? '0'),
      shortQuantity: parseFloat(shortQuantity ?? '0'),
      assetType:     assetType ?? 'EQUITY',
    }, req.session.userId);
    res.json({ success: result.success, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

// ─── Killswitch ───────────────────────────────────────────────────

router.post('/killswitch', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const result = await executeKillswitch(reason ?? 'Manually triggered via API', 'api', req.session.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Killswitch failed' });
  }
});

router.delete('/killswitch', async (req: Request, res: Response) => {
  try {
    await resetKillswitch(req.session.userId);
    res.json({ success: true, message: 'Killswitch deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

// ─── Order history + Scheduler ───────────────────────────────────

router.get('/order-history', async (req: Request, res: Response) => {
  try {
    const limit   = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const history = await getOrderHistory(req.session.userId!, limit);
    res.json({ success: true, data: { history } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.get('/scheduler/strategies', (_req: Request, res: Response) => {
  res.json({ success: true, data: { strategies: listStrategies() } });
});

export default router;
