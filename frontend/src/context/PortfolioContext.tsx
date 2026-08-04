import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../AuthContext';
import { 
  fetchHoldings as fetchHoldingsService,
  fetchHistoricalPerformance as fetchHistoricalPerformanceService,
  fetchPortfolioAnalytics as fetchPortfolioAnalyticsService
} from '../services/calculationService';
import type { Portfolio, Transaction, Holding, Summary } from '../types/portfolio';
import { fetchUserPortfolios, createPortfolio } from '../services/supabaseService';
import { fetchTransactions as fetchTransactionsService } from '../services/transactionService';
import { telemetry } from '../utils/telemetry';

export type BaseCurrencyType = 'PLN' | 'USD' | 'EUR' | 'GBP' | 'CHF' | 'CAD' | 'AUD' | 'JPY';

export interface AnalyticsData {
  mwr: number;
  twr: number;
  volatility_annual: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  beta: number;
  correlation_matrix: Record<string, Record<string, number>>;
}

interface PortfolioContextType {
  apiBaseUrl: string;
  portfolios: Portfolio[];
  setPortfolios: React.Dispatch<React.SetStateAction<Portfolio[]>>;
  activePortfolioId: string | null;
  setActivePortfolioId: (id: string | null) => void;
  activePortfolioRole: 'owner' | 'editor' | 'viewer';
  setActivePortfolioRole: (role: 'owner' | 'editor' | 'viewer') => void;
  baseCurrency: BaseCurrencyType;
  setBaseCurrency: (currency: BaseCurrencyType) => void;
  selectedAccount: string;
  setSelectedAccount: (account: string) => void;
  holdings: Holding[];
  setHoldings: React.Dispatch<React.SetStateAction<Holding[]>>;
  summary: Summary;
  setSummary: React.Dispatch<React.SetStateAction<Summary>>;
  allTransactions: Transaction[];
  setAllTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  dividendsList: any[];
  setDividendsList: React.Dispatch<React.SetStateAction<any[]>>;
  chartData: { dates: string[]; nav: number[]; cost_basis: number[] } | null;
  setChartData: React.Dispatch<React.SetStateAction<{ dates: string[]; nav: number[]; cost_basis: number[] } | null>>;
  analytics: AnalyticsData | null;
  setAnalytics: React.Dispatch<React.SetStateAction<AnalyticsData | null>>;
  
  loadingHoldings: boolean;
  loadingTransactions: boolean;
  loadingPortfolios: boolean;
  loadingChart: boolean;
  loadingAnalytics: boolean;
  
  widgets: string[];
  setWidgets: React.Dispatch<React.SetStateAction<string[]>>;
  showWidgetManager: boolean;
  setShowWidgetManager: React.Dispatch<React.SetStateAction<boolean>>;
  linkCash: boolean;
  setLinkCash: (val: boolean) => void;
  
  // Computed values
  portfolioAccountsMap: Record<string, string[]>;
  uniqueAccounts: string[];
  portfolioTransactions: Transaction[];
  transactions: Transaction[];
  
  // Handlers
  loadPortfolios: () => Promise<void>;
  fetchHoldings: (curr?: BaseCurrencyType, accountFilter?: string, silent?: boolean) => Promise<void>;
  fetchTransactions: () => Promise<void>;
  fetchHistoricalPerformance: (curr?: BaseCurrencyType, accountFilter?: string, benchmarks?: string) => Promise<void>;
  fetchPortfolioAnalytics: (curr?: BaseCurrencyType, accountFilter?: string) => Promise<void>;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);

