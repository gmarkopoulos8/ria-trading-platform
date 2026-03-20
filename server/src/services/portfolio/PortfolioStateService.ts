import { getPrimaryAccount, type TosAccount } from '../tos/tosInfoService';
import { getUserState, type UserState } from '../hyperliquid/hyperliquidInfoService';
import { hasCredentials as tosHasCredentials } from '../tos/tosConfig';
import { hasCredentials as hlHasCredentials } from '../hyperliquid/hyperliquidConfig';
import { prisma } from '../../lib/prisma';
import { getAccount as getAlpacaAccount, getPositions as getAlpacaPositions } from '../alpaca/alpacaInfoService';
import { hasAlpacaCredentials } from '../alpaca/alpacaConfig';

export interface ExchangeBalance {
  exchange: 'TOS' | 'HYPERLIQUID' | 'PAPER';
  equity: number;
  cash: number;
  unrealizedPnl: number;
  marginUsed?: number;
  available: boolean;
}

export interface PortfolioState {
  totalEquity: number;
  balances: ExchangeBalance[];
  openPositionCount: number;
  totalExposureUsd: number;
  totalExposurePct: number;
  dailyPnl: number;
  fetchedAt: Date;
}

async function getTosBalance(): Promise<ExchangeBalance> {
  if (!tosHasCredentials()) {
    return { exchange: 'TOS', equity: 0, cash: 0, unrealizedPnl: 0, available: false };
  }
  try {
    const account: TosAccount | null = await getPrimaryAccount();
    if (!account) return { exchange: 'TOS', equity: 0, cash: 0, unrealizedPnl: 0, available: false };
    const bal = account.securitiesAccount.currentBalances;
    const equity = bal.equity ?? bal.liquidationValue ?? 0;
    const cash = bal.cashBalance ?? bal.totalCash ?? 0;
    const unrealizedPnl = (account.securitiesAccount.positions ?? []).reduce(
      (sum, p) => sum + (p.currentDayProfitLoss ?? 0),
      0,
    );
    return { exchange: 'TOS', equity, cash, unrealizedPnl, available: true };
  } catch {
    return { exchange: 'TOS', equity: 0, cash: 0, unrealizedPnl: 0, available: false };
  }
}

async function getHyperliquidBalance(): Promise<ExchangeBalance> {
  if (!hlHasCredentials()) {
    return { exchange: 'HYPERLIQUID', equity: 0, cash: 0, unrealizedPnl: 0, available: false };
  }
  try {
    const state: UserState | null = await getUserState();
    if (!state) return { exchange: 'HYPERLIQUID', equity: 0, cash: 0, unrealizedPnl: 0, available: false };
    const equity = parseFloat(state.marginSummary.accountValue) || 0;
    const marginUsed = parseFloat(state.marginSummary.totalMarginUsed) || 0;
    const cash = parseFloat(state.withdrawable) || 0;
    const unrealizedPnl = state.assetPositions.reduce(
      (sum, ap) => sum + (parseFloat(ap.position.unrealizedPnl) || 0),
      0,
    );
    return { exchange: 'HYPERLIQUID', equity, cash, unrealizedPnl, marginUsed, available: true };
  } catch {
    return { exchange: 'HYPERLIQUID', equity: 0, cash: 0, unrealizedPnl: 0, available: false };
  }
}

async function getPaperBalance(portfolioId?: string): Promise<ExchangeBalance> {
  if (hasAlpacaCredentials()) {
    try {
      const [account, positions] = await Promise.all([
        getAlpacaAccount(),
        getAlpacaPositions(),
      ]);
      const equity = parseFloat(account.equity ?? '0');
      const cash   = parseFloat(account.buying_power ?? '0');
      const unrealizedPnl = positions.reduce(
        (sum, p) => sum + parseFloat(p.unrealized_pl ?? '0'), 0
      );
      if (equity > 0) {
        return { exchange: 'PAPER', equity, cash, unrealizedPnl, available: true };
      }
    } catch { /* fall through to internal paper portfolio */ }
  }

  try {
    const portfolio = portfolioId
      ? await prisma.portfolio.findUnique({
          where: { id: portfolioId },
          include: { positions: { where: { status: 'OPEN' } } },
        })
      : await prisma.portfolio.findFirst({
          include: { positions: { where: { status: 'OPEN' } } },
          orderBy: { createdAt: 'asc' },
        });

    if (!portfolio) return { exchange: 'PAPER', equity: 100000, cash: 100000, unrealizedPnl: 0, available: true };

    const openPositionValue = portfolio.positions.reduce((sum, p) => {
      const currentPrice = p.currentPrice ?? p.entryPrice;
      return sum + currentPrice * p.quantity;
    }, 0);

    const unrealizedPnl = portfolio.positions.reduce((sum, p) => {
      const currentPrice = p.currentPrice ?? p.entryPrice;
      const pnl = p.side === 'LONG'
        ? (currentPrice - p.entryPrice) * p.quantity
        : (p.entryPrice - currentPrice) * p.quantity;
      return sum + pnl;
    }, 0);

    return {
      exchange: 'PAPER',
      equity:       portfolio.cashBalance + openPositionValue,
      cash:         portfolio.cashBalance,
      unrealizedPnl,
      available:    true,
    };
  } catch {
    return { exchange: 'PAPER', equity: 100000, cash: 100000, unrealizedPnl: 0, available: true };
  }
}

export async function getPortfolioState(portfolioId?: string): Promise<PortfolioState> {
  const [tosBalance, hlBalance, paperBalance] = await Promise.allSettled([
    getTosBalance(),
    getHyperliquidBalance(),
    getPaperBalance(portfolioId),
  ]);

  const balances: ExchangeBalance[] = [
    tosBalance.status === 'fulfilled' ? tosBalance.value : { exchange: 'TOS' as const, equity: 0, cash: 0, unrealizedPnl: 0, available: false },
    hlBalance.status === 'fulfilled' ? hlBalance.value : { exchange: 'HYPERLIQUID' as const, equity: 0, cash: 0, unrealizedPnl: 0, available: false },
    paperBalance.status === 'fulfilled' ? paperBalance.value : { exchange: 'PAPER' as const, equity: 100000, cash: 100000, unrealizedPnl: 0, available: true },
  ];

  const liveBalances = balances.filter((b) => b.available && b.exchange !== 'PAPER');
  const totalEquity = liveBalances.length > 0
    ? liveBalances.reduce((sum, b) => sum + b.equity, 0)
    : (balances.find((b) => b.exchange === 'PAPER')?.equity ?? 100000);

  const dailyPnl = balances.reduce((sum, b) => sum + (b.available ? b.unrealizedPnl : 0), 0);

  const openPositionCount = await prisma.paperPosition.count({ where: { status: 'OPEN' } });

  return {
    totalEquity,
    balances,
    openPositionCount,
    totalExposureUsd: 0,
    totalExposurePct: 0,
    dailyPnl,
    fetchedAt: new Date(),
  };
}
