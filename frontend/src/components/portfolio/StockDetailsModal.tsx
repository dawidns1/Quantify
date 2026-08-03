import { useState, useEffect, useMemo } from 'react';
import { History, Plus, X, Edit2, Trash2, ArrowUpDown, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Holding, Transaction } from '../../types/portfolio';
import { FXHedgingVisualizer } from './FXHedgingVisualizer';
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

const verticalLinePlugin = {
  id: 'verticalLine',
  afterDraw: (chart: any) => {
    if (chart.tooltip && chart.tooltip.getActiveElements().length) {
      const activePoint = chart.tooltip.getActiveElements()[0];
      const ctx = chart.ctx;
      const x = activePoint.element.x;
      const topY = chart.scales.y.top;
      const bottomY = chart.scales.y.bottom;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, bottomY);
      ctx.lineWidth = 1;
      
      const dataset = chart.data.datasets[activePoint.datasetIndex];
      const strokeColor = dataset.borderColor || 'rgba(16, 185, 129, 0.4)';
      ctx.strokeStyle = typeof strokeColor === 'string' ? strokeColor : 'rgba(16, 185, 129, 0.4)';
      ctx.setLineDash([4, 4]); // dashed line
      ctx.stroke();
      ctx.restore();
    }
  }
};

const modalChartPlugins = [verticalLinePlugin];

// File-level cache to persist stock details across modal opens
const stockDetailsCache: Record<string, any> = {};

const formatFinancialValue = (val: number | null, currencyStr = 'USD') => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const absVal = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  
  const symbolMap: Record<string, string> = {
    'USD': '$', 'EUR': '€', 'GBP': '£', 'PLN': ' zł', 'JPY': '¥', 'CAD': 'C$', 'AUD': 'A$'
  };
  
  const currencySymbol = symbolMap[currencyStr.toUpperCase()] || ` ${currencyStr}`;
  const isPostfixed = currencyStr.toUpperCase() === 'PLN' || !symbolMap[currencyStr.toUpperCase()];

  const formatWithSymbol = (numStr: string) => {
    return isPostfixed ? `${sign}${numStr}${currencySymbol}` : `${sign}${currencySymbol}${numStr}`;
  };

  if (absVal >= 1.0e12) {
    return formatWithSymbol(`${(absVal / 1.0e12).toFixed(2)}T`);
  } else if (absVal >= 1.0e9) {
    return formatWithSymbol(`${(absVal / 1.0e9).toFixed(2)}B`);
  } else if (absVal >= 1.0e6) {
    return formatWithSymbol(`${(absVal / 1.0e6).toFixed(2)}M`);
  } else if (absVal >= 1.0e3) {
    return formatWithSymbol(`${(absVal / 1.0e3).toFixed(1)}K`);
  }
  return formatWithSymbol(absVal.toFixed(2));
};

interface StockDetailsModalProps {
  selectedPositionSymbol: string | null;
  setSelectedPositionSymbol: (symbol: string | null) => void;
  holdingDetails: Holding | undefined;
  activePortfolioRole: string;
  apiBaseUrl: string;
  transactions: Transaction[];
  holdings: Holding[];
  baseCurrency: string;
  onAddTransactionClick: (symbol: string) => void;
  onStartEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}