export function PortfolioProvider({ apiBaseUrl, children }: { apiBaseUrl: string; children: ReactNode }) {
  const { user, session } = useAuth();
  
  // --- Core States ---
  const [portfolios, setPortfolios] = useState<Portfolio[]>(() => {
    try {
      const cached = localStorage.getItem('cached_portfolios');
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  });

  const [activePortfolioId, setActivePortfolioIdState] = useState<string | null>(() => {
    return localStorage.getItem('portfolio_active_id');
  });

  const [activePortfolioRole, setActivePortfolioRoleState] = useState<'owner' | 'editor' | 'viewer'>(() => {
    return (localStorage.getItem('portfolio_active_role') as any) || 'viewer';
  });

  const [baseCurrency, setBaseCurrencyState] = useState<BaseCurrencyType>(() => {
    return (localStorage.getItem('portfolio_base_currency') as any) || 'PLN';
  });

  const [selectedAccount, setSelectedAccountState] = useState<string>(() => {
    return localStorage.getItem('portfolio_selected_account') || 'All';
  });

  const [linkCash, setLinkCashState] = useState<boolean>(() => {
    return localStorage.getItem('portfolio_link_cash') !== 'false';
  });

  const [widgets, setWidgets] = useState<string[]>(() => {
    const cached = localStorage.getItem('dashboard_widgets_order');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {}
    }
    return ['metrics', 'chart', 'events', 'allocation', 'analytics'];
  });

  const [showWidgetManager, setShowWidgetManager] = useState<boolean>(false);

  // --- API Data States ---
  const [holdings, setHoldings] = useState<Holding[]>(() => {
    const activeId = localStorage.getItem('portfolio_active_id');
    const baseCurr = localStorage.getItem('portfolio_base_currency') || 'PLN';
    const selAcc = localStorage.getItem('portfolio_selected_account') || 'All';
    if (!activeId) return [];
    try {
      const tsStr = localStorage.getItem(`cached_holdings_ts_${activeId}_${baseCurr}_${selAcc}`);
      const isExpired = !tsStr || (Date.now() - parseInt(tsStr, 10) > 300000);
      if (isExpired) return [];
      const cached = localStorage.getItem(`cached_holdings_${activeId}_${baseCurr}_${selAcc}`);
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  });

  const [summary, setSummary] = useState<Summary>(() => {
    const activeId = localStorage.getItem('portfolio_active_id');
    const baseCurr = localStorage.getItem('portfolio_base_currency') || 'PLN';
    const selAcc = localStorage.getItem('portfolio_selected_account') || 'All';
    const defaultSum: Summary = {
      total_cost_base: 0,
      total_value_base: 0,
      total_gain_base: 0,
      total_gain_percent: 0,
      base_currency: baseCurr as any
    };
    if (!activeId) return defaultSum;
    try {
      const cached = localStorage.getItem(`cached_summary_${activeId}_${baseCurr}_${selAcc}`);
      return cached ? JSON.parse(cached) : defaultSum;
    } catch (e) {
      return defaultSum;
    }
  });

  const [allTransactions, setAllTransactions] = useState<Transaction[]>(() => {
    try {
      const cached = localStorage.getItem('cached_all_transactions');
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  });

  const [dividendsList, setDividendsList] = useState<any[]>(() => {
    const activeId = localStorage.getItem('portfolio_active_id');
    const baseCurr = localStorage.getItem('portfolio_base_currency') || 'PLN';
    const selAcc = localStorage.getItem('portfolio_selected_account') || 'All';
    if (!activeId) return [];
    try {
      const cached = localStorage.getItem(`cached_dividends_list_${activeId}_${baseCurr}_${selAcc}`);
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  });

  const [nextCheckSeconds, setNextCheckSeconds] = useState<number>(300);

  const [chartData, setChartData] = useState<{ dates: string[]; nav: number[]; cost_basis: number[] } | null>(() => {
    const activeId = localStorage.getItem('portfolio_active_id');
    const baseCurr = localStorage.getItem('portfolio_base_currency') || 'PLN';
    const selAcc = localStorage.getItem('portfolio_selected_account') || 'All';
    if (!activeId) return null;
    try {
      const cached = localStorage.getItem(`cached_chart_data_${activeId}_${baseCurr}_${selAcc}`);
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(() => {
    const activeId = localStorage.getItem('portfolio_active_id');
    const baseCurr = localStorage.getItem('portfolio_base_currency') || 'PLN';
    const selAcc = localStorage.getItem('portfolio_selected_account') || 'All';
    if (!activeId) return null;
    try {
      const cached = localStorage.getItem(`cached_analytics_${activeId}_${baseCurr}_${selAcc}`);
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });

  // --- Loading States ---
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [loadingPortfolios, setLoadingPortfolios] = useState(true);
  const [loadingChart, setLoadingChart] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  // --- State Mutator Overrides (for caching) ---
  const setActivePortfolioId = (id: string | null) => {
    setActivePortfolioIdState(id);
    if (id) localStorage.setItem('portfolio_active_id', id);
    else localStorage.removeItem('portfolio_active_id');
  };

  const setActivePortfolioRole = (role: 'owner' | 'editor' | 'viewer') => {
    setActivePortfolioRoleState(role);
    localStorage.setItem('portfolio_active_role', role);
  };

  const setBaseCurrency = (currency: BaseCurrencyType) => {
    setBaseCurrencyState(currency);
    localStorage.setItem('portfolio_base_currency', currency);
  };

  const setSelectedAccount = (account: string) => {
    setSelectedAccountState(account);
    localStorage.setItem('portfolio_selected_account', account);
  };

  const setLinkCash = (val: boolean) => {
    setLinkCashState(val);
    localStorage.setItem('portfolio_link_cash', String(val));
  };

  // --- Race Condition Protection Ref ---
  const latestParamsRef = useRef({
    activePortfolioId,
    baseCurrency,
    selectedAccount
  });
  
  latestParamsRef.current = {
    activePortfolioId,
    baseCurrency,
    selectedAccount
  };

  const holdingsRequestIdRef = useRef(0);
  const chartRequestIdRef = useRef(0);
  const analyticsRequestIdRef = useRef(0);

  // --- Computed Sub-States ---
  const portfolioAccountsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    allTransactions.forEach(tx => {
      const pId = tx.portfolio_id;
      const acc = tx.account || 'Default';
      if (!map[pId]) map[pId] = [];
      if (!map[pId].includes(acc)) map[pId].push(acc);
    });
    return map;
  }, [allTransactions]);

  const uniqueAccounts = useMemo(() => {
    if (!activePortfolioId) return [];
    return portfolioAccountsMap[activePortfolioId] || [];
  }, [activePortfolioId, portfolioAccountsMap]);

  const portfolioTransactions = useMemo(() => {
    if (activePortfolioId && activePortfolioId !== 'all') {
      return allTransactions.filter(tx => tx.portfolio_id === activePortfolioId);
    }
    return allTransactions;
  }, [allTransactions, activePortfolioId]);

  const transactions = useMemo(() => {
    let list = allTransactions;
    if (activePortfolioId && activePortfolioId !== 'all') {
      list = list.filter(tx => tx.portfolio_id === activePortfolioId);
    }
    if (selectedAccount && selectedAccount !== 'All') {
      list = list.filter(tx => tx.account === selectedAccount);
    }
    return list;
  }, [allTransactions, activePortfolioId, selectedAccount]);

  const activeHoldingsAbortControllerRef = useRef<AbortController | null>(null);

  // --- Fetch Actions ---
  const fetchHoldings = async (
    curr: BaseCurrencyType = baseCurrency,
    accountFilter: string = selectedAccount,
    silent = false,
    forceLive = false
  ) => {
    if (!activePortfolioId) return;

    // Abort previous in-flight request if user rapidly clicked between accounts/portfolios or hit refresh
    if (activeHoldingsAbortControllerRef.current) {
      activeHoldingsAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    activeHoldingsAbortControllerRef.current = abortController;

    if (!silent) setLoadingHoldings(true);
    const requestId = ++holdingsRequestIdRef.current;
    const traceId = telemetry.startTrace('fetch_holdings', 'performance', { portfolio_id: activePortfolioId, currency: curr, account: accountFilter });
    try {
      const jwtToken = session?.access_token || null;
      const result = await fetchHoldingsService(
        apiBaseUrl,
        jwtToken,
        activePortfolioId,
        curr,
        accountFilter,
        linkCash,
        forceLive,
        abortController.signal
      );

      // Prevent race conditions: check if a newer request started or portfolio/currency changed
      if (
        requestId < holdingsRequestIdRef.current ||
        activePortfolioId !== latestParamsRef.current.activePortfolioId ||
        curr !== latestParamsRef.current.baseCurrency
      ) {
        telemetry.endTrace(traceId, 'success', undefined, { discarded: true });
        return; // Discard stale response
      }

      setHoldings(result.holdings);
      setSummary(result.summary);
      setDividendsList(result.dividends_list || []);
      if (typeof result.next_check_seconds === 'number') {
        setNextCheckSeconds(result.next_check_seconds);
      }
      
      // Cache the fresh data
      localStorage.setItem(`cached_holdings_${activePortfolioId}_${curr}_${accountFilter}`, JSON.stringify(result.holdings));
      localStorage.setItem(`cached_holdings_ts_${activePortfolioId}_${curr}_${accountFilter}`, String(Date.now()));
      localStorage.setItem(`cached_summary_${activePortfolioId}_${curr}_${accountFilter}`, JSON.stringify(result.summary));
      localStorage.setItem(`cached_dividends_list_${activePortfolioId}_${curr}_${accountFilter}`, JSON.stringify(result.dividends_list || []));
      
    } catch (err: any) {
      if (err?.message !== 'Tab suspended (background).' && err?.message !== 'Request cancelled.') {
        console.error('Error fetching holdings:', err);
      }
      telemetry.endTrace(traceId, 'error', err?.message || String(err));
    } finally {
      if (requestId === holdingsRequestIdRef.current) {
        if (!silent) setLoadingHoldings(false);
      }
    }
  };

  const fetchTransactions = async () => {
    if (!portfolios || portfolios.length === 0) {
      setAllTransactions([]);
      setLoadingTransactions(false);
      return;
    }
    setLoadingTransactions(true);
    try {
      const portfolioIds = portfolios.map(p => p.id);
      const data = await fetchTransactionsService(portfolioIds);
      
      const cachedTxStr = localStorage.getItem('cached_all_transactions');
      if (cachedTxStr && JSON.stringify(data) !== cachedTxStr) {
        // Invalidate chart and analytics caches if transactions list changed
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('cached_chart_data_') || key.startsWith('cached_analytics_')) {
            localStorage.removeItem(key);
          }
        });
      }
      
      setAllTransactions(data);
      localStorage.setItem('cached_all_transactions', JSON.stringify(data));
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const fetchHistoricalPerformance = async (
    curr: BaseCurrencyType = baseCurrency,
    accountFilter: string = selectedAccount,
    benchmarks?: string
  ) => {
    if (!activePortfolioId) {
      setChartData(null);
      return;
    }
    setLoadingChart(true);
    const requestId = ++chartRequestIdRef.current;
    try {
      const jwtToken = session?.access_token || null;
      const data = await fetchHistoricalPerformanceService(
        apiBaseUrl,
        jwtToken,
        activePortfolioId,
        curr,
        accountFilter,
        linkCash,
        benchmarks
      );

      // Prevent race conditions
      if (
        requestId < chartRequestIdRef.current ||
        activePortfolioId !== latestParamsRef.current.activePortfolioId ||
        curr !== latestParamsRef.current.baseCurrency ||
        accountFilter !== latestParamsRef.current.selectedAccount
      ) {
        return; // Discard stale response
      }

      setChartData(data);
      localStorage.setItem(`cached_chart_data_${activePortfolioId}_${curr}_${accountFilter}`, JSON.stringify(data));
    } catch (err) {
      console.error('Error fetching historical performance:', err);
    } finally {
      if (requestId === chartRequestIdRef.current) {
        setLoadingChart(false);
      }
    }
  };

  const fetchPortfolioAnalytics = async (
    curr: BaseCurrencyType = baseCurrency,
    accountFilter: string = selectedAccount
  ) => {
    if (!activePortfolioId || portfolios.length === 0) {
      setAnalytics(null);
      return;
    }
    setLoadingAnalytics(true);
    const requestId = ++analyticsRequestIdRef.current;
    try {
      const jwtToken = session?.access_token || null;
      const data = await fetchPortfolioAnalyticsService(
        apiBaseUrl,
        jwtToken,
        activePortfolioId,
        curr,
        accountFilter,
        linkCash
      );

      // Prevent race conditions
      if (
        requestId < analyticsRequestIdRef.current ||
        activePortfolioId !== latestParamsRef.current.activePortfolioId ||
        curr !== latestParamsRef.current.baseCurrency ||
        accountFilter !== latestParamsRef.current.selectedAccount
      ) {
        return; // Discard stale response
      }

      setAnalytics(data);
      localStorage.setItem(`cached_analytics_${activePortfolioId}_${curr}_${accountFilter}`, JSON.stringify(data));
    } catch (err) {
      console.error('Error fetching portfolio analytics:', err);
    } finally {
      if (requestId === analyticsRequestIdRef.current) {
        setLoadingAnalytics(false);
      }
    }
  };

  const isCreatingDefaultPortfolioRef = useRef(false);

  const loadPortfolios = async () => {
    if (!user) {
      setLoadingPortfolios(false);
      return;
    }
    if (isCreatingDefaultPortfolioRef.current) return;
    isCreatingDefaultPortfolioRef.current = true;

    setLoadingPortfolios(true);
    try {
      let formatted = await fetchUserPortfolios(user.id);

      if (formatted.length === 0) {
        const defaultPortfolio = await createPortfolio(user.id, 'My Portfolio');
        formatted = [defaultPortfolio];
      }

      const savedOrderRaw = localStorage.getItem('cached_portfolio_order');
      if (savedOrderRaw) {
        try {
          const savedOrderIds: string[] = JSON.parse(savedOrderRaw);
          formatted.sort((a, b) => {
            const idxA = savedOrderIds.indexOf(a.id);
            const idxB = savedOrderIds.indexOf(b.id);
            if (idxA === -1 && idxB === -1) return 0;
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
          });
        } catch (e) {
          // ignore parsing error
        }
      }

      setPortfolios(formatted);
      localStorage.setItem('cached_portfolios', JSON.stringify(formatted));

      const cachedId = localStorage.getItem('portfolio_active_id');
      if (cachedId === 'all') {
        setActivePortfolioId('all');
        setActivePortfolioRole('viewer');
      } else {
        const found = formatted.find(p => p.id === cachedId);
        if (found) {
          setActivePortfolioId(found.id);
          setActivePortfolioRole(found.role);
        } else {
          setActivePortfolioId(formatted[0].id);
          setActivePortfolioRole(formatted[0].role);
        }
      }
    } catch (err) {
      console.error('Error loading portfolios:', err);
    } finally {
      setLoadingPortfolios(false);
      isCreatingDefaultPortfolioRef.current = false;
    }
  };

  useEffect(() => {
    loadPortfolios();
  }, [user?.id]);

  // --- Fetch triggers ---
  
  // Fetch transactions when the list of portfolios updates
  useEffect(() => {
    fetchTransactions();
  }, [portfolios]);

  // Recalculate holdings when active portfolio, filters, or transactions update
  useEffect(() => {
    if (activePortfolioId && portfolios.length > 0) {
      // Synchronously load from local storage cache first to avoid flashing empty state
      const cachedH = localStorage.getItem(`cached_holdings_${activePortfolioId}_${baseCurrency}_${selectedAccount}`);
      const cachedS = localStorage.getItem(`cached_summary_${activePortfolioId}_${baseCurrency}_${selectedAccount}`);
      const cachedDiv = localStorage.getItem(`cached_dividends_list_${activePortfolioId}_${baseCurrency}_${selectedAccount}`);
      let hasCache = false;
      if (cachedH && cachedS) {
        try {
          setHoldings(JSON.parse(cachedH));
          setSummary(JSON.parse(cachedS));
          if (cachedDiv) setDividendsList(JSON.parse(cachedDiv));
          hasCache = true;
        } catch (e) {
          hasCache = false;
        }
      }

      fetchHoldings(baseCurrency, selectedAccount, hasCache);
    } else {
      setLoadingHoldings(false);
    }
  }, [baseCurrency, selectedAccount, activePortfolioId, allTransactions, linkCash, portfolios]);

  // Set up live polling for real-time price updates when active portfolios exist
  // Uses backend next_check_seconds to schedule the next check, suspending polling entirely when tab is hidden
  useEffect(() => {
    if (!activePortfolioId || portfolios.length === 0) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Force refresh immediately when tab becomes visible
        fetchHoldings(baseCurrency, selectedAccount, true);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    let timeout: any;
    if (document.visibilityState === 'visible') {
      const delay = nextCheckSeconds > 0 ? nextCheckSeconds : 300;
      timeout = setTimeout(() => {
        if (document.visibilityState === 'visible') {
          fetchHoldings(baseCurrency, selectedAccount, true);
        }
      }, delay * 1000);
    }
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timeout) clearTimeout(timeout);
    };
  }, [activePortfolioId, baseCurrency, selectedAccount, linkCash, portfolios, nextCheckSeconds]);

  // Recalculate chart when active portfolio, filters, or transactions update (staggered after holdings load)
  useEffect(() => {
    if (activePortfolioId && portfolioTransactions.length > 0 && holdings.length > 0 && !loadingHoldings) {
      // Synchronously load chart data from cache first
      const cachedC = localStorage.getItem(`cached_chart_data_${activePortfolioId}_${baseCurrency}_${selectedAccount}`);
      if (cachedC) {
        setChartData(JSON.parse(cachedC));
      } else {
        fetchHistoricalPerformance(baseCurrency, selectedAccount);
      }
    } else if (!activePortfolioId || portfolioTransactions.length === 0) {
      setChartData(null);
      setLoadingChart(false);
    }
  }, [baseCurrency, selectedAccount, activePortfolioId, portfolioTransactions, linkCash, holdings, loadingHoldings]);

  // Fetch portfolio analytics when active portfolio, filters, or transactions update (staggered after holdings load)
  useEffect(() => {
    if (activePortfolioId && portfolioTransactions.length > 0 && holdings.length > 0 && !loadingHoldings) {
      // Synchronously load analytics from cache first
      const cachedA = localStorage.getItem(`cached_analytics_${activePortfolioId}_${baseCurrency}_${selectedAccount}`);
      if (cachedA) {
        setAnalytics(JSON.parse(cachedA));
      }
      // Always fetch fresh analytics in the background
      fetchPortfolioAnalytics(baseCurrency, selectedAccount);
    } else if (!activePortfolioId || portfolioTransactions.length === 0) {
      setAnalytics(null);
      setLoadingAnalytics(false);
    }
  }, [baseCurrency, selectedAccount, activePortfolioId, portfolioTransactions, linkCash, holdings, loadingHoldings]);

  // --- Tab Visibility Resume Auto-Heal ---
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (loadingHoldings || loadingTransactions || loadingChart) {
          console.warn('[PortfolioContext] User returned to tab while sync was in-flight. Resetting stuck loading states and refreshing.');
          setLoadingHoldings(false);
          setLoadingTransactions(false);
          setLoadingChart(false);
          setLoadingAnalytics(false);
          if (activePortfolioId) {
            fetchHoldings(baseCurrency, selectedAccount, true);
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loadingHoldings, loadingTransactions, loadingChart, activePortfolioId, baseCurrency, selectedAccount]);

  return (
    <PortfolioContext.Provider value={{
      apiBaseUrl,
      portfolios,
      setPortfolios,
      activePortfolioId,
      setActivePortfolioId,
      activePortfolioRole,
      setActivePortfolioRole,
      baseCurrency,
      setBaseCurrency,
      selectedAccount,
      setSelectedAccount,
      holdings,
      setHoldings,
      summary,
      setSummary,
      allTransactions,
      setAllTransactions,
      dividendsList,
      setDividendsList,
      chartData,
      setChartData,
      analytics,
      setAnalytics,
      
      loadingHoldings,
      loadingTransactions,
      loadingPortfolios,
      loadingChart,
      loadingAnalytics,
      
      widgets,
      setWidgets,
      showWidgetManager,
      setShowWidgetManager,
      linkCash,
      setLinkCash,
      
      portfolioAccountsMap,
      uniqueAccounts,
      portfolioTransactions,
      transactions,
      
      loadPortfolios,
      fetchHoldings,
      fetchTransactions,
      fetchHistoricalPerformance,
      fetchPortfolioAnalytics
    }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error('usePortfolio must be used within a PortfolioProvider');
  }
  return context;
}
