import { useState, useEffect, useMemo } from 'react';
import { Scale, Check, AlertTriangle, Copy, RotateCcw, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { Holding } from '../../types/portfolio';

interface RebalancingPlannerProps {
  holdings: Holding[];
  summary: any;
  portfolio: any;
  activePortfolioRole: string;
  onSaveSettings: (updatedSettings: any) => Promise<void>;
}

export function RebalancingPlanner({
  holdings,
  summary,
  portfolio,
  activePortfolioRole,
  onSaveSettings
}: RebalancingPlannerProps) {
  const { t, i18n } = useTranslation();
  const [targetWeights, setTargetWeights] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showTrades, setShowTrades] = useState(false);

  const activeHoldings = useMemo(() => {
    return holdings.filter(h => h.shares > 0);
  }, [holdings]);

  const totalValue = useMemo(() => {
    return activeHoldings.reduce((sum, h) => sum + h.current_value_base, 0);
  }, [activeHoldings]);

  // Load existing target weights from portfolio settings
  useEffect(() => {
    if (portfolio && portfolio.settings) {
      const savedWeights = portfolio.settings.targetWeights || {};
      const initialWeights: Record<string, number> = {};
      
      activeHoldings.forEach(h => {
        const symbol = h.symbol.toUpperCase();
        initialWeights[symbol] = savedWeights[symbol] !== undefined 
          ? Number(savedWeights[symbol]) 
          : Math.round((h.current_value_base / (totalValue || 1)) * 100);
      });
      setTargetWeights(initialWeights);
      setShowTrades(false);
    }
  }, [portfolio, activeHoldings, totalValue]);

  const actualWeights = useMemo(() => {
    const weights: Record<string, number> = {};
    activeHoldings.forEach(h => {
      weights[h.symbol.toUpperCase()] = totalValue > 0 
        ? (h.current_value_base / totalValue) * 100 
        : 0;
    });
    return weights;
  }, [activeHoldings, totalValue]);

  const targetWeightsSum = useMemo(() => {
    return Object.values(targetWeights).reduce((sum, w) => sum + w, 0);
  }, [targetWeights]);

  const isSumCorrect = Math.abs(targetWeightsSum - 100) < 0.01;

  const handleWeightChange = (symbol: string, valStr: string) => {
    const val = parseInt(valStr) || 0;
    setTargetWeights(prev => ({
      ...prev,
      [symbol.toUpperCase()]: Math.max(0, Math.min(100, val))
    }));
    setShowTrades(false);
  };

  const handleResetEqual = () => {
    if (activeHoldings.length === 0) return;
    const equalShare = Math.floor(100 / activeHoldings.length);
    const remainder = 100 - (equalShare * activeHoldings.length);
    
    const nextWeights: Record<string, number> = {};
    activeHoldings.forEach((h, idx) => {
      const symbol = h.symbol.toUpperCase();
      // Distribute remainder to first items
      nextWeights[symbol] = equalShare + (idx < remainder ? 1 : 0);
    });
    
    setTargetWeights(nextWeights);
    setShowTrades(false);
  };

  const handleSaveWeights = async () => {
    if (activePortfolioRole === 'viewer' || !portfolio) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const updatedSettings = {
        ...portfolio.settings,
        targetWeights
      };
      await onSaveSettings(updatedSettings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      console.error('Failed to save target weights:', e);
    } finally {
      setSaving(false);
    }
  };

  // Calculate trade actions
  const tradePlan = useMemo(() => {
    if (!isSumCorrect || totalValue === 0) return [];

    return activeHoldings.map(h => {
      const symbol = h.symbol.toUpperCase();
      const actualVal = h.current_value_base;
      const targetWeight = targetWeights[symbol] || 0;
      const targetVal = totalValue * (targetWeight / 100);
      const valDiff = targetVal - actualVal;
      
      const priceInBase = h.current_value_base / h.shares; // base currency price per share
      const sharesToTrade = valDiff / priceInBase;

      return {
        symbol,
        name: h.name,
        actualWeight: actualWeights[symbol] || 0,
        targetWeight,
        actualVal,
        targetVal,
        valDiff,
        sharesToTrade,
        action: valDiff > 0.05 ? 'BUY' : valDiff < -0.05 ? 'SELL' : 'HOLD'
      };
    }).filter(t => t.action !== 'HOLD')
      .sort((a, b) => b.action.localeCompare(a.action)); // BUYs first
  }, [activeHoldings, totalValue, targetWeights, actualWeights, isSumCorrect]);

  const handleCopyPlan = () => {
    if (tradePlan.length === 0) return;

    const baseCurr = summary?.base_currency || 'USD';
    let text = `${t('rebalance.copy_header', 'QuantiFi Rebalancing Plan')} (${baseCurr}):\n`;
    
    tradePlan.forEach(t => {
      const formattedDiff = new Intl.NumberFormat(i18n.language || 'en', { style: 'currency', currency: baseCurr }).format(Math.abs(t.valDiff));
      const formattedShares = Math.abs(t.sharesToTrade).toFixed(4);
      text += `- ${t.action} ${formattedShares} shares of ${t.symbol} (~${formattedDiff})\n`;
    });

    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(i18n.language || 'en', {
      style: 'currency',
      currency: summary?.base_currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  if (activeHoldings.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Scale size={32} style={{ opacity: 0.5, marginBottom: '0.75rem', color: 'var(--color-primary)' }} />
        <h3>{t('rebalance.empty_title', 'No Assets to Rebalance')}</h3>
        <p style={{ maxWidth: '400px', margin: '0 auto', fontSize: '0.85rem' }}>
          {t('rebalance.empty_desc', 'Add stock transactions in your ledger first to enable the Target Allocation planner.')}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Planner Card */}
      <div className="glass-panel" style={{
        padding: '1.25rem',
        background: 'linear-gradient(135deg, rgba(16, 24, 40, 0.45) 0%, rgba(10, 15, 26, 0.7) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px'
      }}>
        {/* Title & Actions Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
            <Scale size={18} style={{ color: 'var(--color-primary)' }} />
            {t('rebalance.title', 'Target Allocation Planner')}
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleResetEqual}
              className="cancel-btn"
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)' }}
              title="Distribute weights equally"
            >
              <RotateCcw size={12} /> {t('rebalance.btn_equal', 'Reset Equal')}
            </button>
            {activePortfolioRole !== 'viewer' && (
              <button
                onClick={handleSaveWeights}
                disabled={saving}
                className="glow-btn"
                style={{ padding: '0.45rem 1rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', borderRadius: '6px', cursor: 'pointer', border: 'none' }}
              >
                {saveSuccess ? (
                  <>
                    <Check size={12} /> {t('rebalance.saved', 'Saved!')}
                  </>
                ) : (
                  <>
                    <Save size={12} /> {saving ? t('rebalance.saving', 'Saving...') : t('rebalance.save_targets', 'Save Targets')}
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Weights input table */}
        <div className="custom-scrollbar" style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', background: 'rgba(0,0,0,0.1)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <th style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{t('rebalance.col_asset', 'Asset')}</th>
                <th style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{t('rebalance.col_value', 'Current Value')}</th>
                <th style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{t('rebalance.col_actual_weight', 'Actual Weight')}</th>
                <th style={{ padding: '0.75rem', color: 'var(--text-muted)', width: '130px' }}>{t('rebalance.col_target_weight', 'Target Weight (%)')}</th>
                <th style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{t('rebalance.col_target_val', 'Target Value')}</th>
                <th style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{t('rebalance.col_diff', 'Difference')}</th>
              </tr>
            </thead>
            <tbody>
              {activeHoldings.map(h => {
                const symbol = h.symbol.toUpperCase();
                const target = targetWeights[symbol] || 0;
                const actual = actualWeights[symbol] || 0;
                const targetVal = totalValue * (target / 100);
                const diffVal = targetVal - h.current_value_base;

                return (
                  <tr key={symbol} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.1s' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ fontWeight: 700, color: 'white' }}>{symbol}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>{h.name}</div>
                    </td>
                    <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>{formatCurrency(h.current_value_base)}</td>
                    <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>{actual.toFixed(2)}%</td>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={target}
                          onChange={(e) => handleWeightChange(symbol, e.target.value)}
                          style={{
                            width: '65px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '4px',
                            color: 'white',
                            padding: '0.25rem 0.4rem',
                            textAlign: 'center',
                            fontSize: '0.8rem',
                            fontFamily: 'monospace'
                          }}
                        />
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>%</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>{formatCurrency(targetVal)}</td>
                    <td style={{
                      padding: '0.75rem',
                      fontFamily: 'monospace',
                      color: diffVal > 0.05 ? 'var(--color-green)' : diffVal < -0.05 ? 'var(--color-red)' : 'var(--text-muted)',
                      fontWeight: Math.abs(diffVal) > 0.05 ? 700 : 500
                    }}>
                      {diffVal > 0.05 ? '+' : ''}{formatCurrency(diffVal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Sum Checker Warning banner */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
            {isSumCorrect ? (
              <span style={{ color: 'var(--color-green)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                ✓ {t('rebalance.sum_ok', 'Total weights: 100%')}
              </span>
            ) : (
              <span style={{ color: 'var(--color-red)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                <AlertTriangle size={14} /> {t('rebalance.sum_error', 'Total weights must equal 100%')} (Current: {targetWeightsSum}%)
              </span>
            )}
          </div>
          <div>
            <button
              onClick={() => setShowTrades(true)}
              disabled={!isSumCorrect}
              className="glow-btn"
              style={{
                padding: '0.5rem 1.25rem',
                fontSize: '0.8rem',
                borderRadius: '6px',
                cursor: isSumCorrect ? 'pointer' : 'not-allowed',
                border: 'none',
                opacity: isSumCorrect ? 1 : 0.4
              }}
            >
              {t('rebalance.btn_calc', 'Calculate Trades')}
            </button>
          </div>
        </div>
      </div>

      {/* Trade execution checklist card */}
      {showTrades && isSumCorrect && (
        <div className="glass-panel" style={{
          padding: '1.25rem',
          background: 'linear-gradient(135deg, rgba(16, 24, 40, 0.45) 0%, rgba(10, 15, 26, 0.7) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'white' }}>
              <Scale size={15} style={{ color: 'var(--color-primary)' }} />
              {t('rebalance.trades_header', 'Trades Checklist to Execute')}
            </h4>
            {tradePlan.length > 0 && (
              <button
                onClick={handleCopyPlan}
                className="cancel-btn"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem', borderRadius: '5px', background: 'rgba(255,255,255,0.03)' }}
              >
                {copySuccess ? (
                  <>
                    <Check size={11} /> {t('rebalance.copied', 'Copied!')}
                  </>
                ) : (
                  <>
                    <Copy size={11} /> {t('rebalance.copy', 'Copy Trade Plan')}
                  </>
                )}
              </button>
            )}
          </div>

          {tradePlan.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-green)', fontSize: '0.82rem', background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.12)', borderRadius: '8px' }}>
              🎉 {t('rebalance.perfect_balance', 'Your portfolio is currently perfectly balanced according to your targets!')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {tradePlan.map((trade) => {
                const isBuy = trade.action === 'BUY';
                return (
                  <div key={trade.symbol} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.55rem 0.75rem',
                    background: 'rgba(255, 255, 255, 0.012)',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    borderRadius: '6px'
                  }}>
                    {/* Action & Symbol Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '0.12rem 0.4rem',
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                        background: isBuy ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: isBuy ? 'var(--color-green)' : 'var(--color-red)',
                        border: isBuy ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid rgba(239, 68, 68, 0.15)'
                      }}>
                        {isBuy ? t('rebalance.buy', 'Buy') : t('rebalance.sell', 'Sell')}
                      </span>
                      <div>
                        <span style={{ fontWeight: 700, color: 'white', fontSize: '0.8rem' }}>{trade.symbol}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>{trade.name}</span>
                      </div>
                    </div>

                    {/* Trade Amount Details */}
                    <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                      <div style={{ fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>
                        {formatCurrency(Math.abs(trade.valDiff))}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {t('rebalance.trade_shares', 'Shares')}: <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{Math.abs(trade.sharesToTrade).toFixed(4)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
