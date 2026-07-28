import { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  X, 
  Lock, 
  Menu,
  LayoutGrid,
  Layout,
  Scale,
  FileText,
  TrendingUp
} from 'lucide-react';


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
import { PreferencesModal } from './portfolio/PreferencesModal';
import { PremiumUpsellModal } from './portfolio/PremiumUpsellModal';
import { FeedbackModal } from './portfolio/FeedbackModal';
import { BetaInfoModal } from './portfolio/BetaInfoModal';
import { DividendLedgerTable } from './portfolio/DividendLedgerTable';
import { AddDividendModal } from './portfolio/AddDividendModal';
import { ImportCSVModal } from './portfolio/ImportCSVModal';
import { UpcomingEvents } from './portfolio/UpcomingEvents';
import { PortfolioAnalytics } from './portfolio/PortfolioAnalytics';
import { DividendCalendar } from './portfolio/DividendCalendar';
import { DividendForecast } from './portfolio/DividendForecast';
import { RebalancingPlanner } from './portfolio/RebalancingPlanner';
import { StockDetailsModal } from './portfolio/StockDetailsModal';

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
    fetchHistoricalPerformance,
    fetchPortfolioAnalytics
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
  const [isHoldingsAtBottom, setIsHoldingsAtBottom] = useState(false);
  const [isLedgerAtBottom, setIsLedgerAtBottom] = useState(false);
  const [quickActionData, setQuickActionData] = useState<{ symbol: string; type: 'BUY' | 'SELL' } | null>(null);
  const [customModal, setCustomModal] = useState<any | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showBetaModal, setShowBetaModal] = useState(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [upsellModalOpen, setUpsellModalOpen] = useState(false);
  const [upsellReason, setUpsellReason] = useState<'portfolio' | 'account' | 'general'>('general');
  
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [mobileOverviewTab, setMobileOverviewTab] = useState<'holdings' | 'analytics'>('holdings');
  const [dividendViewMode, setDividendViewMode] = useState<'overview' | 'ledger'>('overview');
  const [mobileDividendsTab, setMobileDividendsTab] = useState<'forecast' | 'calendar' | 'ledger'>('forecast');

  const isAnyLoading = loadingHoldings || loadingPortfolios || loadingTransactions;
  const [showLoadingPill, setShowLoadingPill] = useState(false);
  const [activeLoadingText, setActiveLoadingText] = useState('');

  useEffect(() => {
    if (isAnyLoading) {
      setShowLoadingPill(true);
      if (loadingPortfolios) setActiveLoadingText(t('dashboard.syncing_portfolios', 'Syncing portfolios...'));
      else if (loadingTransactions) setActiveLoadingText(t('dashboard.syncing_transactions', 'Fetching transaction ledger...'));
      else if (loadingHoldings) setActiveLoadingText(t('dashboard.syncing_holdings', 'Recalculating live holdings & prices...'));
      else setActiveLoadingText(t('dashboard.syncing_generic', 'Synchronizing data...'));
    } else {
      const timer = setTimeout(() => {
        setShowLoadingPill(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isAnyLoading, loadingPortfolios, loadingTransactions, loadingHoldings, t]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1024px)');
    setIsMobile(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const [showDashboardCards, setShowDashboardCards] = useState<boolean>(() => {
    return localStorage.getItem('portfolio_show_dashboard_cards') !== 'false';
  });

  const handleToggleDashboardCards = () => {
    setShowDashboardCards(prev => {
      const next = !prev;
      localStorage.setItem('portfolio_show_dashboard_cards', next ? 'true' : 'false');
      if (next && widgets.length === 0) {
        setShowWidgetManager(true);
      }
      return next;
    });
  };

  // Touch swipe gestures for mobile segmented views
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchStartScrollLeft = useRef<number | null>(null);
  const touchStartScrollMax = useRef<number | null>(null);

  const findScrollContainer = (element: HTMLElement | null): HTMLElement | null => {
    let curr = element;
    while (curr) {
      if (curr.classList.contains('table-wrapper') || curr.style.overflowX === 'auto' || (window.getComputedStyle(curr).overflowX === 'auto')) {
        return curr;
      }
      curr = curr.parentElement;
    }
    return null;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    const scrollContainer = findScrollContainer(target);
    if (scrollContainer) {
      touchStartScrollLeft.current = scrollContainer.scrollLeft;
      touchStartScrollMax.current = scrollContainer.scrollWidth - scrollContainer.clientWidth;
    } else {
      touchStartScrollLeft.current = null;
      touchStartScrollMax.current = null;
    }
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = (tabType: 'overview' | 'dividends') => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > 60;   // Swipe left -> next tab
    const isRightSwipe = distance < -60; // Swipe right -> previous tab

    // Check if horizontal scroll container restricts swipe transitions
    if (touchStartScrollLeft.current !== null && touchStartScrollMax.current !== null) {
      if (isLeftSwipe && touchStartScrollLeft.current < touchStartScrollMax.current - 15) {
        // Table still has space to scroll to the right, block page switch
        touchStartX.current = null;
        touchEndX.current = null;
        return;
      }
      if (isRightSwipe && touchStartScrollLeft.current > 15) {
        // Table still has space to scroll to the left, block page switch
        touchStartX.current = null;
        touchEndX.current = null;
        return;
      }
    }

    if (tabType === 'overview') {
      if (isLeftSwipe && mobileOverviewTab === 'holdings') {
        setMobileOverviewTab('analytics');
      } else if (isRightSwipe && mobileOverviewTab === 'analytics') {
        setMobileOverviewTab('holdings');
      }
    } else if (tabType === 'dividends') {
      if (isLeftSwipe) {
        if (mobileDividendsTab === 'forecast') {
          setMobileDividendsTab('calendar');
        } else if (mobileDividendsTab === 'calendar') {
          setMobileDividendsTab('ledger');
        }
      } else if (isRightSwipe) {
        if (mobileDividendsTab === 'ledger') {
          setMobileDividendsTab('calendar');
        } else if (mobileDividendsTab === 'calendar') {
          setMobileDividendsTab('forecast');
        }
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  // Dynamic Sticky Columns references & styling
  const leftColRef = useRef<HTMLDivElement>(null);
  const rightColRef = useRef<HTMLDivElement>(null);
  const [leftStickyStyle, setLeftStickyStyle] = useState<React.CSSProperties>({ minWidth: 0 });
  const [rightStickyStyle, setRightStickyStyle] = useState<React.CSSProperties>({ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 });

  useEffect(() => {
    const handleResize = () => {
      const isDesktop = window.innerWidth >= 1025;

      if (!isDesktop) {
        setLeftStickyStyle({
          minWidth: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0
        });
        setRightStickyStyle({
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          minWidth: 0,
          height: '100%',
          overflowY: 'auto',
          minHeight: 0
        });
        return;
      }

      setLeftStickyStyle({
        minWidth: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0
      });

      setRightStickyStyle({
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        minWidth: 0,
        height: '100%',
        overflowY: 'auto',
        paddingRight: '6px',
        minHeight: 0
      });
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

  const handleExportCSV = () => {
    if (!apiBaseUrl || !activePortfolioId) return;
    const token = session?.access_token || '';
    const cleanUrl = apiBaseUrl.replace(/\/$/, "");
    const exportUrl = `${cleanUrl}/api/portfolio/${activePortfolioId}/export-csv?token=${encodeURIComponent(token)}`;
    window.open(exportUrl, '_blank');
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
        onShareClick={() => setShowShareModal(true)}
        onSettingsClick={() => setShowSettingsModal(true)}
        onFeedbackClick={() => setShowFeedbackModal(true)}
        onBetaClick={() => setShowBetaModal(true)}
        onPreferencesClick={() => setShowPreferencesModal(true)}
        apiBaseUrl={apiBaseUrl}
        onSelectStockSymbol={setSelectedPositionSymbol}
        onAddTransactionClick={(symbol) => {
          setQuickActionData({ symbol, type: 'BUY' });
          setShowAddModal(true);
        }}
        activePortfolioRole={activePortfolioRole}
      />

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        <div className="portfolio-container" style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '0.25rem' : '0.75rem', position: 'relative', height: '100%', minHeight: 0 }}>
          
          {/* Floating Bottom-Center Ultra-Sleek Glassmorphism Loading Pill */}
          {showLoadingPill && (
            <div style={{
              position: 'fixed',
              bottom: isMobile ? '70px' : '24px',
              left: '50%',
              transform: isAnyLoading ? 'translate(-50%, 0)' : 'translate(-50%, 8px)',
              opacity: isAnyLoading ? 1 : 0,
              transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              zIndex: 9999,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'rgba(10, 15, 26, 0.88)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              boxShadow: '0 6px 24px rgba(0, 0, 0, 0.45), 0 0 14px rgba(6, 182, 212, 0.2)',
              padding: '0.35rem 0.85rem',
              borderRadius: '24px'
            }}>
              <div className="spinner-ring" style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                border: '2px solid rgba(255, 255, 255, 0.1)',
                borderTopColor: '#06b6d4',
                borderRightColor: 'rgba(6, 182, 212, 0.5)',
                flexShrink: 0
              }} />
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 500,
                color: 'rgba(255, 255, 255, 0.9)',
                letterSpacing: '0.2px',
                whiteSpace: 'nowrap'
              }}>
                {activeLoadingText}
              </span>
            </div>
          )}
          
          {/* Top navigation Header Switcher Bar (Mobile only) */}
          <div className="portfolio-header-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <img 
                src="/favicon.png" 
                alt="QuantiFi Logo" 
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '6px',
                  boxShadow: '0 0 10px rgba(6, 182, 212, 0.35)',
                  objectFit: 'contain'
                }}
              />
              <span style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '0.01em', color: '#ffffff' }}>
                Quanti<span style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Fi</span>
              </span>
            </div>
            <button 
              className="mobile-menu-toggle-btn"
              onClick={() => setSidebarOpen(true)}
              title="Open Navigation Menu"
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              <Menu size={16} />
            </button>
          </div>

          {/* Shimmer / Skeleton Loading placeholder for initial data fetch */}
          {((loadingPortfolios && portfolios.length === 0) || (loadingHoldings && holdings.length === 0) || (loadingTransactions && allTransactions.length === 0)) ? (
            <div style={{ position: 'relative', width: '100%', minHeight: '520px' }}>
              {/* Blur/Faded Skeletons Backdrop */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', filter: 'blur(4px)', opacity: 0.3, pointerEvents: 'none', userSelect: 'none' }}>
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

              {/* Glowing Interactive Loading overlay card */}
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                padding: '2rem 1rem'
              }}>
                <div className="glass-panel" style={{
                  padding: '2.5rem 2.25rem',
                  maxWidth: '460px',
                  width: '100%',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '1.25rem',
                  boxShadow: '0 25px 60px rgba(0, 0, 0, 0.55)',
                  border: '1px solid rgba(6, 182, 212, 0.25)', // Premium cyan boundary glow
                  background: 'rgba(10, 15, 28, 0.88)',
                  borderRadius: '16px'
                }}>
                  {/* Glowing spinner ring animation */}
                  <div style={{ position: 'relative', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{
                      position: 'absolute',
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      background: 'radial-gradient(circle, rgba(6, 182, 212, 0.3) 0%, transparent 70%)',
                      animation: 'pulse 2s infinite ease-in-out'
                    }} />
                    <div className="spinner-ring" style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      border: '3.5px solid rgba(255, 255, 255, 0.05)',
                      borderTopColor: 'var(--color-primary)',
                      borderRightColor: 'rgba(6, 182, 212, 0.45)'
                    }} />
                  </div>

                  {/* Header Titles */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'white', letterSpacing: '0.2px' }}>
                      {t('dashboard.initial_sync_title', 'Synchronizing Portfolio')}
                    </h3>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }} className="pulse">
                      {t('dashboard.initial_sync_subtitle', 'Downloading Real-Time Data...')}
                    </span>
                  </div>

                  {/* Description Paragraph */}
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.55' }}>
                    {t('dashboard.initial_sync_explanation', 'We are fetching live asset quotes, currency exchanges, and historical annual financials. Because this is your first load on this device, it may take up to a minute. Please keep this browser window open.')}
                  </p>

                  {/* Monospace status tracker log */}
                  <div style={{
                    fontSize: '0.7rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'monospace',
                    background: 'rgba(0, 0, 0, 0.35)',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}>
                    {t('dashboard.initial_sync_status', 'Status: Connecting to API & downloading price lists...')}
                  </div>
                </div>
              </div>
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
                display: subTab === 'overview' ? 'flex' : 'none',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0
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
                  (() => {
                    const isRightColumnOpen = showDashboardCards && (widgets.length > 0 || showWidgetManager);
                    return (
                      <>
                        <div 
                          className="portfolio-grid" 
                          onTouchStart={handleTouchStart}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={() => handleTouchEnd('overview')}
                          style={{ 
                            display: 'grid', 
                            gridTemplateColumns: isMobile ? '1fr' : (isRightColumnOpen ? '2fr 12px 1fr' : '1fr'), 
                            gridTemplateRows: '1fr',
                            gap: '0px', 
                            marginTop: '0.25rem',
                            flex: 1,
                            minHeight: 0
                          }}
                        >
                          {/* Left Column: Holdings Table */}
                          {(!isMobile || mobileOverviewTab === 'holdings') && (
                            <div ref={leftColRef} className="sticky-column" style={{ ...leftStickyStyle, paddingRight: isRightColumnOpen && !isMobile ? '0px' : '0px', width: '100%' }}>
                              <HoldingsTable 
                                holdings={holdings}
                                summary={summary}
                                activePortfolioRole={activePortfolioRole}
                                onQuickAction={handleQuickAction}
                                onSelectPositionSymbol={setSelectedPositionSymbol}
                                onScrollToBottomChange={setIsHoldingsAtBottom}
                              />
                            </div>
                          )}
                          
                          {/* Middle Column: Vertical Collapse Handle/Divider */}
                          {!isMobile && isRightColumnOpen && (
                            <div 
                              onClick={handleToggleDashboardCards}
                              className="divider-line-hover"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                position: 'relative',
                                height: '100%',
                                width: '100%',
                                zIndex: 10
                              }}
                              title={t('dashboard.hide_cards_tooltip', 'Collapse side cards')}
                            >
                              <div 
                                className="divider-line"
                                style={{
                                  width: '2px',
                                  height: '100%',
                                  background: 'var(--panel-border)',
                                  borderRadius: '1px',
                                  transition: 'background-color 0.2s'
                                }}
                              />
                              <div 
                                className="divider-pill"
                                style={{
                                  position: 'absolute',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  width: '12px',
                                  height: '32px',
                                  background: 'rgba(15, 23, 42, 0.95)',
                                  border: '1px solid var(--panel-border)',
                                  borderRadius: '6px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--text-muted)',
                                  fontSize: '0.55rem',
                                  transition: 'all 0.2s'
                                }}
                              >
                                <span>▶</span>
                              </div>
                            </div>
                          )}

                          {/* Right Column: Metrics, Performance Chart & Allocations stacked */}
                          {isRightColumnOpen && (!isMobile || mobileOverviewTab === 'analytics') && (
                            <div ref={rightColRef} className="custom-scrollbar" style={{ ...rightStickyStyle, paddingLeft: '0px', width: '100%' }}>
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
                                        onRefresh={() => fetchHistoricalPerformance(baseCurrency, selectedAccount)}
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
                                        onRebalanceClick={() => setShowRebalanceModal(true)}
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
                                        onRefresh={() => fetchPortfolioAnalytics(baseCurrency, selectedAccount)}
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

                              {/* Widget Manager Toggle Button */}
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
                          )}
                        </div>

                        {/* Mobile Page Indicator Dots */}
                        {isMobile && holdings.length > 0 && (
                          <div className="mobile-page-indicator" style={{
                            display: 'flex',
                            justifyContent: 'center',
                            gap: '0.6rem',
                            padding: '0.5rem 0 0.5rem 0',
                            alignItems: 'center',
                            marginTop: '0.25rem'
                          }}>
                            <button
                              type="button"
                              onClick={() => setMobileOverviewTab('holdings')}
                              style={{
                                width: '9px',
                                height: '9px',
                                borderRadius: '50%',
                                border: 'none',
                                background: mobileOverviewTab === 'holdings' ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.45)',
                                padding: 0,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: mobileOverviewTab === 'holdings' ? '0 0 8px var(--color-primary)' : 'none'
                              }}
                              aria-label="Holdings Page"
                            />
                            <button
                              type="button"
                              onClick={() => setMobileOverviewTab('analytics')}
                              style={{
                                width: '9px',
                                height: '9px',
                                borderRadius: '50%',
                                border: 'none',
                                background: mobileOverviewTab === 'analytics' ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.45)',
                                padding: 0,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: mobileOverviewTab === 'analytics' ? '0 0 8px var(--color-primary)' : 'none'
                              }}
                              aria-label="Analytics Page"
                            />
                          </div>
                        )}

                        {/* Floating Expand Sidebar Button when collapsed */}
                        {!isMobile && !isRightColumnOpen && (
                          <div 
                            onClick={handleToggleDashboardCards}
                            style={{
                              position: 'fixed',
                              right: '0px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '14px',
                              height: '36px',
                              background: 'rgba(15, 23, 42, 0.95)',
                              border: '1px solid var(--panel-border)',
                              borderRight: 'none',
                              borderRadius: '6px 0 0 6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              color: 'var(--text-muted)',
                              zIndex: 1000,
                              boxShadow: '-4px 0 16px rgba(0,0,0,0.3)',
                              transition: 'all 0.2s'
                            }}
                            title={t('dashboard.show_cards_tooltip', 'Expand side cards')}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'white';
                              e.currentTarget.style.width = '18px';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--text-muted)';
                              e.currentTarget.style.width = '14px';
                            }}
                          >
                            <span style={{ fontSize: '0.6rem' }}>◀</span>
                          </div>
                        )}
                      </>
                    );
                  })()
                )}
              </div>

              <div style={{ 
                display: subTab === 'ledger' ? 'flex' : 'none',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0
              }}>
                <LedgerTable 
                  transactions={transactions}
                  activePortfolioRole={activePortfolioRole}
                  onEditTransaction={handleStartEditTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                  onImportCSVClick={() => setShowImportModal(true)}
                  onExportCSVClick={handleExportCSV}
                  style={{ height: '100%', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
                  onScrollToBottomChange={setIsLedgerAtBottom}
                />
              </div>

              <div style={{ 
                display: subTab === 'dividends' ? 'flex' : 'none',
                flexDirection: 'column',
                flex: 1,
                height: '100%',
                minHeight: 0,
                position: 'relative',
                overflow: 'hidden'
              }}>


                {/* Desktop view */}
                {!isMobile && (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', minHeight: 0, overflow: 'hidden', position: 'relative' }}>
                    {/* Mode 1: Forecast & Calendar side-by-side (Full Height 100%, ZERO SCROLLBARS) */}
                    {dividendViewMode === 'overview' && (
                      <div 
                        style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '1.2fr 1fr', 
                          gap: '0.75rem', 
                          flex: 1, 
                          height: '100%', 
                          minHeight: 0,
                          overflow: 'hidden',
                          animation: 'fadeIn 0.2s ease-out'
                        }} 
                        className="portfolio-grid"
                      >
                        <div style={{ minWidth: 0, height: '100%' }}>
                          <DividendForecast 
                            apiBaseUrl={apiBaseUrl}
                            activePortfolioId={activePortfolioId}
                            session={session}
                            baseCurrency={summary.base_currency}
                            account={selectedAccount}
                            linkCash={linkCash}
                            holdings={holdings}
                            isExpanded={false}
                          />
                        </div>
                        <div style={{ minWidth: 0, height: '100%' }}>
                          <DividendCalendar 
                            dividends={dividendsList}
                            baseCurrency={summary.base_currency}
                            apiBaseUrl={apiBaseUrl}
                            activePortfolioId={activePortfolioId}
                            jwtToken={session?.access_token || null}
                            isExpanded={false}
                            viewMode="both"
                          />
                        </div>
                      </div>
                    )}

                    {/* Mode 2: Dividend Ledger Table (Full Height 100%, Full Width) */}
                    {dividendViewMode === 'ledger' && (
                      <div style={{ flex: 1, height: '100%', minHeight: 0, overflow: 'hidden', animation: 'fadeIn 0.2s ease-out' }}>
                        <DividendLedgerTable 
                          dividends={dividendsList}
                          activePortfolioRole={activePortfolioRole}
                          baseCurrency={summary.base_currency}
                          onEditDividendClick={(div) => {
                            setEditingDividend(div);
                            setShowAddDividendModal(true);
                          }}
                          onDeleteDividendClick={handleDeleteDividend}
                          style={{ flex: 1, height: '100%', minHeight: 0 }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Mobile view */}
                {isMobile && (
                  <div 
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={() => handleTouchEnd('dividends')}
                    style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', paddingRight: '2px' }}
                  >
                    {mobileDividendsTab === 'forecast' && (
                      <div style={{ minWidth: 0, height: 'auto' }}>
                        <DividendForecast 
                          apiBaseUrl={apiBaseUrl}
                          activePortfolioId={activePortfolioId}
                          session={session}
                          baseCurrency={summary.base_currency}
                          account={selectedAccount}
                          linkCash={linkCash}
                          holdings={holdings}
                          style={{ height: 'auto' }}
                        />
                      </div>
                    )}

                    {mobileDividendsTab === 'calendar' && (
                      <div style={{ minWidth: 0, height: 'auto' }}>
                        <DividendCalendar 
                          dividends={dividendsList}
                          baseCurrency={summary.base_currency}
                          apiBaseUrl={apiBaseUrl}
                          activePortfolioId={activePortfolioId}
                          jwtToken={session?.access_token || null}
                          style={{ height: 'auto' }}
                        />
                      </div>
                    )}

                    {mobileDividendsTab === 'ledger' && (
                      <DividendLedgerTable 
                        dividends={dividendsList}
                        activePortfolioRole={activePortfolioRole}
                        baseCurrency={summary.base_currency}
                        onEditDividendClick={(div) => {
                          setEditingDividend(div);
                          setShowAddDividendModal(true);
                        }}
                        onDeleteDividendClick={handleDeleteDividend}
                        style={{ flex: 'none', minHeight: 'auto', height: 'auto', marginTop: '0px' }}
                      />
                    )}

                    {/* Mobile Page Indicator Dots */}
                    <div className="mobile-page-indicator" style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: '0.6rem',
                      padding: '0.5rem 0 0.5rem 0',
                      alignItems: 'center',
                      marginTop: '0.25rem'
                    }}>
                      <button
                        type="button"
                        onClick={() => setMobileDividendsTab('forecast')}
                        style={{
                          width: '9px',
                          height: '9px',
                          borderRadius: '50%',
                          border: 'none',
                          background: mobileDividendsTab === 'forecast' ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.45)',
                          padding: 0,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: mobileDividendsTab === 'forecast' ? '0 0 8px var(--color-primary)' : 'none'
                        }}
                        aria-label="Forecast Page"
                      />
                      <button
                        type="button"
                        onClick={() => setMobileDividendsTab('calendar')}
                        style={{
                          width: '9px',
                          height: '9px',
                          borderRadius: '50%',
                          border: 'none',
                          background: mobileDividendsTab === 'calendar' ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.45)',
                          padding: 0,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: mobileDividendsTab === 'calendar' ? '0 0 8px var(--color-primary)' : 'none'
                        }}
                        aria-label="Calendar Page"
                      />
                      <button
                        type="button"
                        onClick={() => setMobileDividendsTab('ledger')}
                        style={{
                          width: '9px',
                          height: '9px',
                          borderRadius: '50%',
                          border: 'none',
                          background: mobileDividendsTab === 'ledger' ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.45)',
                          padding: 0,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: mobileDividendsTab === 'ledger' ? '0 0 8px var(--color-primary)' : 'none'
                        }}
                        aria-label="Ledger Page"
                      />
                    </div>
                  </div>
                )}
              </div>


            </>
          )}



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

      {/* BETA INFO MODAL */}
      <BetaInfoModal
        isOpen={showBetaModal}
        onClose={() => setShowBetaModal(false)}
        onOpenFeedback={() => setShowFeedbackModal(true)}
      />

      {/* APP PREFERENCES MODAL */}
      <PreferencesModal 
        isOpen={showPreferencesModal}
        onClose={() => setShowPreferencesModal(false)}
        baseCurrency={baseCurrency}
        setBaseCurrency={setBaseCurrency}
        linkCash={linkCash}
        setLinkCash={setLinkCash}
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
        holdingSymbols={holdings.map(h => h.symbol)}
        apiBaseUrl={apiBaseUrl}
        linkCash={linkCash}
        setLinkCash={setLinkCash}
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
        <StockDetailsModal
          selectedPositionSymbol={selectedPositionSymbol}
          setSelectedPositionSymbol={setSelectedPositionSymbol}
          holdingDetails={holdings.find(h => h.symbol.toUpperCase() === selectedPositionSymbol.toUpperCase())}
          activePortfolioRole={activePortfolioRole}
          apiBaseUrl={apiBaseUrl}
          transactions={transactions}
          holdings={holdings}
          baseCurrency={summary.base_currency}
          onAddTransactionClick={(symbol) => {
            setQuickActionData({ symbol, type: 'BUY' });
            setShowAddModal(true);
          }}
          onStartEditTransaction={handleStartEditTransaction}
          onDeleteTransaction={handleDeleteTransaction}
        />
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

      {/* Floating Action Buttons Area (Bottom-Right Corner) */}
      {activePortfolioId !== 'all' && activePortfolioRole !== 'viewer' && (() => {
        const hideFAB = isMobile && (
          (subTab === 'overview' && mobileOverviewTab === 'holdings' && isHoldingsAtBottom) ||
          (subTab === 'ledger' && isLedgerAtBottom)
        );
        return (
          <>
            {/* View Switcher FAB (ONLY in Desktop Dividends subTab, rendered side-by-side to the left at right: 6.2rem) */}
            {!isMobile && subTab === 'dividends' && (
              <button
                type="button"
                onClick={() => setDividendViewMode(prev => prev === 'overview' ? 'ledger' : 'overview')}
                title={dividendViewMode === 'overview' ? t('dividends.view_ledger_tooltip', 'View Payout Ledger') : t('dividends.view_projections_tooltip', 'Back to Forecast & Calendar')}
                style={{
                  position: 'fixed',
                  bottom: '2rem',
                  right: '6.2rem',
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))',
                  border: '1px solid rgba(6, 182, 212, 0.5)',
                  boxShadow: '0 0 16px rgba(6, 182, 212, 0.4), 0 4px 12px rgba(0, 0, 0, 0.3)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 99,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  outline: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.15)';
                  e.currentTarget.style.boxShadow = '0 0 24px rgba(6, 182, 212, 0.7), 0 6px 16px rgba(0, 0, 0, 0.4)';
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 0 16px rgba(6, 182, 212, 0.4), 0 4px 12px rgba(0, 0, 0, 0.3)';
                  e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.5)';
                }}
              >
                {dividendViewMode === 'overview' ? <FileText size={22} /> : <TrendingUp size={22} />}
              </button>
            )}

            {/* Global + FAB Button (ALWAYS present at right: 2rem across ALL tabs!) */}
            <button
              type="button"
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
                outline: 'none',
                opacity: hideFAB ? 0 : 1,
                pointerEvents: hideFAB ? 'none' : 'auto',
                transform: hideFAB ? 'translateY(100px) scale(0.8)' : 'scale(1)'
              }}
              onMouseEnter={(e) => {
                if (hideFAB) return;
                e.currentTarget.style.transform = 'scale(1.15) rotate(90deg)';
                e.currentTarget.style.boxShadow = '0 0 24px rgba(6, 182, 212, 0.8), 0 6px 16px rgba(0, 0, 0, 0.4)';
              }}
              onMouseLeave={(e) => {
                if (hideFAB) return;
                e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
                e.currentTarget.style.boxShadow = '0 0 16px rgba(6, 182, 212, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3)';
              }}
            >
              <Plus size={24} style={{ strokeWidth: 2.5 }} />
            </button>
          </>
        );
      })()}

    </div>
  );
}
