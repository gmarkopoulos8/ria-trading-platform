// HARDCODED PAPER URL — do NOT change to live
export const ALPACA_PAPER_URL = 'https://paper-api.alpaca.markets';
export const ALPACA_DATA_URL  = 'https://data.alpaca.markets';

interface AlpacaRuntimeCreds {
  apiKeyId: string;
  secretKey: string;
  dryRun: boolean;
  maxDrawdownPct: number;
}

let _runtimeCreds: AlpacaRuntimeCreds | null = null;

export function setAlpacaRuntimeCredentials(creds: AlpacaRuntimeCreds): void {
  _runtimeCreds = creds;
}
export function clearAlpacaRuntimeCredentials(): void { _runtimeCreds = null; }
export function getAlpacaCredentials(): AlpacaRuntimeCreds | null { return _runtimeCreds; }
export function hasAlpacaCredentials(): boolean {
  return !!(_runtimeCreds?.apiKeyId && _runtimeCreds?.secretKey);
}

let _pauseActive = false;
let _pauseReason: string | null = null;
let _killswitchActive = false;
let _killswitchReason: string | null = null;
let _pauseActivatedAt: Date | null = null;
let _killswitchActivatedAt: Date | null = null;

export function isPauseActive(): boolean { return _pauseActive; }
export function isKillswitchActive(): boolean { return _killswitchActive; }

export function activatePause(reason: string): void {
  _pauseActive = true;
  _pauseReason = reason;
  _pauseActivatedAt = new Date();
}
export function deactivatePause(): void {
  _pauseActive = false;
  _pauseReason = null;
  _pauseActivatedAt = null;
}
export function activateKillswitch(reason: string): void {
  _killswitchActive = true;
  _killswitchReason = reason;
  _killswitchActivatedAt = new Date();
}
export function deactivateKillswitch(): void {
  _killswitchActive = false;
  _killswitchReason = null;
  _killswitchActivatedAt = null;
}

export function getPauseState() {
  return { active: _pauseActive, reason: _pauseReason, activatedAt: _pauseActivatedAt };
}
export function getKillswitchState() {
  return { active: _killswitchActive, reason: _killswitchReason, activatedAt: _killswitchActivatedAt };
}
export function getControlLevel(): 'ACTIVE' | 'PAUSE' | 'HARD_STOP' {
  if (_killswitchActive) return 'HARD_STOP';
  if (_pauseActive) return 'PAUSE';
  return 'ACTIVE';
}

export function assertSafe(action = 'order'): void {
  if (_killswitchActive) throw new Error(`Hard stop active — ${action} blocked. Reason: ${_killswitchReason ?? 'unknown'}`);
  if (_pauseActive)      throw new Error(`Trading paused — ${action} blocked. Reason: ${_pauseReason ?? 'unknown'}`);
}
