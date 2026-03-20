import axios, { AxiosError } from 'axios';

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const url = error.config?.url ?? '';
    const isAuthMe = url.includes('/auth/me');
    const isAuthRoute = url.includes('/auth/');
    if (error.response?.status === 401 && !isAuthMe && !isAuthRoute) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: Array<{ field: string; message: string }>;
}

export async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await apiClient.get<T>(path, { params });
  return data;
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await apiClient.post<T>(path, body);
  return data;
}

export async function put<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await apiClient.put<T>(path, body);
  return data;
}

export async function del<T>(path: string): Promise<T> {
  const { data } = await apiClient.delete<T>(path);
  return data;
}

export async function patch<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await apiClient.patch<T>(path, body);
  return data;
}

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  success: boolean;
  data?: { user: User };
  error?: string;
  details?: Array<{ field: string; message: string }>;
}

export const api = {
  health: () => get<{ success: boolean; service: string }>('/health'),

  auth: {
    me: () => get<AuthResponse>('/auth/me'),
    login: (body: { email: string; password: string }) =>
      post<AuthResponse>('/auth/login', body),
    logout: () => post<AuthResponse>('/auth/logout'),
    register: (body: {
      email: string;
      username: string;
      password: string;
      displayName: string;
    }) => post<AuthResponse>('/auth/register', body),
    updateProfile: (body: unknown) => put('/auth/profile', body),
    changePassword: (body: unknown) => put('/auth/password', body),
  },

  market: {
    overview: () => get('/market/overview'),
    opportunities: (params?: Record<string, unknown>) => get('/market/opportunities', params),
    movers: (params?: Record<string, unknown>) => get('/market/movers', params),
    regime: () => get('/market/regime'),
  },

  options: {
    chain: (symbol: string) => get(`/options/chain?symbol=${symbol}`),
    recommendation: (symbol: string) => get(`/options/recommendation?symbol=${symbol}`),
    ivRank: (symbol: string) => get(`/options/iv-rank?symbol=${symbol}`),
  },

  symbols: {
    search: (q: string, params?: Record<string, unknown>) =>
      get('/symbols/search', { q, ...params }),
    get: (symbol: string) => get(`/symbols/${symbol}`),
    quote: (symbol: string) => get(`/symbols/${symbol}/quote`),
    history: (symbol: string, period = '1D') =>
      get(`/symbols/${symbol}/history`, { period }),
    catalysts: (symbol: string, params?: Record<string, unknown>) =>
      get(`/symbols/${symbol}/catalysts`, params),
    technical: (symbol: string, timeframe = '1M', assetClass?: string) =>
      get(`/symbols/${symbol}/technical`, { timeframe, ...(assetClass ? { assetClass } : {}) }),
    patterns: (symbol: string, timeframe = '1M', assetClass?: string) =>
      get(`/symbols/${symbol}/patterns`, { timeframe, ...(assetClass ? { assetClass } : {}) }),
    analyze: (symbol: string, assetClass?: string) =>
      get(`/symbols/${symbol}/analyze`, assetClass ? { assetClass } : {}),
    thesis: (symbol: string, assetClass?: string) =>
      get(`/symbols/${symbol}/thesis`, assetClass ? { assetClass } : {}),
  },

  thesis: {
    analyze: (symbol: string, assetClass?: string) =>
      get(`/symbols/${symbol}/analyze`, assetClass ? { assetClass } : {}),
    thesis: (symbol: string, assetClass?: string) =>
      get(`/symbols/${symbol}/thesis`, assetClass ? { assetClass } : {}),
    scan: (params?: Record<string, unknown>) => get('/market/scan', params),
  },

  positions: {
    list: () => get('/paper-positions'),
    open: (body: unknown) => post('/paper-positions/open', body),
    close: (body: unknown) => post('/paper-positions/close', body),
    get: (id: string) => get(`/paper-positions/${id}`),
    update: (id: string, body: unknown) => put(`/paper-positions/${id}`, body),
    delete: (id: string) => del(`/paper-positions/${id}`),
    closed: (params?: Record<string, unknown>) => get('/paper-positions/closed', params),
    refresh: (id: string) => post(`/paper-positions/${id}/refresh`),
    snapshots: (id: string, limit = 50) => get(`/paper-positions/${id}/snapshots`, { limit }),
  },

  alerts: {
    list: (params?: Record<string, unknown>) => get('/alerts', params),
    unreadCount: () => get<{ success: boolean; data: { count: number } }>('/alerts/unread-count'),
    markRead: (id: string) => post(`/alerts/${id}/read`),
    markAllRead: (symbol?: string) => post('/alerts/read-all', symbol ? { symbol } : {}),
    delete: (id: string) => del(`/alerts/${id}`),
    clearAll: (params?: { symbol?: string; read?: boolean }) =>
      del(`/alerts${params?.symbol ? `?symbol=${params.symbol}` : ''}${params?.read ? `${params?.symbol ? '&' : '?'}read=true` : ''}`),
  },

  news: {
    feed: (params?: Record<string, unknown>) => get('/news', params),
    list: (params?: Record<string, unknown>) => get('/news', params),
    catalysts: (symbol: string, params?: Record<string, unknown>) =>
      get('/news/catalysts', { symbol, ...params }),
    sentiment: (symbol: string) => get('/news/sentiment', { symbol }),
  },

  performance: {
    report: (params?: Record<string, unknown>) => get('/performance', params),
    overview: (params?: Record<string, unknown>) => get('/performance/overview', params),
    metrics: (params?: Record<string, unknown>) => get('/performance/metrics', params),
    equityCurve: (params?: Record<string, unknown>) => get('/performance/equity-curve', params),
    tradeLog: (params?: Record<string, unknown>) => get('/performance/trade-log', params),
    patterns: (params?: Record<string, unknown>) => get('/performance/patterns', params),
    sectors: (params?: Record<string, unknown>) => get('/performance/sectors', params),
    catalysts: (params?: Record<string, unknown>) => get('/performance/catalysts', params),
    thesisQuality: (params?: Record<string, unknown>) => get('/performance/thesis-quality', params),
  },

  settings: {
    get: () => get('/settings'),
    update: (body: unknown) => put('/settings', body),
  },

  stocks: {
    health: (ticker: string) => get(`/stocks/${ticker}/health`),
    searchHistory: (limit?: number) => get('/stocks/search/history', limit ? { limit } : {}),
    clearHistory: () => del('/stocks/search/history'),
  },

  tos: {
    authUrl:         ()                          => get('/tos/auth/url'),
    authCallback:    (code: string)              => post('/tos/auth/callback', { code }),
    tokenInfo:       ()                          => get('/tos/auth/token'),
    status:          (accountNumber?: string)     => get(`/tos/status${accountNumber ? `?accountNumber=${accountNumber}` : ''}`),
    account:         (accountNumber?: string)     => get(`/tos/account${accountNumber ? `?accountNumber=${accountNumber}` : ''}`),
    positions:       ()                          => get('/tos/positions'),
    orders:          ()                          => get('/tos/orders'),
    allOrders:       (limit?: number)            => get('/tos/orders/all', limit ? { limit } : {}),
    quotes:          (symbols: string[])         => get('/tos/quotes', { symbols: symbols.join(',') }),
    placeOrder:      (body: unknown)             => post('/tos/orders', body),
    cancelOrder:     (orderId: string | number)  => del(`/tos/orders/${orderId}`),
    closePosition:   (symbol: string, longQty: number, shortQty: number, assetType?: string) =>
      post(`/tos/positions/${symbol}/close`, { longQuantity: longQty, shortQuantity: shortQty, assetType }),
    killswitch:      (reason?: string)           => post('/tos/killswitch', { reason }),
    resetKillswitch: ()                          => del('/tos/killswitch'),
    orderHistory:    (limit?: number)            => get('/tos/order-history', limit ? { limit } : {}),
    strategies:      ()                          => get('/tos/scheduler/strategies'),
    pause:           (reason?: string)           => post('/tos/controls/pause', { reason }),
    hardStop:        (reason?: string)           => post('/tos/controls/hard-stop', { reason }),
    emergencyExit:   (reason?: string, confirmText?: string) => post('/tos/controls/emergency-exit', { reason, confirmText }),
    resume:          ()                          => post('/tos/controls/resume', {}),
  },

  hyperliquid: {
    status:           ()                         => get('/hyperliquid/status'),
    markets:          ()                         => get('/hyperliquid/markets'),
    candles:          (asset: string, interval = '1h') => get(`/hyperliquid/markets/${asset}/candles`, { interval }),
    account:          (address?: string)         => get('/hyperliquid/account', address ? { address } : {}),
    placeOrder:       (body: unknown)            => post('/hyperliquid/orders', body),
    cancelOrder:      (asset: string, oid: number) => del(`/hyperliquid/orders/${oid}?asset=${asset}`),
    closePosition:    (asset: string, size: string, isBuy: boolean) => post(`/hyperliquid/positions/${asset}/close`, { size, isBuy }),
    setLeverage:      (body: unknown)            => post('/hyperliquid/leverage', body),
    killswitch:       (reason?: string)          => post('/hyperliquid/killswitch', { reason }),
    resetKillswitch:  ()                         => del('/hyperliquid/killswitch'),
    orderHistory:     (limit?: number)           => get('/hyperliquid/order-history', limit ? { limit } : {}),
    pause:            (reason?: string)          => post('/hyperliquid/controls/pause', { reason }),
    hardStop:         (reason?: string)          => post('/hyperliquid/controls/hard-stop', { reason }),
    emergencyExit:    (reason?: string, confirmText?: string) => post('/hyperliquid/controls/emergency-exit', { reason, confirmText }),
    resume:           ()                         => post('/hyperliquid/controls/resume', {}),
  },

  autotrader: {
    status: () => get('/autotrader/status'),
    enable: () => post('/autotrader/enable'),
    disable: () => post('/autotrader/disable'),
    updateConfig: (body: unknown) => put('/autotrader/config', body),
    runCycle: () => post('/autotrader/run-cycle'),
    adaptiveStatus: () => get('/autotrader/adaptive-status'),
    logs: (params?: Record<string, unknown>) => get('/autotrader/logs', params),
    signalsPreview: () => get('/autotrader/signals/preview'),
    autonomousEnable:  (params: { minConviction?: number; maxPositions?: number; capitalPct?: number }) =>
      post('/autotrader/autonomous/enable', params),
    autonomousDisable: () => post('/autotrader/autonomous/disable', {}),
    autonomousRun:     () => post('/autotrader/autonomous/run', {}),
    autonomousStatus:  () => get('/autotrader/autonomous/status'),
    intradaySignals: (withAI = true) => get(`/autotrader/intraday/signals?ai=${withAI}`),
    intradayPositions: () => get('/autotrader/intraday/positions'),
    intradayRun: (params?: { maxSignals?: number; dryRun?: boolean }) => post('/autotrader/intraday/run', params ?? {}),
    intradayConfig: (params: { intervalSeconds: number; timeframe: '1min' | '3min' | '5min' }) =>
      post('/autotrader/intraday/config', params),
    livePositions: () => get('/autotrader/live-positions'),
    aiDecision: (body: { signals: any[]; regime?: any; portfolioState?: any; exchange?: string }) =>
      post('/autotrader/ai-decision', body),
    exchangeConfig: {
      get: (exchange: string) => get(`/autotrader/exchange-config/${exchange}`),
      save: (exchange: string, data: unknown) => put(`/autotrader/exchange-config/${exchange}`, data),
      validate: (exchange: string, data: unknown) => post(`/autotrader/exchange-config/${exchange}/validate`, data),
      sessionStatus: (exchange: string) => get(`/autotrader/exchange-config/${exchange}/session-status`),
      startSession: (exchange: string) => post(`/autotrader/exchange-config/${exchange}/session/start`, {}),
      pauseSession: (exchange: string, reason?: string) => post(`/autotrader/exchange-config/${exchange}/session/pause`, { reason }),
    },
  },

  alpaca: {
    status:          () => get('/alpaca/status'),
    account:         () => get('/alpaca/account'),
    positions:       () => get('/alpaca/positions'),
    orders:          () => get('/alpaca/orders'),
    ordersHistory:   (limit?: number) => get('/alpaca/orders/history', limit ? { limit } : {}),
    portfolioHistory:(period = '1M', timeframe = '1D') => get('/alpaca/portfolio/history', { period, timeframe }),
    orderLog:        () => get('/alpaca/order-log'),
    clock:           () => get('/alpaca/clock'),
    placeOrder:      (body: unknown) => post('/alpaca/orders', body),
    cancelOrder:     (id: string) => del(`/alpaca/orders/${id}`),
    cancelAllOrders: () => del('/alpaca/orders'),
    closePosition:   (symbol: string) => del(`/alpaca/positions/${symbol}`),
    pause:           (reason?: string) => post('/alpaca/controls/pause', { reason }),
    hardStop:        (reason?: string) => post('/alpaca/controls/hard-stop', { reason }),
    emergencyExit:   (reason?: string, confirmText?: string) => post('/alpaca/controls/emergency-exit', { reason, confirmText }),
    resume:          () => post('/alpaca/controls/resume', {}),
    latencyStats:    () => get('/alpaca/latency/stats'),
    runTestSuite:    () => post('/alpaca/test-suite/run', {}),
    lastTestResult:  () => get('/alpaca/test-suite/last'),
    runReplay:       (body: unknown) => post('/alpaca/replay', body),
    replayHistory:   () => get('/alpaca/replay/history'),
    autoStart: (params: {
      capitalTotal?: number;
      maxPositions?: number;
      capitalPerTrade?: number;
      stopLossPct?: number;
      takeProfitPct?: number;
      minConvictionScore?: number;
      dryRun?: boolean;
      useAdaptive?: boolean;
      bounds?: any;
      tradingMode?: 'stocks' | 'options' | 'both';
      maxOptionsRiskPct?: number;
    }) => post('/alpaca/auto/start', params),
    autoMonitor: (params: { stopLossPct?: number; takeProfitPct?: number; dryRun?: boolean }) =>
      post('/alpaca/auto/monitor', params),
    autoStatus:  () => get('/alpaca/auto/status'),
    autoAdjust:  (params: { base: any; bounds: any }) => post('/alpaca/auto/adjust', params),
  },

  credentials: {
    status: () => get('/credentials/status'),
    hlConnect: (data: { walletAddress: string; agentPrivateKey: string; isMainnet: boolean; dryRun?: boolean; maxDrawdownPct?: number; defaultLeverage?: number }) =>
      post('/credentials/hl/connect', data),
    hlDisconnect: () => del('/credentials/hl/disconnect'),
    hlUpdateSettings: (data: { dryRun?: boolean; maxDrawdownPct?: number; defaultLeverage?: number }) =>
      patch('/credentials/hl/settings', data),
    tosAuthUrl: (data: { clientId: string; clientSecret: string; redirectUri: string }) =>
      post('/credentials/tos/auth-url', data),
    tosConnect: (data: { authorizationCode: string; accountNumber: string }) =>
      post('/credentials/tos/connect', data),
    tosDisconnect: () => del('/credentials/tos/disconnect'),
    tosUpdateSettings: (data: { dryRun?: boolean; maxDrawdownPct?: number }) =>
      patch('/credentials/tos/settings', data),
    tosAccounts: () => get('/credentials/tos/accounts'),
    tosRefreshAccounts: () => post('/credentials/tos/accounts/refresh', {}),
    tosSetViewAccount: (data: { accountNumber: string }) => put('/credentials/tos/accounts/view', data),
    tosSetAutoTradeAccount: (data: { accountNumber: string }) => put('/credentials/tos/accounts/autotrade', data),
    alpacaConnect: (data: { apiKeyId: string; secretKey: string; dryRun?: boolean; maxDrawdownPct?: number }) =>
      post('/credentials/alpaca/connect', data),
    alpacaDisconnect: () => del('/credentials/alpaca/disconnect'),
    alpacaStatus: () => get('/credentials/alpaca/status'),
    alpacaUpdateSettings: (data: { dryRun?: boolean; maxDrawdownPct?: number }) =>
      patch('/credentials/alpaca/settings', data),
  },

  scans: {
    trigger: (body?: {
      runType?: string;
      marketSession?: string;
      assetScope?: string;
      riskMode?: string;
      force?: boolean;
      fullUniverse?: boolean;
      filterCriteria?: Record<string, unknown>;
    }) => post('/daily-scans/trigger', body),
    progress: (id: string) => `/api/daily-scans/runs/${id}/progress`,
    latest: () => get('/daily-scans/latest'),
    runs: (params?: Record<string, unknown>) => get('/daily-scans/runs', params),
    run: (id: string) => get(`/daily-scans/runs/${id}`),
    results: (id: string, params?: Record<string, unknown>) =>
      get(`/daily-scans/runs/${id}/results`, params),
    symbolHistory: (symbol: string, days?: number) =>
      get(`/daily-scans/history/${symbol}`, days ? { days } : {}),
    schedulerStatus: () => get('/daily-scans/scheduler/status'),
    schedulerToggle: (enabled: boolean) =>
      post('/daily-scans/scheduler/toggle', { enabled }),
    resetStuck: () => post('/daily-scans/reset-stuck', {}),
  },
};
