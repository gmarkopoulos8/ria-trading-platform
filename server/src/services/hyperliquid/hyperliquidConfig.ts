// ─── Hyperliquid Configuration ────────────────────────────────────
// All tunable parameters. DB credentials override env vars at runtime.

let _runtimeCreds: {
  walletAddress?: string;
  agentPrivateKey?: string;
  isMainnet?: boolean;
  dryRun?: boolean;
  maxDrawdownPct?: number;
  defaultLeverage?: number;
} | null = null;

export function setHLRuntimeCredentials(creds: typeof _runtimeCreds): void {
  _runtimeCreds = creds;
  console.info('[HL-Config] Runtime credentials loaded from database');
}

export function clearHLRuntimeCredentials(): void {
  _runtimeCreds = null;
}

export const HL_CONFIG = {
  MAINNET_API: 'https://api.hyperliquid.xyz',
  TESTNET_API: 'https://api.hyperliquid-testnet.xyz',

  get API_URL() {
    return this.IS_MAINNET ? this.MAINNET_API : this.TESTNET_API;
  },

  get IS_MAINNET() {
    return _runtimeCreds?.isMainnet ?? (process.env.HL_TESTNET !== 'true');
  },

  get WALLET_ADDRESS(): string {
    return (_runtimeCreds?.walletAddress ?? process.env.HL_WALLET_ADDRESS ?? '').toLowerCase();
  },

  get PRIVATE_KEY(): string | null {
    return process.env.HL_PRIVATE_KEY ?? null;
  },

  get AGENT_PRIVATE_KEY(): string | null {
    return _runtimeCreds?.agentPrivateKey ?? process.env.HL_AGENT_PRIVATE_KEY ?? null;
  },

  get DRY_RUN(): boolean {
    if (_runtimeCreds?.dryRun !== undefined) return _runtimeCreds.dryRun;
    return process.env.HL_DRY_RUN !== 'false';
  },

  get MAX_DRAWDOWN_PCT(): number {
    return _runtimeCreds?.maxDrawdownPct ?? parseFloat(process.env.HL_MAX_DRAWDOWN_PCT ?? '5');
  },

  get DEFAULT_LEVERAGE(): number {
    return _runtimeCreds?.defaultLeverage ?? parseInt(process.env.HL_DEFAULT_LEVERAGE ?? '3');
  },

  DEFAULT_SLIPPAGE_PCT: parseFloat(process.env.HL_SLIPPAGE_PCT ?? '0.3'),
  MAX_ORDER_VALUE_USD:  parseFloat(process.env.HL_MAX_ORDER_USD ?? '10000'),
  REQUEST_TIMEOUT_MS:   10_000,
};

// ─── In-memory killswitch state ───────────────────────────────────

let _killswitchActive = process.env.KILLSWITCH === 'true';
let _killswitchReason = _killswitchActive ? 'KILLSWITCH env var set at startup' : null;
let _killswitchTime: Date | null = _killswitchActive ? new Date() : null;
let _killswitchTrigger: string = _killswitchActive ? 'env' : '';

export function isKillswitchActive(): boolean {
  return _killswitchActive;
}

export function getKillswitchState() {
  return {
    active: _killswitchActive,
    reason: _killswitchReason,
    activatedAt: _killswitchTime,
    trigger: _killswitchTrigger,
  };
}

export function activateKillswitch(reason: string, trigger: 'api' | 'env' | 'drawdown' | 'manual') {
  _killswitchActive = true;
  _killswitchReason = reason;
  _killswitchTime   = new Date();
  _killswitchTrigger = trigger;
  console.warn(`[HL-KILLSWITCH] ACTIVATED | trigger=${trigger} | reason=${reason}`);
}

export function deactivateKillswitch() {
  _killswitchActive  = false;
  _killswitchReason  = null;
  _killswitchTime    = null;
  _killswitchTrigger = '';
  console.info('[HL-KILLSWITCH] Deactivated');
}

export function hasCredentials(): boolean {
  return !!(HL_CONFIG.WALLET_ADDRESS && HL_CONFIG.WALLET_ADDRESS.startsWith('0x'));
}

export function hasSigningKey(): boolean {
  return !!(HL_CONFIG.PRIVATE_KEY ?? HL_CONFIG.AGENT_PRIVATE_KEY);
}
