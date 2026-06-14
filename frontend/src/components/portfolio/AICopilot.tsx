import { useState, useEffect, useRef } from 'react';
import { Sparkles, RefreshCw, AlertTriangle, ShieldCheck, PieChart, Activity, Clock, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchAIInsights } from '../../services/calculationService';

interface AICopilotProps {
  portfolioId: string;
  apiBaseUrl: string;
  jwtToken: string | null;
  baseCurrency: string;
  account: string;
  linkCash: boolean;
  hasHoldings: boolean;
}

interface ParsedInsights {
  diversification: string;
  risk: string;
  alerts: string;
  isParsed: boolean;
  fullText: string;
}

export function AICopilot({
  portfolioId,
  apiBaseUrl,
  jwtToken,
  baseCurrency,
  account,
  linkCash,
  hasHoldings
}: AICopilotProps) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<ParsedInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  
  // Rate limiting & debounce guard
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimerRef = useRef<any>(null);

  const startCooldown = () => {
    setCooldown(10); // 10 seconds visual debounce cooldown
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  const parseInsights = (text: string): ParsedInsights => {
    if (!text) {
      return { diversification: '', risk: '', alerts: '', isParsed: false, fullText: '' };
    }

    const parts = text.split(/###\s+/);
    let diversification = '';
    let risk = '';
    let alerts = '';

    for (const part of parts) {
      const lines = part.split('\n');
      const header = lines[0].toLowerCase();
      const content = lines.slice(1).join('\n').trim();

      if (header.includes('diversif') || header.includes('dywersyf') || header.includes('alokac')) {
        diversification = content;
      } else if (header.includes('risk') || header.includes('ryzyk') || header.includes('korel')) {
        risk = content;
      } else if (header.includes('alert') || header.includes('wskaz') || header.includes('wydarz')) {
        alerts = content;
      } else if (content && !lines[0].startsWith('#')) {
        // Fallback assignments
        if (!diversification) diversification = part;
        else if (!risk) risk = part;
        else if (!alerts) alerts = part;
      }
    }

    const isParsed = !!(diversification || risk || alerts);
    return {
      diversification,
      risk,
      alerts,
      isParsed,
      fullText: text
    };
  };

  const loadInsights = async (force: boolean = false) => {
    if (!hasHoldings) return;
    setLoading(true);
    setError(null);
    if (force) {
      startCooldown();
    }

    try {
      const res = await fetchAIInsights(
        apiBaseUrl,
        jwtToken,
        portfolioId,
        baseCurrency,
        account,
        linkCash,
        i18n.language,
        force
      );
      
      if (res && res.insights) {
        setInsights(parseInsights(res.insights));
        setIsCached(!!res.cached);
        setLastRefreshed(new Date());
      } else {
        setError(t('ai_copilot.err_failed', 'Failed to generate insights.'));
      }
    } catch (err: any) {
      setError(err.message || t('ai_copilot.err_failed', 'An error occurred during AI analysis.'));
    } finally {
      setLoading(false);
    }
  };

  // Auto load when tab opens or parameters change
  useEffect(() => {
    loadInsights(false);
  }, [portfolioId, baseCurrency, account, linkCash, i18n.language, hasHoldings]);

  // Helper to parse simple markdown to react nodes
  const renderMarkdownText = (text: string) => {
    if (!text) return null;
    const lines = text.split('\n');

    return lines.map((line, idx) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        return (
          <ul key={idx} style={{ paddingLeft: '1.15rem', margin: '0.3rem 0', listStyleType: 'disc' }}>
            <li style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: '1.5' }}>
              {parseInlineMarkdown(trimmed.substring(2))}
            </li>
          </ul>
        );
      }

      if (trimmed.startsWith('> ')) {
        return (
          <blockquote key={idx} style={{ borderLeft: '3px solid var(--color-primary)', paddingLeft: '0.75rem', color: 'var(--text-muted)', fontSize: '0.78rem', fontStyle: 'italic', margin: '0.5rem 0' }}>
            {parseInlineMarkdown(trimmed.substring(2))}
          </blockquote>
        );
      }

      if (trimmed === '') {
        return <div key={idx} style={{ height: '0.4rem' }} />;
      }

      return (
        <p key={idx} style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0.35rem 0', lineHeight: '1.5' }}>
          {parseInlineMarkdown(trimmed)}
        </p>
      );
    });
  };

  const parseInlineMarkdown = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} style={{ color: 'white', fontWeight: 600 }}>{part.substring(2, part.length - 2)}</strong>;
      }
      const codeParts = part.split(/(`.*?`)/g);
      if (codeParts.length > 1) {
        return codeParts.map((cp, cIdx) => {
          if (cp.startsWith('`') && cp.endsWith('`')) {
            return <code key={cIdx} style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 4px', borderRadius: '4px', fontFamily: 'monospace', color: 'var(--color-primary)', fontSize: '0.78rem' }}>{cp.substring(1, cp.length - 1)}</code>;
          }
          return cp;
        });
      }
      return part;
    });
  };

  if (!hasHoldings) {
    return (
      <div className="glass-panel" style={{ padding: '3rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(6, 182, 212, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--color-primary)' }}>
          <Sparkles size={28} className="animate-pulse" />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'white' }}>{t('ai_copilot.empty_title', 'AI Copilot Unavailable')}</h3>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '420px', lineHeight: 1.5 }}>
            {t('ai_copilot.empty_portfolio', 'Your portfolio has no active stock holdings. Add buy transactions in the Ledger tab first to enable AI diagnostics.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
      
      {/* Top Banner Card */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', position: 'relative', overflow: 'hidden' }}>
        
        {/* Glow behind */}
        <div style={{ position: 'absolute', top: '-20px', left: '-20px', width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, rgba(6,182,212,0) 70%)', pointerEvents: 'none' }} />
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', minWidth: '280px' }}>
          <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(236, 72, 153, 0.15) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--color-primary)', flexShrink: 0 }}>
            <Sparkles size={20} className={loading ? "animate-spin" : ""} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {t('ai_copilot.title', 'AI Portfolio Copilot')}
              {insights && (
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: '10px',
                  background: isCached ? 'rgba(255,255,255,0.05)' : 'rgba(16, 185, 129, 0.1)',
                  border: isCached ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(16, 185, 129, 0.2)',
                  color: isCached ? 'var(--text-muted)' : 'var(--color-green)'
                }}>
                  {isCached ? t('ai_copilot.cached_badge', 'Cached') : t('ai_copilot.fresh_badge', 'Live')}
                </span>
              )}
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {t('ai_copilot.subtitle', 'Risk and diversification diagnostics powered by Gemini.')}
            </p>
          </div>
        </div>

        {/* Action button & status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {lastRefreshed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <Clock size={12} />
              <span>
                {t('ai_copilot.last_updated', 'Updated')}: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}
          <button
            onClick={() => loadInsights(true)}
            disabled={loading || cooldown > 0}
            className="glow-btn"
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.78rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              cursor: 'pointer',
              height: '34px'
            }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>
              {cooldown > 0 
                ? `${t('ai_copilot.cooldown', 'Cooldown')} (${cooldown}s)` 
                : t('ai_copilot.btn_regenerate', 'Regenerate')}
            </span>
          </button>
        </div>
      </div>

      {/* Warnings & Limits banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 0.85rem', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        <Info size={13} style={{ color: 'var(--color-primary)' }} />
        <span>{t('ai_copilot.rate_limit_warning', 'Maximum 3 calculations per day per user. Analysis is cached for 12 hours.')}</span>
      </div>

      {error && (
        <div className="form-error-banner" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid var(--color-red)', color: 'var(--color-red)', borderRadius: '8px', fontSize: '0.8rem' }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Shimmer State */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-panel shimmer-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '280px' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)' }} className="shimmer-pulse" />
                <div style={{ width: '150px', height: '16px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)' }} className="shimmer-pulse" />
              </div>
              <div style={{ width: '100%', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }} className="shimmer-pulse" />
              <div style={{ width: '90%', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }} className="shimmer-pulse" />
              <div style={{ width: '95%', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }} className="shimmer-pulse" />
              <div style={{ width: '80%', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }} className="shimmer-pulse" />
              <div style={{ width: '85%', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }} className="shimmer-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Finished Output Cards */}
      {!loading && insights && (
        <>
          {insights.isParsed ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
              
              {/* Card 1: Diversification */}
              <div className="glass-panel card-hover" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, right: 0, width: '60px', height: '60px', background: 'radial-gradient(circle, rgba(6,182,212,0.03) 0%, rgba(0,0,0,0) 70%)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
                  <PieChart size={18} style={{ color: 'var(--color-primary)' }} />
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'white' }}>
                    {t('ai_copilot.sec_diversification', 'Diversification & Allocation')}
                  </h4>
                </div>
                <div style={{ flex: 1 }}>
                  {renderMarkdownText(insights.diversification)}
                </div>
              </div>

              {/* Card 2: Risk Profile */}
              <div className="glass-panel card-hover" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, right: 0, width: '60px', height: '60px', background: 'radial-gradient(circle, rgba(236,72,153,0.03) 0%, rgba(0,0,0,0) 70%)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
                  <Activity size={18} style={{ color: 'var(--color-pink)' }} />
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'white' }}>
                    {t('ai_copilot.sec_risk', 'Risk Profile & Correlations')}
                  </h4>
                </div>
                <div style={{ flex: 1 }}>
                  {renderMarkdownText(insights.risk)}
                </div>
              </div>

              {/* Card 3: Actionable Alerts */}
              <div className="glass-panel card-hover" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, right: 0, width: '60px', height: '60px', background: 'radial-gradient(circle, rgba(234,179,8,0.03) 0%, rgba(0,0,0,0) 70%)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
                  <AlertTriangle size={18} style={{ color: 'var(--color-yellow)' }} />
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'white' }}>
                    {t('ai_copilot.sec_alerts', 'Actionable Warnings & Rebalancing')}
                  </h4>
                </div>
                <div style={{ flex: 1 }}>
                  {renderMarkdownText(insights.alerts)}
                </div>
              </div>

            </div>
          ) : (
            // Full Text Fallback if structure is unparseable
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
                <ShieldCheck size={18} style={{ color: 'var(--color-primary)' }} />
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'white' }}>
                  {t('ai_copilot.sec_full_report', 'Copilot Assessment')}
                </h4>
              </div>
              <div>
                {renderMarkdownText(insights.fullText)}
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
