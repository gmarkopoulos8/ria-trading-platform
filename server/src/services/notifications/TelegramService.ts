import axios from 'axios';
import { prisma } from '../../lib/prisma';

export interface TelegramMessage {
  type: 'TRADE_PLACED' | 'TRADE_CLOSED' | 'CIRCUIT_BREAKER' | 'KILLSWITCH' |
        'DAILY_SUMMARY' | 'SESSION_PAUSED' | 'EARNINGS_WARNING' |
        'THESIS_DEGRADED' | 'TARGET_APPROACHED' | 'SYSTEM_ERROR';
  exchange?: 'tos' | 'hyperliquid';
  ticker?: string;
  data: Record<string, unknown>;
}

function getToken(): string | null { return process.env.TELEGRAM_BOT_TOKEN ?? null; }
function getChatId(): string | null { return process.env.TELEGRAM_CHAT_ID ?? null; }

export async function sendMessage(chatId: string, text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }, { timeout: 8000 });
    return true;
  } catch (err) {
    console.warn('[Telegram] Send failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

function formatMessage(msg: TelegramMessage): string {
  const d = msg.data;
  const ex = (msg.exchange ?? '').toUpperCase();
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  switch (msg.type) {
    case 'TRADE_PLACED':
      return `🟢 <b>TRADE PLACED</b> — ${ex}\n📈 ${d.ticker ?? msg.ticker} | ${d.side ?? 'LONG'} | ${d.quantity ?? '?'} units\n💰 Entry: $${d.entryPrice ?? '?'} | Stop: $${d.stop ?? '?'} | TP: $${d.target ?? '?'}\n🎯 Conviction: ${d.conviction ?? '?'}/100 | R:R ${d.rr ?? '?'}:1\n📋 Dry Run: ${d.dryRun ? 'YES' : 'NO'}\n⏱ ${ts}`;

    case 'TRADE_CLOSED':
      return `🔴 <b>POSITION CLOSED</b> — ${ex}\n📉 ${d.ticker ?? msg.ticker} | ${d.closeReason ?? 'MANUAL'}\n💵 P&L: ${Number(d.pnl ?? 0) >= 0 ? '+' : ''}$${Number(d.pnl ?? 0).toFixed(2)} (${Number(d.pnlPct ?? 0) >= 0 ? '+' : ''}${Number(d.pnlPct ?? 0).toFixed(2)}%)\n⏱ Held ${d.holdDays ?? '?'} days | Closed ${ts}`;

    case 'CIRCUIT_BREAKER':
      return `🚨 <b>CIRCUIT BREAKER ACTIVATED</b>\n⚠️ Reason: ${d.reason ?? 'Unknown'}\n🛑 All autonomous trading paused\n🔄 Auto-reset at next market open`;

    case 'DAILY_SUMMARY':
      return `📊 <b>DAILY SUMMARY</b> — ${new Date().toLocaleDateString()}\n\nTrades placed: ${d.tradesPlaced ?? 0} | Closed: ${d.tradesClosed ?? 0}\nToday's P&amp;L: ${Number(d.dailyPnl ?? 0) >= 0 ? '+' : ''}$${Number(d.dailyPnl ?? 0).toFixed(2)}\n\nTOS: $${d.tosEquity ?? '—'} equity | ${d.tosPositions ?? 0} positions\nHyperliquid: $${d.hlEquity ?? '—'} | ${d.hlPositions ?? 0} positions\n\nTop pick: ${d.topPick ?? 'None'} (conviction ${d.topConviction ?? '?'})\nCircuit breaker: ${d.circuitBreakerActive ? '🔴 ACTIVE' : '✅ Inactive'}`;

    case 'EARNINGS_WARNING':
      return `⚠️ <b>EARNINGS WARNING</b>\n📅 ${d.ticker ?? msg.ticker} reports earnings on ${d.reportDate ?? '?'}\n🚫 Auto-trade blocked for ${d.daysAhead ?? 5}-day window`;

    case 'SESSION_PAUSED':
      return `⏸ Session paused — ${ex}: ${d.reason ?? 'Manual'}`;

    case 'THESIS_DEGRADED':
      return `📉 <b>THESIS DEGRADED</b> — ${msg.ticker}\nHealth: ${d.oldHealth ?? '?'} → ${d.newHealth ?? '?'}\n💡 Recommended: ${d.action ?? 'Review position'}`;

    case 'TARGET_APPROACHED':
      return `🎯 <b>TARGET APPROACHED</b> — ${msg.ticker}\nPrice: $${d.currentPrice ?? '?'} | Target: $${d.target ?? '?'}\nUnrealized P&amp;L: ${Number(d.unrealizedPnl ?? 0) >= 0 ? '+' : ''}$${Number(d.unrealizedPnl ?? 0).toFixed(2)}`;

    case 'KILLSWITCH':
      return `🛑 <b>KILLSWITCH TRIGGERED</b> — ${ex}\n${d.reason ?? ''}`;

    default:
      return `🤖 <b>RIA BOT</b> — ${msg.type}\n${JSON.stringify(d).slice(0, 200)}`;
  }
}

export async function notify(message: TelegramMessage): Promise<void> {
  const chatId = getChatId();
  if (!chatId) return;

  // Check notification prefs — load from any active user settings
  try {
    const settings = await prisma.userSettings.findFirst({ where: { autoTradeEnabled: true } });
    if (settings?.notificationPrefs) {
      const prefs = settings.notificationPrefs as Record<string, boolean>;
      const prefKey = message.type.toLowerCase().replace(/_/g, '');
      if (prefs[prefKey] === false) return;
    }
  } catch { }

  const text = formatMessage(message);
  await sendMessage(chatId, text);
}

export async function sendDailySummary(): Promise<void> {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [placed, closed, pnlAgg] = await Promise.all([
      prisma.autoTradeLog.count({ where: { phase: 'ENTRY', executedAt: { gte: startOfDay } } }),
      prisma.autoTradeLog.count({ where: { phase: 'EXIT', executedAt: { gte: startOfDay } } }),
      prisma.autoTradeLog.aggregate({ where: { phase: 'EXIT', executedAt: { gte: startOfDay } }, _sum: { pnl: true } }),
    ]);

    await notify({
      type: 'DAILY_SUMMARY',
      data: {
        tradesPlaced: placed,
        tradesClosed: closed,
        dailyPnl: pnlAgg._sum.pnl ?? 0,
        tosEquity: '—',
        hlEquity: '—',
        tosPositions: 0,
        hlPositions: 0,
        topPick: 'N/A',
        topConviction: 'N/A',
        circuitBreakerActive: false,
      },
    });
  } catch (err) {
    console.warn('[Telegram] Daily summary error:', err instanceof Error ? err.message : err);
  }
}

export function getSetupLink(): string {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? 'RIABotNotifier';
  return `https://t.me/${botUsername}?start=setup`;
}

export function isConfigured(): boolean {
  return !!(getToken() && getChatId());
}

const telegramService = { notify, sendMessage, sendDailySummary, getSetupLink, isConfigured };
export default telegramService;
