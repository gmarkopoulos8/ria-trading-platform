import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_TRADES = [
  { symbol: 'NVDA', side: 'LONG', qty: 10, entry: 480, exit: 625, holdDays: 18, thesis: 'AI GPU supercycle — data center demand accelerating into H2 earnings. Jensen commentary bullish.', outcome: 'CONFIRMED', closeReason: 'TARGET_HIT', tags: ['ai', 'semiconductor', 'earnings'], assetClass: 'STOCK' },
  { symbol: 'TSLA', side: 'LONG', qty: 15, entry: 220, exit: 185, holdDays: 8, thesis: 'Q4 delivery beat expected. Price-volume expansion near base. EV margin recovery thesis.', outcome: 'INVALIDATED', closeReason: 'STOP_HIT', tags: ['ev', 'automotive', 'macro'], assetClass: 'STOCK' },
  { symbol: 'AAPL', side: 'LONG', qty: 20, entry: 175, exit: 198, holdDays: 25, thesis: 'Services revenue mix shift ongoing. India manufacturing ramp reduces geo concentration risk.', outcome: 'CONFIRMED', closeReason: 'TARGET_HIT', tags: ['services', 'consumer', 'china'], assetClass: 'STOCK' },
  { symbol: 'META', side: 'LONG', qty: 8, entry: 460, exit: 530, holdDays: 14, thesis: 'Reality Labs losses narrowing. Llama 3 moat expanding. Ad revenue reacceleration.', outcome: 'CONFIRMED', closeReason: 'TARGET_HIT', tags: ['ai', 'advertising', 'metaverse'], assetClass: 'STOCK' },
  { symbol: 'AMZN', side: 'LONG', qty: 12, entry: 175, exit: 168, holdDays: 5, thesis: 'AWS re-acceleration thesis. Prime Video monetization. Operating leverage story intact.', outcome: 'PARTIAL', closeReason: 'MANUAL', tags: ['cloud', 'ecommerce', 'aws'], assetClass: 'STOCK' },
  { symbol: 'BTC', side: 'LONG', qty: 0.5, entry: 42000, exit: 68000, holdDays: 45, thesis: 'ETF approval catalyst imminent. Halving cycle setup. Institutional allocation thesis.', outcome: 'CONFIRMED', closeReason: 'TARGET_HIT', tags: ['crypto', 'halving', 'etf'], assetClass: 'CRYPTO' },
  { symbol: 'ETH', side: 'LONG', qty: 3, entry: 2200, exit: 1980, holdDays: 12, thesis: 'Restaking narrative + EIP-4844 blob fee revenue. Ecosystem TVL growth thesis.', outcome: 'INVALIDATED', closeReason: 'STOP_HIT', tags: ['crypto', 'defi', 'staking'], assetClass: 'CRYPTO' },
  { symbol: 'MSFT', side: 'LONG', qty: 10, entry: 378, exit: 415, holdDays: 30, thesis: 'Copilot monetization beginning. Azure AI attach rate expanding. Margin expansion durable.', outcome: 'CONFIRMED', closeReason: 'TARGET_HIT', tags: ['ai', 'cloud', 'saas'], assetClass: 'STOCK' },
  { symbol: 'NVDA', side: 'LONG', qty: 5, entry: 550, exit: 720, holdDays: 22, thesis: 'H100 backlog 12+ months. Blackwell demand pull-forward. Gross margin expansion to 78%+.', outcome: 'CONFIRMED', closeReason: 'TARGET_HIT', tags: ['ai', 'semiconductor', 'data-center'], assetClass: 'STOCK' },
  { symbol: 'TSLA', side: 'SHORT', qty: 8, entry: 260, exit: 215, holdDays: 10, thesis: 'FSD margin dilutive near term. Price cuts destroying ASP. Chinese EV competition intensifying.', outcome: 'CONFIRMED', closeReason: 'TARGET_HIT', tags: ['ev', 'short', 'china'], assetClass: 'STOCK' },
  { symbol: 'SOL', side: 'LONG', qty: 20, entry: 95, exit: 185, holdDays: 35, thesis: 'Firedancer upgrade imminent. DeFi TVL surpassing ETH L2s. Institutional custody launch Q1.', outcome: 'CONFIRMED', closeReason: 'TARGET_HIT', tags: ['crypto', 'defi', 'layer1'], assetClass: 'CRYPTO' },
  { symbol: 'SPY', side: 'SHORT', qty: 25, entry: 475, exit: 490, holdDays: 7, thesis: 'CPI data hotter than expected. Fed hawkish pivot risk. VIX structure compressed.', outcome: 'INVALIDATED', closeReason: 'STOP_HIT', tags: ['macro', 'etf', 'rates'], assetClass: 'ETF' },
  { symbol: 'AAPL', side: 'LONG', qty: 15, entry: 188, exit: 182, holdDays: 6, thesis: 'iPhone 16 super-cycle thesis. Vision Pro halo effect on ASP upgrade cycle.', outcome: 'PARTIAL', closeReason: 'MANUAL', tags: ['consumer', 'hardware', 'cycle'], assetClass: 'STOCK' },
  { symbol: 'META', side: 'LONG', qty: 6, entry: 510, exit: 590, holdDays: 18, thesis: 'Q1 ad beat + raised guidance. Threads gaining monetizable DAUs. AI infra spend well-guided.', outcome: 'CONFIRMED', closeReason: 'TARGET_HIT', tags: ['advertising', 'ai', 'social'], assetClass: 'STOCK' },
  { symbol: 'BTC', side: 'LONG', qty: 0.2, entry: 58000, exit: 52000, holdDays: 9, thesis: 'Post-halving supply shock. ETF inflow pace accelerating. Mt Gox overhang resolved.', outcome: 'INVALIDATED', closeReason: 'STOP_HIT', tags: ['crypto', 'halving', 'macro'], assetClass: 'CRYPTO' },
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  console.log('🌱 Seeding database...');

  const email = 'dev@riabot.local';
  const username = 'devtrader';

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    include: { portfolios: true },
  });

  let userId: string;
  let portfolioId: string;

  if (existing) {
    console.log(`⚠️  Test user already exists (${email}).`);
    userId = existing.id;
    portfolioId = existing.portfolios[0]?.id;

    if (!portfolioId) {
      console.log('Creating missing portfolio...');
      const portfolio = await prisma.portfolio.create({
        data: { userId, name: 'Main Portfolio', cashBalance: 100000 },
      });
      portfolioId = portfolio.id;
    }

    const closedCount = await prisma.closedPosition.count({ where: { userId } });
    if (closedCount > 0) {
      console.log(`   ${closedCount} demo trades already exist. Skipping trade seed.`);
      console.log('✅ Done.');
      return;
    }
  } else {
    const passwordHash = await bcrypt.hash('password123', 12);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        displayName: 'Dev Trader',
        passwordHash,
        settings: {
          create: {
            riskTolerance: 'medium',
            maxPositionPct: 10,
            dailyLossLimit: 5000,
          },
        },
        portfolios: {
          create: { name: 'Main Portfolio', cashBalance: 100000 },
        },
        watchlists: {
          create: [
            { name: 'My Watchlist', isDefault: true },
            { name: 'High Conviction' },
          ],
        },
      },
      include: { portfolios: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'SEED_CREATED',
        entity: 'User',
        entityId: user.id,
      },
    });

    userId = user.id;
    portfolioId = user.portfolios[0].id;

    console.log('');
    console.log('✅ Test user created:');
    console.log(`   Email    : ${email}`);
    console.log(`   Username : ${username}`);
    console.log(`   Password : password123`);
    console.log(`   User ID  : ${userId}`);
  }

  console.log('');
  console.log('📈 Seeding demo closed trades...');

  let totalDaysOffset = 180;

  for (const t of DEMO_TRADES) {
    const openedAt = daysAgo(totalDaysOffset);
    const closedAt = daysAgo(totalDaysOffset - t.holdDays);
    totalDaysOffset -= t.holdDays + Math.floor(Math.random() * 5) + 2;

    const dir = t.side === 'LONG' ? 1 : -1;
    const realizedPnl = (t.exit - t.entry) * t.qty * dir;
    const realizedPct = ((t.exit - t.entry) / t.entry) * 100 * dir;
    const isWin = realizedPnl > 0;

    await prisma.closedPosition.create({
      data: {
        userId,
        portfolioId,
        symbol: t.symbol,
        name: t.symbol,
        assetClass: t.assetClass as any,
        side: t.side as any,
        quantity: t.qty,
        entryPrice: t.entry,
        exitPrice: t.exit,
        realizedPnl,
        realizedPct,
        holdingPeriodDays: t.holdDays,
        openedAt,
        closedAt,
        thesis: t.thesis,
        thesisOutcome: t.outcome as any,
        closeReason: t.closeReason as any,
        tags: t.tags,
        isWin,
      },
    });

    const arrow = isWin ? '✅' : '❌';
    const pnl = realizedPnl >= 0 ? `+$${realizedPnl.toFixed(0)}` : `-$${Math.abs(realizedPnl).toFixed(0)}`;
    console.log(`   ${arrow} ${t.side.padEnd(5)} ${t.symbol.padEnd(5)} ${pnl.padStart(10)} (${realizedPct.toFixed(1)}%) — ${t.outcome}`);
  }

  console.log('');
  console.log(`✅ Seeded ${DEMO_TRADES.length} demo trades.`);
  console.log('');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
