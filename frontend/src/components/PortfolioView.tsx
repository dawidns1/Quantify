import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  History, 
  Plus, 
  X, 
  Edit2, 
  Trash2, 
  Lock, 
  Menu,
  Search,
  LayoutGrid,
  Layout,
  Scale
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

import { PortfolioAllocation } from './portfolio/PortfolioAllocation';
import { useAuth } from '../AuthContext';
import { useTranslation } from 'react-i18next';

import type { Transaction } from '../types/portfolio';

import { Sidebar } from './portfolio/Sidebar';
import { MetricsBanner } from './portfolio/MetricsBanner';
import { PerformanceChart } from './portfolio/PerformanceChart';
import { HoldingsTable } from './portfolio/HoldingsTable';
import { LedgerTable } from './portfolio/LedgerTable';
import { AddTransactionModal } from './portfolio/AddTransactionModal';
import { ShareModal } from './portfolio/ShareModal';
import { SettingsModal } from './portfolio/SettingsModal';
import { PremiumUpsellModal } from './portfolio/PremiumUpsellModal';
import { FeedbackModal } from './portfolio/FeedbackModal';
import { DividendLedgerTable } from './portfolio/DividendLedgerTable';
import { AddDividendModal } from './portfolio/AddDividendModal';
import { ImportCSVModal } from './portfolio/ImportCSVModal';
import { UpcomingEvents } from './portfolio/UpcomingEvents';
import { PortfolioAnalytics } from './portfolio/PortfolioAnalytics';
import { DividendCalendar } from './portfolio/DividendCalendar';
import { DividendForecast } from './portfolio/DividendForecast';
import { RebalancingPlanner } from './portfolio/RebalancingPlanner';
import { FXHedgingVisualizer } from './portfolio/FXHedgingVisualizer';

import { 
  createPortfolio,
  renamePortfolio,
  deletePortfolio,
  updatePortfolioSettings,
  joinPortfolioViaInviteToken
} from '../services/supabaseService';
import { 
  deleteTransaction as deleteTransactionService 
} from '../services/transactionService';


import { usePortfolio } from '../context/PortfolioContext';

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

const formatFinancialValue = (val: number | null, currencyStr = 'USD') => {
  if (val === null || val === undefined) return '—';
  const absVal = Math.abs(val);
  let formatted = '';
  if (absVal >= 1e12) {
    formatted = `${(val / 1e12).toFixed(2)}T`;
  } else if (absVal >= 1e9) {
    formatted = `${(val / 1e9).toFixed(2)}B`;
  } else if (absVal >= 1e6) {
    formatted = `${(val / 1e6).toFixed(2)}M`;
  } else {
    formatted = val.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  
  const curr = currencyStr || 'USD';
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
    }).formatToParts(1);
    const symbol = parts.find(p => p.type === 'currency')?.value || '$';
    if (curr.toUpperCase() === 'PLN') {
      return `${formatted} zł`;
    }
    return `${symbol}${formatted}`;
  } catch (e) {
    return `$${formatted}`;
  }
};

interface PortfolioViewProps {
  apiBaseUrl: string;
  signOut: () => Promise<void>;
}

