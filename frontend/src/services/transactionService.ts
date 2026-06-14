import { supabase } from '../supabaseClient';
import type { Transaction } from '../types/portfolio';

export async function fetchTransactions(portfolioIds: string[]): Promise<Transaction[]> {
  if (portfolioIds.length === 0) return [];
  
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .in('portfolio_id', portfolioIds)
    .order('date', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transactionId);

  if (error) throw error;
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
    const { error } = await supabase
      .from('transactions')
      .update(payload)
      .eq('id', editingId);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('transactions')
      .insert(payload);

    if (error) throw error;
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
  const { error } = await supabase
    .from('transactions')
    .insert(payloads);

  if (error) throw error;
}
