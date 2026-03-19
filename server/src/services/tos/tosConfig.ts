// ─── Schwab / ThinkorSwim Configuration ──────────────────────────
// All tunable parameters. Source values from Replit Secrets.

export const TOS_CONFIG = {
  BASE_URL:     'https://api.schwabapi.com',
  TOKEN_URL:    'https://api.schwabapi.com/v1/oauth/token',
  TRADER_URL:   'https://api.schwabapi.com/trader/v1',
  MARKET_URL:   'https://api.schwabapi.com/marketdata/v1',

  get CLIENT_ID(): string {
    return process.env.SCHWAB_CLIENT_ID ?? '';
  },

  get CLIENT_SECRET(): string {
    return process.env.SCHWAB_CLIENT_SECRET ?? '';
  },

  get REDIRECT_URI(): string {
    return process.env.SCHWAB_REDIRECT_URI ?? 'https://127.0.0.1';
  },

  get REFRESH_TOKEN(): string {
    return process.env.SCHWAB_REFRESH_TOKEN ?? '';
  },

  get ACCOUNT_NUMBER(): string {
    return process.env.SCHWAB_ACCOUNT_NUMBER ?? '';
  },

  get DRY_RUN(): boolean {
    return process.env.SCHWAB_DRY_RUN !== 'false';
  },

  get MAX_DRAWDOWN_PCT(): number {
    return parseFloat(process.env.SCHWAB_MAX_DRAWDOWN_PCT ?? '5');
  },

  get DEFAULT_QUANTITY(): number {
    return parseInt(process.env.SCHWAB_DEFAULT_QTY ?? '1');
  },

  REQUEST_TIMEOUT_MS: 12_000,

  RATE_LIMIT: {
    MAX_PER_SECOND:  10,
    MAX_PER_MINUTE: 120,
  },
};

// ─── In-memory killswitch state ───────────────────────────────────

let _killswitchActive = process.env.KILLSWITCH_TOS === 'true';
let _killswitchReason: string | null = _killswitchActive ? 'KILLSWITCH_TOS env var set at startup' : null;
let _killswitchTime: Date | null     = _killswitchActive ? new Date() : null;
let _killswitchTrigger: string       = _killswitchActive ? 'env' : '';

export function isKillswitchActive(): boolean { return _killswitchActive; }

export function getKillswitchState() {
  return {
    active: _killswitchActive,
    reason: _killswitchReason,
    activatedAt: _killswitchTime,
    trigger: _killswitchTrigger,
  };
}

export function activateKillswitch(reason: string, trigger: 'api' | 'env' | 'drawdown' | 'manual') {
  _killswitchActive  = true;
  _killswitchReason  = reason;
  _killswitchTime    = new Date();
  _killswitchTrigger = trigger;
  console.warn(`[TOS-KILLSWITCH] ACTIVATED | trigger=${trigger} | reason=${reason}`);
}

export function deactivateKillswitch() {
  _killswitchActive  = false;
  _killswitchReason  = null;
  _killswitchTime    = null;
  _killswitchTrigger = '';
  console.info('[TOS-KILLSWITCH] Deactivated');
}

export function hasCredentials(): boolean {
  return !!(TOS_CONFIG.CLIENT_ID && TOS_CONFIG.CLIENT_SECRET && TOS_CONFIG.REFRESH_TOKEN);
}

export function hasAccountNumber(): boolean {
  return !!TOS_CONFIG.ACCOUNT_NUMBER;
}
