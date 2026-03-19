import 'express-session';
import type { SafeUser } from '../lib/auth';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    pendingTosAuth?: { clientId: string; clientSecret: string; redirectUri: string };
  }
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: SafeUser;
    }
  }
}
