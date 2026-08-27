import { supabase } from '../supabaseClient';
import type { Transaction } from '../types/portfolio';
import { withFreshSessionRetry } from './supabaseService';

export async function fetchTransactions(portfolioIds: string[]): Promise<Transaction[]> {
  if (portfolioIds.length === 0) return [];
  
  const data = await withFreshSessionRetry(() =>
    supabase
      .from('transactions')
      .select('*')
      .in('portfolio_id', portfolioIds)
      .order('date', { ascending: false })
  );

  return data || [];
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  await withFreshSessionRetry(() =>
    supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId)
  );
}

export async function saveTransaction(
  payload: {
    portfolio_id: string | null;
    symbol: string;
    type: 'BUY' | 'SELL';
    date: string;
    shares: number;
    price: number;
    currency: string;
    fees: number;
    account: string;
  },
  editingId?: string
): Promise<void> {
  if (editingId) {
    await withFreshSessionRetry(() =>
      supabase
        .from('transactions')
        .update(payload)
        .eq('id', editingId)
    );
  } else {
    await withFreshSessionRetry(() =>
      supabase
        .from('transactions')
        .insert(payload)
    );
  }
}

export async function saveTransactionsBulk(
  payloads: Array<{
    portfolio_id: string;
    symbol: string;
    type: 'BUY' | 'SELL';
    date: string;
    shares: number;
    price: number;
    currency: string;
    fees: number;
    account: string;
  }>
): Promise<void> {
  await withFreshSessionRetry(() =>
    supabase
      .from('transactions')
      .insert(payloads)
  );
}
