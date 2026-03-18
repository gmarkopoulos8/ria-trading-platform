import { Router, Request, Response } from 'express';
import { CreateAlertSchema } from '@ria-bot/shared';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Alerts list — not yet implemented',
    data: { alerts: [] },
  });
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const body = CreateAlertSchema.parse(req.body);
    res.status(201).json({
      success: true,
      message: 'Create alert — not yet implemented',
      data: { alert: body },
    });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Invalid alert data' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ success: true, message: `Update alert ${id} — not yet implemented` });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ success: true, message: `Delete alert ${id} — not yet implemented` });
});

router.post('/:id/dismiss', async (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({ success: true, message: `Dismiss alert ${id} — not yet implemented` });
});

export default router;
