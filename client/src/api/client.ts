import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

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

export const api = {
  health: () => get<{ success: boolean; service: string }>('/health'),
  auth: {
    me: () => get('/auth/me'),
    login: (body: { email: string; password: string }) => post('/auth/login', body),
    logout: () => post('/auth/logout'),
  },
  market: {
    overview: () => get('/market/overview'),
    opportunities: (params?: Record<string, unknown>) => get('/market/opportunities', params),
    movers: (params?: Record<string, unknown>) => get('/market/movers', params),
  },
  symbols: {
    search: (q: string, params?: Record<string, unknown>) => get('/symbols/search', { q, ...params }),
    get: (symbol: string) => get(`/symbols/${symbol}`),
    quote: (symbol: string) => get(`/symbols/${symbol}/quote`),
    history: (symbol: string, period = '1D') => get(`/symbols/${symbol}/history`, { period }),
    catalysts: (symbol: string) => get(`/symbols/${symbol}/catalysts`),
  },
  positions: {
    list: () => get('/paper-positions'),
    open: (body: unknown) => post('/paper-positions/open', body),
    close: (body: unknown) => post('/paper-positions/close', body),
    get: (id: string) => get(`/paper-positions/${id}`),
    delete: (id: string) => del(`/paper-positions/${id}`),
  },
  alerts: {
    list: () => get('/alerts'),
    create: (body: unknown) => post('/alerts', body),
    delete: (id: string) => del(`/alerts/${id}`),
    dismiss: (id: string) => post(`/alerts/${id}/dismiss`),
  },
  news: {
    list: (params?: Record<string, unknown>) => get('/news', params),
    catalysts: (params?: Record<string, unknown>) => get('/news/catalysts', params),
    sentiment: (symbol: string) => get('/news/sentiment', { symbol }),
  },
  performance: {
    report: (period?: string) => get('/performance', { period }),
    metrics: () => get('/performance/metrics'),
    equityCurve: (period?: string) => get('/performance/equity-curve', { period }),
    tradeLog: (params?: Record<string, unknown>) => get('/performance/trade-log', params),
  },
};
