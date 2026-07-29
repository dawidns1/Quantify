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
  Layers,
  Search,
  X,
  Star,
  SlidersHorizontal
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
  onShareClick?: () => void;
  onSettingsClick?: () => void;
  onFeedbackClick?: () => void;
  onBetaClick?: () => void;
  onPreferencesClick?: () => void;
  apiBaseUrl: string;
  onSelectStockSymbol: (symbol: string) => void;
  onAddTransactionClick?: (symbol: string) => void;
  activePortfolioRole?: 'owner' | 'editor' | 'viewer';
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
  onShareClick,
  onSettingsClick,
  onFeedbackClick,
  onBetaClick,
  onPreferencesClick,
  apiBaseUrl,
  onSelectStockSymbol,
  onAddTransactionClick,
  activePortfolioRole = 'viewer'
}: SidebarProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [expandedPortfolios, setExpandedPortfolios] = useState<Record<string, boolean>>({});
  const [allAssetsExpanded, setAllAssetsExpanded] = useState(true);

  // Watchlist State & Logic
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    const cached = localStorage.getItem('quantifi_watchlist');
    return cached ? JSON.parse(cached) : ['AAPL', 'MSFT', 'TSLA'];
  });
  const [prices, setPrices] = useState<Record<string, { price: number | null; currency: string; change_percent: number; is_market_open: boolean }>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);

  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);

  // Global search state
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchSuggestions, setGlobalSearchSuggestions] = useState<any[]>([]);
  const [showGlobalSuggestions, setShowGlobalSuggestions] = useState(false);

  useEffect(() => {
    if (!globalSearchQuery || globalSearchQuery.trim().length < 2) {
      setGlobalSearchSuggestions([]);
      setShowGlobalSuggestions(false);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`${apiBaseUrl}/api/portfolio/search?q=${encodeURIComponent(globalSearchQuery)}`)
        .then((r) => r.json())
        .then((data) => {
          setGlobalSearchSuggestions(data);
          setShowGlobalSuggestions(true);
        })
        .catch((e) => console.error('Error fetching global lookup suggestions:', e));
    }, 300);
    return () => clearTimeout(timer);
  }, [globalSearchQuery, apiBaseUrl]);

  const handleSelectGlobalSearchSymbol = (symbol: string) => {
    onSelectStockSymbol(symbol);
    setGlobalSearchQuery('');
    setGlobalSearchSuggestions([]);
    setShowGlobalSuggestions(false);
    if (onCloseSidebar) onCloseSidebar();
  };

  const toggleWatchlistSymbol = (symbolToToggle: string) => {
    const upper = symbolToToggle.toUpperCase();
    setWatchlist(prev => {
      let next;
      if (prev.includes(upper)) {
        next = prev.filter(s => s !== upper);
      } else {
        next = [...prev, upper];
      }
      localStorage.setItem('quantifi_watchlist', JSON.stringify(next));
      syncWatchlistToDb(next);
      return next;
    });
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0.01em', color: '#ffffff' }}>
              Quanti<span style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Fi</span>
            </span>
            <span 
              onClick={onBetaClick}
              title="Click for Beta Info & Release Notes"
              style={{
                padding: '0.08rem 0.35rem',
                fontSize: '0.52rem',
                fontWeight: 700,
                borderRadius: '4px',
                background: 'rgba(6, 182, 212, 0.15)',
                color: '#06b6d4',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                lineHeight: 1,
                cursor: onBetaClick ? 'pointer' : 'default',
                transition: 'all 0.15s ease'
              }}
            >Beta</span>
          </div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {/* Row 1: Logged-in user email with subtle avatar badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#06b6d4',
              fontWeight: 700,
              fontSize: '0.7rem',
              flexShrink: 0
            }}>
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{t('sidebar.logged_in_as', 'Logged in as')}</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user?.email}>
                {user?.email}
              </span>
            </div>
          </div>
          
          {/* Row 2: Sleek Action Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(0, 0, 0, 0.2)', padding: '4px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
            <button 
              onClick={onShareClick}
              style={{
                flex: 1,
                background: 'rgba(6, 182, 212, 0.08)',
                border: '1px solid rgba(6, 182, 212, 0.25)',
                color: '#06b6d4',
                borderRadius: '4px',
                padding: '4px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)'
              }}
              title={t('modals.share.title', 'Share & Invite')}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'white';
                e.currentTarget.style.background = 'rgba(6, 182, 212, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#06b6d4';
                e.currentTarget.style.background = 'rgba(6, 182, 212, 0.08)';
              }}
            >
              <Share2 size={13} />
            </button>

            <button 
              onClick={onPreferencesClick}
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-secondary)',
                borderRadius: '4px',
                padding: '4px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)'
              }}
              title={t('sidebar.preferences', 'App Preferences')}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'white';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              }}
            >
              <SlidersHorizontal size={13} />
            </button>

            <button 
              onClick={onFeedbackClick}
              style={{
                flex: 1,
                background: 'rgba(6, 182, 212, 0.06)',
                border: '1px solid rgba(6, 182, 212, 0.15)',
                color: 'var(--color-primary)',
                borderRadius: '4px',
                padding: '4px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)'
              }}
              title={t('sidebar.feedback', 'Feedback & Bug Report')}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'white';
                e.currentTarget.style.background = 'rgba(6, 182, 212, 0.18)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-primary)';
                e.currentTarget.style.background = 'rgba(6, 182, 212, 0.06)';
              }}
            >
              <MessageSquare size={13} />
            </button>

            <button 
              onClick={signOut}
              style={{
                flex: 1,
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: 'var(--color-red)',
                borderRadius: '4px',
                padding: '4px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)'
              }}
              title={t('sidebar.sign_out', 'Sign Out')}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'white';
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-red)';
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
              }}
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
                onClick={() => {
                  setSubTab(tab.id as any);
                  if (onCloseSidebar) onCloseSidebar();
                }}
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
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0.65rem 0.75rem' }}>
          <div style={{ 
            fontSize: '0.62rem', 
            color: 'var(--text-muted)', 
            textTransform: 'uppercase', 
            letterSpacing: '0.05em', 
            fontWeight: 600, 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '0.35rem'
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
                                <button
                                  onClick={() => onSettingsClick?.()}
                                  title="Portfolio Settings"
                                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                >
                                  <Settings size={12} />
                                </button>
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

        {/* Global Symbol Search / Lookup */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0.65rem 0.75rem', position: 'relative', flexShrink: 0, borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Search size={12} style={{ color: 'var(--color-primary)' }} />
            <span>{t('sidebar.search_title', 'Search')}</span>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              onFocus={(e) => {
                e.currentTarget.style.background = 'rgba(6, 182, 212, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.4)';
                e.currentTarget.style.boxShadow = '0 0 12px rgba(6, 182, 212, 0.18)';
                if (globalSearchSuggestions.length > 0) setShowGlobalSuggestions(true);
              }}
              onBlur={(e) => {
                e.currentTarget.style.background = 'rgba(6, 182, 212, 0.03)';
                e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.18)';
                e.currentTarget.style.boxShadow = '0 0 10px rgba(6, 182, 212, 0.03)';
                setTimeout(() => setShowGlobalSuggestions(false), 200);
              }}
              placeholder={t('sidebar.search_placeholder', 'Search symbol (e.g. AAPL, TSLA)...')}
              style={{
                width: '100%',
                background: 'rgba(6, 182, 212, 0.03)',
                border: '1px solid rgba(6, 182, 212, 0.18)',
                borderRadius: '8px',
                padding: '0.45rem 0.65rem 0.45rem 1.8rem',
                fontSize: '0.78rem',
                color: 'white',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'all 0.25s ease',
                boxShadow: '0 0 10px rgba(6, 182, 212, 0.03)'
              }}
            />
            <Search size={13} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            {globalSearchQuery && (
              <button
                onClick={() => {
                  setGlobalSearchQuery('');
                  setGlobalSearchSuggestions([]);
                  setShowGlobalSuggestions(false);
                }}
                style={{
                  position: 'absolute',
                  right: '0.65rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={13} />
              </button>
            )}
            
            {/* Suggestions Dropdown */}
            {showGlobalSuggestions && globalSearchSuggestions.length > 0 && (
              <div
                className="search-suggestions-dropdown custom-scrollbar"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 2000,
                  marginTop: '4px',
                  maxHeight: '200px',
                  background: 'rgba(18, 24, 38, 0.98)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  overflowY: 'auto'
                }}
              >
                {globalSearchSuggestions.map((s) => {
                  const isInWatchlist = watchlist.includes(s.symbol.toUpperCase());
                  return (
                    <div
                      key={s.symbol}
                      className="suggestion-item"
                      onClick={() => handleSelectGlobalSearchSymbol(s.symbol)}
                      style={{
                        padding: '0.5rem 0.75rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                        cursor: 'pointer',
                        transition: 'background 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Left Column: Symbol Details */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1, marginRight: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: 'white', fontSize: '0.78rem' }}>{s.symbol}</span>
                          <span style={{
                            fontSize: '0.62rem',
                            background: 'rgba(255, 255, 255, 0.08)',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            color: 'var(--text-muted)'
                          }}>{s.exchange}</span>
                        </div>
                        <span style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          textAlign: 'left'
                        }} title={s.name}>{s.name}</span>
                      </div>

                      {/* Right Column: Contextual Action Buttons */}
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                        {/* Add/Remove from Watchlist Star Button */}
                        <button
                          onClick={() => toggleWatchlistSymbol(s.symbol)}
                          title={isInWatchlist ? t('sidebar.remove_from_watchlist', 'Remove from Watchlist') : t('sidebar.add_to_watchlist', 'Add to Watchlist')}
                          style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid var(--panel-border)',
                            borderRadius: '4px',
                            color: isInWatchlist ? '#eab308' : 'var(--text-muted)',
                            padding: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'var(--transition-smooth)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                            e.currentTarget.style.borderColor = 'rgba(234, 179, 8, 0.3)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                            e.currentTarget.style.borderColor = 'var(--panel-border)';
                          }}
                        >
                          <Star size={12} fill={isInWatchlist ? '#eab308' : 'transparent'} color={isInWatchlist ? '#eab308' : 'var(--text-muted)'} />
                        </button>

                        {/* Add Transaction Plus Button */}
                        {activePortfolioRole !== 'viewer' && onAddTransactionClick && (
                          <button
                            onClick={() => {
                              onAddTransactionClick(s.symbol);
                              setGlobalSearchQuery('');
                              setGlobalSearchSuggestions([]);
                              setShowGlobalSuggestions(false);
                              if (onCloseSidebar) onCloseSidebar();
                            }}
                            title={t('dashboard.add_tx_shortcut', 'Add Transaction')}
                            style={{
                              background: 'rgba(6, 182, 212, 0.06)',
                              border: '1px solid rgba(6, 182, 212, 0.15)',
                              borderRadius: '4px',
                              color: 'var(--color-primary)',
                              padding: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'var(--transition-smooth)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(6, 182, 212, 0.12)';
                              e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.35)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(6, 182, 212, 0.06)';
                              e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.15)';
                            }}
                          >
                            <Plus size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Watchlist Section */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0.65rem 0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
          <div style={{ 
            fontSize: '0.62rem', 
            color: 'var(--text-muted)', 
            textTransform: 'uppercase', 
            letterSpacing: '0.05em', 
            fontWeight: 600, 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '0.35rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Eye size={12} style={{ color: 'var(--color-primary)' }} />
              <span>{t('sidebar.watchlist', 'Watchlist')}</span>
            </div>
          </div>

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

      {/* Footer Settings Area (Disclaimer only) */}
      <div style={{
        padding: '0.6rem 0.75rem',
        borderTop: '1px solid rgba(255, 255, 255, 0.04)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '0.72rem',
        color: 'var(--text-secondary)',
        flexShrink: 0,
        position: 'relative'
      }}>
        {/* Disclaimer Link Trigger */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowDisclaimerModal(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontWeight: 500,
              padding: '0.2rem 0.4rem',
              borderRadius: '4px',
              transition: 'var(--transition-smooth)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            title={t('sidebar.disclaimer_tooltip', 'View Legal Disclaimer')}
          >
            {t('dashboard.disclaimer_title', 'Disclaimer')}
          </button>
        </div>
      </div>

      {showDisclaimerModal && (
        <>
          <div 
            onClick={() => setShowDisclaimerModal(false)}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(5, 7, 13, 0.8)',
              zIndex: 9999,
              cursor: 'pointer'
            }}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(18, 24, 38, 0.98)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '1.5rem',
            width: '90%',
            maxWidth: '420px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}>
            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'white' }}>
              {t('dashboard.disclaimer_title', 'Disclaimer')}
            </h4>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p>
                {t('dashboard.disclaimer_desc', 'QuantiFi is a portfolio tracking tool provided for educational and informational purposes only. We do not provide financial, investment, or tax advice.')}
              </p>
              <p>
                {t('dashboard.disclaimer_market_data', 'Market data may be delayed and is provided "as is" without guarantees of accuracy or completeness.')}
              </p>
            </div>
            <button
              onClick={() => setShowDisclaimerModal(false)}
              className="glow-btn"
              style={{
                marginTop: '0.5rem',
                padding: '0.45rem 1rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                border: 'none',
                fontWeight: 600,
                alignSelf: 'flex-end'
              }}
            >
              {t('common.close', 'Close')}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
