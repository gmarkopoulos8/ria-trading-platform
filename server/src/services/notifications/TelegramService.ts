import axios from 'axios';
import { prisma } from '../../lib/prisma';

export interface TelegramMessage {
  type: 'TRADE_PLACED' | 'TRADE_CLOSED' | 'CIRCUIT_BREAKER' | 'KILLSWITCH' |
        'DAILY_SUMMARY' | 'SESSION_PAUSED' | 'EARNINGS_WARNING' |
        'THESIS_DEGRADED' | 'TARGET_APPROACHED' | 'SYSTEM_ERROR';
  exchange?: string;
  ticker?: string;
  data: Record<string, unknown>;
}

// ── Send a message using a specific bot token ──────────────────────────────

export async function sendMessage(
  chatId:    string,
  text:      string,
  botToken:  string,
  parseMode: 'HTML' | 'Markdown' = 'HTML',
): Promise<boolean> {
  if (!botToken || !chatId) return false;
  try {
    await axios.post(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      { chat_id: chatId, text, parse_mode: parseMode, disable_web_page_preview: true },
      { timeout: 8000 },
    );
    return true;
  } catch (err) {
    console.warn('[Telegram] Send failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ── Format message text ────────────────────────────────────────────────────

function formatMessage(msg: TelegramMessage): string {
  const d  = msg.data;
  const ex = (msg.exchange ?? '').toUpperCase();
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  switch (msg.type) {
    case 'TRADE_PLACED':
      return `🟢 <b>TRADE PLACED</b> — ${ex}\n` +
        `📈 ${d.ticker ?? msg.ticker} | ${d.side ?? 'LONG'} | ${d.quantity ?? '?'} units\n` +
        `💰 Entry: $${d.entryPrice ?? '?'} | Stop: $${d.stop ?? '?'} | TP: $${d.target ?? '?'}\n` +
        `🎯 Conviction: ${d.conviction ?? '?'}/100 | R:R ${d.rr ?? '?'}:1\n` +
        `${d.strategy ? `📊 Strategy: ${d.strategy}\n` : ''}` +
        `📋 Mode: ${d.dryRun ? 'DRY RUN' : 'LIVE'} | Regime: ${d.regime ?? '?'}\n` +
        `⏱ ${ts}`;

    case 'TRADE_CLOSED':
      return `🔴 <b>POSITION CLOSED</b> — ${ex}\n` +
        `📉 ${d.ticker ?? msg.ticker} | ${d.closeReason ?? 'MANUAL'}\n` +
        `💵 P&amp;L: ${Number(d.pnl ?? 0) >= 0 ? '+' : ''}$${Number(d.pnl ?? 0).toFixed(2)} ` +
        `(${Number(d.pnlPct ?? 0) >= 0 ? '+' : ''}${Number(d.pnlPct ?? 0).toFixed(2)}%)\n` +
        `⏱ Held ${d.holdDays ?? '?'} | Closed ${ts}`;

    case 'DAILY_SUMMARY':
      return `📊 <b>DAILY SUMMARY</b> — ${new Date().toLocaleDateString()}\n\n` +
        `Trades: ${d.tradesPlaced ?? 0} placed | ${d.tradesClosed ?? 0} closed\n` +
        `Today's P&amp;L: ${Number(d.dailyPnl ?? 0) >= 0 ? '+' : ''}$${Number(d.dailyPnl ?? 0).toFixed(2)}\n` +
        `${d.alpacaEquity ? `Alpaca equity: ${d.alpacaEquity}\n` : ''}` +
        `Top pick: ${d.topPick ?? 'None'} (conviction ${d.topConviction ?? '?'})\n` +
        `Circuit breaker: ${d.circuitBreakerActive ? '🔴 ACTIVE' : '✅ Inactive'}`;

    case 'CIRCUIT_BREAKER':
      return `🚨 <b>CIRCUIT BREAKER</b>\n⚠️ ${d.reason ?? 'Unknown'}\n🛑 Trading paused`;

    case 'KILLSWITCH':
      return `🛑 <b>KILLSWITCH TRIGGERED</b> — ${ex}\n${d.reason ?? ''}`;

    case 'EARNINGS_WARNING':
      return `⚠️ <b>EARNINGS WARNING</b>\n📅 ${d.ticker ?? msg.ticker} reports on ${d.reportDate ?? '?'}\n🚫 Auto-trade blocked`;

    default:
      return `🤖 <b>RIA BOT</b> — ${msg.type}\n${JSON.stringify(d).slice(0, 200)}`;
  }
}

// ── Resolve user's bot token and chat ID ──────────────────────────────────

interface UserTelegramConfig {
  botToken: string;
  chatId:   string;
}

async function getUserTelegramConfig(userSettingsId: string): Promise<UserTelegramConfig | null> {
  const settings = await prisma.userSettings.findUnique({
    where:  { id: userSettingsId },
    select: {
      telegramBotToken:  true,
      telegramChatId:    true,
      telegramEnabled:   true,
      telegramConsent:   true,
      notificationPrefs: true,
    } as any,
  });

  if (!settings) return null;
  if ((settings as any).telegramConsent === false) return null;
  if (!(settings as any).telegramEnabled) return null;
  if (!(settings as any).telegramChatId) return null;

  const botToken = (settings as any).telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN ?? null;
  if (!botToken) return null;

  return { botToken, chatId: (settings as any).telegramChatId };
}

// ── Public API ────────────────────────────────────────────────────────────

export async function notify(message: TelegramMessage, userSettingsId?: string): Promise<void> {
  try {
    if (userSettingsId) {
      const settings = await prisma.userSettings.findUnique({
        where:  { id: userSettingsId },
        select: { notificationPrefs: true },
      });
      if (settings?.notificationPrefs) {
        const prefs   = settings.notificationPrefs as Record<string, boolean>;
        const prefKey = message.type.toLowerCase().replace(/_/g, '');
        if (prefs[prefKey] === false) return;
      }

      const config = await getUserTelegramConfig(userSettingsId);
      if (config) {
        const text = formatMessage(message);
        await sendMessage(config.chatId, text, config.botToken);
        return;
      }
    }

    // Fall back to global env config
    const globalToken  = process.env.TELEGRAM_BOT_TOKEN;
    const globalChatId = process.env.TELEGRAM_CHAT_ID;
    if (globalToken && globalChatId) {
      const text = formatMessage(message);
      await sendMessage(globalChatId, text, globalToken);
    }
  } catch (err) {
    console.warn('[Telegram] Notify error:', err instanceof Error ? err.message : err);
  }
}

export async function notifyAllConnected(message: TelegramMessage): Promise<void> {
  try {
    const connectedUsers = await prisma.userSettings.findMany({
      where: {
        telegramEnabled: true,
        telegramConsent: true,
        telegramChatId:  { not: null },
      },
      select: {
        id:               true,
        telegramChatId:   true,
        telegramBotToken: true,
      } as any,
    });

    const text = formatMessage(message);

    await Promise.allSettled(
      connectedUsers.map((u: any) => {
        const botToken = u.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken || !u.telegramChatId) return Promise.resolve();
        return sendMessage(u.telegramChatId, text, botToken);
      }),
    );
  } catch (err) {
    console.warn('[Telegram] notifyAllConnected error:', err instanceof Error ? err.message : err);
  }
}

export async function sendDailySummary(): Promise<void> {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [placed, closed, pnlAgg] = await Promise.all([
      prisma.autoTradeLog.count({ where: { phase: 'ENTRY', executedAt: { gte: startOfDay } } }),
      prisma.autoTradeLog.count({ where: { phase: 'EXIT',  executedAt: { gte: startOfDay } } }),
      prisma.autoTradeLog.aggregate({
        where: { phase: 'EXIT', executedAt: { gte: startOfDay } },
        _sum:  { pnl: true },
      }),
    ]);

    const latestRun = await prisma.dailyScanRun.findFirst({ where: { status: 'COMPLETED' }, orderBy: { completedAt: 'desc' } });
    const topResult = latestRun ? await prisma.dailyScanResult.findFirst({
      where: { scanRunId: latestRun.id }, orderBy: { convictionScore: 'desc' },
    }) : null;

    let alpacaEquity = '—';
    try {
      const { hasAlpacaCredentials } = await import('../alpaca/alpacaConfig');
      if (hasAlpacaCredentials()) {
        const { getAccount } = await import('../alpaca/alpacaInfoService');
        const acct = await getAccount();
        alpacaEquity = `$${parseFloat(acct.equity ?? '0').toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
      }
    } catch { /* non-fatal */ }

    await notifyAllConnected({
      type: 'DAILY_SUMMARY',
      data: {
        tradesPlaced:         placed,
        tradesClosed:         closed,
        dailyPnl:             pnlAgg._sum.pnl ?? 0,
        alpacaEquity,
        topPick:              topResult?.symbol ?? 'None',
        topConviction:        topResult?.convictionScore ?? 'N/A',
        circuitBreakerActive: false,
      },
    });
  } catch (err) {
    console.warn('[Telegram] Daily summary error:', err instanceof Error ? err.message : err);
  }
}

// ── Bot webhook helpers ────────────────────────────────────────────────────

export async function getConnectLink(userSettingsId: string, token: string): Promise<string | null> {
  const settings = await prisma.userSettings.findUnique({
    where:  { id: userSettingsId },
    select: { telegramBotUsername: true } as any,
  });
  const botUsername = (settings as any)?.telegramBotUsername ?? process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) return null;
  return `https://t.me/${botUsername}?start=${token}`;
}

export function isConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

export function isBotFullyConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME);
}

export async function sendToUser(userSettingsId: string, text: string): Promise<boolean> {
  const config = await getUserTelegramConfig(userSettingsId);
  if (!config) return false;
  return sendMessage(config.chatId, text, config.botToken);
}

const telegramService = {
  notify, notifyAllConnected, sendMessage, sendDailySummary,
  getConnectLink, isConfigured, isBotFullyConfigured, sendToUser,
};
export default telegramService;
