export interface Portfolio {
  id: string;
  name: string;
  role: 'owner' | 'editor' | 'viewer';
  settings?: {
    accountTaxRates?: Record<string, number>;
    dividends?: any[];
    [key: string]: any;
  };
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
  dividends_base?: number;
  dividends_net_base?: number;
  day_change_percent?: number;
  day_change_value_base?: number;
  is_live?: boolean;
  asset_class?: string;
}

export interface Summary {
  total_cost_base: number;
  total_value_base: number;
  total_gain_base: number;
  total_gain_percent: number;
  total_dividends_base?: number;
  total_dividends_net_base?: number;
  total_day_change_base?: number;
  total_day_change_percent?: number;
  base_currency: string;
}
