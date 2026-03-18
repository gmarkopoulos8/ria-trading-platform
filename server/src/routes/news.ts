import { Router, Request, Response } from 'express';
import { newsService } from '../services/news/NewsService';

const router = Router();

const EVENT_TYPES = [
  'ALL', 'EARNINGS', 'GUIDANCE', 'FILING', 'PARTNERSHIP', 'CONTRACT',
  'PRODUCT_LAUNCH', 'LAWSUIT', 'REGULATORY', 'EXECUTIVE_CHANGE',
  'SECURITY_BREACH', 'ANALYST_ACTION', 'MACRO', 'SECTOR',
  'CRYPTO_EXCHANGE', 'TOKEN_UNLOCK', 'CHAIN_OUTAGE', 'PROTOCOL_EXPLOIT', 'GENERAL',
];

const SENTIMENT_TYPES = ['ALL', 'POSITIVE', 'NEGATIVE', 'NEUTRAL'];

router.get('/', async (req: Request, res: Response) => {
  try {
    const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : undefined;
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
    const eventType = String(req.query.eventType ?? req.query.category ?? 'ALL').toUpperCase();
    const sentiment = String(req.query.sentiment ?? 'ALL').toUpperCase();

    const validEventType = EVENT_TYPES.includes(eventType) ? eventType : 'ALL';
    const validSentiment = SENTIMENT_TYPES.includes(sentiment) ? sentiment : 'ALL';

    if (symbol) {
      const analysis = await newsService.getCatalysts(symbol, {
        limit,
        eventType: validEventType !== 'ALL' ? validEventType : undefined,
        sentiment: validSentiment !== 'ALL' ? validSentiment : undefined,
      });
      return res.json({
        success: true,
        data: {
          articles: analysis.newsItems,
          sentimentSummary: analysis.sentimentSummary,
          total: analysis.newsItems.length,
          filters: { symbol, eventType: validEventType, sentiment: validSentiment, limit },
        },
      });
    }

    const articles = await newsService.getMarketNews({
      limit,
      eventType: validEventType !== 'ALL' ? validEventType : undefined,
    });

    return res.json({
      success: true,
      data: {
        articles,
        total: articles.length,
        filters: { eventType: validEventType, sentiment: validSentiment, limit },
      },
    });
  } catch (err) {
    console.error('[/news]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch news' });
  }
});

router.get('/catalysts', async (req: Request, res: Response) => {
  try {
    const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : undefined;
    if (!symbol) {
      return res.status(400).json({ success: false, error: 'symbol is required' });
    }
    const analysis = await newsService.getCatalysts(symbol, { limit: 15 });
    return res.json({
      success: true,
      data: {
        ticker: analysis.ticker,
        catalysts: analysis.newsItems,
        sentimentSummary: analysis.sentimentSummary,
        analyzedAt: analysis.analyzedAt,
        timespan: analysis.timespan,
      },
    });
  } catch (err) {
    console.error('[/news/catalysts]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch catalysts' });
  }
});

router.get('/sentiment', async (req: Request, res: Response) => {
  try {
    const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : undefined;
    if (!symbol) {
      return res.status(400).json({ success: false, error: 'symbol is required' });
    }
    const analysis = await newsService.getCatalysts(symbol, { limit: 20 });
    return res.json({
      success: true,
      data: { symbol, sentiment: analysis.sentimentSummary },
    });
  } catch (err) {
    console.error('[/news/sentiment]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch sentiment' });
  }
});

router.get('/:id', async (_req: Request, res: Response) => {
  return res.json({
    success: true,
    data: { message: 'Individual article lookup not yet supported' },
  });
});

export default router;
