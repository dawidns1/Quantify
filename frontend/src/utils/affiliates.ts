export type CountryCode = 'PL' | 'US' | 'GB' | 'DE' | 'ES' | 'EU' | 'GLOBAL';

export interface CountryOption {
  code: CountryCode;
  labelKey: string;
  flag: string;
}

export const SUPPORTED_COUNTRIES: CountryOption[] = [
  { code: 'PL', labelKey: 'broker_deals.countries.pl', flag: '🇵🇱' },
  { code: 'US', labelKey: 'broker_deals.countries.us', flag: '🇺🇸' },
  { code: 'GB', labelKey: 'broker_deals.countries.gb', flag: '🇬🇧' },
  { code: 'DE', labelKey: 'broker_deals.countries.de', flag: '🇩🇪' },
  { code: 'ES', labelKey: 'broker_deals.countries.es', flag: '🇪🇸' },
  { code: 'EU', labelKey: 'broker_deals.countries.eu', flag: '🇪🇺' },
  { code: 'GLOBAL', labelKey: 'broker_deals.countries.global', flag: '🌐' },
];

export interface BrokerDeal {
  id: string;
  name: string;
  tagline: string;
  countries: CountryCode[];
  badge?: string;
  perks: string[];
  url: string;
  disclaimer?: string;
}

// Curated broker partners and exclusive community deals.
// Leave empty for now until official affiliate partnerships are active.
export const BROKER_DEALS: BrokerDeal[] = [];

// Helper to auto-detect user's country code from timezone, language, and base currency
export function detectUserCountry(language?: string, baseCurrency?: string): CountryCode {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Warsaw') || tz.includes('Poland')) return 'PL';
    if (tz.includes('London')) return 'GB';
    if (tz.includes('Berlin') || tz.includes('Vienna') || tz.includes('Zurich')) return 'DE';
    if (tz.includes('Madrid')) return 'ES';
    if (tz.startsWith('America/') || tz.includes('New_York') || tz.includes('Chicago') || tz.includes('Los_Angeles')) return 'US';
    if (tz.startsWith('Europe/')) return 'EU';
  } catch (e) {}

  if (language === 'pl' || baseCurrency === 'PLN') return 'PL';
  if (baseCurrency === 'GBP') return 'GB';
  if (language === 'es') return 'ES';
  if (baseCurrency === 'EUR') return 'EU';
  if (baseCurrency === 'USD') return 'US';

  return 'GLOBAL';
}
