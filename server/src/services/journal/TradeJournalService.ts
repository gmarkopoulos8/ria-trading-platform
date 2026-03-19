import axios from 'axios';
import { prisma } from '../../lib/prisma';

function ruleBasedPostMortem(pos: any) {
  const isWin = pos.pnl > 0;
  const pnlPct = ((pos.exitPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.side === 'SHORT' ? -1 : 1);
  const closeReason = pos.closeReason ?? '';
  const holdDays = pos.holdingPeriodDays ?? 1;

  let entryQuality = 'GOOD';
  if (closeReason === 'HIT_STOP' && Math.abs(pnlPct) > 10) entryQuality = 'CHASED';
  else if (closeReason === 'HIT_STOP') entryQuality = 'EARLY';

  let exitQuality = 'DISCIPLINED';
  if (closeReason === 'HIT_TARGET') exitQuality = 'DISCIPLINED';
  else if (closeReason === 'MANUAL' && isWin) exitQuality = 'TOO_EARLY';
  else if (closeReason === 'MANUAL' && !isWin) exitQuality = 'PANIC';
  else if (closeReason === 'HIT_STOP' && holdDays < 1) exitQuality = 'PANIC';

  const thesisCalled = isWin;

  let keyLesson = '';
  if (closeReason === 'HIT_TARGET') keyLesson = 'Target hit — thesis validated. Continue applying same entry criteria.';
  else if (closeReason === 'HIT_STOP') keyLesson = `Stop loss triggered at ${pnlPct.toFixed(1)}%. Review entry timing and stop placement.`;
  else if (isWin) keyLesson = 'Position closed profitably. Document the setup for future reference.';
  else keyLesson = 'Review thesis assumptions — consider whether entry criteria were met before position initiation.';

  const postMortem = `**Trade Summary**: ${pos.symbol} ${pos.side} on ${pos.assetClass === 'crypto' ? 'Hyperliquid' : 'ThinkorSwim'}. Entry at $${pos.entryPrice.toFixed(2)}, exit at $${pos.exitPrice.toFixed(2)}, P&L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% over ${holdDays} days.\n\n**Execution Analysis**: Entry quality was ${entryQuality.toLowerCase()}, exit was ${exitQuality.toLowerCase().replace('_', ' ')}. ${closeReason === 'HIT_TARGET' ? 'The thesis played out as expected and the position was exited at the planned target.' : closeReason === 'HIT_STOP' ? 'The trade hit its stop loss. Review whether the stop was placed at a meaningful technical level.' : 'The position was manually closed.'}\n\n**Key Takeaway**: ${keyLesson}`;

  const tags = [];
  if (entryQuality === 'GOOD') tags.push('clean_entry');
  if (exitQuality === 'DISCIPLINED') tags.push('plan_followed');
  if (Math.abs(pnlPct) < 2) tags.push('small_move');
  if (holdDays >= 5) tags.push('patient_hold');

  return { postMortem, keyLesson, entryQuality, exitQuality, thesisCalled, improvementTags: tags };
}

async function aiPostMortem(pos: any): Promise<any> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const prompt = `You are a professional trading coach reviewing a closed trade.

Trade: ${pos.symbol} ${pos.side} on ${pos.assetClass === 'crypto' ? 'Hyperliquid' : 'TOS'}
Entry: $${pos.entryPrice} | Exit: $${pos.exitPrice} | P&L: ${((pos.exitPrice - pos.entryPrice) / pos.entryPrice * 100).toFixed(2)}%
Hold time: ${pos.holdingPeriodDays ?? 1} days | Close reason: ${pos.closeReason ?? 'MANUAL'}
Thesis: ${pos.thesis?.slice(0, 300) ?? 'Not provided'}
Stop: $${pos.stopLoss ?? 'N/A'} | Target: $${pos.targetPrice ?? 'N/A'}

Provide a structured post-mortem in this exact JSON format:
{
  "postMortem": "2-3 paragraph analysis",
  "keyLesson": "one sentence takeaway",
  "entryQuality": "GOOD|EARLY|LATE|CHASED",
  "exitQuality": "DISCIPLINED|TOO_EARLY|TOO_LATE|PANIC",
  "thesisCalled": true or false,
  "improvementTags": ["tag1", "tag2"]
}`;

  try {
    const { data } = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      timeout: 20000,
    });

    const text = data?.content?.[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch { }
  return null;
}

export async function generatePostMortem(closedPositionId: string, userId: string) {
  const pos = await prisma.closedPosition.findFirst({ where: { id: closedPositionId, userId } });
  if (!pos) throw new Error('Position not found');

  const analysis = (await aiPostMortem(pos)) ?? ruleBasedPostMortem(pos);

  return prisma.tradeJournal.upsert({
    where: { closedPositionId },
    update: { ...analysis, generatedAt: new Date() },
    create: {
      userId,
      closedPositionId,
      ticker: pos.symbol,
      exchange: pos.assetClass === 'crypto' ? 'HYPERLIQUID' : 'TOS',
      side: pos.side,
      entryPrice: pos.entryPrice,
      exitPrice: pos.exitPrice,
      pnl: pos.pnl,
      pnlPct: pos.pnlPercent,
      holdDays: pos.holdingPeriodDays ?? null,
      closeReason: pos.closeReason ?? null,
      thesisOutcome: pos.thesisOutcome ?? null,
      ...analysis,
      generatedAt: new Date(),
    },
  });
}

export async function generatePostMortems(userId: string, limit = 5): Promise<void> {
  const closed = await prisma.closedPosition.findMany({
    where: {
      userId,
      NOT: { id: { in: (await prisma.tradeJournal.findMany({ where: { userId }, select: { closedPositionId: true } })).map((j) => j.closedPositionId) } },
    },
    orderBy: { closedAt: 'desc' },
    take: limit,
  });

  for (const pos of closed) {
    try {
      await generatePostMortem(pos.id, userId);
    } catch { }
  }
}

export async function getJournalStats(userId: string) {
  const entries = await prisma.tradeJournal.findMany({ where: { userId } });
  if (entries.length === 0) return { total: 0, entryQuality: {}, exitQuality: {}, thesisCalledPct: 0, topTags: [] };

  const entryQuality: Record<string, number> = {};
  const exitQuality: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  let thesisCalled = 0;

  for (const e of entries) {
    if (e.entryQuality) entryQuality[e.entryQuality] = (entryQuality[e.entryQuality] ?? 0) + 1;
    if (e.exitQuality) exitQuality[e.exitQuality] = (exitQuality[e.exitQuality] ?? 0) + 1;
    if (e.thesisCalled) thesisCalled++;
    for (const tag of (e.improvementTags ?? [])) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
  }

  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, count]) => ({ tag, count }));

  return {
    total: entries.length,
    entryQuality,
    exitQuality,
    thesisCalledPct: (thesisCalled / entries.length) * 100,
    topTags,
  };
}