export function PortfolioView({ 
  apiBaseUrl, 
  signOut
}: PortfolioViewProps) {
  const { user, session } = useAuth();
  const { t } = useTranslation();
  const {
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
    summary,
    allTransactions,
    dividendsList,
    chartData,
    analytics,
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
    fetchHistoricalPerformance
  } = usePortfolio();

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
  const [showRebalanceModal, setShowRebalanceModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddDividendModal, setShowAddDividendModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingDividend, setEditingDividend] = useState<any | null>(null);
  const [quickActionData, setQuickActionData] = useState<{ symbol: string; type: 'BUY' | 'SELL' } | null>(null);
  const [customModal, setCustomModal] = useState<any | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [dividendViewMode, setDividendViewMode] = useState<'both' | 'forecast' | 'calendar'>('both');
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [upsellModalOpen, setUpsellModalOpen] = useState(false);
  const [upsellReason, setUpsellReason] = useState<'portfolio' | 'account' | 'general'>('general');
  
  // Dynamic Sticky Columns references & styling
  const leftColRef = useRef<HTMLDivElement>(null);
  const rightColRef = useRef<HTMLDivElement>(null);
  const [leftStickyStyle, setLeftStickyStyle] = useState<React.CSSProperties>({ minWidth: 0 });
  const [rightStickyStyle, setRightStickyStyle] = useState<React.CSSProperties>({ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 });

  useEffect(() => {
    const handleResize = () => {
      const vh = window.innerHeight;
      const isDesktop = window.innerWidth >= 1025;
      const headerOffset = 20; // 1.25rem is 20px

      if (!isDesktop) {
        setLeftStickyStyle({ minWidth: 0 });
        setRightStickyStyle({ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 });
        return;
      }

      if (leftColRef.current) {
        const leftHeight = leftColRef.current.getBoundingClientRect().height;
        const topValue = leftHeight + headerOffset > vh 
          ? `calc(100vh - ${leftHeight}px - 1.25rem)` 
          : '1.25rem';
        
        setLeftStickyStyle({
          minWidth: 0,
          position: 'sticky',
          top: topValue,
          alignSelf: 'start'
        });
      }

      if (rightColRef.current) {
        const rightHeight = rightColRef.current.getBoundingClientRect().height;
        const topValue = rightHeight + headerOffset > vh 
          ? `calc(100vh - ${rightHeight}px - 1.25rem)` 
          : '1.25rem';

        setRightStickyStyle({
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          minWidth: 0,
          position: 'sticky',
          top: topValue,
          alignSelf: 'start'
        });
      }
    };

    // Run measurement
    handleResize();

    // Set up ResizeObserver to watch for dimension changes
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (leftColRef.current) resizeObserver.observe(leftColRef.current);
    if (rightColRef.current) resizeObserver.observe(rightColRef.current);

    window.addEventListener('resize', handleResize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [holdings, widgets, subTab, loadingHoldings, loadingTransactions]);

  // Effect to process pending invitation links upon component mount and portfolio list loading
  useEffect(() => {
    const processInvite = async () => {
      const inviteToken = localStorage.getItem('pending_portfolio_invite');
      if (!inviteToken) return;

      // Clean up immediately to avoid duplicate network submissions
      localStorage.removeItem('pending_portfolio_invite');

      try {
        const result = await joinPortfolioViaInviteToken(inviteToken);
        if (result && result.success) {
          // Trigger portfolios list refresh
          await loadPortfolios();
          
          // Switch view focus to newly joined portfolio
          setActivePortfolioId(result.portfolio_id);
          setActivePortfolioRole(result.role);
          
          alert((t('modals.share.invite_join_success') || 'Successfully joined portfolio: ') + result.portfolio_name);
        }
      } catch (err: any) {
        console.error('Error joining portfolio via invite link:', err);
        alert((t('modals.share.invite_join_failed') || 'Failed to join portfolio from invite link: ') + (err.message || err));
      }
    };

    if (user && portfolios.length > 0) {
      processInvite();
    }
  }, [user, portfolios.length]);
  
  const handleMoveWidget = (fromIdx: number, toIdx: number) => {
    setWidgets(prev => {
      const next = [...prev];
      const temp = next[fromIdx];
      next[fromIdx] = next[toIdx];
      next[toIdx] = temp;
      localStorage.setItem('dashboard_widgets_order', JSON.stringify(next));
      return next;
    });
  };

  const handleCloseWidget = (widgetId: string) => {
    setWidgets(prev => {
      const next = prev.filter(w => w !== widgetId);
      localStorage.setItem('dashboard_widgets_order', JSON.stringify(next));
      return next;
    });
  };

  const handleToggleWidgetVisibility = (widgetId: string) => {
    setWidgets(prev => {
      let next;
      if (prev.includes(widgetId)) {
        next = prev.filter(w => w !== widgetId);
      } else {
        const defaultOrder = ['metrics', 'chart', 'events', 'allocation'];
        next = [...prev, widgetId].sort((a, b) => defaultOrder.indexOf(a) - defaultOrder.indexOf(b));
      }
      localStorage.setItem('dashboard_widgets_order', JSON.stringify(next));
      return next;
    });
  };

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

  // Load Demo Portfolio Transactions
  const handleLoadDemoData = async () => {
    if (!activePortfolioId) return;
    setLoadingDemo(true);
    
    const demoTransactions = [
      {
        portfolio_id: activePortfolioId,
        symbol: 'AAPL',
        type: 'BUY' as const,
        date: '2025-01-15',
        shares: 15.0,
        price: 175.5,
        currency: 'USD',
        fees: 1.0,
        account: 'US Stocks'
      },
      {
        portfolio_id: activePortfolioId,
        symbol: 'MSFT',
        type: 'BUY' as const,
        date: '2025-02-10',
        shares: 8.0,
        price: 410.2,
        currency: 'USD',
        fees: 2.0,
        account: 'US Stocks'
      },
      {
        portfolio_id: activePortfolioId,
        symbol: 'SPY',
        type: 'BUY' as const,
        date: '2025-03-01',
        shares: 12.0,
        price: 505.0,
        currency: 'USD',
        fees: 0.0,
        account: 'ETF Account'
      },
      {
        portfolio_id: activePortfolioId,
        symbol: 'PKO.WA',
        type: 'BUY' as const,
        date: '2025-03-20',
        shares: 100.0,
        price: 52.4,
        currency: 'PLN',
        fees: 5.5,
        account: 'GPW Polish Stocks'
      }
    ];

    try {
      const { saveTransaction } = await import('../services/transactionService');
      for (const tx of demoTransactions) {
        await saveTransaction(tx);
      }
      await fetchTransactions();
    } catch (err: any) {
      console.error('Error loading demo transactions:', err);
      alert('Failed to load demo transactions: ' + err.message);
    } finally {
      setLoadingDemo(false);
    }
  };

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


  const financialsChartData = useMemo(() => {
    if (!selectedStockDetails?.financials || selectedStockDetails.financials.length === 0) return null;

    // Sort ascending chronologically
    const sortedFin = [...selectedStockDetails.financials].sort((a: any, b: any) => a.year.localeCompare(b.year));
    
    const labels = sortedFin.map((fin: any) => fin.year.substring(0, 4));
    const revenues = sortedFin.map((fin: any) => fin.revenue);
    const ebitdas = sortedFin.map((fin: any) => fin.ebitda);
    const netIncomes = sortedFin.map((fin: any) => fin.net_income);

    return {
      labels,
      datasets: [
        {
          label: t('financials.revenue', 'Revenue'),
          data: revenues,
          backgroundColor: 'rgba(59, 130, 246, 0.75)', // primary blue
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: t('financials.ebitda', 'EBITDA'),
          data: ebitdas,
          backgroundColor: 'rgba(168, 85, 247, 0.75)', // purple
          borderColor: 'rgb(168, 85, 247)',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: t('financials.net_income', 'Net Income'),
          data: netIncomes,
          backgroundColor: 'rgba(16, 185, 129, 0.75)', // green/emerald
          borderColor: 'rgb(16, 185, 129)',
          borderWidth: 1,
          borderRadius: 4,
        }
      ]
    };
  }, [selectedStockDetails?.financials, t]);

  const financialsChartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 150 },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: 'rgba(255, 255, 255, 0.6)',
            font: { family: 'Outfit', size: 10 }
          }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: 'rgba(255, 255, 255, 0.6)',
            font: { family: 'Outfit', size: 9 },
            callback: function(value: any) {
              return formatFinancialValue(value, selectedStockDetails?.overview?.currency || 'USD');
            }
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          labels: {
            color: 'rgba(255, 255, 255, 0.8)',
            font: { family: 'Outfit', size: 10 },
            boxWidth: 12,
            padding: 10
          }
        },
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
          bodyFont: { family: 'Outfit', size: 10 },
          callbacks: {
            label: function(context: any) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += formatFinancialValue(context.parsed.y, selectedStockDetails?.overview?.currency || 'USD');
              }
              return label;
            }
          }
        }
      }
    };
  }, [selectedStockDetails?.overview?.currency, formatFinancialValue]);

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
        onFeedbackClick={() => setShowFeedbackModal(true)}
        apiBaseUrl={apiBaseUrl}
        onSelectStockSymbol={setSelectedPositionSymbol}
      />

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        <div className="portfolio-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}>
          
          {/* Glowing Neon Top Progress Bar */}
          {(loadingHoldings || loadingChart || loadingPortfolios || loadingTransactions) && (
            <div className="shimmer-progress-bar" />
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
              {subTab === 'overview' ? (
                <div className="portfolio-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                  {/* Left Column: Holdings skeleton */}
                  <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="shimmer-placeholder" style={{ width: '180px', height: '22px' }}></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <div key={i} style={{ display: 'flex', gap: '1rem' }}>
                          <div className="shimmer-placeholder" style={{ flex: 2, height: '20px' }}></div>
                          <div className="shimmer-placeholder" style={{ flex: 3, height: '20px' }}></div>
                          <div className="shimmer-placeholder" style={{ flex: 1, height: '20px' }}></div>
                          <div className="shimmer-placeholder" style={{ flex: 1.5, height: '20px' }}></div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right Column: Metrics, Chart & Allocations stacked */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 }}>
                    {/* Portfolio Metrics Skeleton */}
                    <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div className="shimmer-placeholder" style={{ width: '120px', height: '18px' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <div className="shimmer-placeholder" style={{ width: '150px', height: '24px', marginBottom: '0.25rem' }} />
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                            <div className="shimmer-placeholder" style={{ width: '80px', height: '14px' }} />
                            <div className="shimmer-placeholder" style={{ width: '60px', height: '14px' }} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Chart skeleton */}
                    <div className="glass-panel" style={{ padding: '1rem', height: '200px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div className="shimmer-placeholder" style={{ width: '140px', height: '16px' }}></div>
                      <div className="shimmer-placeholder" style={{ width: '100%', flex: 1 }}></div>
                    </div>

                    {/* Allocation skeleton */}
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
                </div>
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
                  <span>{t('dashboard.viewer_readonly_warning', 'You have Read-Only (Viewer) access to this portfolio. Adding, editing, or deleting transactions is disabled.')}</span>
                </div>
              )}

              {/* OVERVIEW TAB CONTENT */}
              <div style={{ 
                display: subTab === 'overview' ? 'block' : 'none'
              }}>
                {portfolioTransactions.length === 0 && !loadingTransactions ? (
                  <div className="glass-panel" style={{ padding: '3rem 2rem', margin: '0.25rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.04) 0%, rgba(236, 72, 153, 0.04) 100%)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(6, 182, 212, 0.1)', border: '1px solid var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)', marginBottom: '1.25rem' }}>
                      <Plus size={30} />
                    </div>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>{t('dashboard.empty_title', 'Welcome to QuantiFi!')}</h3>
                    <p style={{ margin: '0 0 2rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '480px', lineHeight: 1.5 }}>
                      {t('dashboard.empty_desc', 'Your portfolio is currently empty. Get started by adding a transaction manually, or load a sample demo portfolio to immediately explore all advanced charts, dividend tracking, and risk analytics.')}
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                      {activePortfolioRole !== 'viewer' && (
                        <>
                          <button 
                            type="button"
                            onClick={() => setShowAddModal(true)}
                            className="glow-btn"
                            style={{ padding: '0.65rem 1.75rem', fontSize: '0.85rem', borderRadius: '8px', cursor: 'pointer', border: 'none', fontWeight: 600 }}
                          >
                            {t('dashboard.btn_add_tx', 'Add First Transaction')}
                          </button>
                          <button 
                            type="button"
                            onClick={handleLoadDemoData}
                            disabled={loadingDemo}
                            className="cancel-btn"
                            style={{ padding: '0.65rem 1.75rem', fontSize: '0.85rem', borderRadius: '8px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                          >
                            {loadingDemo ? t('dashboard.btn_loading_demo', 'Loading Demo...') : t('dashboard.btn_load_demo', 'Load Demo Portfolio')}
                          </button>
                        </>
                      )}
                      {activePortfolioRole === 'viewer' && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {t('dashboard.viewer_empty_warning', 'This portfolio is empty and you have read-only access.')}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="portfolio-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginTop: '0.25rem' }}>
                  {/* Left Column: Holdings Table */}
                  <div ref={leftColRef} className="sticky-column" style={leftStickyStyle}>
                    <HoldingsTable 
                      holdings={holdings}
                      summary={summary}
                      activePortfolioRole={activePortfolioRole}
                      onQuickAction={handleQuickAction}
                      onSelectPositionSymbol={setSelectedPositionSymbol}
                      onRebalanceClick={() => setShowRebalanceModal(true)}
                    />
                  </div>
                  {/* Right Column: Metrics, Performance Chart & Allocations stacked */}
                  <div ref={rightColRef} style={rightStickyStyle}>
                    {/* Render active widgets in order */}
                    {widgets.map((widgetId, index) => {
                      const onMoveUp = index > 0 ? () => handleMoveWidget(index, index - 1) : undefined;
                      const onMoveDown = index < widgets.length - 1 ? () => handleMoveWidget(index, index + 1) : undefined;
                      const onClose = () => handleCloseWidget(widgetId);

                      switch (widgetId) {
                        case 'metrics':
                          return (
                            <MetricsBanner 
                              key="metrics"
                              summary={summary}
                              activePortfolioId={activePortfolioId}
                              onMoveUp={onMoveUp}
                              onMoveDown={onMoveDown}
                              onClose={onClose}
                            />
                          );
                        case 'chart':
                          return (
                            <PerformanceChart 
                              key="chart"
                              chartData={chartData}
                              loadingChart={loadingChart}
                              baseCurrency={summary.base_currency}
                              onMoveUp={onMoveUp}
                              onMoveDown={onMoveDown}
                              onClose={onClose}
                            />
                          );
                        case 'events':
                          return (
                            <UpcomingEvents 
                              key="events"
                              apiBaseUrl={apiBaseUrl}
                              activePortfolioId={activePortfolioId}
                              session={session}
                              holdings={holdings}
                              onMoveUp={onMoveUp}
                              onMoveDown={onMoveDown}
                              onClose={onClose}
                            />
                          );
                        case 'allocation':
                          return (
                            <PortfolioAllocation 
                              key="allocation"
                              holdings={holdings}
                              summary={summary}
                              onMoveUp={onMoveUp}
                              onMoveDown={onMoveDown}
                              onClose={onClose}
                            />
                          );
                        case 'analytics':
                          return (
                            <PortfolioAnalytics 
                              key="analytics"
                              analytics={analytics}
                              loading={loadingAnalytics}
                              onMoveUp={onMoveUp}
                              onMoveDown={onMoveDown}
                              onClose={onClose}
                            />
                          );

                        default:
                          return null;
                      }
                    })}

                    {/* Widget Manager Selection Card */}
                    {showWidgetManager && (
                      <div className="glass-panel" style={{
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        background: 'linear-gradient(135deg, rgba(18, 24, 38, 0.75) 0%, rgba(0, 0, 0, 0.9) 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '12px',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
                        marginTop: '0.25rem'
                      }}>
                        <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.4rem' }}>
                          <LayoutGrid size={14} style={{ color: 'var(--color-primary)' }} /> {t('dashboard.toggle_cards', 'Toggle Dashboard Cards')}
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                          {[
                            { id: 'metrics', name: t('metrics.header', 'Portfolio Metrics') },
                            { id: 'chart', name: t('dashboard.performance_chart', 'Performance Chart') },
                            { id: 'events', name: t('events.header', 'Upcoming Corporate Events') },
                            { id: 'allocation', name: t('allocation.title', 'Portfolio Allocation') },
                            { id: 'analytics', name: t('analytics.header', 'Performance & Risk') }
                          ].map(widget => {
                            const isVisible = widgets.includes(widget.id);
                            return (
                              <label key={widget.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                <input 
                                  type="checkbox" 
                                  checked={isVisible}
                                  onChange={() => handleToggleWidgetVisibility(widget.id)}
                                  style={{
                                    cursor: 'pointer',
                                    accentColor: 'var(--color-primary)',
                                    width: '14px',
                                    height: '14px'
                                  }}
                                />
                                <span>{widget.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Widget Manager Toggle Button (at the bottom, centered, icon only) */}
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.25rem' }}>
                      <button 
                        className="glow-btn"
                        style={{
                          background: showWidgetManager ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.02)',
                          border: '1px dashed var(--panel-border)',
                          color: 'var(--text-secondary)',
                          padding: '0.5rem',
                          borderRadius: '50%',
                          width: '36px',
                          height: '36px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: 'none',
                          transition: 'var(--transition-smooth)'
                        }}
                        onClick={() => setShowWidgetManager(!showWidgetManager)}
                        title={showWidgetManager ? t('dashboard.close_customizer', 'Close Card Customizer') : t('dashboard.customize_cards', 'Customize Dashboard Cards')}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                          e.currentTarget.style.transform = 'scale(1.08)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = showWidgetManager ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.02)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        <Layout size={14} />
                      </button>
                    </div>
                  </div>
                </div>
                )}
              </div>

              {/* LEDGER TAB CONTENT */}
              <div style={{ 
                display: subTab === 'ledger' ? 'block' : 'none'
              }}>
                <LedgerTable 
                  transactions={transactions}
                  activePortfolioRole={activePortfolioRole}
                  onEditTransaction={handleStartEditTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                  onImportCSVClick={() => setShowImportModal(true)}
                />
              </div>

              {/* DIVIDENDS TAB CONTENT */}
              <div style={{ 
                display: subTab === 'dividends' ? 'block' : 'none'
              }}>
                {/* Dividends View Switcher Toolbar */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem',
                  gap: '0.75rem',
                  flexWrap: 'wrap'
                }}>
                  <h3 className="portfolio-section-title" style={{ margin: 0 }}>
                    {t('dividends.dashboard_title', 'Dividend Dashboard')}
                  </h3>
                  
                  {/* Glassmorphic Segmented Control Switcher */}
                  <div style={{
                    display: 'flex',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '8px',
                    padding: '3px',
                    gap: '2px',
                    position: 'relative',
                    width: '320px',
                    boxSizing: 'border-box'
                  }}>
                    {/* Sliding active pill indicator */}
                    <div style={{
                      position: 'absolute',
                      top: '3px',
                      bottom: '3px',
                      left: dividendViewMode === 'both' 
                        ? '3px' 
                        : dividendViewMode === 'forecast' 
                          ? 'calc(33.33% + 1px)' 
                          : 'calc(66.66% + 1px)',
                      width: 'calc(33.33% - 4px)',
                      background: 'rgba(255, 255, 255, 0.08)',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      zIndex: 0
                    }} />

                    <button
                      onClick={() => setDividendViewMode('both')}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        color: dividendViewMode === 'both' ? 'white' : 'var(--text-muted)',
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        zIndex: 1,
                        position: 'relative',
                        transition: 'color 0.25s ease',
                        textAlign: 'center',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {t('dividends.view_both', 'Show Both')}
                    </button>
                    <button
                      onClick={() => setDividendViewMode('forecast')}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        color: dividendViewMode === 'forecast' ? 'white' : 'var(--text-muted)',
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        zIndex: 1,
                        position: 'relative',
                        transition: 'color 0.25s ease',
                        textAlign: 'center',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {t('dividends.view_forecast', '12m Forecast')}
                    </button>
                    <button
                      onClick={() => setDividendViewMode('calendar')}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        color: dividendViewMode === 'calendar' ? 'white' : 'var(--text-muted)',
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        zIndex: 1,
                        position: 'relative',
                        transition: 'color 0.25s ease',
                        textAlign: 'center',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {t('dividends.view_calendar', 'Calendar')}
                    </button>
                  </div>
                </div>

                <div 
                  key={dividendViewMode}
                  style={{ 
                    display: 'grid', 
                    gridTemplateColumns: dividendViewMode === 'both' ? '1.2fr 1fr' : '1fr', 
                    gap: '0.75rem', 
                    marginBottom: '0.75rem',
                    animation: 'fadeIn 0.25s ease-out'
                  }} 
                  className="portfolio-grid"
                >
                  {(dividendViewMode === 'both' || dividendViewMode === 'forecast') && (
                    <div style={{ minWidth: 0, height: '100%' }}>
                      <DividendForecast 
                        apiBaseUrl={apiBaseUrl}
                        activePortfolioId={activePortfolioId}
                        session={session}
                        baseCurrency={summary.base_currency}
                        account={selectedAccount}
                        linkCash={linkCash}
                        holdings={holdings}
                      />
                    </div>
                  )}
                  {(dividendViewMode === 'both' || dividendViewMode === 'calendar') && (
                    <div style={{ minWidth: 0, height: '100%' }}>
                      <DividendCalendar 
                        dividends={dividendsList}
                        baseCurrency={summary.base_currency}
                      />
                    </div>
                  )}
                </div>

                <DividendLedgerTable 
                  dividends={dividendsList}
                  activePortfolioRole={activePortfolioRole}
                  baseCurrency={summary.base_currency}
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
              <strong>{t('dashboard.disclaimer_title', 'Disclaimer')}:</strong> {t('dashboard.disclaimer_desc', 'QuantiFi is a portfolio tracking tool provided for educational and informational purposes only. We do not provide financial, investment, or tax advice.')}
            </div>
            <div>
              {t('dashboard.disclaimer_market_data', 'Market data may be delayed and is provided "as is" without guarantees of accuracy or completeness.')}
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
      {showShareModal && (
        <ShareModal 
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          activePortfolioId={activePortfolioId}
          showCustomConfirm={showCustomConfirm}
        />
      )}

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

      {/* FEEDBACK & BUG REPORT MODAL */}
      <FeedbackModal 
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
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

      {/* CSV IMPORT DIALOG MODAL */}
      <ImportCSVModal 
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        portfolioId={activePortfolioId || ''}
        apiBaseUrl={apiBaseUrl}
        accounts={uniqueAccounts}
        onImportComplete={() => {
          fetchHoldings(baseCurrency, selectedAccount);
          fetchTransactions();
        }}
      />

      {/* REBALANCE DIALOG MODAL */}
      {showRebalanceModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '640px', padding: '1.75rem', position: 'relative', display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '90vh', overflow: 'hidden' }}>
            {/* Close Button */}
            <button 
              onClick={() => setShowRebalanceModal(false)}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              title={t('common.close', 'Close')}
            >
              <X size={18} />
            </button>
            
            {/* Modal Header */}
            <div>
              <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Scale size={20} style={{ color: 'var(--color-primary)' }} />
                {t('rebalance.title', 'Portfolio Rebalancing Planner')}
              </h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {t('rebalance.desc', 'Analyze target vs actual holdings weights and compute needed adjustments.')}
              </p>
            </div>

            {/* Rebalancing Planner Component */}
            <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
              <RebalancingPlanner 
                holdings={holdings}
                summary={summary}
                portfolio={portfolios.find(p => p.id === activePortfolioId) || null}
                activePortfolioRole={activePortfolioRole}
                onSaveSettings={async (updatedSettings) => {
                  if (activePortfolioId) {
                    await updatePortfolioSettings(activePortfolioId, updatedSettings);
                    setPortfolios(prev => prev.map(p => p.id === activePortfolioId ? { ...p, settings: updatedSettings } : p));
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* POSITION TRANSACTIONS HISTORY MODAL */}
      {selectedPositionSymbol && (
        <>
          <div className="modal-backdrop" onClick={() => setSelectedPositionSymbol(null)} style={{ cursor: 'pointer' }} />
          <div className="modal-overlay-container">
            <div className="modal-content custom-scrollbar" style={{ maxWidth: '850px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
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
                  {activePortfolioRole !== 'viewer' && (
                    <button
                      onClick={() => {
                        const symbol = selectedPositionSymbol;
                        setSelectedPositionSymbol(null);
                        setQuickActionData({ symbol: symbol!, type: 'BUY' });
                        setShowAddModal(true);
                      }}
                      className="glow-btn"
                      style={{
                        padding: '0.35rem 0.85rem',
                        fontSize: '0.75rem',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        height: '28px',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={13} />
                      <span>{t('dashboard.add_tx_shortcut', 'Add Transaction')}</span>
                    </button>
                  )}
                  {/* Modal Search Bar */}
                  {(transactions.filter(tx => tx.symbol.toUpperCase() === selectedPositionSymbol.toUpperCase()).length > 0 || modalSearchQuery) && (
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Search size={13} style={{ position: 'absolute', left: '8px', color: 'var(--text-muted)' }} />
                      <input 
                        type="text" 
                        placeholder={t('dashboard.search_history_placeholder', 'Search history...')} 
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
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('holdings.col_shares_owned', 'Shares Owned')}</span>
                      <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                        {formatShares(holdingDetails.shares)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('holdings.col_avg_cost', 'Avg Cost (Local)')}</span>
                      <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                        {formatCurrency(holdingDetails.avg_cost_local, holdingDetails.currency)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('metrics.nav', 'Current Value')}</span>
                      <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                        {formatCurrency(holdingDetails.current_value_base, summary.base_currency)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('metrics.total_return', 'Total Return')}</span>
                      <div style={{ 
                        display: 'flex',
                        flexDirection: 'column',
                        lineHeight: 1.15
                      }}>
                        <span style={{ 
                          fontSize: '1.2rem', 
                          fontWeight: 700, 
                          fontFamily: 'monospace',
                          color: holdingDetails.gain_base >= 0 ? 'var(--color-green)' : 'var(--color-red)'
                        }}>
                          {holdingDetails.gain_base >= 0 ? '+' : ''}{formatCurrency(holdingDetails.gain_base, summary.base_currency)}
                        </span>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          fontWeight: 600, 
                          fontFamily: 'monospace',
                          color: holdingDetails.gain_base >= 0 ? 'var(--color-green)' : 'var(--color-red)',
                          opacity: 0.85,
                          marginTop: '2px'
                        }}>
                          ({holdingDetails.gain_base >= 0 ? '+' : ''}{holdingDetails.gain_percent.toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Simplified Interactive Details Chart */}
                <div className="glass-panel" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', background: 'rgba(0, 0, 0, 0.12)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                      {t('holdings.price_performance', 'Price Performance')} ({holdingDetails?.currency || 'USD'})
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
                        {t('holdings.loading_price_details', 'Loading price details...')}
                      </div>
                    ) : modalChartFormatted ? (
                      <Line 
                        options={modalChartOptions}
                        data={modalChartFormatted}
                      />
                    ) : (
                      <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {t('holdings.no_price_history', 'No price history available.')}
                      </div>
                    )}
                  </div>
                </div>

                 {holdingDetails && (
                  <FXHedgingVisualizer 
                    holding={holdingDetails} 
                    baseCurrency={summary.base_currency} 
                  />
                )}

                {/* COMPANY KEY METRICS & ANNUAL FINANCIALS */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                  background: 'rgba(255, 255, 255, 0.015)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '12px',
                  padding: '1.15rem',
                  minHeight: '272px'
                }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                    {t('holdings.company_profile_metrics', 'Company Profile & Key Financials')}
                  </span>
                  
                  {loadingDetails || !selectedStockDetails ? (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      gap: '1.25rem',
                      alignItems: 'start'
                    }}>
                      {/* Left: Key Financial Ratios Skeleton Grid */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '0.65rem'
                      }}>
                        {Array.from({ length: 8 }).map((_, idx) => (
                          <div key={idx} style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '8px', padding: '0.45rem 0.6rem', height: '48px' }} className="pulse">
                            <div style={{ width: '60%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', marginBottom: '8px' }} />
                            <div style={{ width: '40%', height: '14px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }} />
                          </div>
                        ))}
                      </div>
                      
                      {/* Right: Annual Financial Results Skeleton Graph */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', height: '100%', minHeight: '220px' }} className="pulse">
                        <div style={{ width: '120px', height: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', marginBottom: '0.25rem' }} />
                        <div style={{ flex: 1, height: '200px', background: 'rgba(0, 0, 0, 0.08)', border: '1px solid var(--panel-border)', borderRadius: '8px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '1.5rem 1rem 0.75rem 1rem' }}>
                          <div style={{ width: '16px', height: '30%', background: 'rgba(255,255,255,0.04)', borderRadius: '3px 3px 0 0' }} />
                          <div style={{ width: '16px', height: '50%', background: 'rgba(255,255,255,0.04)', borderRadius: '3px 3px 0 0' }} />
                          <div style={{ width: '16px', height: '70%', background: 'rgba(255,255,255,0.04)', borderRadius: '3px 3px 0 0' }} />
                          <div style={{ width: '16px', height: '40%', background: 'rgba(255,255,255,0.04)', borderRadius: '3px 3px 0 0' }} />
                          <div style={{ width: '16px', height: '80%', background: 'rgba(255,255,255,0.04)', borderRadius: '3px 3px 0 0' }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      gap: '1.25rem',
                      alignItems: 'start'
                    }}>
                      {/* Left: Key Financial Ratios Grid */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '0.65rem'
                      }}>
                        {/* P/E Ratio */}
                        <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.45rem 0.6rem' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>P/E Ratio (Trailing)</span>
                          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.trailing_pe ? selectedStockDetails.overview.trailing_pe.toFixed(2) : '—'}
                          </span>
                        </div>
                        {/* Forward P/E */}
                        <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.45rem 0.6rem' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>P/E Ratio (Forward)</span>
                          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.forward_pe ? selectedStockDetails.overview.forward_pe.toFixed(2) : '—'}
                          </span>
                        </div>
                        {/* PEG Ratio */}
                        <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.45rem 0.6rem' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>PEG Ratio</span>
                          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.peg_ratio ? selectedStockDetails.overview.peg_ratio.toFixed(2) : '—'}
                          </span>
                        </div>
                        {/* P/B Ratio */}
                        <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.45rem 0.6rem' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>P/B Ratio</span>
                          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.price_to_book ? selectedStockDetails.overview.price_to_book.toFixed(2) : '—'}
                          </span>
                        </div>
                        {/* Profit Margin */}
                        <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.45rem 0.6rem' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Profit Margin</span>
                          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.profit_margin ? `${(selectedStockDetails.overview.profit_margin * 100).toFixed(2)}%` : '—'}
                          </span>
                        </div>
                        {/* Return on Equity */}
                        <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.45rem 0.6rem' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>ROE</span>
                          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.roe ? `${(selectedStockDetails.overview.roe * 100).toFixed(2)}%` : '—'}
                          </span>
                        </div>
                        {/* Dividend Yield */}
                        <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.45rem 0.6rem' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Div Yield</span>
                          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.dividend_yield ? `${(selectedStockDetails.overview.dividend_yield * 100).toFixed(2)}%` : '0.00%'}
                          </span>
                        </div>
                        {/* Beta */}
                        <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.45rem 0.6rem' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Beta (5Y Monthly)</span>
                          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.beta ? selectedStockDetails.overview.beta.toFixed(2) : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Right: Annual Financial Results Graph */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', height: '100%', minHeight: '220px' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>
                          Past Annual Results
                        </span>
                        
                        {(!selectedStockDetails.financials || selectedStockDetails.financials.length === 0) ? (
                          <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', background: 'rgba(0,0,0,0.1)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                            No past annual results available.
                          </div>
                        ) : (
                          <div style={{ flex: 1, height: '200px', position: 'relative', background: 'rgba(0, 0, 0, 0.12)', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '0.5rem' }}>
                            {financialsChartData && (
                              <Bar 
                                options={financialsChartOptions}
                                data={financialsChartData}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {positionTransactionsFilteredAndSorted.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0', margin: 0 }}>
                    {t('holdings.no_tx_found_for', 'No transactions found for')} {selectedPositionSymbol}.
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
                            {t('ledger.col_date', 'Date')} {renderModalSortArrow('date')}
                          </th>
                          <th onClick={() => handleModalSort('type')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            {t('ledger.col_type', 'Type')} {renderModalSortArrow('type')}
                          </th>
                          <th onClick={() => handleModalSort('shares')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                            {t('ledger.col_shares', 'Shares')} {renderModalSortArrow('shares')}
                          </th>
                          <th onClick={() => handleModalSort('price')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                            {t('ledger.col_price', 'Price')} {renderModalSortArrow('price')}
                          </th>
                          <th onClick={() => handleModalSort('fees')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                            {t('ledger.col_fees', 'Fees')} {renderModalSortArrow('fees')}
                          </th>
                          <th onClick={() => handleModalSort('total')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                            {t('ledger.col_value', 'Total')} {renderModalSortArrow('total')}
                          </th>
                          {activePortfolioRole !== 'viewer' && <th style={{ textAlign: 'center' }}>{t('ledger.col_actions', 'Actions')}</th>}
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
                                  {tx.type === 'BUY' ? t('modals.add_tx.type_buy', 'Buy') : t('modals.add_tx.type_sell', 'Sell')}
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
                                      title={t('modals.add_tx.edit_title', 'Edit Transaction')}
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteTransaction(tx.id)}
                                      className="ledger-delete-btn"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '4px', borderRadius: '4px' }}
                                      title={t('ledger.action_delete', 'Delete')}
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
                    {t('modals.common_close', 'Close')}
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
                    {t('modals.common_cancel', 'Cancel')}
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
                    {t('modals.common_confirm', 'Confirm')}
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
              if (subTab === 'dividends') {
                setEditingDividend(null);
                setShowAddDividendModal(true);
              } else {
                setShowAddModal(true);
              }
            }
          }}
          title={subTab === 'dividends' ? t('calendar.btn_add_div', 'Record Dividend') : t('dashboard.add_tx_shortcut', 'Add Transaction')}
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
