import { useState } from 'react';
import { 
  Settings, 
  LogOut, 
  Globe, 
  Plus, 
  ChevronDown, 
  Briefcase, 
  Edit2, 
  Trash2, 
  History, 
  CreditCard,
  DollarSign,
  Share2
} from 'lucide-react';
import { useAuth } from '../../AuthContext';
import type { Portfolio } from '../../types/portfolio';

interface SidebarProps {
  signOut: () => Promise<void>;
  lowPerformanceMode: boolean;
  setLowPerformanceMode: (val: boolean) => void;
  linkCash: boolean;
  setLinkCash: (val: boolean) => void;
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
}

export function Sidebar({
  signOut,
  lowPerformanceMode,
  setLowPerformanceMode,
  linkCash,
  setLinkCash,
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
  onSettingsClick
}: SidebarProps) {
  const { user } = useAuth();
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [expandedPortfolios, setExpandedPortfolios] = useState<Record<string, boolean>>({});

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
        <div style={{
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '1.1rem',
          color: 'white',
          boxShadow: '0 0 12px rgba(6, 182, 212, 0.4)'
        }}>
          Q
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.03em', background: 'linear-gradient(90deg, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            QUANTIFY
          </span>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Portfolio Intelligence
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
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Logged in as</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user?.email}>
              {user?.email}
            </span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem', flexShrink: 0 }}>
            <button 
              onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: showSettingsDropdown ? 'var(--color-primary)' : 'var(--text-secondary)',
                borderRadius: '4px',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)'
              }}
              title="Settings"
            >
              <Settings size={13} />
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
              title="Sign Out"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>

        {showSettingsDropdown && (
          <div className="glass-panel" style={{
            marginTop: '0.5rem',
            padding: '0.75rem',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            zIndex: 50
          }}>
            <h5 style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.25rem' }}>Settings</h5>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Performance Mode</span>
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>Disable animations/blurs</span>
              </div>
              <label className="switch" style={{ width: '28px', height: '16px' }}>
                <input 
                  type="checkbox" 
                  checked={lowPerformanceMode}
                  onChange={(e) => setLowPerformanceMode(e.target.checked)}
                />
                <span className="slider" style={{ borderRadius: '16px' }}></span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Link Cash Balance</span>
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>Auto-deduct transactions</span>
              </div>
              <label className="switch" style={{ width: '28px', height: '16px' }}>
                <input 
                  type="checkbox" 
                  checked={linkCash}
                  onChange={(e) => setLinkCash(e.target.checked)}
                />
                <span className="slider" style={{ borderRadius: '16px' }}></span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Base Currency Picker */}
      <div style={{ padding: '0.25rem 0.5rem', margin: '0 0.5rem 0.5rem 0.5rem' }}>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.35rem' }}>
          Base Currency
        </div>
        <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '6px', padding: '2px' }}>
          {(['PLN', 'USD', 'EUR'] as const).map((curr) => (
            <button
              key={curr}
              onClick={() => setBaseCurrency(curr)}
              style={{
                flex: 1,
                background: baseCurrency === curr ? 'var(--color-primary)' : 'transparent',
                color: baseCurrency === curr ? 'white' : 'var(--text-secondary)',
                border: 'none',
                padding: '0.3rem 0',
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
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0 0.5rem', marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, padding: '0.25rem 0.25rem 0.15rem 0.25rem' }}>
          View Mode
        </div>
        <button
          onClick={() => setSubTab('overview')}
          className={`tree-node ${subTab === 'overview' ? 'active' : ''}`}
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Briefcase size={14} />
          <span>Overview</span>
        </button>
        <button
          onClick={() => setSubTab('ledger')}
          className={`tree-node ${subTab === 'ledger' ? 'active' : ''}`}
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <History size={14} />
          <span>Transactions Ledger</span>
        </button>
        <button
          onClick={() => setSubTab('dividends')}
          className={`tree-node ${subTab === 'dividends' ? 'active' : ''}`}
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <DollarSign size={14} />
          <span>Dividend History</span>
        </button>
      </div>

      {/* Navigation Tree Root */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0 0.5rem' }}>
        <div 
          className={`tree-node ${activePortfolioId === 'all' ? 'active' : ''}`}
          onClick={() => {
            setActivePortfolioId('all');
            setSelectedAccount('All');
            localStorage.setItem('portfolio_active_id', 'all');
            if (onCloseSidebar) onCloseSidebar();
          }}
        >
          <Globe size={15} />
          <span>All Assets</span>
        </div>
      </div>

      {/* Portfolios Section */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 0.5rem' }}>
        <div className="tree-section-header">
          <span>Portfolios</span>
          <button 
            onClick={onCreatePortfolio}
            title="Create New Portfolio"
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto', flex: 1, paddingRight: '4px', marginTop: '0.25rem' }}>
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
                  <div 
                    className={`tree-caret ${isExpanded ? '' : 'collapsed'}`}
                    onClick={(e) => togglePortfolioExpand(portfolio.id, e)}
                  >
                    <ChevronDown size={13} />
                  </div>
                  <Briefcase size={14} style={{ flexShrink: 0 }} />
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap', 
                    paddingRight: portfolio.role === 'owner' ? '2.5rem' : '0.5rem',
                    fontSize: '0.82rem'
                  }}>
                    {portfolio.name}
                  </span>
                  
                  {/* Active Actions (Share & Settings) */}
                  {isActive && portfolio.role === 'owner' && (
                    <div style={{ display: 'flex', gap: '0.35rem', marginLeft: 'auto', marginRight: '0.25rem', zIndex: 10 }} onClick={(e) => e.stopPropagation()}>
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
                    </div>
                  )}

                  {/* Hover CRUD icons */}
                  {portfolio.role === 'owner' && (
                    <div className="tree-node-actions" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onRenamePortfolio(portfolio.id);
                        }}
                        title="Rename Portfolio"
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
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
                        style={{ background: 'transparent', border: 'none', color: 'var(--color-red)', cursor: 'pointer', padding: '2px' }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Nested Accounts Sub-list */}
                {isExpanded && (
                  <div className="tree-sub-list">
                    <div 
                      className={`tree-node ${isActive && selectedAccount === 'All' ? 'active' : ''}`}
                      style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem' }}
                      onClick={() => {
                        setActivePortfolioId(portfolio.id);
                        setActivePortfolioRole(portfolio.role);
                        setSelectedAccount('All');
                        localStorage.setItem('portfolio_active_id', portfolio.id);
                        if (onCloseSidebar) onCloseSidebar();
                      }}
                    >
                      <History size={12} />
                      <span>All Accounts</span>
                    </div>
                    
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
      </div>
    </aside>
  );
}
