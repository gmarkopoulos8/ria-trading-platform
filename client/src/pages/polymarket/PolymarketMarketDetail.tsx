import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Zap, DollarSign, Droplets, Clock, TrendingUp, TrendingDown,
  Minus, AlertTriangle, ShieldCheck, ChevronDown, ChevronUp, Target,
  PlusCircle, CheckCircle2, RefreshCw, ExternalLink, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { cn } from '../../lib/utils';
import { api } from '../../api/client';
import { Card, CardHeader } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { ThesisCard } from '../../components/polymarket/ThesisCard';

type PolyBias = 'yes' | 'no' | 'neutral';
type ActionLabel = 'high conviction' | 'tradable' | 'developing' | 'weak' | 'avoid';

interface Market {
  id: string; question: string; description: string; category: string;
  conditionId: string; outcomes: string[]; outcomePrices: number[];
  yesPrice: number; noPrice: number; volume: number; liquidity: number;
  active: boolean; closed: boolean; endDate: string | null; imageUrl: string;
  eventId: string | null; eventTitle: string | null; slug: string;
}

interface ThesisData {
  marketId: string; question: string; yesPrice: number; noPrice: number;
  healthScore: number; bias: PolyBias; confidenceScore: number; liquidityScore: number;
  momentumScore: number; riskScore: number; actionLabel: ActionLabel;
  thesisSummary: string; supportingReasons: string[]; mainRisk: string;
  suggestedHold: string; analyzedAt: string;
  priceSnapshot: { yesPrice: number; noPrice: number; volume: number; liquidity: number };
}

interface PricePoint { t: number; p: number }

