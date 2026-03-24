import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword, sanitizeUser } from '../lib/auth';
import { requireAuth } from '../middleware/requireAuth';
import { LoginSchema, RegisterSchema } from '@ria-bot/shared';
import { ZodError } from 'zod';

const router = Router();

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, username, password, displayName } = RegisterSchema.parse(req.body);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: existing.email === email ? 'Email already registered' : 'Username already taken',
        code: 'CONFLICT',
      });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        displayName,
        passwordHash,
        settings: { create: {} },
        portfolios: {
          create: { name: 'Main Portfolio', cashBalance: 100000 },
        },
        watchlists: {
          create: { name: 'My Watchlist', isDefault: true },
        },
      },
    });

    req.session.userId = user.id;

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REGISTER',
        entity: 'User',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.status(201).json({
      success: true,
      data: { user: sanitizeUser(user) },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
    }
    next(err);
  }
});

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const valid = await verifyPassword(password, user.passwordHash);

    if (!valid) {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN_FAILED',
          entity: 'User',
          entityId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });

      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      });
    }

    req.session.userId = user.id;

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.json({
      success: true,
      data: { user: sanitizeUser(user) },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
    }
    next(err);
  }
});

router.post('/logout', requireAuth, (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Logout failed' });
    }
    res.clearCookie('ria.sid');
    return res.json({ success: true, message: 'Logged out successfully' });
  });
});

router.get('/me', requireAuth, (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: { user: req.currentUser },
  });
});

router.put('/profile', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { displayName, phoneNumber } = req.body;
    if (displayName !== undefined && (typeof displayName !== 'string' || displayName.trim().length < 1)) {
      return res.status(400).json({ success: false, error: 'Invalid display name' });
    }
    const userId = req.session.userId!;
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(displayName  !== undefined && { displayName:  displayName.trim() }),
        ...(phoneNumber  !== undefined && { phoneNumber:  phoneNumber?.trim() || null }),
      },
    });
    return res.json({ success: true, data: { user: sanitizeUser(updated) } });
  } catch (err) {
    next(err);
  }
});

router.get('/notification-settings', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const [settings, user] = await Promise.all([
      prisma.userSettings.findUnique({
        where: { userId },
        select: { telegramChatId: true, telegramEnabled: true, telegramConsent: true, telegramConsentAt: true },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { phoneNumber: true } }),
    ]);
    res.json({
      success: true,
      data: {
        phoneNumber:       user?.phoneNumber ?? null,
        telegramLinked:    !!settings?.telegramChatId,
        telegramEnabled:   settings?.telegramEnabled  ?? false,
        telegramConsent:   settings?.telegramConsent  ?? false,
        telegramConsentAt: settings?.telegramConsentAt ?? null,
        botConfigured:     !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME),
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed' });
  }
});

router.post('/notification-settings/telegram-connect', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_BOT_USERNAME) {
      return res.status(400).json({ success: false, error: 'Telegram bot not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME in Replit Secrets.' });
    }
    const token  = crypto.randomBytes(20).toString('hex');
    const expiry = new Date(Date.now() + 10 * 60_000);
    const existing = await prisma.userSettings.findUnique({ where: { userId } });
    if (!existing) {
      await prisma.userSettings.create({ data: { userId, telegramConnectToken: token, telegramConnectExpiry: expiry } });
    } else {
      await prisma.userSettings.update({ where: { userId }, data: { telegramConnectToken: token, telegramConnectExpiry: expiry } });
    }
    const connectUrl = `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${token}`;
    res.json({ success: true, data: { connectUrl, expiresAt: expiry } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to generate connect link' });
  }
});

router.post('/notification-settings/telegram-disconnect', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    await prisma.userSettings.updateMany({
      where: { userId },
      data:  { telegramEnabled: false, telegramChatId: null, telegramConsent: false, telegramConsentAt: null },
    });
    res.json({ success: true, data: { disconnected: true } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed' });
  }
});

router.put('/password', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current and new password required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
    }
    const userId = req.session.userId!;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    const newHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

// Emergency seed — only works on empty database, disabled once any user exists
router.post('/setup', async (req: Request, res: Response) => {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return res.status(403).json({ success: false, error: 'Setup already completed' });
    }

    const passwordHash = await hashPassword('password123');

    const user = await prisma.user.create({
      data: {
        email:       'dev@riabot.local',
        username:    'devtrader',
        displayName: 'Dev Trader',
        passwordHash,
        settings:   { create: {} },
        portfolios: { create: { name: 'Main Portfolio', cashBalance: 100000 } },
        watchlists: { create: { name: 'My Watchlist', isDefault: true } },
      },
    });

    res.json({
      success: true,
      data: {
        message:  'Dev account created',
        email:    'dev@riabot.local',
        password: 'password123',
        userId:   user.id,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Setup failed' });
  }
});

export default router;
