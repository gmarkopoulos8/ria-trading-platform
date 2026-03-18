import 'express-session';
import type { SafeUser } from '../lib/auth';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: SafeUser;
    }
  }
}
