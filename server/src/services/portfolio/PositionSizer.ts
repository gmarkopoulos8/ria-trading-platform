export interface SizingConfig {
  totalEquity: number;
  maxPositionPct: number;
  convictionScore: number;
  riskScore?: number;
  minPositionUsd?: number;
  maxPositionUsd?: number;
}

export interface SizedPosition {
  dollarAmount: number;
  positionPct: number;
  quantity: number;
  entryPrice: number;
}

export function sizePosition(
  config: SizingConfig,
  entryPrice: number,
): SizedPosition {
  const {
    totalEquity,
    maxPositionPct,
    convictionScore,
    riskScore = 0.5,
    minPositionUsd = 500,
    maxPositionUsd = 50000,
  } = config;

  const cappedPct = Math.min(maxPositionPct, 10);

  const convictionMultiplier = Math.max(0.3, Math.min(1.0, convictionScore / 100));
  const riskAdjustment = Math.max(0.5, 1.0 - riskScore * 0.5);
  const adjustedPct = cappedPct * convictionMultiplier * riskAdjustment;

  let dollarAmount = (adjustedPct / 100) * totalEquity;
  dollarAmount = Math.max(minPositionUsd, Math.min(maxPositionUsd, dollarAmount));

  if (entryPrice <= 0) {
    return { dollarAmount, positionPct: adjustedPct, quantity: 0, entryPrice };
  }

  const rawQuantity = dollarAmount / entryPrice;
  const quantity = Math.floor(rawQuantity * 100) / 100;

  return {
    dollarAmount: quantity * entryPrice,
    positionPct: (quantity * entryPrice / totalEquity) * 100,
    quantity,
    entryPrice,
  };
}

export function computeStopLoss(entryPrice: number, side: 'LONG' | 'SHORT', stopPct = 3.0): number {
  return side === 'LONG'
    ? entryPrice * (1 - stopPct / 100)
    : entryPrice * (1 + stopPct / 100);
}

export function computeTakeProfit(entryPrice: number, side: 'LONG' | 'SHORT', tpPct = 6.0): number {
  return side === 'LONG'
    ? entryPrice * (1 + tpPct / 100)
    : entryPrice * (1 - tpPct / 100);
}
