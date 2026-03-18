import { Router, Request, Response } from 'express';
import { OpenPositionSchema, ClosePositionSchema } from '@ria-bot/shared';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Paper positions list — not yet implemented',
    data: { positions: [], portfolio: null },
  });
});

router.post('/open', async (req: Request, res: Response) => {
  try {
    const body = OpenPositionSchema.parse(req.body);
    res.status(201).json({
      success: true,
      message: 'Open position — not yet implemented',
      data: { position: body },
    });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Invalid position data' });
  }
});

router.post('/close', async (req: Request, res: Response) => {
  try {
    const body = ClosePositionSchema.parse(req.body);
    res.json({
      success: true,
      message: 'Close position — not yet implemented',
      data: { positionId: body.positionId },
    });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Invalid close data' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({
    success: true,
    message: `Position ${id} detail — not yet implemented`,
    data: null,
  });
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({
    success: true,
    message: `Update position ${id} — not yet implemented`,
    data: null,
  });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({
    success: true,
    message: `Delete position ${id} — not yet implemented`,
  });
});

export default router;
