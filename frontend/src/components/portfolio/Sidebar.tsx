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
  CreditCard,
  Share2,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '../../AuthContext';
import type { Portfolio } from '../../types/portfolio';
import { useTranslation } from 'react-i18next';

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
  subTab: 'overview' | 'ledger' | 'dividends' | 'rebalance';
  setSubTab: (tab: 'overview' | 'ledger' | 'dividends' | 'rebalance') => void;
  baseCurrency: 'PLN' | 'USD' | 'EUR';
  setBaseCurrency: (val: 'PLN' | 'USD' | 'EUR') => void;
  onShareClick?: () => void;
  onSettingsClick?: () => void;
  onFeedbackClick?: () => void;
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
  onFeedbackClick
}: SidebarProps) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [expandedPortfolios, setExpandedPortfolios] = useState<Record<string, boolean>>({});
  const [allAssetsExpanded, setAllAssetsExpanded] = useState(true);

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
          alt="Quantify Logo" 
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            boxShadow: '0 0 12px rgba(6, 182, 212, 0.4)',
            objectFit: 'contain'
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.03em', background: 'linear-gradient(90deg, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            QUANTIFY
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

      {/* Base Currency Picker */}
      <div style={{ padding: '0.25rem 0.5rem', margin: '0 0.5rem 0.5rem 0.5rem' }}>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.35rem' }}>
          {t('sidebar.base_currency', 'Base Currency')}
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



      {/* View Mode Picker */}
      <div style={{ padding: '0.25rem 0.5rem', margin: '0 0.5rem 0.5rem 0.5rem' }}>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.35rem' }}>
          {t('sidebar.view_mode', 'View Mode')}
        </div>
        <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '6px', padding: '2px' }}>
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'ledger', label: 'Ledger' },
            { id: 'dividends', label: 'Dividends' },
            { id: 'rebalance', label: 'Rebalance' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as any)}
              style={{
                flex: 1,
                background: subTab === tab.id ? 'var(--color-primary)' : 'transparent',
                color: subTab === tab.id ? 'white' : 'var(--text-secondary)',
                border: 'none',
                padding: '0.3rem 0',
                fontSize: '0.72rem',
                fontWeight: 600,
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)',
                textAlign: 'center'
              }}
            >
              {t('sidebar.' + tab.id, tab.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Assets Section */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 0.5rem', minHeight: 0 }}>
        <div className="tree-section-header">
          <span>{t('sidebar.assets', 'Assets')}</span>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto', flex: 1, paddingRight: '4px', marginTop: '0.25rem' }}>
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
