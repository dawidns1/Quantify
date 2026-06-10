export interface Portfolio {
  id: string;
  name: string;
  role: 'owner' | 'editor' | 'viewer';
}

export interface Member {
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  email: string;
}

export interface Transaction {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  date: string;
  shares: number;
  price: number;
  currency: string;
  fees: number;
  account: string;
  portfolio_id: string;
}

export interface Holding {
  symbol: string;
  name: string;
  shares: number;
  avg_cost_local: number;
  current_price_local: number;
  currency: string;
  fx_rate: number;
  cost_basis_base: number;
  current_value_base: number;
  gain_base: number;
  gain_percent: number;
}

export interface Summary {
  total_cost_base: number;
  total_value_base: number;
  total_gain_base: number;
  total_gain_percent: number;
  base_currency: string;
}
