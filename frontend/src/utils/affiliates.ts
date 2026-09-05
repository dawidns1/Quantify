export interface BrokerDeal {
  id: string;
  name: string;
  tagline: string;
  badge?: string;
  perks: string[];
  url: string;
  disclaimer?: string;
}

// Curated broker partners and exclusive community deals.
// Leave empty for now until official affiliate partnerships are active.
export const BROKER_DEALS: BrokerDeal[] = [];
