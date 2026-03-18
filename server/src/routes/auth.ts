import { Router, Request, Response } from 'express';
import { LoginSchema, RegisterSchema } from '@ria-bot/shared';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  try {
    const body = LoginSchema.parse(req.body);
    res.json({
      success: true,
      message: 'Login endpoint — authentication not yet implemented',
      data: { email: body.email },
    });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Invalid credentials' });
  }
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const body = RegisterSchema.parse(req.body);
    res.status(201).json({
      success: true,
      message: 'Register endpoint — registration not yet implemented',
      data: { email: body.email, username: body.username },
    });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Registration failed' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

router.get('/me', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: null,
    message: 'Auth /me endpoint — session not yet implemented',
  });
});

export default router;
