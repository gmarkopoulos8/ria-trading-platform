import { Router } from 'express';
import { getOptionsChain, computeIVRank } from '../services/options/OptionsDataService';
import { getRecommendation } from '../services/options/OptionsAnalyzer';
import { thesisEngine } from '../services/thesis/ThesisEngine';

const router = Router();

router.get('/chain', async (req, res) => {
  const symbol = req.query.symbol as string;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  try {
    const chain = await getOptionsChain(symbol.toUpperCase());
    if (!chain) return res.status(404).json({ error: 'No options data available', chain: null });
    return res.json(chain);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch options chain' });
  }
});

router.get('/iv-rank', async (req, res) => {
  const symbol = req.query.symbol as string;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  try {
    const ivRank = await computeIVRank(symbol.toUpperCase());
    if (!ivRank) return res.status(404).json({ error: 'No IV rank data available', ivRank: null });
    return res.json(ivRank);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to compute IV rank' });
  }
});

router.get('/recommendation', async (req, res) => {
  const symbol = req.query.symbol as string;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  try {
    const thesis = await thesisEngine.analyze(symbol.toUpperCase());
    const accountEquity = 100_000;
    const maxRisk = accountEquity * 0.02;
    const rec = await getRecommendation(thesis, accountEquity, maxRisk);
    if (!rec) return res.json({ recommendation: null, reason: 'No suitable options strategy found' });
    return res.json({ recommendation: rec, thesis: { bias: thesis.thesis.bias, conviction: thesis.thesis.convictionScore } });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get recommendation' });
  }
});

export default router;
