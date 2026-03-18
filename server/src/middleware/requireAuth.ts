import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({
        success: false,
        error: 'Session expired. Please sign in again.',
        code: 'SESSION_EXPIRED',
      });
    }

    req.currentUser = user;
    next();
  } catch (err) {
    next(err);
  }
}
