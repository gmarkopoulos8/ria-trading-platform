import { prisma } from '../../lib/prisma';

export type ExchangeType = 'hyperliquid' | 'tos';

export interface ExchangeAutoConfig {
  id: string;
  userId: string;
  exchange: string;
  enabled: boolean;
  sessionDurationHours: number | null;
  dailyCutoffTime: string | null;
  activeDays: number[];
  sessionStartedAt: Date | null;
  sessionPausedAt: Date | null;
  sessionPauseReason: string | null;
  capitalHardLimitUsd: number;
  capitalTargetUsd: number;
  maxPositionSizeUsd: number;
  minPositionSizeUsd: number;
  riskMode: string;
  customRiskPct: number | null;
  minStopDistancePct: number;
  maxStopDistancePct: number;
  minRewardRiskRatio: number;
  maxDrawdownPct: number;
  maxDailyLossUsd: number;
  maxConcurrentPositions: number;
  maxTradesPerScan: number;
  maxTradesPerDay: number;
  orderCooldownMinutes: number;
  minConvictionScore: number;
  minConfidenceScore: number;
  allowedBias: string[];
  allowedActions: string[];
  minHoldThesisHealth: number;
  defaultLeverage: number;
  maxLeverage: number;
  useCrossMargin: boolean;
  allowedAssets: string[];
  blockedAssets: string[];
  allowShorts: boolean;
  allowedAssetTypes: string[];
  orderSession: string;
  orderDuration: string;
  useBracketOrders: boolean;
  blockedSectors: string[];
  minAvgDailyVolume: number;
  minMarketCapUsd: number;
  optionsEnabled: boolean;
  preferOptions: boolean;
  maxOptionsRiskPct: number;
  allowedOptionStrategies: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export async function getConfig(userId: string, exchange: ExchangeType): Promise<ExchangeAutoConfig> {
  let record = await prisma.exchangeAutoConfig.findUnique({
    where: { userId_exchange: { userId, exchange } },
  });

  if (!record) {
    record = await prisma.exchangeAutoConfig.create({
      data: { userId, exchange },
    });
  }

  return record as ExchangeAutoConfig;
}

export function validateConfig(config: Partial<ExchangeAutoConfig>, exchange: string): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const {
    capitalHardLimitUsd,
    capitalTargetUsd,
    maxPositionSizeUsd,
    minPositionSizeUsd,
    minStopDistancePct,
    maxStopDistancePct,
    minRewardRiskRatio,
    maxDailyLossUsd,
    defaultLeverage,
    maxLeverage,
    minConvictionScore,
  } = config;

  if (capitalTargetUsd != null && capitalHardLimitUsd != null && capitalTargetUsd > capitalHardLimitUsd) {
    errors.push('Capital target must be ≤ capital hard limit');
  }
  if (maxPositionSizeUsd != null && capitalTargetUsd != null && maxPositionSizeUsd > capitalTargetUsd) {
    errors.push('Max position size must be ≤ capital target');
  }
  if (minPositionSizeUsd != null && maxPositionSizeUsd != null && minPositionSizeUsd >= maxPositionSizeUsd) {
    errors.push('Min position size must be < max position size');
  }
  if (minStopDistancePct != null && maxStopDistancePct != null && minStopDistancePct >= maxStopDistancePct) {
    errors.push('Min stop distance must be < max stop distance');
  }
  if (minRewardRiskRatio != null && minRewardRiskRatio < 1.0) {
    errors.push('Min reward:risk ratio must be ≥ 1.0');
  }
  if (maxDailyLossUsd != null && capitalHardLimitUsd != null && maxDailyLossUsd > capitalHardLimitUsd * 0.5) {
    errors.push('Max daily loss cannot exceed 50% of capital hard limit');
  }
  if (minConvictionScore != null && (minConvictionScore < 50 || minConvictionScore > 99)) {
    errors.push('Min conviction score must be between 50 and 99');
  }

  if (exchange === 'hyperliquid') {
    if (defaultLeverage != null && maxLeverage != null && defaultLeverage > maxLeverage) {
      errors.push('Default leverage must be ≤ max leverage');
    }
    if (defaultLeverage != null && defaultLeverage > 20) {
      errors.push('Default leverage cannot exceed 20');
    }
    if (maxLeverage != null && maxLeverage > 20) {
      errors.push('Max leverage cannot exceed 20');
    }
    if (maxLeverage != null && maxLeverage > 5) {
      warnings.push('High leverage increases liquidation risk');
    }
  }

