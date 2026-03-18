import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'User settings — not yet implemented',
    data: { settings: null },
  });
});

router.put('/', async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Update settings — not yet implemented',
  });
});

router.get('/api-keys', async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'API key status — not yet implemented',
    data: { stocksApi: false, cryptoApi: false },
  });
});

router.put('/notifications', async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Notification settings — not yet implemented',
  });
});

export default router;
