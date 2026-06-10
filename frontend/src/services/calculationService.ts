import type { Transaction, Holding, Summary } from '../types/portfolio';

export async function fetchHoldings(
  apiBaseUrl: string,
  baseCurrency: string,
  account: string,
  transactions: Transaction[],
  linkCash: boolean
): Promise<{ holdings: Holding[]; summary: Summary }> {
  const response = await fetch(`${apiBaseUrl}/api/portfolio/holdings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_currency: baseCurrency,
      account,
      transactions,
      link_cash: linkCash
    })
  });

  if (!response.ok) throw new Error('Failed to calculate holdings');
  const data = await response.json();
  return {
    holdings: data.holdings || [],
    summary: data.summary || {
      total_cost_base: 0,
      total_value_base: 0,
      total_gain_base: 0,
      total_gain_percent: 0,
      base_currency: baseCurrency
    }
  };
}

export async function fetchHistoricalPerformance(
  apiBaseUrl: string,
  baseCurrency: string,
  account: string,
  transactions: Transaction[],
  linkCash: boolean
): Promise<{ dates: string[]; nav: number[]; cost_basis: number[] }> {
  const response = await fetch(`${apiBaseUrl}/api/portfolio/historical`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_currency: baseCurrency,
      account,
      transactions,
      link_cash: linkCash
    })
  });

  if (!response.ok) throw new Error('Failed to fetch historical performance');
  return response.json();
}

export async function searchAssets(
  apiBaseUrl: string,
  query: string
): Promise<any[]> {
  const response = await fetch(`${apiBaseUrl}/api/portfolio/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error('Asset search failed');
  return response.json();
}
