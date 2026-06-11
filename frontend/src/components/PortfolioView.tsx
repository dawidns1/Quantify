import { useState, useEffect, useMemo } from 'react';
import { 
  Globe, 
  Briefcase, 
  History, 
  Plus, 
  X, 
  Edit2, 
  Trash2, 
  Lock, 
  Share2,
  Menu
} from 'lucide-react';
import { useAuth } from '../AuthContext';

import type { Portfolio, Transaction, Holding, Summary } from '../types/portfolio';

import { Sidebar } from './portfolio/Sidebar';
import { MetricsBanner } from './portfolio/MetricsBanner';
import { PerformanceChart } from './portfolio/PerformanceChart';
import { HoldingsTable } from './portfolio/HoldingsTable';
import { LedgerTable } from './portfolio/LedgerTable';
import { AddTransactionModal } from './portfolio/AddTransactionModal';
import { ShareModal } from './portfolio/ShareModal';

import { 
  fetchHoldings as fetchHoldingsService, 
  fetchHistoricalPerformance as fetchHistoricalPerformanceService 
} from '../services/calculationService';
import { 
  fetchUserPortfolios, 
  createPortfolio, 
  renamePortfolio, 
  deletePortfolio 
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
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [subTab, setSubTabState] = useState<'overview' | 'ledger'>(() => {
    const cached = localStorage.getItem('portfolio_sub_tab');
    return (cached === 'overview' || cached === 'ledger') ? cached : 'overview';
  });

  const setSubTab = (tab: 'overview' | 'ledger') => {
    setSubTabState(tab);
    localStorage.setItem('portfolio_sub_tab', tab);
  };

  const [baseCurrency, setBaseCurrencyState] = useState<'PLN' | 'USD' | 'EUR'>(() => {
    const cached = localStorage.getItem('portfolio_base_currency');
    return (cached === 'PLN' || cached === 'USD' || cached === 'EUR') ? cached : 'PLN';
  });

  const setBaseCurrency = (currency: 'PLN' | 'USD' | 'EUR') => {
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
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [quickActionData, setQuickActionData] = useState<{ symbol: string; type: 'BUY' | 'SELL' } | null>(null);
  const [customModal, setCustomModal] = useState<any | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  
  const [linkCash, setLinkCashState] = useState<boolean>(() => {
    return localStorage.getItem('portfolio_link_cash') !== 'false';
  });

  const setLinkCash = (val: boolean) => {
    setLinkCashState(val);
    localStorage.setItem('portfolio_link_cash', String(val));
  };

  const [chartData, setChartData] = useState<{ dates: string[]; nav: number[]; cost_basis: number[] } | null>(null);
  const [loadingChart, setLoadingChart] = useState<boolean>(false);
  const [selectedPositionSymbol, setSelectedPositionSymbol] = useState<string | null>(null);

  // Filtering states
  const [selectedAccount, setSelectedAccountState] = useState<string>(() => {
    return localStorage.getItem('portfolio_selected_account') || 'All';
  });

  const setSelectedAccount = (account: string) => {
    setSelectedAccountState(account);
    localStorage.setItem('portfolio_selected_account', account);
  };

  // Portfolios state (multi-device collaborative lists)
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [activePortfolioRole, setActivePortfolioRole] = useState<'owner' | 'editor' | 'viewer'>('viewer');
  const [loadingPortfolios, setLoadingPortfolios] = useState(true);

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
  const fetchHoldings = async (curr: 'PLN' | 'USD' | 'EUR', accountFilter: string = selectedAccount) => {
    if (!activePortfolioId) return;
    setLoadingHoldings(true);
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
    } catch (err) {
      console.error('Error fetching holdings:', err);
    } finally {
      setLoadingHoldings(false);
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

  // Recalculate holdings when active portfolio, filters, or transactions update
  useEffect(() => {
    if (activePortfolioId && portfolios.length > 0) {
      fetchHoldings(baseCurrency, selectedAccount);
    }
  }, [baseCurrency, selectedAccount, activePortfolioId, allTransactions, linkCash, portfolios]);

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

  // Populate form fields to start editing transaction
  const handleStartEditTransaction = (tx: Transaction) => {
    setEditingTransaction(tx);
    setShowAddModal(true);
  };

  // Filter transactions for the selected holding position modal
  const positionTransactions = useMemo(() => {
    if (!selectedPositionSymbol) return [];
    return transactions.filter(tx => tx.symbol.toUpperCase() === selectedPositionSymbol.toUpperCase());
  }, [transactions, selectedPositionSymbol]);

  // Find holding details for the selected position modal
  const holdingDetails = useMemo(() => {
    if (!selectedPositionSymbol) return null;
    return holdings.find(h => h.symbol.toUpperCase() === selectedPositionSymbol.toUpperCase()) || null;
  }, [holdings, selectedPositionSymbol]);

  const activePortfolioName = activePortfolioId === 'all'
    ? 'All Assets'
    : portfolios.find(p => p.id === activePortfolioId)?.name || 'My Portfolio';

  const formatCurrency = (val: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
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
      />

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        <div className="portfolio-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Top navigation Header Switcher Bar */}
          <div className="portfolio-header-bar glass-panel" style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            flexWrap: 'wrap', 
            gap: '1rem',
            padding: '0.75rem 1.25rem',
            background: 'rgba(13, 20, 35, 0.45)',
            border: '1px solid var(--panel-border)',
            borderRadius: '10px'
          }}>
            {/* Breadcrumb Trail */}
            <div className="breadcrumb-trail" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button 
                className="mobile-menu-toggle-btn"
                onClick={() => setSidebarOpen(true)}
                title="Open Navigation Menu"
              >
                <Menu size={18} />
              </button>
              <Globe size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
              <span className="breadcrumb-item">All Assets</span>
              {activePortfolioId && activePortfolioId !== 'all' && (
                <>
                  <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.7rem' }}>/</span>
                  <span className={`breadcrumb-item ${selectedAccount === 'All' ? 'active' : ''}`}>
                    {activePortfolioName}
                  </span>
                </>
              )}
              {selectedAccount && selectedAccount !== 'All' && (
                <>
                  <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.7rem' }}>/</span>
                  <span className="breadcrumb-item active">
                    {selectedAccount}
                  </span>
                </>
              )}
            </div>

            {/* Utility selectors & action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
              
              {/* Sub-tabs buttons */}
              <div className="sub-tabs-container" style={{ display: 'flex', gap: '0.35rem' }}>
                <button 
                  className={`sub-tab-btn ${subTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setSubTab('overview')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    background: subTab === 'overview' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                    color: subTab === 'overview' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: subTab === 'overview' ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
                    padding: '0.4rem 0.85rem',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                >
                  <Briefcase size={14} />
                  Overview
                </button>
                <button 
                  className={`sub-tab-btn ${subTab === 'ledger' ? 'active' : ''}`}
                  onClick={() => setSubTab('ledger')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    background: subTab === 'ledger' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                    color: subTab === 'ledger' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: subTab === 'ledger' ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
                    padding: '0.4rem 0.85rem',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                >
                  <History size={14} />
                  Ledger ({transactions.length})
                </button>
              </div>

              {/* Base Currency Selector pills */}
              <div className="currency-selector-pills" style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '2px' }}>
                {(['PLN', 'USD', 'EUR'] as const).map((curr) => (
                  <button
                    key={curr}
                    onClick={() => setBaseCurrency(curr)}
                    style={{
                      background: baseCurrency === curr ? 'var(--color-primary)' : 'transparent',
                      color: baseCurrency === curr ? 'white' : 'var(--text-secondary)',
                      border: 'none',
                      padding: '0.2rem 0.55rem',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'var(--transition-smooth)'
                    }}
                  >
                    {curr}
                  </button>
                ))}
              </div>

              {/* Share button */}
              {activePortfolioId !== 'all' && activePortfolioRole === 'owner' && (
                <button
                  className="glow-btn"
                  onClick={() => setShowShareModal(true)}
                  style={{
                    padding: '0.35rem 0.85rem',
                    fontSize: '0.8rem',
                    borderRadius: '6px',
                    boxShadow: 'none',
                    background: 'rgba(59, 130, 246, 0.06)',
                    color: 'var(--color-primary)',
                    borderColor: 'rgba(59, 130, 246, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <Share2 size={13} /> Share
                </button>
              )}

              {/* Add Transaction Button */}
              {activePortfolioId !== 'all' && activePortfolioRole !== 'viewer' && (
                <button 
                  className="glow-btn"
                  onClick={() => setShowAddModal(true)}
                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', borderRadius: '6px' }}
                >
                  <Plus size={14} /> Add Transaction
                </button>
              )}
            </div>
          </div>

          {/* Shimmer / Skeleton Loading placeholder for initial data fetch */}
          {((loadingPortfolios && portfolios.length === 0) || (loadingHoldings && holdings.length === 0) || (loadingTransactions && allTransactions.length === 0)) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Consolidated Premium Metrics Banner Skeleton */}
              <div className="glass-panel" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1.25rem 1.75rem',
                background: 'linear-gradient(135deg, rgba(18, 24, 38, 0.65) 0%, rgba(13, 17, 28, 0.8) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
                gap: '1.5rem',
                flexWrap: 'wrap',
                marginBottom: '0.5rem'
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
                  <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '0.5rem', height: '260px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="shimmer-placeholder" style={{ width: '220px', height: '18px' }}></div>
                    <div className="shimmer-placeholder" style={{ width: '100%', flex: 1 }}></div>
                  </div>

                  {/* Grid skeleton */}
                  <div className="portfolio-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
                    <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="shimmer-placeholder" style={{ width: '180px', height: '22px' }}></div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.5rem' }}>
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

                    <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
                <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="shimmer-placeholder" style={{ width: '220px', height: '24px' }}></div>
                    <div className="shimmer-placeholder" style={{ width: '150px', height: '18px' }}></div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1rem' }}>
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
              {activePortfolioRole === 'viewer' && (
                <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid #f59e0b', color: '#f59e0b', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                  <Lock size={16} style={{ flexShrink: 0 }} />
                  <span>You have <strong>Read-Only (Viewer)</strong> access to this portfolio. Adding, editing, or deleting transactions is disabled.</span>
                </div>
              )}

              {/* OVERVIEW TAB CONTENT */}
              <div style={{ display: subTab === 'overview' ? 'block' : 'none' }}>
                <MetricsBanner summary={summary} />
                
                <PerformanceChart 
                  chartData={chartData} 
                  loadingChart={loadingChart} 
                  baseCurrency={summary.base_currency} 
                />

                <HoldingsTable 
                  holdings={holdings}
                  summary={summary}
                  activePortfolioRole={activePortfolioRole}
                  onQuickAction={handleQuickAction}
                  onSelectPositionSymbol={setSelectedPositionSymbol}
                />
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
      />

      {/* COLLABORATIVE SHARING DIALOG MODAL */}
      <ShareModal 
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        activePortfolioId={activePortfolioId}
        showCustomConfirm={showCustomConfirm}
      />

      {/* POSITION TRANSACTIONS HISTORY MODAL */}
      {selectedPositionSymbol && (
        <>
          <div className="modal-backdrop" onClick={() => setSelectedPositionSymbol(null)} style={{ cursor: 'pointer' }} />
          <div className="modal-overlay-container">
            <div className="modal-content" style={{ maxWidth: '850px', width: '95%' }}>
              <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, fontSize: '1.35rem' }}>
                  <History size={22} className="gradient-text" /> 
                  <span style={{ fontWeight: 700 }}>{selectedPositionSymbol}</span>
                  {holdingDetails?.name && (
                    <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', fontWeight: 400, opacity: 0.85 }}>
                      ({holdingDetails.name})
                    </span>
                  )}
                </h3>
                <button 
                  onClick={() => setSelectedPositionSymbol(null)}
                  className="modal-close-btn"
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
                >
                  <X size={20} />
                </button>
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
                        {holdingDetails.shares}
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

                {positionTransactions.length === 0 ? (
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
                          <th>Date</th>
                          <th>Type</th>
                          <th style={{ textAlign: 'right' }}>Shares</th>
                          <th style={{ textAlign: 'right' }}>Price</th>
                          <th style={{ textAlign: 'right' }}>Fees</th>
                          <th style={{ textAlign: 'right' }}>Total</th>
                          {activePortfolioRole !== 'viewer' && <th style={{ textAlign: 'center' }}>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {positionTransactions.map((tx) => {
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
                                {tx.shares}
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

    </div>
  );
}
