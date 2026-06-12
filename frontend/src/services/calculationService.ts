import type { Holding, Summary } from '../types/portfolio';

export async function fetchHoldings(
  apiBaseUrl: string,
  jwtToken: string | null,
  portfolioId: string,
  baseCurrency: string,
  account: string,
  linkCash: boolean
): Promise<{ holdings: Holding[]; summary: Summary; dividends_list?: any[] }> {
  const headers: Record<string, string> = {};
  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
  }

  const queryParams = new URLSearchParams({
    base_currency: baseCurrency,
    account,
    link_cash: String(linkCash)
  });

  const response = await fetch(`${apiBaseUrl}/api/portfolio/${portfolioId}/holdings?${queryParams.toString()}`, {
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
    dividends_list: data.dividends_list || []
  };
}

export async function fetchHistoricalPerformance(
  apiBaseUrl: string,
  jwtToken: string | null,
  portfolioId: string,
  baseCurrency: string,
  account: string,
  linkCash: boolean
): Promise<{ dates: string[]; nav: number[]; cost_basis: number[] }> {
  const headers: Record<string, string> = {};
  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
  }

  const queryParams = new URLSearchParams({
    base_currency: baseCurrency,
    account,
    link_cash: String(linkCash)
  });

  const response = await fetch(`${apiBaseUrl}/api/portfolio/${portfolioId}/historical?${queryParams.toString()}`, {
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
  const response = await fetch(`${apiBaseUrl}/api/portfolio/search?q=${encodeURIComponent(query)}`);
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