const ACTION_META: Record<ActionLabel, { color: string; bg: string }> = {
  'high conviction': { color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  'tradable':        { color: 'text-accent-blue',  bg: 'bg-accent-blue/15 border-accent-blue/30' },
  'developing':      { color: 'text-yellow-400',   bg: 'bg-yellow-500/15 border-yellow-500/30' },
  'weak':            { color: 'text-orange-400',   bg: 'bg-orange-500/15 border-orange-500/30' },
  'avoid':           { color: 'text-red-400',      bg: 'bg-red-500/15 border-red-500/30' },
};

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}
function pct(p: number) { return `${(p * 100).toFixed(2)}¢`; }
function ts(t: number)  {
  const d = new Date(t * 1000);
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function daysUntil(d: string | null): string {
  if (!d) return '—';
  const ms = new Date(d).getTime() - Date.now();
  if (ms < 0)        return 'Ended';
  const days = ms / 86_400_000;
  if (days < 1)  return `${Math.round(ms / 3_600_000)}h`;
  if (days < 30) return `${Math.round(days)}d`;
  return `${Math.round(days / 30)}mo`;
}

function OpenPositionForm({ market, onClose }: { market: Market; onClose: () => void }) {
  const qc = useQueryClient();
  const [side, setSide]     = useState<'YES' | 'NO'>('YES');
  const [qty, setQty]       = useState('10');
  const [capital, setCapital] = useState('100');
  const [notes, setNotes]   = useState('');

  const entryProb = side === 'YES' ? market.yesPrice : market.noPrice;

  const mutation = useMutation({
    mutationFn: (body: object) => api.polymarket.openPosition(body),
    onSuccess: () => {
      toast.success(`Paper position opened — ${side} @ ${pct(entryProb)}`);
      qc.invalidateQueries({ queryKey: ['poly-positions'] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to open position'),
  });

  const handleSubmit = () => {
    if (!qty || !capital) { toast.error('Enter quantity and capital'); return; }
    mutation.mutate({
      marketId: market.id,
      eventId: market.eventId ?? undefined,
      question: market.question,
      selectedSide: side,
      entryProbability: entryProb,
      quantity: parseFloat(qty),
      capitalAllocated: parseFloat(capital),
      notes: notes || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-card w-full max-w-md rounded-2xl p-6 border border-surface-border">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-white">Open Paper Position</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <span className="text-xl">×</span>
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-5 line-clamp-2">{market.question}</p>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-slate-500 mb-2">Side</p>
            <div className="grid grid-cols-2 gap-2">
              {(['YES', 'NO'] as const).map((s) => {
                const price = s === 'YES' ? market.yesPrice : market.noPrice;
                return (
                  <button key={s} onClick={() => setSide(s)}
                    className={cn('py-3 rounded-xl border text-sm font-bold transition-all',
                      side === s
                        ? s === 'YES' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                      : 'bg-red-500/20 border-red-500/50 text-red-400'
                        : 'bg-surface-2 border-surface-border text-slate-400 hover:text-white')}>
                    {s} <span className="text-[10px] font-mono opacity-70">{pct(price)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-500 mb-1.5">Quantity (shares)</p>
              <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="1"
                className="w-full bg-surface-2 border border-surface-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent-purple/60" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1.5">Capital ($)</p>
              <input value={capital} onChange={(e) => setCapital(e.target.value)} type="number" min="1"
                className="w-full bg-surface-2 border border-surface-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent-purple/60" />
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-1.5">Entry Probability</p>
            <p className="text-lg font-mono font-bold text-white">{pct(entryProb)} <span className="text-xs text-slate-500">({(entryProb * 100).toFixed(1)}%)</span></p>
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-1.5">Notes (optional)</p>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thesis notes…"
              className="w-full bg-surface-2 border border-surface-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent-purple/60 placeholder-slate-600" />
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-surface-border text-slate-400 text-sm hover:text-white transition-colors">Cancel</button>
            <button onClick={handleSubmit} disabled={mutation.isPending}
              className="flex-1 py-2.5 rounded-xl bg-accent-purple text-white text-sm font-bold hover:bg-accent-purple/80 transition-colors disabled:opacity-50">
              {mutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mx-auto" /> : 'Open Position'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PolymarketMarketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [interval, setInterval] = useState<'1d' | '7d' | '30d'>('7d');
  const [showPosition, setShowPosition] = useState(false);
  const [showDesc, setShowDesc] = useState(false);

  const { data: marketData, isLoading: mLoading } = useQuery({
    queryKey: ['poly-market', id],
    queryFn: () => api.polymarket.market(id!),
    enabled: !!id,
    staleTime: 60_000,
  });

  const { data: thesisData, isLoading: tLoading, refetch: refetchThesis } = useQuery({
    queryKey: ['poly-thesis', id],
    queryFn: () => api.polymarket.thesis(id!),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });

  const { data: historyData, isLoading: hLoading } = useQuery({
    queryKey: ['poly-history', id, interval],
    queryFn: () => api.polymarket.history(id!, interval),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });

  const { data: orderbookData } = useQuery({
    queryKey: ['poly-orderbook', id],
    queryFn: () => api.polymarket.orderbook(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  const market: Market | null = (marketData as any)?.data?.market ?? null;
  const thesis: ThesisData | null = (thesisData as any)?.data?.thesis ?? null;
  const history: PricePoint[] = (historyData as any)?.data?.history ?? [];
  const orderbook = (orderbookData as any)?.data?.orderbook ?? null;

  if (mLoading) return <div className="flex-1 flex items-center justify-center"><LoadingState message="Loading market data…" /></div>;
  if (!market)  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <AlertTriangle className="h-8 w-8 text-red-400" />
      <p className="text-slate-400">Market not found</p>
      <button onClick={() => navigate('/polymarket')} className="text-accent-purple hover:underline text-sm">← Back to Explorer</button>
    </div>
  );

  const actionMeta = thesis ? ACTION_META[thesis.actionLabel] : null;
  const chartData = history.map((pt) => ({ time: ts(pt.t), price: parseFloat((pt.p * 100).toFixed(2)) }));
  const priceMin  = Math.min(...chartData.map((d) => d.price), market.yesPrice * 100) - 2;
  const priceMax  = Math.max(...chartData.map((d) => d.price), market.yesPrice * 100) + 2;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-surface-border bg-surface-1 px-6 py-4">
        <button onClick={() => navigate('/polymarket')} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white mb-3 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Market Explorer
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-white leading-snug mb-1 line-clamp-2">{market.question}</h1>
            <div className="flex flex-wrap gap-1.5 items-center">
              {market.eventTitle && <span className="text-[10px] text-slate-500 bg-surface-2 border border-surface-border px-2 py-0.5 rounded">{market.eventTitle}</span>}
              <span className="text-[10px] text-slate-500 bg-surface-2 border border-surface-border px-2 py-0.5 rounded">{market.category || 'General'}</span>
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', market.active && !market.closed ? 'text-accent-green border-accent-green/30 bg-accent-green/10' : 'text-red-400 border-red-400/30 bg-red-400/10')}>
                {market.closed ? 'CLOSED' : market.active ? 'ACTIVE' : 'INACTIVE'}
              </span>
              {thesis && actionMeta && (
                <span className={cn('text-[10px] font-black px-2 py-0.5 rounded border', actionMeta.bg, actionMeta.color)}>
                  {thesis.actionLabel.toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <button onClick={() => setShowPosition(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent-purple text-white text-xs font-bold rounded-xl hover:bg-accent-purple/80 transition-colors flex-shrink-0">
            <PlusCircle className="h-4 w-4" /> Paper Trade
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-0 h-full">
          <div className="xl:col-span-2 border-r border-surface-border overflow-y-auto">
            <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-surface-border">
              {[
                { label: 'YES Price', value: pct(market.yesPrice), color: 'text-accent-green', icon: <TrendingUp className="h-3.5 w-3.5" /> },
                { label: 'NO Price',  value: pct(market.noPrice),  color: 'text-red-400',      icon: <TrendingDown className="h-3.5 w-3.5" /> },
                { label: 'Volume',    value: fmt(market.volume),   color: 'text-accent-blue',  icon: <BarChart3 className="h-3.5 w-3.5" /> },
                { label: 'Liquidity', value: fmt(market.liquidity),color: 'text-yellow-400',  icon: <Droplets className="h-3.5 w-3.5" /> },
              ].map(({ label, value, color, icon }) => (
                <div key={label} className="bg-surface-2 rounded-xl p-3">
                  <div className={cn('flex items-center gap-1.5 mb-1', color)}>{icon}<p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p></div>
                  <p className={cn('text-lg font-bold font-mono', color)}>{value}</p>
                </div>
              ))}
            </div>

            <div className="p-5 border-b border-surface-border">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">YES Probability · Price History</p>
                <div className="flex gap-1">
                  {(['1d', '7d', '30d'] as const).map((iv) => (
                    <button key={iv} onClick={() => setInterval(iv)}
                      className={cn('text-[10px] px-2.5 py-1 rounded-lg border transition-colors',
                        interval === iv ? 'bg-accent-purple/20 border-accent-purple/40 text-accent-purple' : 'border-surface-border text-slate-500 hover:text-white')}>
                      {iv}
                    </button>
                  ))}
                </div>
              </div>
              {hLoading ? (
                <div className="h-40 flex items-center justify-center"><RefreshCw className="h-4 w-4 animate-spin text-slate-500" /></div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <XAxis dataKey="time" tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis domain={[Math.max(0, priceMin), Math.min(100, priceMax)]} tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}¢`} width={35} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', fontSize: 11 }}
                      labelStyle={{ color: '#94a3b8' }} formatter={(v: unknown) => [`${Number(v).toFixed(2)}¢ YES`, 'Price']} />
                    <ReferenceLine y={50} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="price" stroke="#a78bfa" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center">
                  <p className="text-slate-600 text-xs">Price history unavailable for this market</p>
                </div>
              )}
            </div>

            {orderbook && (orderbook.bids?.length > 0 || orderbook.asks?.length > 0) && (
              <div className="p-5 border-b border-surface-border">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-mono mb-3">Order Book (YES)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-accent-green mb-2 font-mono">BIDS</p>
                    {orderbook.bids.slice(0, 6).map((b: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs font-mono py-0.5">
                        <span className="text-accent-green">{(b.price * 100).toFixed(2)}¢</span>
                        <span className="text-slate-500">{b.size.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-[10px] text-red-400 mb-2 font-mono">ASKS</p>
                    {orderbook.asks.slice(0, 6).map((a: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs font-mono py-0.5">
                        <span className="text-red-400">{(a.price * 100).toFixed(2)}¢</span>
                        <span className="text-slate-500">{a.size.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {orderbook.midpoint != null && (
                  <p className="text-[10px] text-slate-500 mt-2 font-mono">Mid: {(orderbook.midpoint * 100).toFixed(2)}¢ · Spread: {orderbook.spread != null ? (orderbook.spread * 100).toFixed(3) : '—'}¢</p>
                )}
              </div>
            )}

            {market.description && (
              <div className="p-5 border-b border-surface-border">
                <button onClick={() => setShowDesc((v) => !v)} className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors mb-2">
                  {showDesc ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  Market Rules & Description
                </button>
                {showDesc && <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">{market.description}</p>}
              </div>
            )}

            {market.endDate && (
              <div className="p-5">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  Resolves: <span className="text-white font-mono">{new Date(market.endDate).toLocaleString()}</span>
                  <span className={cn('font-bold', daysUntil(market.endDate) === 'Today' ? 'text-orange-400' : 'text-slate-500')}>
                    ({daysUntil(market.endDate)})
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="overflow-y-auto p-5 space-y-4">
            {tLoading ? (
              <LoadingState message="Running AI analysis…" />
            ) : thesis ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Zap className="h-3 w-3" /> AI Research Verdict
                  </p>
                  <button onClick={() => refetchThesis()} className="text-[10px] text-slate-600 hover:text-white flex items-center gap-1 transition-colors">
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </button>
                </div>
                <ThesisCard thesis={{ ...thesis, analyzedAt: thesis.analyzedAt ?? new Date().toISOString() }} />

                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-mono mb-2 flex items-center gap-1.5">
                    <ShieldCheck className="h-3 w-3" /> Supporting Reasons
                  </p>
                  <ul className="space-y-1.5">
                    {thesis.supportingReasons.map((r, i) => (
                      <li key={i} className="flex gap-2 text-xs text-slate-300">
                        <span className="text-accent-green flex-shrink-0">✓</span><span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3">
                  <p className="text-[10px] text-orange-400 uppercase tracking-wider font-mono mb-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" /> Key Risk
                  </p>
                  <p className="text-xs text-slate-300">{thesis.mainRisk}</p>
                </div>

                <div className="bg-surface-2 rounded-xl p-4 border border-surface-border">
                  <p className="text-[10px] text-slate-500 mb-3 uppercase tracking-wider font-mono">Score Breakdown</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Market Health', value: thesis.healthScore, color: 'text-accent-purple' },
                      { label: 'Liquidity', value: thesis.liquidityScore, color: 'text-accent-blue' },
                      { label: 'Momentum', value: thesis.momentumScore, color: 'text-teal-400' },
                      { label: 'Confidence', value: thesis.confidenceScore, color: 'text-yellow-400' },
                      { label: 'Risk', value: thesis.riskScore, color: 'text-accent-green' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="space-y-0.5">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500">{label}</span>
                          <span className={cn('font-mono font-bold', color)}>{Math.round(value)}</span>
                        </div>
                        <div className="h-1 bg-surface-border rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', color.replace('text-', 'bg-'))} style={{ width: `${value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Zap className="h-8 w-8 text-slate-600" />
                <p className="text-slate-500 text-sm">No thesis yet</p>
                <button onClick={() => refetchThesis()} className="text-xs text-accent-purple hover:underline">Run AI Analysis</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showPosition && market && <OpenPositionForm market={market} onClose={() => setShowPosition(false)} />}
    </div>
  );
}
