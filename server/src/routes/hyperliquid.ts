import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  getMeta, getAllMids, getUserState, getOpenOrders,
  getUserFills, getCandles, getDrawdownPct,
} from '../services/hyperliquid/hyperliquidInfoService';
import {
  placeOrder, cancelOrder, cancelAllOrders,
  closePosition, getOrderHistory, setLeverage,
} from '../services/hyperliquid/hyperliquidExchangeService';
import {
  executeKillswitch, resetKillswitch, getKillswitchStatus,
  startDrawdownMonitor,
} from '../services/hyperliquid/hyperliquidKillswitchService';
import {
  HL_CONFIG, isKillswitchActive, hasCredentials, hasSigningKey,
} from '../services/hyperliquid/hyperliquidConfig';
import { signerAddress } from '../services/hyperliquid/hyperliquidSigningService';

const router = Router();
router.use(requireAuth);

// Start the drawdown monitor when routes are loaded (if wallet configured)
if (hasCredentials()) startDrawdownMonitor(60_000);

// ─── Status ───────────────────────────────────────────────────────

router.get('/status', async (req: Request, res: Response) => {
  try {
    const [userState, openOrders] = await Promise.all([
      getUserState(),
      getOpenOrders(),
    ]);

    const drawdownPct = await getDrawdownPct(userState);
    const killswitch  = getKillswitchStatus();

    res.json({
      success: true,
      data: {
        walletAddress: HL_CONFIG.WALLET_ADDRESS || null,
        signerAddress: signerAddress(),
        hasCredentials: hasCredentials(),
        hasSigningKey: hasSigningKey(),
        dryRun: HL_CONFIG.DRY_RUN,
        isMainnet: HL_CONFIG.IS_MAINNET,
        killswitch,
        drawdownPct,
        maxDrawdownPct: HL_CONFIG.MAX_DRAWDOWN_PCT,
        userState,
        openOrders,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to get status' });
  }
});

// ─── Market Data (public) ─────────────────────────────────────────

router.get('/markets', async (_req: Request, res: Response) => {
  try {
    const [meta, mids] = await Promise.all([getMeta(), getAllMids()]);
    const markets = meta.universe.map((asset, idx) => ({
      idx,
      name: asset.name,
      maxLeverage: asset.maxLeverage,
      mid: mids[asset.name] ? parseFloat(mids[asset.name]) : null,
    }));
    res.json({ success: true, data: { markets } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.get('/markets/:asset/candles', async (req: Request, res: Response) => {
  try {
    const { asset } = req.params;
    const interval = (req.query.interval as string) ?? '1h';
    const startMs  = req.query.start ? Number(req.query.start) : Date.now() - 7 * 86_400_000;
    const candles  = await getCandles(asset.toUpperCase(), interval, startMs);
    res.json({ success: true, data: { candles, asset: asset.toUpperCase(), interval } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

// ─── Account ─────────────────────────────────────────────────────

router.get('/account', async (req: Request, res: Response) => {
  try {
    const address = (req.query.address as string) ?? HL_CONFIG.WALLET_ADDRESS;
    const [userState, openOrders, fills] = await Promise.all([
      getUserState(address),
      getOpenOrders(address),
      getUserFills(address, 30),
    ]);
    const drawdownPct = await getDrawdownPct(userState);
    res.json({ success: true, data: { userState, openOrders, fills, drawdownPct } });
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
    const { asset, isBuy, price, size, reduceOnly, orderType, tif, leverage } = req.body;
    if (!asset || size == null || isBuy == null) {
      return res.status(400).json({ success: false, error: 'Required: asset, isBuy, size' });
    }
    if (size <= 0) return res.status(400).json({ success: false, error: 'size must be > 0' });

    const result = await placeOrder({
      asset: asset.toUpperCase(),
      isBuy: Boolean(isBuy),
      price:   price   ?? null,
      size:    parseFloat(size),
      reduceOnly: Boolean(reduceOnly ?? false),
      orderType: orderType ?? (price != null ? 'limit' : 'market'),
      tif: tif ?? 'Gtc',
      leverage: leverage ?? HL_CONFIG.DEFAULT_LEVERAGE,
      userId: req.session.userId,
    });

    const status = result.success ? 201 : 500;
    res.status(status).json({ success: result.success, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Order failed';
    res.status(400).json({ success: false, error: msg });
  }
});

router.delete('/orders/:oid', async (req: Request, res: Response) => {
  if (isKillswitchActive()) {
    return res.status(403).json({ success: false, error: 'KILLSWITCH ACTIVE' });
  }
  try {
    const asset = req.query.asset as string;
    if (!asset) return res.status(400).json({ success: false, error: 'asset query param required' });
    const result = await cancelOrder(asset.toUpperCase(), parseInt(req.params.oid), req.session.userId);
    res.json({ success: result.success, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.post('/positions/:asset/close', async (req: Request, res: Response) => {
  if (isKillswitchActive()) {
    return res.status(403).json({ success: false, error: 'KILLSWITCH ACTIVE' });
  }
  try {
    const { size, isBuy } = req.body;
    if (!size || isBuy == null) return res.status(400).json({ success: false, error: 'Required: size, isBuy' });
    const result = await closePosition(req.params.asset.toUpperCase(), size.toString(), Boolean(isBuy), req.session.userId);
    res.json({ success: result.success, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.post('/leverage', async (req: Request, res: Response) => {
  if (isKillswitchActive()) {
    return res.status(403).json({ success: false, error: 'KILLSWITCH ACTIVE' });
  }
  try {
    const { asset, leverage, isCross } = req.body;
    if (!asset || !leverage) return res.status(400).json({ success: false, error: 'Required: asset, leverage' });
    const result = await setLeverage(asset.toUpperCase(), parseInt(leverage), isCross !== false, req.session.userId);
    res.json({ success: result.success, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

// ─── Killswitch ───────────────────────────────────────────────────

router.post('/killswitch', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const result = await executeKillswitch(
      reason ?? 'Manually triggered via API',
      'api',
      req.session.userId,
    );
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

// ─── Order history ────────────────────────────────────────────────

router.get('/order-history', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const history = await getOrderHistory(req.session.userId!, limit);
    res.json({ success: true, data: { history } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

export default router;
