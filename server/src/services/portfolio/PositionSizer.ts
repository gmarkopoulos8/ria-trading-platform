export interface SizingConfig {
  totalEquity: number;
  maxPositionPct: number;
  convictionScore: number;
  riskScore?: number;
  minPositionUsd?: number;
  maxPositionUsd?: number;
  atrPercent?: number;
  stopLossPrice?: number;
  entryPrice?: number;
  regimeSizeMultiplier?: number;
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
    atrPercent,
    stopLossPrice,
    regimeSizeMultiplier = 1.0,
  } = config;

  const cappedPct = Math.min(maxPositionPct, 10);
  const convictionMultiplier = Math.max(0.3, Math.min(1.0, convictionScore / 100));
  const riskAdjustment = Math.max(0.5, 1.0 - riskScore * 0.5);

  // ATR-based quantity sizing (Phase 3)
  let quantity: number;
  if (atrPercent !== undefined && atrPercent > 0 && entryPrice > 0) {
    const atrBasedStop = entryPrice * (atrPercent / 100) * 1.5;
    const thesisStop = stopLossPrice !== undefined
      ? Math.abs(entryPrice - stopLossPrice)
      : atrBasedStop;
    const effectiveStopDistance = Math.max(
      atrBasedStop,
      thesisStop,
      entryPrice * 0.005,
    );
    const riskPct = Math.max(0.5, Math.min(cappedPct * convictionMultiplier * riskAdjustment, 5));
    const riskAmount = totalEquity * (riskPct / 100);
    quantity = riskAmount / effectiveStopDistance;
    const maxNotional = Math.min(totalEquity * 0.10, maxPositionUsd);
    if (quantity * entryPrice > maxNotional) {
      quantity = maxNotional / entryPrice;
    }
  } else {
    const adjustedPct = cappedPct * convictionMultiplier * riskAdjustment;
    let dollarAmount = (adjustedPct / 100) * totalEquity;
    dollarAmount = Math.max(minPositionUsd, Math.min(maxPositionUsd, dollarAmount));
    quantity = entryPrice > 0 ? dollarAmount / entryPrice : 0;
  }

  // Apply regime size multiplier (Phase 4)
  quantity = quantity * regimeSizeMultiplier;
  quantity = Math.floor(quantity * 100) / 100;

  if (entryPrice <= 0 || quantity <= 0) {
    return { dollarAmount: 0, positionPct: 0, quantity: 0, entryPrice };
  }

  const dollarAmount = quantity * entryPrice;
  const positionPct = (dollarAmount / totalEquity) * 100;

  return { dollarAmount, positionPct, quantity, entryPrice };
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