export function StockDetailsModal({
  selectedPositionSymbol,
  setSelectedPositionSymbol,
  holdingDetails,
  activePortfolioRole,
  apiBaseUrl,
  transactions,
  holdings,
  baseCurrency,
  onAddTransactionClick,
  onStartEditTransaction,
  onDeleteTransaction
}: StockDetailsModalProps) {
  const { t } = useTranslation();

  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedStockDetails, setSelectedStockDetails] = useState<any | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [modalRange, setModalRange] = useState<'1M' | '3M' | '1Y' | '3Y' | 'MAX'>('1Y');

  // Search & sorting states for modal transaction ledger
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [modalSortField, setModalSortField] = useState('date');
  const [modalSortAsc, setModalSortAsc] = useState(false);

  // Fetch stock details on symbol change
  useEffect(() => {
    if (!selectedPositionSymbol) {
      setSelectedStockDetails(null);
      return;
    }

    setDetailsError(null);
    const cached = stockDetailsCache[selectedPositionSymbol];
    if (cached) {
      setSelectedStockDetails(cached);
      setLoadingDetails(false);
      
      // Silent background validation to fetch fresh data
      fetch(`${apiBaseUrl}/api/stocks/${selectedPositionSymbol}`)
        .then(res => {
          if (res.ok) return res.json();
        })
        .then(data => {
          if (data) {
            stockDetailsCache[selectedPositionSymbol] = data;
            setSelectedStockDetails((prev: any) => {
              if (prev && selectedPositionSymbol && prev.overview?.symbol === data.overview?.symbol) {
                return data;
              }
              return prev;
            });
          }
        })
        .catch(err => console.error("Silent background refresh error:", err));
    } else {
      setLoadingDetails(true);
      fetch(`${apiBaseUrl}/api/stocks/${selectedPositionSymbol}`)
        .then(res => {
          if (!res.ok) throw new Error("Failed to fetch stock details");
          return res.json();
        })
        .then(data => {
          stockDetailsCache[selectedPositionSymbol] = data;
          setSelectedStockDetails(data);
          setLoadingDetails(false);
        })
        .catch(err => {
          console.error("Error fetching stock details:", err);
          setDetailsError(err.message || "Failed to load company details");
          setLoadingDetails(false);
        });
    }
  }, [selectedPositionSymbol, apiBaseUrl]);

  // Modal Price History Chart calculations
  const modalChartData = useMemo(() => {
    if (!selectedStockDetails || !selectedStockDetails.history || selectedStockDetails.history.length === 0) return null;
    let hist = [...selectedStockDetails.history];
    hist.sort((a: any, b: any) => a.date.localeCompare(b.date));

    if (modalRange !== 'MAX') {
      const cutoffDate = new Date();
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
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: accentColor,
          pointHoverBorderWidth: 2,
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
      animation: false as const,
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
      hover: {
        mode: 'index' as const,
        intersect: false
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

  // Annual Financials chart calculations
  const financialsChartData = useMemo(() => {
    if (!selectedStockDetails?.financials || selectedStockDetails.financials.length === 0) return null;
    
    const sortedFin = [...selectedStockDetails.financials].sort((a: any, b: any) => a.year.localeCompare(b.year));
    const years = sortedFin.map((f: any) => f.year);
    const revenue = sortedFin.map((f: any) => f.revenue);
    const netIncome = sortedFin.map((f: any) => f.net_income);

    return {
      labels: years,
      datasets: [
        {
          label: t('holdings.annual_revenue', 'Revenue'),
          data: revenue,
          backgroundColor: 'rgba(6, 182, 212, 0.7)',
          borderColor: 'rgba(6, 182, 212, 1)',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: t('holdings.annual_net_income', 'Net Income'),
          data: netIncome,
          backgroundColor: 'rgba(16, 185, 129, 0.7)',
          borderColor: 'rgba(16, 185, 129, 1)',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    };
  }, [selectedStockDetails?.financials, t]);

  const financialsChartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
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
  }, [selectedStockDetails?.overview?.currency]);

  // Handle transaction list sorting & filtering inside the modal
  const handleModalSort = (field: string) => {
    if (modalSortField === field) {
      setModalSortAsc(!modalSortAsc);
    } else {
      setModalSortField(field);
      setModalSortAsc(field !== 'date');
    }
  };

  const renderModalSortArrow = (field: string) => {
    if (modalSortField !== field) return null;
    return <ArrowUpDown size={11} style={{ marginLeft: '2px', display: 'inline' }} />;
  };

  const positionTransactionsFilteredAndSorted = useMemo(() => {
    if (!selectedPositionSymbol) return [];
    
    // 1. Filter by symbol
    let list = transactions.filter(tx => tx.symbol.toUpperCase() === selectedPositionSymbol.toUpperCase());
    
    // 2. Filter by search query
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
    
    // 3. Map with totalLocal and return metrics
    const holding = holdings.find(h => h.symbol.toUpperCase() === selectedPositionSymbol.toUpperCase());
    const currentPrice = holding?.current_price_local || 0;

    const listWithTotals = list.map(tx => {
      const totalLocal = (tx.shares * tx.price) + (tx.type === 'BUY' ? tx.fees : -tx.fees);
      
      let gainVal = 0;
      let gainPct = 0;
      
      if (tx.type === 'BUY' && currentPrice > 0) {
        const costBasis = (tx.shares * tx.price) + tx.fees;
        const currentValue = tx.shares * currentPrice;
        gainVal = currentValue - costBasis;
        gainPct = costBasis > 0 ? (gainVal / costBasis) * 100 : 0;
      }

      return {
        ...tx,
        totalLocal,
        gainVal,
        gainPct
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
      } else if (modalSortField === 'return') {
        valA = a.gainPct;
        valB = b.gainPct;
      } else {
        valA = a.date;
        valB = b.date;
      }

      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      if (typeof valA === 'string') {
        return modalSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return modalSortAsc ? valA - valB : valB - valA;
      }
    });

    return listWithTotals;
  }, [transactions, holdings, selectedPositionSymbol, modalSearchQuery, modalSortField, modalSortAsc]);

  if (!selectedPositionSymbol) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={() => setSelectedPositionSymbol(null)} style={{ cursor: 'pointer' }} />
      <div className="modal-overlay-container">
        <div className="modal-content" style={{ maxWidth: '850px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 1.75rem 0.75rem 1.75rem', flexWrap: 'wrap', gap: '0.75rem', background: 'rgba(18, 24, 38, 0.2)' }}>
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
                    setSelectedPositionSymbol(null);
                    onAddTransactionClick(selectedPositionSymbol);
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

              <button 
                onClick={() => setSelectedPositionSymbol(null)}
                className="modal-close-btn"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="custom-scrollbar" style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.25rem 1.75rem 1.75rem 1.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            willChange: 'scroll-position'
          }}>
            {/* Quick Summary Dashboard */}
            {holdingDetails && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem', flexShrink: 0 }}>
                <div className="glass-panel" style={{ padding: '0.6rem 0.85rem', background: 'rgba(255, 255, 255, 0.01)' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>{t('holdings.col_shares', 'Shares')}</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    {holdingDetails.shares.toFixed(4).replace(/\.?0+$/, '')}
                  </span>
                </div>
                <div className="glass-panel" style={{ padding: '0.6rem 0.85rem', background: 'rgba(255, 255, 255, 0.01)' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>{t('holdings.col_avg_cost', 'Avg Cost')}</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    {formatFinancialValue(holdingDetails.avg_cost_local, holdingDetails.currency)}
                  </span>
                </div>
                <div className="glass-panel" style={{ padding: '0.6rem 0.85rem', background: 'rgba(255, 255, 255, 0.01)' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>{t('holdings.col_price', 'Market Price')}</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                    {formatFinancialValue(holdingDetails.current_price_local, holdingDetails.currency)}
                  </span>
                </div>
                <div className="glass-panel" style={{ padding: '0.6rem 0.85rem', background: 'rgba(255, 255, 255, 0.01)' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>{t('holdings.col_current', 'Current Value')}</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    {formatFinancialValue(holdingDetails.current_value_base, baseCurrency)}
                  </span>
                </div>
                <div className="glass-panel" style={{ padding: '0.6rem 0.85rem', background: 'rgba(255, 255, 255, 0.01)' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>{t('holdings.col_gain_loss', 'Gain/Loss')}</span>
                  <span style={{ 
                    fontSize: '1rem', 
                    fontWeight: 700, 
                    color: holdingDetails.gain_base >= 0 ? 'var(--color-green)' : 'var(--color-red)', 
                    fontFamily: 'monospace' 
                  }}>
                    {holdingDetails.gain_base >= 0 ? '+' : ''}{formatFinancialValue(holdingDetails.gain_base, baseCurrency)}
                  </span>
                </div>
              </div>
            )}

            {/* Price Chart Container */}
            <div className="glass-panel" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', background: 'rgba(0, 0, 0, 0.12)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                    {t('holdings.price_performance', 'Price Performance')} ({holdingDetails?.currency || 'USD'})
                  </span>
                  {!loadingDetails && selectedStockDetails && (() => {
                    if (!modalChartData || modalChartData.length < 2) return null;
                    const startPrice = modalChartData[0].price;
                    const endPrice = modalChartData[modalChartData.length - 1].price;
                    const changeVal = endPrice - startPrice;
                    const changePct = (changeVal / startPrice) * 100;
                    const isPositive = changeVal >= 0;
                    return (
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        color: isPositive ? 'var(--color-green)' : 'var(--color-red)',
                        background: isPositive ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        border: `1px solid ${isPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`,
                        marginLeft: '4px'
                      }}>
                        {isPositive ? '+' : ''}{changeVal.toFixed(2)} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%)
                      </span>
                    );
                  })()}
                </div>
                
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
                    plugins={modalChartPlugins}
                  />
                ) : (
                  <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {t('holdings.no_price_history', 'No price history available.')}
                  </div>
                )}
              </div>
            </div>

            {holdingDetails && (
              <div style={{ flexShrink: 0 }}>
                <FXHedgingVisualizer 
                  holding={holdingDetails} 
                  baseCurrency={baseCurrency} 
                />
              </div>
            )}

            {/* COMPANY KEY METRICS & ANNUAL FINANCIALS */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
              background: 'rgba(255, 255, 255, 0.015)',
              border: '1px solid var(--panel-border)',
              borderRadius: '12px',
              padding: '1.25rem',
              flexShrink: 0
            }}>
              {detailsError ? (
                <div style={{ color: 'var(--color-red)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
                  {detailsError}
                </div>
              ) : (!selectedStockDetails && !loadingDetails) ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem', fontSize: '0.85rem' }}>
                  {t('holdings.ticker_metadata_unavailable', 'Corporate metrics and financials are currently unavailable for this ticker.')}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                  
                  {/* Left sub-column: Key metrics table */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.4rem' }}>
                      {t('holdings.key_statistics', 'Key Statistics')}
                    </h4>
                    
                    {loadingDetails || !selectedStockDetails ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0' }}>
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className="pulse" style={{ height: '16px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px' }} />
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '0.3rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{t('holdings.trailing_pe', 'Trailing P/E')}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.trailing_pe ? selectedStockDetails.overview.trailing_pe.toFixed(2) : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '0.3rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{t('holdings.forward_pe', 'Forward P/E')}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.forward_pe ? selectedStockDetails.overview.forward_pe.toFixed(2) : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '0.3rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{t('holdings.peg_ratio', 'PEG Ratio')}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.peg_ratio ? selectedStockDetails.overview.peg_ratio.toFixed(2) : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '0.3rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{t('holdings.pb_ratio', 'P/B Ratio')}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.price_to_book ? selectedStockDetails.overview.price_to_book.toFixed(2) : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '0.3rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{t('holdings.profit_margin', 'Profit Margin')}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.profit_margin ? `${(selectedStockDetails.overview.profit_margin * 100).toFixed(2)}%` : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '0.3rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{t('holdings.roe', 'Return on Equity (ROE)')}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.roe ? `${(selectedStockDetails.overview.roe * 100).toFixed(2)}%` : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '0.3rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{t('holdings.div_yield', 'Dividend Yield')}</span>
                          <span style={{ fontWeight: 600, color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.dividend_yield ? `${(selectedStockDetails.overview.dividend_yield * 100).toFixed(2)}%` : '0.00%'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.1rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{t('holdings.beta', 'Beta (3Y Volatility)')}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {selectedStockDetails.overview?.beta ? selectedStockDetails.overview.beta.toFixed(2) : '—'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right sub-column: Annual Financials Chart */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.4rem' }}>
                      {t('holdings.annual_financials', 'Annual Financials')}
                    </h4>
                    
                    {loadingDetails || !selectedStockDetails ? (
                      <div style={{ height: '239px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(0, 0, 0, 0.1)', borderRadius: '8px' }} className="pulse">
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('holdings.loading_financials', 'Loading financials...')}</span>
                      </div>
                    ) : (!selectedStockDetails.financials || selectedStockDetails.financials.length === 0) ? (
                      <div style={{ height: '239px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(0, 0, 0, 0.1)', border: '1px solid var(--panel-border)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {t('holdings.no_financials_available', 'Annual balance sheet metrics are unavailable.')}
                      </div>
                    ) : (
                      <div style={{ height: '239px', position: 'relative', background: 'rgba(0, 0, 0, 0.12)', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '0.5rem' }}>
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

            {/* Transaction History Section Header & Search */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {t('holdings.transaction_ledger', 'Transaction Ledger')}
                </h4>
                {(transactions.filter(tx => tx.symbol.toUpperCase() === selectedPositionSymbol.toUpperCase()).length > 0 || modalSearchQuery) && (
                  <div className="search-container" style={{ 
                    width: '100%', 
                    maxWidth: '260px', 
                    background: 'rgba(10, 15, 28, 0.75)', 
                    border: '1px solid rgba(6, 182, 212, 0.3)', 
                    borderRadius: '8px', 
                    height: '34px',
                    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    <Search size={14} className="search-icon" style={{ left: '0.75rem', color: 'var(--color-primary)' }} />
                    <input
                      type="text"
                      className="search-input"
                      placeholder={t('ledger.search_placeholder', 'Search transactions...')}
                      value={modalSearchQuery}
                      onChange={(e) => setModalSearchQuery(e.target.value)}
                      style={{ 
                        paddingLeft: '2.2rem', 
                        paddingRight: modalSearchQuery ? '2rem' : '0.75rem', 
                        fontSize: '0.8rem', 
                        color: '#ffffff',
                        background: 'transparent',
                        border: 'none',
                        width: '100%',
                        height: '100%',
                        outline: 'none'
                      }}
                    />
                    {modalSearchQuery && (
                      <button 
                        className="search-clear-btn" 
                        onClick={() => setModalSearchQuery('')}
                        style={{ right: '0.6rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {positionTransactionsFilteredAndSorted.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0', margin: 0, flexShrink: 0 }}>
                  {t('holdings.no_tx_found_for', 'No transactions found for')} {selectedPositionSymbol}.
                </p>
              ) : (
                <div style={{ 
                  maxHeight: '320px', 
                  overflowY: 'auto',
                  border: '1px solid var(--panel-border)',
                  borderRadius: '10px',
                  background: 'rgba(0, 0, 0, 0.15)',
                  flexShrink: 0
                }}>
                  <table className="screener-table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255, 255, 255, 0.01)' }}>
                        <th onClick={() => handleModalSort('date')} style={{ cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, backgroundColor: '#0d1322', zIndex: 10 }}>
                          {t('ledger.col_date', 'Date')} {renderModalSortArrow('date')}
                        </th>
                        <th onClick={() => handleModalSort('type')} style={{ cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, backgroundColor: '#0d1322', zIndex: 10 }}>
                          {t('ledger.col_type', 'Type')} {renderModalSortArrow('type')}
                        </th>
                        <th onClick={() => handleModalSort('shares')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, backgroundColor: '#0d1322', zIndex: 10 }}>
                          {t('ledger.col_shares', 'Shares')} {renderModalSortArrow('shares')}
                        </th>
                        <th onClick={() => handleModalSort('price')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, backgroundColor: '#0d1322', zIndex: 10 }}>
                          {t('ledger.col_price', 'Price')} {renderModalSortArrow('price')}
                        </th>
                        <th onClick={() => handleModalSort('fees')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, backgroundColor: '#0d1322', zIndex: 10 }}>
                          {t('ledger.col_fees', 'Fees')} {renderModalSortArrow('fees')}
                        </th>
                        <th onClick={() => handleModalSort('total')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, backgroundColor: '#0d1322', zIndex: 10 }}>
                          {t('ledger.col_value', 'Total')} {renderModalSortArrow('total')}
                        </th>
                        <th onClick={() => handleModalSort('return')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, backgroundColor: '#0d1322', zIndex: 10 }}>
                          {t('ledger.col_return', 'Return')} {renderModalSortArrow('return')}
                        </th>
                        {activePortfolioRole !== 'viewer' && <th style={{ textAlign: 'center', position: 'sticky', top: 0, backgroundColor: '#0d1322', zIndex: 10 }}>{t('ledger.col_actions', 'Actions')}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {positionTransactionsFilteredAndSorted.map((tx) => {
                        const totalLocal = (tx.shares * tx.price) + (tx.type === 'BUY' ? tx.fees : -tx.fees);
                        const gainPct = (tx as any).gainPct;
                        return (
                          <tr key={tx.id} className="interactive-row-modal">
                            <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                              {tx.date}
                            </td>
                            <td>
                              <span style={{ 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                fontSize: '0.72rem', 
                                fontWeight: 700,
                                background: tx.type === 'BUY' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                                color: tx.type === 'BUY' ? 'var(--color-green)' : 'var(--color-red)'
                              }}>
                                {tx.type === 'BUY' ? t('ledger.type_buy', 'BUY') : t('ledger.type_sell', 'SELL')}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                              {tx.shares.toFixed(4).replace(/\.?0+$/, '')}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                              {formatFinancialValue(tx.price, tx.currency)}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                              {tx.fees > 0 ? formatFinancialValue(tx.fees, tx.currency) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {formatFinancialValue(totalLocal, tx.currency)}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                              {tx.type === 'BUY' && gainPct !== undefined && !isNaN(gainPct) ? (
                                <span style={{
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  background: gainPct >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                  color: gainPct >= 0 ? '#10b981' : '#ef4444',
                                  border: gainPct >= 0 ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)'
                                }}>
                                  {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                              )}
                            </td>
                            {activePortfolioRole !== 'viewer' && (
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                                  <button 
                                    onClick={() => {
                                      setSelectedPositionSymbol(null);
                                      onStartEditTransaction(tx);
                                    }}
                                    className="ledger-delete-btn"
                                    style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '4px', borderRadius: '4px' }}
                                    title={t('modals.add_tx.edit_title', 'Edit Transaction')}
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button 
                                    onClick={() => onDeleteTransaction(tx.id)}
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem', flexShrink: 0 }}>
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
      </div>
    </>
  );
}
