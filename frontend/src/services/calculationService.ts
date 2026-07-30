import type { Holding, Summary } from '../types/portfolio';

/**
 * Fetch helper with explicit 30-second timeout to prevent requests from hanging 
 * indefinitely when a user switches browser tabs or locks their device.
 */
export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  // If the user's browser tab is hidden in the background, do not start network requests
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    throw new Error('Tab suspended (background).');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        throw new Error('Tab suspended (background).');
      }
      throw new Error(`Network request timed out after ${timeoutMs / 1000}s (possible tab switch suspension).`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchHoldings(
  apiBaseUrl: string,
  jwtToken: string | null,
  portfolioId: string,
  baseCurrency: string,
  account: string,
  linkCash: boolean,
  forceLive: boolean = false
): Promise<{ holdings: Holding[]; summary: Summary; dividends_list?: any[]; next_check_seconds?: number }> {
  const headers: Record<string, string> = {};
  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (supabaseUrl) {
    headers['x-supabase-url'] = supabaseUrl;
  }
  if (supabaseAnonKey) {
    headers['x-supabase-anon-key'] = supabaseAnonKey;
  }

  const queryParams = new URLSearchParams({
    base_currency: baseCurrency,
    account,
    link_cash: String(linkCash),
    force_live: String(forceLive)
  });

  const response = await fetchWithTimeout(`${apiBaseUrl}/api/portfolio/${portfolioId}/holdings?${queryParams.toString()}`, {
    method: 'GET',
    headers
  });

  if (!response.ok) {
    let errMsg = 'Failed to calculate holdings';
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  const data = await response.json();
  return {
    holdings: data.holdings || [],
    summary: data.summary || {
      total_cost_base: 0,
      total_value_base: 0,
      total_gain_base: 0,
      total_gain_percent: 0,
      base_currency: baseCurrency
    },
    dividends_list: data.dividends_list || [],
    next_check_seconds: data.next_check_seconds
  };
}

export async function fetchHistoricalPerformance(
  apiBaseUrl: string,
  jwtToken: string | null,
  portfolioId: string,
  baseCurrency: string,
  account: string,
  linkCash: boolean,
  benchmarks?: string
): Promise<{ dates: string[]; nav: number[]; cost_basis: number[]; benchmarks?: Record<string, number[]> }> {
  const headers: Record<string, string> = {};
  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (supabaseUrl) {
    headers['x-supabase-url'] = supabaseUrl;
  }
  if (supabaseAnonKey) {
    headers['x-supabase-anon-key'] = supabaseAnonKey;
  }

  const queryParams = new URLSearchParams({
    base_currency: baseCurrency,
    account,
    link_cash: String(linkCash)
  });
  if (benchmarks) {
    queryParams.append('benchmarks', benchmarks);
  }

  const response = await fetchWithTimeout(`${apiBaseUrl}/api/portfolio/${portfolioId}/historical?${queryParams.toString()}`, {
    method: 'GET',
    headers
  });

  if (!response.ok) {
    let errMsg = 'Failed to fetch historical performance';
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}


export async function searchAssets(
  apiBaseUrl: string,
  query: string
): Promise<any[]> {
  const response = await fetchWithTimeout(`${apiBaseUrl}/api/portfolio/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    let errMsg = 'Asset search failed';
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}

export async function fetchUpcomingEvents(
  apiBaseUrl: string,
  jwtToken: string | null,
  portfolioId: string,
  baseCurrency: string,
  account: string,
  linkCash: boolean
): Promise<any[]> {
  const headers: Record<string, string> = {};
  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (supabaseUrl) {
    headers['x-supabase-url'] = supabaseUrl;
  }
  if (supabaseAnonKey) {
    headers['x-supabase-anon-key'] = supabaseAnonKey;
  }

  const queryParams = new URLSearchParams({
    base_currency: baseCurrency,
    account,
    link_cash: String(linkCash)
  });

  const response = await fetchWithTimeout(`${apiBaseUrl}/api/portfolio/${portfolioId}/upcoming-events?${queryParams.toString()}`, {
    method: 'GET',
    headers
  });

  if (!response.ok) {
    let errMsg = 'Failed to fetch upcoming corporate events';
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}

export async function fetchPortfolioAnalytics(
  apiBaseUrl: string,
  jwtToken: string | null,
  portfolioId: string,
  baseCurrency: string,
  account: string,
  linkCash: boolean
): Promise<{
  mwr: number;
  twr: number;
  volatility_annual: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  beta: number;
  correlation_matrix: Record<string, Record<string, number>>;
}> {
  const headers: Record<string, string> = {};
  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (supabaseUrl) {
    headers['x-supabase-url'] = supabaseUrl;
  }
  if (supabaseAnonKey) {
    headers['x-supabase-anon-key'] = supabaseAnonKey;
  }

  const queryParams = new URLSearchParams({
    base_currency: baseCurrency,
    account,
    link_cash: String(linkCash)
  });

  const response = await fetchWithTimeout(`${apiBaseUrl}/api/portfolio/${portfolioId}/analytics?${queryParams.toString()}`, {
    method: 'GET',
    headers
  });

  if (!response.ok) {
    let errMsg = 'Failed to fetch portfolio analytics';
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}

export async function fetchDividendForecast(
  apiBaseUrl: string,
  jwtToken: string | null,
  portfolioId: string,
  baseCurrency: string,
  account: string,
  linkCash: boolean
): Promise<{
  forward_annual_income: number;
  forward_yield: number;
  yield_on_cost: number;
  months: string[];
  monthly_amounts: number[];
  ticker_contributions: Record<string, number[]>;
}> {
  const headers: Record<string, string> = {};
  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (supabaseUrl) {
    headers['x-supabase-url'] = supabaseUrl;
  }
  if (supabaseAnonKey) {
    headers['x-supabase-anon-key'] = supabaseAnonKey;
  }

  const queryParams = new URLSearchParams({
    base_currency: baseCurrency,
    account,
    link_cash: String(linkCash)
  });

  const response = await fetchWithTimeout(`${apiBaseUrl}/api/portfolio/${portfolioId}/dividend-forecast?${queryParams.toString()}`, {
    method: 'GET',
    headers
  });

  if (!response.ok) {
    let errMsg = 'Failed to fetch dividend forecast';
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}

export async function fetchAIInsights(
  apiBaseUrl: string,
  jwtToken: string | null,
  portfolioId: string,
  baseCurrency: string,
  account: string,
  linkCash: boolean,
  lang: string,
  forceRefresh: boolean = false
): Promise<{ status: string; insights: string; cached: boolean }> {
  const headers: Record<string, string> = {};
  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (supabaseUrl) {
    headers['x-supabase-url'] = supabaseUrl;
  }
  if (supabaseAnonKey) {
    headers['x-supabase-anon-key'] = supabaseAnonKey;
  }

  const queryParams = new URLSearchParams({
    base_currency: baseCurrency,
    account,
    link_cash: String(linkCash),
    lang,
    force_refresh: String(forceRefresh)
  });

  const response = await fetchWithTimeout(`${apiBaseUrl}/api/portfolio/${portfolioId}/ai-insights?${queryParams.toString()}`, {
    method: 'GET',
    headers
  });

  if (!response.ok) {
    let errMsg = 'Failed to fetch AI insights';
    try {
      const errData = await response.json();
      if (errData && errData.detail) errMsg = errData.detail;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return response.json();
}