  if (maxStopDistancePct != null && maxStopDistancePct > 10) {
    warnings.push('Wide stops will reduce position sizes significantly');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export async function saveConfig(
  userId: string,
  exchange: string,
  updates: Partial<ExchangeAutoConfig>,
): Promise<ExchangeAutoConfig> {
  const validation = validateConfig(updates, exchange);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
  }

  const hlOnlyFields = ['defaultLeverage', 'maxLeverage', 'useCrossMargin', 'allowedAssets', 'blockedAssets', 'allowShorts'];
  const tosOnlyFields = ['allowedAssetTypes', 'orderSession', 'orderDuration', 'useBracketOrders', 'blockedSectors', 'minAvgDailyVolume', 'minMarketCapUsd'];

  const clean = { ...updates };
  delete (clean as Record<string, unknown>).id;
  delete (clean as Record<string, unknown>).userId;
  delete (clean as Record<string, unknown>).exchange;
  delete (clean as Record<string, unknown>).createdAt;
  delete (clean as Record<string, unknown>).updatedAt;

  if (exchange === 'tos') {
    for (const f of hlOnlyFields) delete (clean as Record<string, unknown>)[f];
  } else if (exchange === 'hyperliquid') {
    for (const f of tosOnlyFields) delete (clean as Record<string, unknown>)[f];
  }

  const record = await prisma.exchangeAutoConfig.upsert({
    where: { userId_exchange: { userId, exchange } },
    create: { userId, exchange, ...clean },
    update: clean,
  });

  return record as ExchangeAutoConfig;
}

function getNYTime(): { hour: number; minute: number; dayOfWeek: number } {
  const now = new Date();
  const nyStr = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'narrow',
    hour12: false,
  });
  const parts = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
    hour12: false,
  });
  const hour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }), 10);
  const minute = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', minute: 'numeric', hour12: false }), 10);
  const dayOfWeek = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
  void nyStr; void parts;
  return { hour, minute, dayOfWeek };
}

export async function checkSessionActive(
  userId: string,
  exchange: string,
): Promise<{ active: boolean; reason?: string }> {
  const config = await prisma.exchangeAutoConfig.findUnique({
    where: { userId_exchange: { userId, exchange } },
  });

  if (!config) return { active: false, reason: 'No config found' };
  if (!config.enabled) return { active: false, reason: 'Exchange autonomous trading is disabled' };

  const { hour, minute, dayOfWeek } = getNYTime();

  if (config.activeDays.length > 0 && !config.activeDays.includes(dayOfWeek)) {
    return { active: false, reason: `Not an active trading day (day ${dayOfWeek})` };
  }

  if (config.dailyCutoffTime) {
    const [cutH, cutM] = config.dailyCutoffTime.split(':').map(Number);
    const nowMinutes = hour * 60 + minute;
    const cutMinutes = cutH * 60 + cutM;
    if (nowMinutes >= cutMinutes) {
      return { active: false, reason: `Past daily cutoff time ${config.dailyCutoffTime} ET` };
    }
  }

  if (config.sessionDurationHours != null && config.sessionStartedAt) {
    const elapsedHours = (Date.now() - new Date(config.sessionStartedAt).getTime()) / 3_600_000;
    if (elapsedHours >= config.sessionDurationHours) {
      return { active: false, reason: `Session duration of ${config.sessionDurationHours}h elapsed` };
    }
  }

  const todayTradeCount = await getTodayTradeCount(userId, exchange);
  if (todayTradeCount >= config.maxTradesPerDay) {
    return { active: false, reason: `Max daily trades (${config.maxTradesPerDay}) reached` };
  }

  const todayLoss = await getTodayLossUsd(userId, exchange);
  if (todayLoss >= config.maxDailyLossUsd) {
    return { active: false, reason: `Daily loss limit ($${config.maxDailyLossUsd}) reached` };
  }

  return { active: true };
}

export async function startSession(userId: string, exchange: string): Promise<void> {
  await prisma.exchangeAutoConfig.upsert({
    where: { userId_exchange: { userId, exchange } },
    create: { userId, exchange, enabled: true, sessionStartedAt: new Date(), sessionPausedAt: null, sessionPauseReason: null },
    update: { enabled: true, sessionStartedAt: new Date(), sessionPausedAt: null, sessionPauseReason: null },
  });
}

export async function pauseSession(userId: string, exchange: string, reason: string): Promise<void> {
  const settings = await prisma.userSettings.findFirst({ where: { userId } });
  if (!settings) return;

  await prisma.exchangeAutoConfig.updateMany({
    where: { userId, exchange },
    data: { sessionPausedAt: new Date(), sessionPauseReason: reason },
  });

  await prisma.autoTradeLog.create({
    data: {
      userSettingsId: settings.id,
      sessionId: `session_pause_${Date.now()}`,
      phase: 'SESSION',
      exchange: exchange.toUpperCase(),
      symbol: 'N/A',
      assetClass: 'N/A',
      action: 'SESSION_PAUSED',
      status: 'BLOCKED',
      dryRun: false,
      reason,
      metadata: JSON.parse(JSON.stringify({ exchange, reason, pausedAt: new Date().toISOString() })),
    },
  });
}

export async function getTodayTradeCount(userId: string, exchange: string): Promise<number> {
  const settings = await prisma.userSettings.findFirst({ where: { userId } });
  if (!settings) return 0;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return prisma.autoTradeLog.count({
    where: {
      userSettingsId: settings.id,
      exchange: exchange.toUpperCase(),
      action: { in: ['BUY', 'SELL'] },
      status: 'submitted',
      executedAt: { gte: startOfDay },
    },
  });
}

export async function getTodayLossUsd(userId: string, exchange: string): Promise<number> {
  const settings = await prisma.userSettings.findFirst({ where: { userId } });
  if (!settings) return 0;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const logs = await prisma.autoTradeLog.findMany({
    where: {
      userSettingsId: settings.id,
      exchange: exchange.toUpperCase(),
      phase: 'EXIT',
      pnl: { lt: 0 },
      executedAt: { gte: startOfDay },
    },
    select: { pnl: true },
  });

  return Math.abs(logs.reduce((sum, l) => sum + (l.pnl ?? 0), 0));
}
