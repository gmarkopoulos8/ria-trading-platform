import { Router, Request, Response, NextFunction } from 'express';
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
    res.clearCookie('connect.sid');
    return res.json({ success: true, message: 'Logged out successfully' });
  });
});

router.get('/me', requireAuth, (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: { user: req.currentUser },
  });
});

export default router;
