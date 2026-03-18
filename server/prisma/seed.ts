import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const email = 'dev@riabot.local';
  const username = 'devtrader';

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });

  if (existing) {
    console.log(`⚠️  Test user already exists (${email}). Skipping.`);
    return;
  }

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
        create: {
          name: 'Main Portfolio',
          cashBalance: 100000,
        },
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

  console.log('');
  console.log('✅ Test user created:');
  console.log(`   Email    : ${email}`);
  console.log(`   Username : ${username}`);
  console.log(`   Password : password123`);
  console.log(`   User ID  : ${user.id}`);
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
