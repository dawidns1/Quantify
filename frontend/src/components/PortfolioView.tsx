import { useState, useEffect, useMemo } from 'react';
import { 
  History, 
  Plus, 
  X, 
  Edit2, 
  Trash2, 
  Lock, 
  Menu,
  Search
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

import { PortfolioAllocation } from './portfolio/PortfolioAllocation';
import { useAuth } from '../AuthContext';

import type { Portfolio, Transaction, Holding, Summary } from '../types/portfolio';

import { Sidebar } from './portfolio/Sidebar';
import { MetricsBanner } from './portfolio/MetricsBanner';
import { PerformanceChart } from './portfolio/PerformanceChart';
import { HoldingsTable } from './portfolio/HoldingsTable';
import { LedgerTable } from './portfolio/LedgerTable';
import { AddTransactionModal } from './portfolio/AddTransactionModal';
import { ShareModal } from './portfolio/ShareModal';
import { SettingsModal } from './portfolio/SettingsModal';
import { PremiumUpsellModal } from './portfolio/PremiumUpsellModal';
import { DividendLedgerTable } from './portfolio/DividendLedgerTable';
import { AddDividendModal } from './portfolio/AddDividendModal';

import { 
  fetchHoldings as fetchHoldingsService, 
  fetchHistoricalPerformance as fetchHistoricalPerformanceService 
} from '../services/calculationService';
import { 
  fetchUserPortfolios, 
  createPortfolio, 
  renamePortfolio, 
  deletePortfolio,
  updatePortfolioSettings
} from '../services/supabaseService';
import { 
  fetchTransactions as fetchTransactionsService, 
  deleteTransaction as deleteTransactionService 
} from '../services/transactionService';


interface PortfolioViewProps {
  apiBaseUrl: string;
  signOut: () => Promise<void>;
  lowPerformanceMode: boolean;
  setLowPerformanceMode: (val: boolean) => void;
}

export function PortfolioView({ 
  apiBaseUrl, 
  signOut, 
  lowPerformanceMode, 
  setLowPerformanceMode 
}: PortfolioViewProps) {
  const { user, session } = useAuth();
  const tier = 'premium' as 'free' | 'premium'; // Force premium tier to bypass all free-tier limits and prompts for now
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [subTab, setSubTabState] = useState<'overview' | 'ledger' | 'dividends'>(() => {
    const cached = localStorage.getItem('portfolio_sub_tab');
    return (cached === 'overview' || cached === 'ledger' || cached === 'dividends') ? cached : 'overview';
  });

  const setSubTab = (tab: 'overview' | 'ledger' | 'dividends') => {
    triggerRandomUpsell();
    setSubTabState(tab);
    localStorage.setItem('portfolio_sub_tab', tab);
  };

  const [baseCurrency, setBaseCurrencyState] = useState<'PLN' | 'USD' | 'EUR'>(() => {
    const cached = localStorage.getItem('portfolio_base_currency');
    return (cached === 'PLN' || cached === 'USD' || cached === 'EUR') ? cached : 'PLN';
  });

  const setBaseCurrency = (currency: 'PLN' | 'USD' | 'EUR') => {
    triggerRandomUpsell();
    setBaseCurrencyState(currency);
    localStorage.setItem('portfolio_base_currency', currency);
  };
  
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total_cost_base: 0,
    total_value_base: 0,
    total_gain_base: 0,
    total_gain_percent: 0,
    base_currency: 'PLN'
  });
  
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [dividendsList, setDividendsList] = useState<any[]>([]);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddDividendModal, setShowAddDividendModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingDividend, setEditingDividend] = useState<any | null>(null);
  const [quickActionData, setQuickActionData] = useState<{ symbol: string; type: 'BUY' | 'SELL' } | null>(null);
  const [customModal, setCustomModal] = useState<any | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [upsellModalOpen, setUpsellModalOpen] = useState(false);
  const [upsellReason, setUpsellReason] = useState<'portfolio' | 'account' | 'general'>('general');
  
  const [linkCash, setLinkCashState] = useState<boolean>(() => {
    return localStorage.getItem('portfolio_link_cash') !== 'false';
  });

  const setLinkCash = (val: boolean) => {
    triggerRandomUpsell();
    setLinkCashState(val);
    localStorage.setItem('portfolio_link_cash', String(val));
  };

  const [chartData, setChartData] = useState<{ dates: string[]; nav: number[]; cost_basis: number[] } | null>(null);
  const [loadingChart, setLoadingChart] = useState<boolean>(false);
  const [selectedPositionSymbol, setSelectedPositionSymbol] = useState<string | null>(null);
  const [selectedStockDetails, setSelectedStockDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  const [modalSortField, setModalSortField] = useState<string>('date');
  const [modalSortAsc, setModalSortAsc] = useState<boolean>(false);
  const [modalSearchQuery, setModalSearchQuery] = useState<string>('');
  const [modalRange, setModalRange] = useState<'1M' | '3M' | '1Y' | '3Y' | 'MAX'>('1M');

  useEffect(() => {
    setModalSortField('date');
    setModalSortAsc(false);
    setModalSearchQuery('');
    setModalRange('1M');
  }, [selectedPositionSymbol]);

  useEffect(() => {
    if (!selectedPositionSymbol) {
      setSelectedStockDetails(null);
      return;
    }
    setLoadingDetails(true);
    fetch(`${apiBaseUrl}/api/stocks/${selectedPositionSymbol}`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch stock details");
        return res.json();
      })
      .then(data => {
        setSelectedStockDetails(data);
        setLoadingDetails(false);
      })
      .catch(err => {
        console.error("Error fetching stock details:", err);
        setLoadingDetails(false);
      });
  }, [selectedPositionSymbol, apiBaseUrl]);

  const modalChartData = useMemo(() => {
    if (!selectedStockDetails || !selectedStockDetails.history || selectedStockDetails.history.length === 0) return null;
    let hist = [...selectedStockDetails.history];
    hist.sort((a: any, b: any) => a.date.localeCompare(b.date));

    if (modalRange !== 'MAX') {
      const latestDateStr = hist[hist.length - 1].date;
      const latestDate = new Date(latestDateStr);
      let cutoffDate = new Date(latestDate);
      if (modalRange === '1M') {
        cutoffDate.setMonth(cutoffDate.getMonth() - 1);
      } else if (modalRange === '3M') {
        cutoffDate.setMonth(cutoffDate.getMonth() - 3);
      } else if (modalRange === '1Y') {
        cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
      } else if (modalRange === '3Y') {
        cutoffDate.setFullYear(cutoffDate.getFullYear() - 3);
      }
      const cutoffStr = cutoffDate.toISOString().split('T')[0];
      hist = hist.filter((pt: any) => pt.date >= cutoffStr);
    }
    return hist;
  }, [selectedStockDetails, modalRange]);

  const modalChartFormatted = useMemo(() => {
    if (!modalChartData || modalChartData.length === 0) return null;
    const dates = modalChartData.map((pt: any) => pt.date);
    const prices = modalChartData.map((pt: any) => pt.price);
    const isUp = prices[prices.length - 1] >= prices[0];
    const accentColor = isUp ? '#10b981' : '#ef4444';
    return {
      labels: dates,
      datasets: [
        {
          label: 'Price',
          data: prices,
          fill: true,
          backgroundColor: isUp ? 'rgba(16, 185, 129, 0.04)' : 'rgba(239, 68, 68, 0.04)',
          borderColor: accentColor,
          borderWidth: 1.75,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHitRadius: 10,
          tension: 0.15
        }
      ]
    };
  }, [modalChartData]);

  const modalChartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 150 },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: 'rgba(255, 255, 255, 0.6)',
            font: { family: 'Outfit', size: 9 },
            maxTicksLimit: 6
          }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: 'rgba(255, 255, 255, 0.6)',
            font: { family: 'Outfit', size: 9 }
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index' as const,
          intersect: false,
          backgroundColor: 'rgba(15, 23, 42, 0.96)',
          titleColor: '#ffffff',
          bodyColor: '#f1f5f9',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          padding: 8,
          cornerRadius: 6,
          titleFont: { family: 'Outfit', size: 10, weight: 'bold' as const },
          bodyFont: { family: 'Outfit', size: 10 }
        }
      }
    };
  }, []);

  // Filtering states
  const [selectedAccount, setSelectedAccountState] = useState<string>(() => {
    return localStorage.getItem('portfolio_selected_account') || 'All';
  });

  const setSelectedAccount = (account: string) => {
    triggerRandomUpsell();
    setSelectedAccountState(account);
    localStorage.setItem('portfolio_selected_account', account);
  };

  // Portfolios state (multi-device collaborative lists)
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [activePortfolioRole, setActivePortfolioRole] = useState<'owner' | 'editor' | 'viewer'>('viewer');
  const [loadingPortfolios, setLoadingPortfolios] = useState(true);

  // Trigger a random upsell modal (e.g. 10% chance) on general user actions when on the Free plan
  const triggerRandomUpsell = () => {
    if (tier === 'free') {
      if (Math.random() < 0.10) {
        setUpsellReason('general');
        setUpsellModalOpen(true);
        return true;
      }
    }
    return false;
  };

  // 1. Transactions filtered by portfolio (used for fetching holdings & historical charting)
  const portfolioTransactions = useMemo(() => {
    if (activePortfolioId && activePortfolioId !== 'all') {
      return allTransactions.filter(tx => tx.portfolio_id === activePortfolioId);
    }
    return allTransactions;
  }, [allTransactions, activePortfolioId]);

  // 2. Transactions filtered by both portfolio and account (used for ledger, Cash Modal, etc.)
  const transactions = useMemo(() => {
    let list = allTransactions;
    if (activePortfolioId && activePortfolioId !== 'all') {
      list = list.filter(tx => tx.portfolio_id === activePortfolioId);
    }
    if (selectedAccount && selectedAccount !== 'All') {
      list = list.filter(tx => (tx.account || 'Default').toLowerCase() === selectedAccount.toLowerCase());
    }
    return list;
  }, [allTransactions, activePortfolioId, selectedAccount]);

  // 3. Dynamic map of unique accounts per portfolio ID for sidebar tree list
  const portfolioAccountsMap = useMemo(() => {
    const mapping: Record<string, string[]> = {};
    for (const tx of allTransactions) {
      const pId = tx.portfolio_id;
      if (!pId) continue;
      const acc = tx.account || 'Default';
      if (!mapping[pId]) {
        mapping[pId] = [];
      }
      if (!mapping[pId].includes(acc)) {
        mapping[pId].push(acc);
      }
    }
    for (const pId in mapping) {
      mapping[pId].sort();
    }
    return mapping;
  }, [allTransactions]);

  // 4. Extract unique accounts dynamically for the active portfolio scope
  const uniqueAccounts = useMemo(() => {
    return Array.from(
      new Set(portfolioTransactions.map((tx) => tx.account || 'Default'))
    ).sort();
  }, [portfolioTransactions]);

  // Load portfolios from Supabase
  const loadPortfolios = async () => {
    if (!user) return;
    setLoadingPortfolios(true);
    try {
      let formatted = await fetchUserPortfolios(user.id);

      if (formatted.length === 0) {
        const defaultPortfolio = await createPortfolio(user.id, 'My Portfolio');
        formatted = [defaultPortfolio];
      }

      setPortfolios(formatted);

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
          localStorage.setItem('portfolio_active_id', formatted[0].id);
        }
      }
    } catch (err) {
      console.error('Error loading portfolios:', err);
    } finally {
      setLoadingPortfolios(false);
    }
  };

  // Custom modal helpers
  const showCustomPrompt = (title: string, message: string, defaultValue: string, onConfirm: (val: string) => void) => {
    setCustomModal({
      isOpen: true,
      type: 'prompt',
      title,
      message,
      defaultValue,
      onConfirm: (val: any) => onConfirm(val || ''),
    });
  };

  const showCustomConfirm = (title: string, message: string, onConfirm: () => void, isDestructive = false) => {
    setCustomModal({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      onConfirm: () => onConfirm(),
      isDestructive
    });
  };

  // Create Portfolio
  const handleCreatePortfolio = () => {
    if (tier === 'free' && portfolios.length >= 1) {
      setUpsellReason('portfolio');
      setUpsellModalOpen(true);
      return;
    }
    showCustomPrompt(
      "Create Portfolio",
      "Enter a name for your new portfolio:",
      "",
      async (name) => {
        if (!name || !name.trim()) return;
        try {
          const newPortfolio = await createPortfolio(user!.id, name.trim());
          await loadPortfolios();
          
          // Switch to the new portfolio
          setActivePortfolioId(newPortfolio.id);
          setActivePortfolioRole('owner');
          localStorage.setItem('portfolio_active_id', newPortfolio.id);
        } catch (err: any) {
          console.error('Error creating portfolio:', err);
          alert('Failed to create portfolio: ' + err.message);
        }
      }
    );
  };

  // Rename Portfolio
  const handleRenamePortfolio = (id: string = activePortfolioId || '') => {
    if (!id) return;
    const currentPortfolio = portfolios.find(p => p.id === id);
    if (!currentPortfolio) return;
    
    showCustomPrompt(
      "Rename Portfolio",
      `Enter a new name for "${currentPortfolio.name}":`,
      currentPortfolio.name,
      async (newName) => {
        if (!newName || !newName.trim() || newName.trim() === currentPortfolio.name) return;
        
        try {
          await renamePortfolio(id, newName.trim());
          await loadPortfolios();
        } catch (err: any) {
          console.error('Error renaming portfolio:', err);
          alert('Failed to rename portfolio: ' + err.message);
        }
      }
    );
  };

  // Delete Portfolio
  const handleDeletePortfolio = (id: string = activePortfolioId || '') => {
    if (!id) return;
    const currentPortfolio = portfolios.find(p => p.id === id);
    if (!currentPortfolio) return;
    
    showCustomConfirm(
      "Delete Portfolio",
      `Are you sure you want to permanently delete the portfolio "${currentPortfolio.name}"? This will delete all its transactions and cannot be undone.`,
      async () => {
        try {
          await deletePortfolio(id);
          // Clear localStorage active ID so loadPortfolios selects the first remaining one
          localStorage.removeItem('portfolio_active_id');
          await loadPortfolios();
        } catch (err: any) {
          console.error('Error deleting portfolio:', err);
          alert('Failed to delete portfolio: ' + err.message);
        }
      },
      true
    );
  };

  useEffect(() => {
    loadPortfolios();
  }, [user?.id]);

  // Fetch holdings (GET from backend calculator using JWT)
  const fetchHoldings = async (curr: 'PLN' | 'USD' | 'EUR', accountFilter: string = selectedAccount, silent = false) => {
    if (!activePortfolioId) return;
    if (!silent) setLoadingHoldings(true);
    try {
      const jwtToken = session?.access_token || null;
      const result = await fetchHoldingsService(
        apiBaseUrl,
        jwtToken,
        activePortfolioId,
        curr,
        accountFilter,
        linkCash
      );
      setHoldings(result.holdings);
      setSummary(result.summary);
      setDividendsList(result.dividends_list || []);
    } catch (err) {
      console.error('Error fetching holdings:', err);
    } finally {
      if (!silent) setLoadingHoldings(false);
    }
  };

  // Fetch transactions from Supabase for all loaded portfolios
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
      setAllTransactions(data);
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoadingTransactions(false);
    }
  };

  // Fetch historical performance data for the chart
  const fetchHistoricalPerformance = async (curr: 'PLN' | 'USD' | 'EUR', accountFilter: string = selectedAccount) => {
    if (!activePortfolioId) {
      setChartData(null);
      return;
    }
    setLoadingChart(true);
    try {
      const jwtToken = session?.access_token || null;
      const data = await fetchHistoricalPerformanceService(
        apiBaseUrl,
        jwtToken,
        activePortfolioId,
        curr,
        accountFilter,
        linkCash
      );
      setChartData(data);
    } catch (err) {
      console.error('Error fetching historical performance:', err);
    } finally {
      setLoadingChart(false);
    }
  };

  // Fetch transactions when the list of portfolios updates
  useEffect(() => {
    if (portfolios.length > 0) {
      fetchTransactions();
    }
  }, [portfolios]);

  // Reset holdings and chart data on portfolio or account change to show skeleton loader
  useEffect(() => {
    setHoldings([]);
    setChartData(null);
  }, [activePortfolioId, selectedAccount]);

  // Recalculate holdings when active portfolio, filters, or transactions update
  useEffect(() => {
    if (activePortfolioId && portfolios.length > 0) {
      fetchHoldings(baseCurrency, selectedAccount, false);
    }
  }, [baseCurrency, selectedAccount, activePortfolioId, allTransactions, linkCash, portfolios]);

  // Set up live polling (every 60 seconds) for real-time price updates when active portfolios exist and markets are open
  useEffect(() => {
    if (!activePortfolioId || portfolios.length === 0) return;
    
    // We only poll if at least one holding is currently in a live trading session
    const hasLiveInstruments = holdings.some(h => h.is_live);
    if (!hasLiveInstruments) return;
    
    const interval = setInterval(() => {
      fetchHoldings(baseCurrency, selectedAccount, true);
    }, 60000); // Poll every 60 seconds (1 minute)
    
    return () => clearInterval(interval);
  }, [activePortfolioId, baseCurrency, selectedAccount, linkCash, portfolios, holdings]);

  // Recalculate chart when active portfolio, filters, or transactions update
  useEffect(() => {
    if (activePortfolioId && portfolioTransactions.length > 0) {
      fetchHistoricalPerformance(baseCurrency, selectedAccount);
    } else {
      setChartData(null);
    }
  }, [baseCurrency, selectedAccount, activePortfolioId, portfolioTransactions, linkCash]);

  // Handle quick actions from holdings table
  const handleQuickAction = (symbol: string, type: 'BUY' | 'SELL') => {
    if (activePortfolioRole === 'viewer') return;
    if (triggerRandomUpsell()) return;
    setQuickActionData({ symbol, type });
    setShowAddModal(true);
  };

  // Handle delete transaction
  const handleDeleteTransaction = (id: string) => {
    if (activePortfolioRole === 'viewer') return;
    
    showCustomConfirm(
      "Delete Transaction",
      "Are you sure you want to delete this transaction from your ledger?",
      async () => {
        try {
          await deleteTransactionService(id);
          fetchHoldings(baseCurrency, selectedAccount);
          fetchTransactions();
        } catch (err: any) {
          console.error('Error deleting transaction:', err);
          alert('Failed to delete transaction: ' + err.message);
        }
      },
      true
    );
  };

  // Handle delete or skip of a dividend payout (saves to portfolio settings)
  const handleDeleteDividend = async (div: any) => {
    if (!activePortfolioId) return;
    if (activePortfolioRole === 'viewer') return;
    
    showCustomConfirm(
      div.is_manual ? "Delete Dividend" : "Skip Dividend Payment",
      div.is_manual 
        ? "Are you sure you want to delete this manual dividend record?" 
        : "Are you sure you want to skip/delete this automatic dividend payment? (This filters it out of holdings and historical NAV calculation)",
      async () => {
        try {
          const activePort = portfolios.find(p => p.id === activePortfolioId);
          const settings = activePort?.settings || {};
          const existingDividends = [...(settings.dividends || [])];

          if (div.is_manual) {
            // Remove the manual dividend record by filtering it out
            const nextDivs = existingDividends.filter(d => d.id !== div.id);
            const updatedSettings = { ...settings, dividends: nextDivs };
            await updatePortfolioSettings(activePortfolioId, updatedSettings);
            setPortfolios(prev => prev.map(p => p.id === activePortfolioId ? { ...p, settings: updatedSettings } : p));
          } else {
            // Add a skip override key matching (symbol, date, account)
            const idx = existingDividends.findIndex(d => 
              !d.is_manual &&
              d.symbol?.toUpperCase() === div.symbol?.toUpperCase() &&
              d.date === div.date &&
              (d.account || 'Default') === (div.account || 'Default')
            );

            if (idx !== -1) {
              existingDividends[idx] = {
                ...existingDividends[idx],
                is_deleted: true
              };
            } else {
              existingDividends.push({
                id: 'div_ovr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                symbol: div.symbol,
                date: div.date,
                account: div.account || 'Default',
                is_manual: false,
                is_deleted: true
              });
            }

            const updatedSettings = { ...settings, dividends: existingDividends };
            await updatePortfolioSettings(activePortfolioId, updatedSettings);
            setPortfolios(prev => prev.map(p => p.id === activePortfolioId ? { ...p, settings: updatedSettings } : p));
          }

          fetchHoldings(baseCurrency, selectedAccount);
          fetchHistoricalPerformance(baseCurrency, selectedAccount);
        } catch (err: any) {
          console.error('Error deleting dividend:', err);
          alert('Failed to delete/skip dividend: ' + err.message);
        }
      },
      true
    );
  };

  // Populate form fields to start editing transaction
  const handleStartEditTransaction = (tx: Transaction) => {
    setEditingTransaction(tx);
    setShowAddModal(true);
  };

  // Filter and sort transactions for the selected holding position modal
  const positionTransactionsFilteredAndSorted = useMemo(() => {
    if (!selectedPositionSymbol) return [];
    
    // 1. Filter by symbol
    let list = transactions.filter(tx => tx.symbol.toUpperCase() === selectedPositionSymbol.toUpperCase());
    
    // 2. Filter by search query (date, type, account, price, shares, etc.)
    if (modalSearchQuery.trim()) {
      const q = modalSearchQuery.toLowerCase().trim();
      list = list.filter(tx => 
        tx.date.includes(q) || 
        tx.type.toLowerCase().includes(q) ||
        (tx.account || 'Default').toLowerCase().includes(q) ||
        tx.shares.toString().includes(q) ||
        tx.price.toString().includes(q)
      );
    }
    
    // 3. Map with totalLocal
    const listWithTotals = list.map(tx => {
      const totalLocal = (tx.shares * tx.price) + (tx.type === 'BUY' ? tx.fees : -tx.fees);
      return {
        ...tx,
        totalLocal
      };
    });
    
    // 4. Sort
    listWithTotals.sort((a, b) => {
      let valA: any;
      let valB: any;
      
      if (modalSortField === 'date') {
        valA = a.date;
        valB = b.date;
      } else if (modalSortField === 'type') {
        valA = a.type;
        valB = b.type;
      } else if (modalSortField === 'shares') {
        valA = a.shares;
        valB = b.shares;
      } else if (modalSortField === 'price') {
        valA = a.price;
        valB = b.price;
      } else if (modalSortField === 'fees') {
        valA = a.fees;
        valB = b.fees;
      } else if (modalSortField === 'total') {
        valA = a.totalLocal;
        valB = b.totalLocal;
      } else {
        valA = a.date;
        valB = b.date;
      }
      
      if (valA === undefined || valA === null) return modalSortAsc ? 1 : -1;
      if (valB === undefined || valB === null) return modalSortAsc ? -1 : 1;
      
      if (typeof valA === 'string' && typeof valB === 'string') {
        const comp = valA.localeCompare(valB, undefined, { sensitivity: 'base' });
        return modalSortAsc ? comp : -comp;
      }
      
      return modalSortAsc ? valA - valB : valB - valA;
    });
    
    return listWithTotals;
  }, [transactions, selectedPositionSymbol, modalSearchQuery, modalSortField, modalSortAsc]);

  // Find holding details for the selected position modal
  const holdingDetails = useMemo(() => {
    if (!selectedPositionSymbol) return null;
    return holdings.find(h => h.symbol.toUpperCase() === selectedPositionSymbol.toUpperCase()) || null;
  }, [holdings, selectedPositionSymbol]);

  const formatCurrency = (val: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const formatShares = (shares: number) => {
    return (Math.round(shares * 10000) / 10000).toString();
  };

  const handleModalSort = (field: string) => {
    if (modalSortField === field) {
      setModalSortAsc(!modalSortAsc);
    } else {
      setModalSortField(field);
      setModalSortAsc(field !== 'date');
    }
  };

  const renderModalSortArrow = (field: string) => {
    if (modalSortField !== field) {
      return <span style={{ opacity: 0.25, marginLeft: '4px', fontSize: '0.75rem' }}>↕</span>;
    }
    return modalSortAsc ? (
      <span style={{ color: 'var(--color-primary)', marginLeft: '4px', fontSize: '0.75rem' }}>▲</span>
    ) : (
      <span style={{ color: 'var(--color-primary)', marginLeft: '4px', fontSize: '0.75rem' }}>▼</span>
    );
  };

  return (
    <div className="app-layout">
      {/* Mobile Sidebar Backdrop Overlay */}
      {sidebarOpen && (
        <div className="mobile-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* LEFT SIDEBAR */}
      <Sidebar 
        signOut={signOut}
        lowPerformanceMode={lowPerformanceMode}
        setLowPerformanceMode={setLowPerformanceMode}
        linkCash={linkCash}
        setLinkCash={setLinkCash}
        portfolios={portfolios}
        activePortfolioId={activePortfolioId}
        setActivePortfolioId={setActivePortfolioId}
        setActivePortfolioRole={setActivePortfolioRole}
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        portfolioAccountsMap={portfolioAccountsMap}
        onCreatePortfolio={handleCreatePortfolio}
        onRenamePortfolio={handleRenamePortfolio}
        onDeletePortfolio={handleDeletePortfolio}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        subTab={subTab}
        setSubTab={setSubTab}
        baseCurrency={baseCurrency}
        setBaseCurrency={setBaseCurrency}
        onShareClick={() => setShowShareModal(true)}
        onSettingsClick={() => setShowSettingsModal(true)}
      />

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        <div className="portfolio-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}>
          
          {/* Glowing Neon Top Progress Bar */}
          {(loadingHoldings || loadingChart || loadingPortfolios || loadingTransactions) && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: 'linear-gradient(90deg, transparent, var(--color-primary), transparent)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite linear',
              zIndex: 10,
              borderRadius: '3px 3px 0 0'
            }} />
          )}
          
          {/* Top navigation Header Switcher Bar (Mobile only) */}
          <div className="portfolio-header-bar glass-panel">
            <button 
              className="mobile-menu-toggle-btn"
              onClick={() => setSidebarOpen(true)}
              title="Open Navigation Menu"
            >
              <Menu size={18} />
            </button>
          </div>

          {/* Shimmer / Skeleton Loading placeholder for initial data fetch */}
          {((loadingPortfolios && portfolios.length === 0) || (loadingHoldings && holdings.length === 0) || (loadingTransactions && allTransactions.length === 0)) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Consolidated Premium Metrics Banner Skeleton */}
              <div className="glass-panel" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem',
                background: 'linear-gradient(135deg, rgba(18, 24, 38, 0.65) 0%, rgba(13, 17, 28, 0.8) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
                gap: '1rem',
                flexWrap: 'wrap',
                marginBottom: '0.75rem'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '120px' }}>
                  <div className="shimmer-placeholder" style={{ width: '120px', height: '12px' }}></div>
                  <div className="shimmer-placeholder" style={{ width: '180px', height: '24px' }}></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '120px' }}>
                  <div className="shimmer-placeholder" style={{ width: '100px', height: '12px' }}></div>
                  <div className="shimmer-placeholder" style={{ width: '140px', height: '20px' }}></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '120px' }}>
                  <div className="shimmer-placeholder" style={{ width: '120px', height: '12px' }}></div>
                  <div className="shimmer-placeholder" style={{ width: '160px', height: '20px' }}></div>
                </div>
              </div>

              {subTab === 'overview' ? (
                <>
                  {/* Chart skeleton */}
                  <div className="glass-panel" style={{ padding: '1rem', marginBottom: '0.75rem', height: '260px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="shimmer-placeholder" style={{ width: '220px', height: '18px' }}></div>
                    <div className="shimmer-placeholder" style={{ width: '100%', flex: 1 }}></div>
                  </div>

                  {/* Grid skeleton */}
                  <div className="portfolio-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                    <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div className="shimmer-placeholder" style={{ width: '180px', height: '22px' }}></div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} style={{ display: 'flex', gap: '1rem' }}>
                            <div className="shimmer-placeholder" style={{ flex: 2, height: '20px' }}></div>
                            <div className="shimmer-placeholder" style={{ flex: 3, height: '20px' }}></div>
                            <div className="shimmer-placeholder" style={{ flex: 1, height: '20px' }}></div>
                            <div className="shimmer-placeholder" style={{ flex: 1.5, height: '20px' }}></div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div className="shimmer-placeholder" style={{ width: '140px', height: '20px' }}></div>
                      {[1, 2, 3].map(i => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div className="shimmer-placeholder" style={{ width: '60px', height: '14px' }}></div>
                            <div className="shimmer-placeholder" style={{ width: '40px', height: '14px' }}></div>
                          </div>
                          <div className="shimmer-placeholder" style={{ width: '100%', height: '8px' }}></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                /* Ledger tab skeleton */
                <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="shimmer-placeholder" style={{ width: '220px', height: '24px' }}></div>
                    <div className="shimmer-placeholder" style={{ width: '150px', height: '18px' }}></div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                      <div key={i} style={{ display: 'flex', gap: '1rem' }}>
                        <div className="shimmer-placeholder" style={{ flex: 1.5, height: '20px' }}></div>
                        <div className="shimmer-placeholder" style={{ flex: 1, height: '20px' }}></div>
                        <div className="shimmer-placeholder" style={{ flex: 1, height: '20px' }}></div>
                        <div className="shimmer-placeholder" style={{ flex: 2, height: '20px' }}></div>
                        <div className="shimmer-placeholder" style={{ flex: 1, height: '20px' }}></div>
                        <div className="shimmer-placeholder" style={{ flex: 1.5, height: '20px' }}></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Viewer Lock Warning Banner */}
              {activePortfolioRole === 'viewer' && activePortfolioId !== 'all' && (
                <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid #f59e0b', color: '#f59e0b', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                  <Lock size={16} style={{ flexShrink: 0 }} />
                  <span>You have <strong>Read-Only (Viewer)</strong> access to this portfolio. Adding, editing, or deleting transactions is disabled.</span>
                </div>
              )}

              {/* OVERVIEW TAB CONTENT */}
              <div style={{ display: subTab === 'overview' ? 'block' : 'none' }}>
                <MetricsBanner summary={summary} />
                
                <div className="portfolio-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginTop: '0.25rem' }}>
                  {/* Left Column: Holdings Table */}
                  <div style={{ minWidth: 0 }}>
                    <HoldingsTable 
                      holdings={holdings}
                      summary={summary}
                      activePortfolioRole={activePortfolioRole}
                      onQuickAction={handleQuickAction}
                      onSelectPositionSymbol={setSelectedPositionSymbol}
                    />
                  </div>
                  {/* Right Column: Performance Chart & Allocations stacked */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <PerformanceChart 
                      chartData={chartData} 
                      loadingChart={loadingChart} 
                      baseCurrency={summary.base_currency} 
                    />
                    <PortfolioAllocation 
                      holdings={holdings}
                      summary={summary}
                    />
                  </div>
                </div>
              </div>

              {/* LEDGER TAB CONTENT */}
              <div style={{ display: subTab === 'ledger' ? 'block' : 'none' }}>
                <LedgerTable 
                  transactions={transactions}
                  activePortfolioRole={activePortfolioRole}
                  onEditTransaction={handleStartEditTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                />
              </div>

              {/* DIVIDENDS TAB CONTENT */}
              <div style={{ display: subTab === 'dividends' ? 'block' : 'none' }}>
                <DividendLedgerTable 
                  dividends={dividendsList}
                  activePortfolioRole={activePortfolioRole}
                  baseCurrency={summary.base_currency}
                  onAddDividendClick={() => {
                    setEditingDividend(null);
                    setShowAddDividendModal(true);
                  }}
                  onEditDividendClick={(div) => {
                    setEditingDividend(div);
                    setShowAddDividendModal(true);
                  }}
                  onDeleteDividendClick={handleDeleteDividend}
                />
              </div>
            </>
          )}

          {/* Legal Compliance & Market Data Disclaimer Footer */}
          <footer style={{ 
            marginTop: '2.5rem', 
            padding: '1.25rem 0', 
            borderTop: '1px solid var(--panel-border)', 
            textAlign: 'center', 
            fontSize: '0.72rem', 
            color: 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            lineHeight: '1.45'
          }}>
            <div>
              <strong>Disclaimer:</strong> Quantify is a portfolio tracking tool provided for educational and informational purposes only. We do not provide financial, investment, or tax advice.
            </div>
            <div>
              Market data may be delayed and is provided "as is" without guarantees of accuracy or completeness.
            </div>
          </footer>

        </div>
      </main>

      {/* ADD TRANSACTION DIALOG MODAL */}
      <AddTransactionModal 
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingTransaction(null);
          setQuickActionData(null);
        }}
        editingTransaction={editingTransaction}
        quickActionData={quickActionData}
        activePortfolioId={activePortfolioId}
        activePortfolioRole={activePortfolioRole}
        apiBaseUrl={apiBaseUrl}
        uniqueAccounts={uniqueAccounts}
        transactions={allTransactions}
        linkCash={linkCash}
        setLinkCash={setLinkCash}
        onSaveSuccess={() => {
          fetchHoldings(baseCurrency, selectedAccount);
          fetchTransactions();
        }}
        tier={tier}
        onLimitReached={(reason) => {
          setUpsellReason(reason);
          setUpsellModalOpen(true);
        }}
      />

      {/* COLLABORATIVE SHARING DIALOG MODAL */}
      <ShareModal 
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        activePortfolioId={activePortfolioId}
        showCustomConfirm={showCustomConfirm}
      />

      {/* PORTFOLIO SETTINGS MODAL */}
      <SettingsModal 
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        portfolio={portfolios.find(p => p.id === activePortfolioId) || null}
        portfolioAccounts={uniqueAccounts}
        onSaveSuccess={(updatedSettings) => {
          setPortfolios(prev => prev.map(p => p.id === activePortfolioId ? { ...p, settings: updatedSettings } : p));
          fetchHoldings(baseCurrency, selectedAccount);
          fetchHistoricalPerformance(baseCurrency, selectedAccount);
        }}
      />

      {/* PORTFOLIO DIVIDENDS OVERRIDES MODAL */}
      <AddDividendModal
        isOpen={showAddDividendModal}
        onClose={() => setShowAddDividendModal(false)}
        editingDividend={editingDividend}
        activePortfolioId={activePortfolioId}
        uniqueAccounts={uniqueAccounts}
        portfolioSettings={portfolios.find(p => p.id === activePortfolioId)?.settings || {}}
        onSaveSuccess={(updatedSettings) => {
          setPortfolios(prev => prev.map(p => p.id === activePortfolioId ? { ...p, settings: updatedSettings } : p));
          fetchHoldings(baseCurrency, selectedAccount);
          fetchHistoricalPerformance(baseCurrency, selectedAccount);
        }}
      />

      {/* POSITION TRANSACTIONS HISTORY MODAL */}
      {selectedPositionSymbol && (
        <>
          <div className="modal-backdrop" onClick={() => setSelectedPositionSymbol(null)} style={{ cursor: 'pointer' }} />
          <div className="modal-overlay-container">
            <div className="modal-content" style={{ maxWidth: '850px', width: '95%' }}>
              <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, fontSize: '1.35rem' }}>
                  <History size={22} className="gradient-text" /> 
                  <span style={{ fontWeight: 700 }}>{selectedPositionSymbol}</span>
                  {holdingDetails?.name && (
                    <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', fontWeight: 400, opacity: 0.85 }}>
                      ({holdingDetails.name})
                    </span>
                  )}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {/* Modal Search Bar */}
                  {(transactions.filter(tx => tx.symbol.toUpperCase() === selectedPositionSymbol.toUpperCase()).length > 0 || modalSearchQuery) && (
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Search size={13} style={{ position: 'absolute', left: '8px', color: 'var(--text-muted)' }} />
                      <input 
                        type="text" 
                        placeholder="Search history..." 
                        value={modalSearchQuery}
                        onChange={(e) => setModalSearchQuery(e.target.value)}
                        className="input-field"
                        style={{ 
                          paddingLeft: '26px', 
                          fontSize: '0.72rem', 
                          height: '28px', 
                          width: '150px',
                          borderRadius: '6px'
                        }}
                      />
                    </div>
                  )}
                  <button 
                    onClick={() => setSelectedPositionSymbol(null)}
                    className="modal-close-btn"
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Quick Summary Dashboard */}
                {holdingDetails && (
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                    gap: '1rem', 
                    background: 'rgba(255, 255, 255, 0.02)',
                    padding: '1rem 1.25rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Shares Owned</span>
                      <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                        {formatShares(holdingDetails.shares)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Cost (Local)</span>
                      <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                        {formatCurrency(holdingDetails.avg_cost_local, holdingDetails.currency)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current Value</span>
                      <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                        {formatCurrency(holdingDetails.current_value_base, summary.base_currency)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Return</span>
                      <span style={{ 
                        fontSize: '1.2rem', 
                        fontWeight: 700, 
                        fontFamily: 'monospace',
                        color: holdingDetails.gain_base >= 0 ? 'var(--color-green)' : 'var(--color-red)'
                      }}>
                        {holdingDetails.gain_base >= 0 ? '+' : ''}{formatCurrency(holdingDetails.gain_base, summary.base_currency)}
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, marginLeft: '4px' }}>
                          ({holdingDetails.gain_base >= 0 ? '+' : ''}{holdingDetails.gain_percent.toFixed(2)}%)
                        </span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Simplified Interactive Details Chart */}
                <div className="glass-panel" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', background: 'rgba(0, 0, 0, 0.12)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                      Price Performance ({holdingDetails?.currency || 'USD'})
                    </span>
                    
                    {/* Modal range selector pills */}
                    {!loadingDetails && selectedStockDetails && (
                      <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '2px' }}>
                        {(['1M', '3M', '1Y', '3Y', 'MAX'] as const).map((r) => (
                          <button
                            key={r}
                            onClick={() => setModalRange(r)}
                            style={{
                              background: modalRange === r ? 'var(--color-primary)' : 'transparent',
                              color: modalRange === r ? 'white' : 'var(--text-secondary)',
                              border: 'none',
                              padding: '0.15rem 0.4rem',
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              borderRadius: '4px',
                              cursor: 'pointer',
                              transition: 'var(--transition-smooth)'
                            }}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div style={{ height: '140px', position: 'relative' }}>
                    {loadingDetails ? (
                      <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }} className="pulse">
                        Loading price details...
                      </div>
                    ) : modalChartFormatted ? (
                      <Line 
                        options={modalChartOptions}
                        data={modalChartFormatted}
                      />
                    ) : (
                      <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        No price history available.
                      </div>
                    )}
                  </div>
                </div>

                {positionTransactionsFilteredAndSorted.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0', margin: 0 }}>
                    No transactions found for {selectedPositionSymbol}.
                  </p>
                ) : (
                  <div style={{ 
                    maxHeight: '320px', 
                    overflowY: 'auto',
                    border: '1px solid var(--panel-border)',
                    borderRadius: '10px',
                    background: 'rgba(0, 0, 0, 0.15)'
                  }}>
                    <table className="screener-table" style={{ fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255, 255, 255, 0.01)' }}>
                          <th onClick={() => handleModalSort('date')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            Date {renderModalSortArrow('date')}
                          </th>
                          <th onClick={() => handleModalSort('type')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            Type {renderModalSortArrow('type')}
                          </th>
                          <th onClick={() => handleModalSort('shares')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                            Shares {renderModalSortArrow('shares')}
                          </th>
                          <th onClick={() => handleModalSort('price')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                            Price {renderModalSortArrow('price')}
                          </th>
                          <th onClick={() => handleModalSort('fees')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                            Fees {renderModalSortArrow('fees')}
                          </th>
                          <th onClick={() => handleModalSort('total')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                            Total {renderModalSortArrow('total')}
                          </th>
                          {activePortfolioRole !== 'viewer' && <th style={{ textAlign: 'center' }}>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {positionTransactionsFilteredAndSorted.map((tx) => {
                          const totalLocal = (tx.shares * tx.price) + (tx.type === 'BUY' ? tx.fees : -tx.fees);
                          return (
                            <tr key={tx.id} className="interactive-row-modal">
                              <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                                {tx.date}
                              </td>
                              <td>
                                <span className={`ledger-type-badge ${tx.type === 'BUY' ? 'badge-buy' : 'badge-sell'}`}>
                                  {tx.type}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                {formatShares(tx.shares)}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                {formatCurrency(tx.price, tx.currency)}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                {tx.fees > 0 ? formatCurrency(tx.fees, tx.currency) : '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                                {formatCurrency(totalLocal, tx.currency)}
                              </td>
                              {activePortfolioRole !== 'viewer' && (
                                <td style={{ textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                                    <button 
                                      onClick={() => {
                                        setSelectedPositionSymbol(null);
                                        handleStartEditTransaction(tx);
                                      }}
                                      className="ledger-delete-btn"
                                      style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '4px', borderRadius: '4px' }}
                                      title="Edit Transaction"
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteTransaction(tx.id)}
                                      className="ledger-delete-btn"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '4px', borderRadius: '4px' }}
                                      title="Delete Transaction"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                  <button
                    onClick={() => setSelectedPositionSymbol(null)}
                    className="glow-btn"
                    style={{
                      padding: '0.55rem 1.5rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-primary)',
                      borderColor: 'var(--panel-border)',
                      boxShadow: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* CUSTOM PROMPT/CONFIRM DIALOG MODAL */}
      {customModal && customModal.isOpen && (
        <>
          <div className="modal-backdrop" />
          <div className="modal-overlay-container">
            <div className="modal-content glass-panel" style={{ maxWidth: '400px' }}>
              <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                  {customModal.title}
                </h3>
                <button 
                  onClick={() => setCustomModal(null)}
                  className="modal-close-btn"
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  {customModal.message}
                </p>

                {customModal.type === 'prompt' && (
                  <div className="form-group">
                    <input
                      type="text"
                      className="input-field"
                      style={{ width: '100%' }}
                      defaultValue={customModal.defaultValue}
                      id="custom-modal-input"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value;
                          customModal.onConfirm(val);
                          setCustomModal(null);
                        }
                      }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    onClick={() => setCustomModal(null)}
                    className="input-field"
                    style={{
                      padding: '0.45rem 1rem',
                      background: 'transparent',
                      borderColor: 'var(--panel-border)',
                      color: 'var(--text-secondary)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      height: 'auto',
                      width: 'auto'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      let val = undefined;
                      if (customModal.type === 'prompt') {
                        val = (document.getElementById('custom-modal-input') as HTMLInputElement)?.value;
                      }
                      customModal.onConfirm(val);
                      setCustomModal(null);
                    }}
                    className="glow-btn"
                    style={{
                      padding: '0.45rem 1rem',
                      background: customModal.isDestructive ? 'var(--color-red)' : 'var(--color-primary)',
                      color: 'white',
                      borderColor: customModal.isDestructive ? 'var(--color-red)' : 'var(--color-primary)',
                      boxShadow: customModal.isDestructive ? '0 0 10px rgba(239, 68, 68, 0.3)' : '0 0 10px rgba(59, 130, 246, 0.3)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      height: 'auto'
                    }}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {/* PREMIUM UPSELL MODAL */}
      <PremiumUpsellModal 
        isOpen={upsellModalOpen}
        onClose={() => setUpsellModalOpen(false)}
        reason={upsellReason}
      />

      {/* Floating Action Button (FAB) */}
      {activePortfolioId !== 'all' && activePortfolioRole !== 'viewer' && (
        <button
          onClick={() => {
            if (!triggerRandomUpsell()) {
              setShowAddModal(true);
            }
          }}
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
            color: 'white',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 0 16px rgba(6, 182, 212, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3)',
            zIndex: 99,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            outline: 'none'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.15) rotate(90deg)';
            e.currentTarget.style.boxShadow = '0 0 24px rgba(6, 182, 212, 0.8), 0 6px 16px rgba(0, 0, 0, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
            e.currentTarget.style.boxShadow = '0 0 16px rgba(6, 182, 212, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3)';
          }}
        >
          <Plus size={24} style={{ strokeWidth: 2.5 }} />
        </button>
      )}

    </div>
  );
}
