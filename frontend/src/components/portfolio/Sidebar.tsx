import { useState, useEffect } from 'react';
import { 
  Settings,
  LogOut, 
  Globe, 
  Plus, 
  ChevronDown, 
  Briefcase, 
  Edit2, 
  Trash2, 
  CreditCard,
  Share2,
  MessageSquare,
  Eye,
  TrendingUp,
  TrendingDown,
  Coins,
  Layers
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../AuthContext';
import type { Portfolio } from '../../types/portfolio';
import { useTranslation } from 'react-i18next';
import { AnimateOnChange } from './AnimateOnChange';

interface SidebarProps {
  signOut: () => Promise<void>;
  portfolios: Portfolio[];
  activePortfolioId: string | null;
  setActivePortfolioId: (id: string) => void;
  setActivePortfolioRole: (role: 'owner' | 'editor' | 'viewer') => void;
  selectedAccount: string;
  setSelectedAccount: (account: string) => void;
  portfolioAccountsMap: Record<string, string[]>;
  onCreatePortfolio: () => void;
  onRenamePortfolio: (id: string) => void;
  onDeletePortfolio: (id: string) => void;
  sidebarOpen?: boolean;
  onCloseSidebar?: () => void;
  subTab: 'overview' | 'ledger' | 'dividends';
  setSubTab: (tab: 'overview' | 'ledger' | 'dividends') => void;
  baseCurrency: 'PLN' | 'USD' | 'EUR';
  setBaseCurrency: (val: 'PLN' | 'USD' | 'EUR') => void;
  onShareClick?: () => void;
  onSettingsClick?: () => void;
  onFeedbackClick?: () => void;
  apiBaseUrl: string;
  onSelectStockSymbol: (symbol: string) => void;
}

export function Sidebar({
  signOut,
  portfolios,
  activePortfolioId,
  setActivePortfolioId,
  setActivePortfolioRole,
  selectedAccount,
  setSelectedAccount,
  portfolioAccountsMap,
  onCreatePortfolio,
  onRenamePortfolio,
  onDeletePortfolio,
  sidebarOpen = false,
  onCloseSidebar,
  subTab,
  setSubTab,
  baseCurrency,
  setBaseCurrency,
  onShareClick,
  onSettingsClick,
  onFeedbackClick,
  apiBaseUrl,
  onSelectStockSymbol,
}: SidebarProps) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [expandedPortfolios, setExpandedPortfolios] = useState<Record<string, boolean>>({});
  const [allAssetsExpanded, setAllAssetsExpanded] = useState(true);

  // Watchlist State & Logic
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    const cached = localStorage.getItem('quantifi_watchlist');
    return cached ? JSON.parse(cached) : ['AAPL', 'MSFT', 'TSLA'];
  });
  const [prices, setPrices] = useState<Record<string, { price: number | null; currency: string; change_percent: number; is_market_open: boolean }>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [showAddInput, setShowAddInput] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggestionSelected, setIsSuggestionSelected] = useState(false);

  // Debounced search for watchlist suggestions
  useEffect(() => {
    if (isSuggestionSelected) return;

    if (newSymbol.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const delayDebounce = setTimeout(() => {
      fetch(`${apiBaseUrl}/api/portfolio/search?q=${newSymbol}`)
        .then((res) => res.json())
        .then((data) => {
          if (newSymbol.trim().length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
          }
          setSuggestions(data || []);
          setShowSuggestions(data && data.length > 0);
        })
        .catch((err) => {
          console.error('Error fetching watchlist suggestions:', err);
        });
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [newSymbol, apiBaseUrl, isSuggestionSelected]);

  const handleSelectWatchlistSuggestion = (s: any) => {
    const sym = s.symbol.toUpperCase().trim();
    setIsSuggestionSelected(true);
    setShowSuggestions(false);
    
    if (!watchlist.includes(sym)) {
      const updated = [...watchlist, sym];
      setWatchlist(updated);
      localStorage.setItem('quantifi_watchlist', JSON.stringify(updated));
      syncWatchlistToDb(updated);
    }
    
    setNewSymbol('');
    setShowAddInput(false);
    setIsSuggestionSelected(false);
  };

  const fetchWatchlistFromDb = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;
      
      const { data, error } = await supabase
        .from('watchlists')
        .select('symbols')
        .eq('user_id', currentUser.id)
        .maybeSingle();
        
      if (error) {
        console.error("Error fetching watchlist from db:", error);
      }
        
      if (data && data.symbols) {
        setWatchlist(data.symbols);
        localStorage.setItem('quantifi_watchlist', JSON.stringify(data.symbols));
      }
    } catch (err) {
      console.log("Supabase watchlist fetch failed, using local storage:", err);
    }
  };

  const syncWatchlistToDb = async (updatedList: string[]) => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;
      
      const { error } = await supabase
        .from('watchlists')
        .upsert({ 
          user_id: currentUser.id, 
          symbols: updatedList, 
          updated_at: new Date().toISOString() 
        });
        
      if (error) {
        console.log("Supabase watchlist sync failed:", error);
      }
    } catch (err) {
      console.log("Supabase watchlist sync error:", err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchWatchlistFromDb();
    }
  }, [user]);

  const fetchWatchlistPrices = async (symbolsList: string[]) => {
    if (symbolsList.length === 0) {
      setPrices({});
      return;
    }
    setLoadingPrices(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/watchlist/prices?symbols=${symbolsList.join(',')}`);
      if (response.ok) {
        const data = await response.json();
        const pricesMap: Record<string, { price: number | null; currency: string; change_percent: number; is_market_open: boolean }> = {};
        data.forEach((item: any) => {
          pricesMap[item.symbol] = {
            price: item.price,
            currency: item.currency,
            change_percent: item.change_percent,
            is_market_open: item.is_market_open
          };
        });
        setPrices(pricesMap);
      }
    } catch (err) {
      console.error("Error fetching watchlist prices:", err);
    } finally {
      setLoadingPrices(false);
    }
  };

  useEffect(() => {
    fetchWatchlistPrices(watchlist);
    const interval = setInterval(() => {
      fetchWatchlistPrices(watchlist);
    }, 60000);
    return () => clearInterval(interval);
  }, [watchlist]);

  const handleAddSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSym = newSymbol.trim().toUpperCase();
    if (!cleanSym) return;
    if (watchlist.includes(cleanSym)) {
      setNewSymbol('');
      setShowAddInput(false);
      return;
    }
    const updated = [...watchlist, cleanSym];
    setWatchlist(updated);
    localStorage.setItem('quantifi_watchlist', JSON.stringify(updated));
    syncWatchlistToDb(updated);
    setNewSymbol('');
    setShowAddInput(false);
  };

  const handleRemoveSymbol = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = watchlist.filter(s => s !== sym);
    setWatchlist(updated);
    localStorage.setItem('quantifi_watchlist', JSON.stringify(updated));
    syncWatchlistToDb(updated);
  };

  const togglePortfolioExpand = (portfolioId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedPortfolios(prev => ({
      ...prev,
      [portfolioId]: !prev[portfolioId]
    }));
  };

  return (
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      {/* Branding */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0.75rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
        <img 
          src="/favicon.png" 
          alt="QuantiFi Logo" 
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            boxShadow: '0 0 12px rgba(6, 182, 212, 0.4)',
            objectFit: 'contain'
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0.01em', color: '#ffffff' }}>
            Quanti<span style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Fi</span>
          </span>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('sidebar.portfolio_intelligence', 'Portfolio Intelligence')}
          </span>
        </div>
      </div>

      {/* User Context */}
      <div style={{ 
        padding: '0.55rem 0.75rem', 
        background: 'rgba(255,255,255,0.02)', 
        borderRadius: '8px', 
        border: '1px solid rgba(255,255,255,0.04)', 
        margin: '0 0.5rem 0.5rem 0.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        position: 'relative'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{t('sidebar.logged_in_as', 'Logged in as')}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user?.email}>
              {user?.email}
            </span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem', flexShrink: 0 }}>
            <button 
              onClick={onFeedbackClick}
              style={{
                background: 'rgba(6, 182, 212, 0.06)',
                border: '1px solid rgba(6, 182, 212, 0.15)',
                color: 'var(--color-primary)',
                borderRadius: '4px',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)'
              }}
              title={t('sidebar.feedback', 'Feedback & Bug Report')}
            >
              <MessageSquare size={13} />
            </button>
            <button 
              onClick={signOut}
              style={{
                background: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                color: 'var(--color-red)',
                borderRadius: '4px',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)'
              }}
              title={t('sidebar.sign_out', 'Sign Out')}
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* View Mode Picker */}
      <div style={{ padding: '0.25rem 0.5rem', margin: '0 0.5rem 0.5rem 0.5rem' }}>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Layers size={12} style={{ color: 'var(--color-primary)' }} />
          <span>{t('sidebar.view_mode', 'View Mode')}</span>
        </div>
        <div style={{ 
          display: 'flex', 
          background: 'rgba(255, 255, 255, 0.02)', 
          border: '1px solid rgba(255, 255, 255, 0.05)', 
          borderRadius: '8px', 
          padding: '3px',
          gap: '3px'
        }}>
          {[
            { id: 'overview', label: 'Overview', activeBg: 'linear-gradient(135deg, rgba(6, 182, 212, 0.16) 0%, rgba(6, 182, 212, 0.05) 100%)', activeBorder: 'rgba(6, 182, 212, 0.35)', activeColor: '#22d3ee', shadow: '0 2px 10px rgba(6, 182, 212, 0.12)' },
            { id: 'ledger', label: 'Ledger', activeBg: 'linear-gradient(135deg, rgba(236, 72, 153, 0.16) 0%, rgba(236, 72, 153, 0.05) 100%)', activeBorder: 'rgba(236, 72, 153, 0.35)', activeColor: '#f472b6', shadow: '0 2px 10px rgba(236, 72, 153, 0.12)' },
            { id: 'dividends', label: 'Dividends', activeBg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.16) 0%, rgba(16, 185, 129, 0.05) 100%)', activeBorder: 'rgba(16, 185, 129, 0.35)', activeColor: '#34d399', shadow: '0 2px 10px rgba(16, 185, 129, 0.12)' }
          ].map((tab) => {
            const isActive = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as any)}
                style={{
                  flex: 1,
                  background: isActive ? tab.activeBg : 'transparent',
                  color: isActive ? tab.activeColor : 'var(--text-secondary)',
                  border: isActive ? `1px solid ${tab.activeBorder}` : '1px solid transparent',
                  boxShadow: isActive ? tab.shadow : 'none',
                  padding: '0.35rem 0',
                  fontSize: '0.72rem',
                  fontWeight: isActive ? 700 : 600,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {t('sidebar.' + tab.id, tab.label)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Unified scrollbox container for Assets and Watchlist */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', minHeight: 0 }} className="custom-scrollbar">
        
        {/* Assets Section */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 0.5rem' }}>
          <div style={{ 
            fontSize: '0.62rem', 
            color: 'var(--text-muted)', 
            textTransform: 'uppercase', 
            letterSpacing: '0.05em', 
            fontWeight: 600, 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '0.25rem 0.5rem',
            marginTop: '0.25rem',
            marginBottom: '0.35rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
            paddingBottom: '0.25rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Briefcase size={12} style={{ color: 'var(--color-primary)' }} />
              <span>{t('sidebar.assets', 'Assets')}</span>
            </div>
            <button 
              onClick={onCreatePortfolio}
              title={t('sidebar.create_portfolio', 'Create Portfolio')}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2px',
                borderRadius: '4px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <Plus size={13} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingRight: '4px', marginTop: '0.25rem' }}>
            {/* All Assets Node */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div 
                className={`tree-node ${activePortfolioId === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setActivePortfolioId('all');
                  setSelectedAccount('All');
                  localStorage.setItem('portfolio_active_id', 'all');
                  if (onCloseSidebar) onCloseSidebar();
                }}
              >
                <div 
                  className={`tree-caret ${allAssetsExpanded ? '' : 'collapsed'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAllAssetsExpanded(!allAssetsExpanded);
                  }}
                >
                  <ChevronDown size={13} />
                </div>
                <Globe size={14} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{t('sidebar.all_assets', 'All Assets')}</span>
              </div>

              {/* Nested Portfolios under All Assets */}
              {allAssetsExpanded && (
                <div className="tree-sub-list">
                  {portfolios.map((portfolio) => {
                    const isActive = activePortfolioId === portfolio.id;
                    const isExpanded = !!expandedPortfolios[portfolio.id];
                    const accounts = portfolioAccountsMap[portfolio.id] || [];
                    
                    return (
                      <div key={portfolio.id} style={{ display: 'flex', flexDirection: 'column' }}>
                        {/* Portfolio Folder Node */}
                        <div 
                          className={`tree-node ${isActive && selectedAccount === 'All' ? 'active' : ''}`}
                          onClick={() => {
                            setActivePortfolioId(portfolio.id);
                            setActivePortfolioRole(portfolio.role);
                            setSelectedAccount('All');
                            localStorage.setItem('portfolio_active_id', portfolio.id);
                            if (onCloseSidebar) onCloseSidebar();
                          }}
                        >
                          {accounts.length > 0 ? (
                            <div 
                              className={`tree-caret ${isExpanded ? '' : 'collapsed'}`}
                              onClick={(e) => togglePortfolioExpand(portfolio.id, e)}
                            >
                              <ChevronDown size={13} />
                            </div>
                          ) : (
                            <div style={{ width: '18px', flexShrink: 0 }} />
                          )}
                          <Briefcase size={14} style={{ flexShrink: 0 }} />
                          <span style={{ 
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap', 
                            paddingRight: portfolio.role === 'owner' 
                              ? (isActive ? '4.5rem' : '2.5rem') 
                              : '0.5rem',
                            fontSize: '0.82rem'
                          }}>
                            {portfolio.name}
                          </span>
                          
                          {/* Portfolio Actions */}
                          {portfolio.role === 'owner' && (
                            <div 
                              className={isActive ? "portfolio-actions-active" : "tree-node-actions"}
                              style={{ 
                                position: 'absolute',
                                right: '0.5rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                zIndex: 10,
                                display: isActive ? 'flex' : undefined,
                                gap: '0.35rem'
                              }} 
                              onClick={(e) => e.stopPropagation()}
                            >
                              {isActive && (
                                <>
                                  <button
                                    onClick={() => onShareClick?.()}
                                    title="Share Portfolio"
                                    style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                  >
                                    <Share2 size={12} />
                                  </button>
                                  <button
                                    onClick={() => onSettingsClick?.()}
                                    title="Portfolio Settings"
                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                  >
                                    <Settings size={12} />
                                  </button>
                                </>
                              )}
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRenamePortfolio(portfolio.id);
                                }}
                                title="Rename Portfolio"
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                              >
                                <Edit2 size={11} />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeletePortfolio(portfolio.id);
                                }}
                                title="Delete Portfolio"
                                style={{ background: 'transparent', border: 'none', color: 'var(--color-red)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Nested Accounts Sub-list */}
                        {isExpanded && accounts.length > 0 && (
                          <div className="tree-sub-list">
                            {accounts.map((accName) => {
                              const isAccActive = isActive && selectedAccount === accName;
                              return (
                                <div 
                                  key={accName}
                                  className={`tree-node ${isAccActive ? 'active' : ''}`}
                                  style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem' }}
                                  onClick={() => {
                                    setActivePortfolioId(portfolio.id);
                                    setActivePortfolioRole(portfolio.role);
                                    setSelectedAccount(accName);
                                    localStorage.setItem('portfolio_active_id', portfolio.id);
                                    if (onCloseSidebar) onCloseSidebar();
                                  }}
                                >
                                  <CreditCard size={12} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {accName}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Watchlist Section */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 0.5rem', marginTop: '0.375rem', borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: '0.375rem' }}>
          <div style={{ 
            fontSize: '0.62rem', 
            color: 'var(--text-muted)', 
            textTransform: 'uppercase', 
            letterSpacing: '0.05em', 
            fontWeight: 600, 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '0.25rem 0.5rem',
            marginBottom: '0.35rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
            paddingBottom: '0.25rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Eye size={12} style={{ color: 'var(--color-primary)' }} />
              <span>{t('sidebar.watchlist', 'Watchlist')}</span>
            </div>
            <button 
              onClick={() => setShowAddInput(!showAddInput)}
              title={t('sidebar.add_to_watchlist', 'Add to Watchlist')}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2px',
                borderRadius: '4px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <Plus size={13} />
            </button>
          </div>

          {/* Inline Add Ticker Form */}
          {showAddInput && (
            <form onSubmit={handleAddSymbol} style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem 0.5rem', marginBottom: '0.5rem', position: 'relative' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input 
                  type="text"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  placeholder="e.g. TSLA, NVDA"
                  autoFocus
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--panel-border)',
                    borderRadius: '4px',
                    padding: '0.25rem 0.4rem',
                    fontSize: '0.75rem',
                    color: 'white',
                    outline: 'none'
                  }}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div 
                    className="search-suggestions-dropdown" 
                    style={{ 
                      position: 'absolute', 
                      top: '100%', 
                      left: 0, 
                      right: 0, 
                      zIndex: 2000, 
                      maxHeight: '150px',
                      background: 'rgba(18, 24, 38, 0.98)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      overflowY: 'auto'
                    }}
                  >
                    {suggestions.map((s) => (
                      <div 
                        key={s.symbol}
                        className="suggestion-item" 
                        onClick={() => handleSelectWatchlistSuggestion(s)}
                        style={{
                          padding: '0.4rem 0.6rem',
                          fontSize: '0.75rem',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          gap: '2px',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: 'white' }}>{s.symbol}</span>
                          <span style={{ 
                            fontSize: '0.6rem', 
                            background: 'rgba(255, 255, 255, 0.08)', 
                            padding: '1px 4px', 
                            borderRadius: '3px',
                            color: 'var(--text-muted)'
                          }}>{s.exchange}</span>
                        </div>
                        <span style={{ 
                          fontSize: '0.65rem', 
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%',
                          textAlign: 'left'
                        }} title={s.name}>{s.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button 
                type="submit"
                style={{
                  background: 'var(--color-primary)',
                  border: 'none',
                  borderRadius: '4px',
                  color: 'white',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                Add
              </button>
            </form>
          )}

          {/* Watchlist Scrollable List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
            {watchlist.length === 0 ? (
              <div style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                {t('sidebar.watchlist_empty', 'Watchlist is empty')}
              </div>
            ) : (
              watchlist.map((symbol) => {
                const data = prices[symbol];
                const price = data?.price;
                const pct = data?.change_percent ?? 0;
                const isPositive = pct >= 0;
                
                return (
                  <div 
                    key={symbol}
                    className="tree-node"
                    style={{ justifyContent: 'space-between', padding: '0.4rem 0.5rem' }}
                    onClick={() => onSelectStockSymbol(symbol)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'white' }}>{symbol}</span>
                      {data !== undefined && (
                        <span 
                          style={{ 
                            width: '5px', 
                            height: '5px', 
                            borderRadius: '50%', 
                            backgroundColor: data.is_market_open ? 'var(--color-green)' : 'rgba(255, 255, 255, 0.2)',
                            display: 'inline-block' 
                          }} 
                          title={data.is_market_open ? t('sidebar.market_open', 'Market Open') : t('sidebar.market_closed', 'Market Closed')}
                        />
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                      {price !== undefined && price !== null ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'end', fontSize: '0.72rem', lineHeight: '1.1' }}>
                          <AnimateOnChange value={price} contextId={symbol}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                              {price.toFixed(2)} <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{data.currency}</span>
                            </span>
                          </AnimateOnChange>
                          <AnimateOnChange value={pct} contextId={symbol}>
                            <span style={{ 
                              fontSize: '0.62rem', 
                              fontWeight: 600,
                              color: isPositive ? 'var(--color-green)' : 'var(--color-red)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '1px'
                            }}>
                              {isPositive ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                              {isPositive ? '+' : ''}{pct.toFixed(2)}%
                            </span>
                          </AnimateOnChange>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {loadingPrices ? '...' : 'N/A'}
                        </span>
                      )}
                      
                      <button
                        onClick={(e) => handleRemoveSymbol(symbol, e)}
                        title="Remove from Watchlist"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          marginLeft: '0.1rem',
                          fontSize: '0.7rem'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-red)'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Base Currency Picker */}
      <div style={{ padding: '0.4rem 0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.04)', flexShrink: 0 }}>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'center' }}>
          <Coins size={11} style={{ color: 'var(--color-primary)' }} />
          <span>{t('sidebar.base_currency', 'Base Currency')}</span>
        </div>
        <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '2px', width: '100%', maxWidth: '180px', margin: '0 auto' }}>
          {(['PLN', 'USD', 'EUR'] as const).map((curr) => (
            <button
              key={curr}
              onClick={() => setBaseCurrency(curr)}
              style={{
                flex: 1,
                background: baseCurrency === curr ? 'var(--color-primary)' : 'transparent',
                color: baseCurrency === curr ? 'white' : 'var(--text-secondary)',
                border: 'none',
                padding: '0.25rem 0',
                fontSize: '0.68rem',
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
      </div>

      {/* Footer / Language Selector */}
      <div style={{ 
        padding: '0.6rem 0.5rem', 
        borderTop: '1px solid rgba(255, 255, 255, 0.04)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.7rem',
        color: 'var(--text-muted)',
        flexShrink: 0
      }}>
        <button 
          onClick={() => i18n.changeLanguage('en')}
          style={{
            background: 'transparent',
            border: 'none',
            color: i18n.language.startsWith('en') ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: i18n.language.startsWith('en') ? 'bold' : 'normal',
            textDecoration: i18n.language.startsWith('en') ? 'underline' : 'none',
            cursor: 'pointer',
            padding: '2px 4px',
            fontSize: '0.7rem',
            transition: 'var(--transition-smooth)'
          }}
        >
          EN
        </button>
        <span style={{ opacity: 0.3 }}>|</span>
        <button 
          onClick={() => i18n.changeLanguage('pl')}
          style={{
            background: 'transparent',
            border: 'none',
            color: i18n.language.startsWith('pl') ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: i18n.language.startsWith('pl') ? 'bold' : 'normal',
            textDecoration: i18n.language.startsWith('pl') ? 'underline' : 'none',
            cursor: 'pointer',
            padding: '2px 4px',
            fontSize: '0.7rem',
            transition: 'var(--transition-smooth)'
          }}
        >
          PL
        </button>
      </div>
    </aside>
  );
}
