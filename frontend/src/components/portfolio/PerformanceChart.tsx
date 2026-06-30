import { useState, useMemo, useEffect, useRef, memo } from 'react';
import { Activity, ChevronUp, ChevronDown, X, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePortfolio } from '../../context/PortfolioContext';
import { searchAssets } from '../../services/calculationService';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register ChartJS elements
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Custom Chart.js plugin to draw vertical guide line on hover
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
      const strokeColor = dataset.borderColor || 'rgba(6, 182, 212, 0.4)';
      ctx.strokeStyle = typeof strokeColor === 'string' ? strokeColor : 'rgba(6, 182, 212, 0.4)';
      ctx.setLineDash([4, 4]); // dashed line
      ctx.stroke();
      ctx.restore();
    }
  }
};

// Register custom top positioner to place the tooltip cleanly at the top of the chart area
(Tooltip.positioners as any).top = function(this: any, items: any) {
  if (!items || items.length === 0) return false;
  const x = items[0].element.x;
  const chart = this.chart;
  const topY = chart.scales.y.top;
  
  const isRightHalf = x > chart.width / 2;
  const offset = 10;
  const tooltipX = isRightHalf ? x - offset : x + offset;
  const xAlign = isRightHalf ? 'right' : 'left';
  
  return {
    x: tooltipX,
    y: topY + 4,
    xAlign,
    yAlign: 'top'
  };
};

const performanceChartPlugins = [verticalLinePlugin];

interface PerformanceChartProps {
  chartData: { 
    dates: string[]; 
    nav: number[]; 
    cost_basis: number[]; 
    benchmarks?: Record<string, number[]> 
  } | null;
  loadingChart: boolean;
  baseCurrency: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onClose?: () => void;
  onRefresh?: () => void;
}

export const PerformanceChart = memo(function PerformanceChart({
  chartData,
  loadingChart,
  baseCurrency,
  onMoveUp,
  onMoveDown,
  onClose,
  onRefresh
}: PerformanceChartProps) {
  const { t } = useTranslation();
  const { apiBaseUrl, selectedAccount, fetchHistoricalPerformance } = usePortfolio();

  const [selectedRange, setSelectedRange] = useState<'1M' | '1Q' | '1Y' | '5Y' | 'MAX'>('1M');
  const [chartMode, setChartMode] = useState<'value' | 'percent'>('value');
  const [activeBenchmarks, setActiveBenchmarks] = useState<string[]>([]);
  
  // Custom benchmark search autocomplete
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch historical data with benchmarks when selections change
  useEffect(() => {
    fetchHistoricalPerformance(baseCurrency as any, selectedAccount, activeBenchmarks.join(','));
  }, [activeBenchmarks, baseCurrency, selectedAccount]);

  // Search query debounce
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      searchAssets(apiBaseUrl, searchQuery)
        .then(data => {
          setSearchSuggestions(data || []);
        })
        .catch(err => {
          console.error('Error fetching benchmark suggestions:', err);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, apiBaseUrl]);

  // Filter and slice chart data based on range
  const filteredData = useMemo(() => {
    if (!chartData || !chartData.dates || chartData.dates.length === 0) return null;
    if (selectedRange === 'MAX') return chartData;

    const latestDateStr = chartData.dates[chartData.dates.length - 1];
    const latestDate = new Date(latestDateStr);

    let cutoffDate = new Date(latestDate);
    if (selectedRange === '1M') {
      cutoffDate.setMonth(cutoffDate.getMonth() - 1);
    } else if (selectedRange === '1Q') {
      cutoffDate.setMonth(cutoffDate.getMonth() - 3);
    } else if (selectedRange === '1Y') {
      cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
    } else if (selectedRange === '5Y') {
      cutoffDate.setFullYear(cutoffDate.getFullYear() - 5);
    }

    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    const startIndex = chartData.dates.findIndex(d => d >= cutoffStr);

    if (startIndex === -1) return chartData;

    const slicedBenchmarks: Record<string, number[]> = {};
    const benchmarks = chartData.benchmarks;
    if (benchmarks) {
      Object.keys(benchmarks).forEach(sym => {
        const prices = benchmarks[sym];
        if (prices) {
          slicedBenchmarks[sym] = prices.slice(startIndex);
        }
      });
    }

    return {
      dates: chartData.dates.slice(startIndex),
      nav: chartData.nav.slice(startIndex),
      cost_basis: chartData.cost_basis.slice(startIndex),
      benchmarks: slicedBenchmarks
    };
  }, [chartData, selectedRange]);

  const performanceIndicator = useMemo(() => {
    if (!filteredData || !filteredData.nav || filteredData.nav.length < 2) return null;
    const startNAV = filteredData.nav[0];
    const endNAV = filteredData.nav[filteredData.nav.length - 1];
    const changeVal = endNAV - startNAV;
    const changePct = startNAV !== 0 ? (changeVal / startNAV) * 100 : 0;
    const isPositive = changeVal >= 0;
    return { changeVal, changePct, isPositive };
  }, [filteredData]);

  // Memoized Chart Options
  const chartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
      normalized: true as const,
      scales: {
        x: {
          grid: { display: false },
          ticks: { 
            color: 'rgba(255, 255, 255, 0.75)', 
            font: { family: 'Outfit', size: 9 },
            maxTicksLimit: 6
          }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { 
            color: 'rgba(255, 255, 255, 0.75)', 
            font: { family: 'Outfit', size: 9 },
            callback: function(value: any) {
              return chartMode === 'percent' ? `${value.toFixed(1)}%` : value.toLocaleString('en-US');
            }
          }
        }
      },
      hover: {
        mode: 'index' as const,
        intersect: false
      },
      plugins: {
        legend: { 
          display: chartMode === 'percent',
          position: 'top' as const,
          labels: {
            color: 'rgba(255, 255, 255, 0.7)',
            font: {
              family: 'Outfit, sans-serif',
              size: 11
            },
            boxHeight: 2, // Sleek line format instead of square box
            boxWidth: 16,
            padding: 10
          }
        },
        tooltip: {
          position: 'top' as any,
          caretSize: 0,
          backgroundColor: 'rgba(10, 15, 30, 0.95)',
          titleColor: 'white',
          titleFont: { family: 'Outfit', size: 11, weight: 'bold' as const },
          bodyColor: 'rgba(255, 255, 255, 0.85)',
          bodyFont: { family: 'Outfit', size: 10 },
          borderColor: 'rgba(6, 182, 212, 0.25)',
          borderWidth: 1,
          padding: 8,
          cornerRadius: 6,
          displayColors: true,
          mode: 'index' as const,
          intersect: false,
          callbacks: {
            label: function(context: any) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += chartMode === 'percent'
                  ? `${context.parsed.y.toFixed(2)}%`
                  : `${context.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${baseCurrency}`;
              }
              return label;
            }
          }
        }
      }
    };
  }, [chartMode, baseCurrency]);

  // Memoized Chart Data
  const chartDataFormatted = useMemo(() => {
    if (!filteredData) return null;

    if (chartMode === 'percent') {
      const getPortGainAt = (idx: number) => {
        const nav = filteredData.nav[idx];
        const cost = filteredData.cost_basis[idx];
        return cost > 0 ? ((nav - cost) / cost) * 100 : 0;
      };
      
      const portGainStart = getPortGainAt(0);
      const portfolioPercentData = filteredData.nav.map((_, i) => getPortGainAt(i) - portGainStart);

      const datasets = [
        {
          label: `Portfolio NAV (TWR)`,
          data: portfolioPercentData,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.03)',
          fill: true,
          tension: 0.15,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#06b6d4',
          pointHoverBorderWidth: 2
        }
      ];

      const benchmarkColors = ['#f59e0b', '#8b5cf6', '#10b981', '#ec4899', '#eab308'];
      if (filteredData.benchmarks) {
        Object.keys(filteredData.benchmarks).forEach((sym, idx) => {
          const prices = filteredData.benchmarks?.[sym] || [];
          if (prices.length > 0) {
            const startPrice = prices[0] || 1;
            const benchmarkPercentData = prices.map(p => ((p - startPrice) / startPrice) * 100);
            const color = benchmarkColors[idx % benchmarkColors.length];
            
            datasets.push({
              label: sym,
              data: benchmarkPercentData,
              borderColor: color,
              backgroundColor: 'transparent',
              fill: false,
              tension: 0.15,
              borderWidth: 1.5,
              pointRadius: 0,
              pointHoverRadius: 4,
              pointHoverBackgroundColor: '#ffffff',
              pointHoverBorderColor: color,
              pointHoverBorderWidth: 2
            } as any);
          }
        });
      }

      return {
        labels: filteredData.dates,
        datasets
      };
    } else {
      // Absolute Value Mode
      return {
        labels: filteredData.dates,
        datasets: [
          {
            label: 'NAV',
            data: filteredData.nav,
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.05)',
            fill: true,
            tension: 0.15,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: '#ffffff',
            pointHoverBorderColor: '#06b6d4',
            pointHoverBorderWidth: 2
          },
          {
            label: 'Cost Basis',
            data: filteredData.cost_basis,
            borderColor: 'rgba(239, 68, 68, 0.65)',
            borderDash: [4, 4],
            fill: false,
            tension: 0.1,
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: '#ffffff',
            pointHoverBorderColor: 'rgba(239, 68, 68, 0.85)',
            pointHoverBorderWidth: 2
          }
        ]
      };
    }
  }, [filteredData, chartMode, baseCurrency]);

  const toggleBenchmark = (sym: string) => {
    setActiveBenchmarks(prev => 
      prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
    );
  };

  const removeBenchmark = (sym: string) => {
    setActiveBenchmarks(prev => prev.filter(s => s !== sym));
  };

  if (!loadingChart && (!chartData || !chartData.dates || chartData.dates.length === 0)) {
    return null;
  }

  return (
    <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap', gap: '0.4rem', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Activity size={14} className="gradient-text" /> {t('dashboard.performance', 'Performance')} ({baseCurrency})
          </h4>
          {chartMode === 'value' && performanceIndicator && (
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              fontFamily: 'monospace',
              color: performanceIndicator.isPositive ? 'var(--color-green)' : 'var(--color-red)',
              background: performanceIndicator.isPositive ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              padding: '1px 6px',
              borderRadius: '4px',
              border: `1px solid ${performanceIndicator.isPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`,
              marginLeft: '4px'
            }}>
              {performanceIndicator.isPositive ? '+' : ''}{performanceIndicator.changeVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({performanceIndicator.isPositive ? '+' : ''}{performanceIndicator.changePct.toFixed(2)}%)
            </span>
          )}
        </div>
        
        {/* Widget Controls */}
        {(onMoveUp || onMoveDown || onClose || onRefresh) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {onRefresh && (
              <button 
                onClick={(e) => { e.stopPropagation(); onRefresh(); }} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', marginRight: '4px' }} 
                title={t('dashboard.refresh_card', 'Refresh Data')} 
                className={loadingChart ? 'spinner-ring' : ''}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-primary)'} 
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                <RefreshCw size={13} />
              </button>
            )}
            {onMoveUp && (
              <button 
                onClick={(e) => { e.stopPropagation(); onMoveUp(); }} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }} 
                title={t('dashboard.move_up', 'Move Up')} 
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'} 
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                <ChevronUp size={14} />
              </button>
            )}
            {onMoveDown && (
              <button 
                onClick={(e) => { e.stopPropagation(); onMoveDown(); }} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }} 
                title={t('dashboard.move_down', 'Move Down')} 
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'} 
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                <ChevronDown size={14} />
              </button>
            )}
            {onClose && (
              <button 
                onClick={(e) => { e.stopPropagation(); onClose(); }} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }} 
                title={t('dashboard.hide_card', 'Hide Card')} 
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-red)'} 
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Date Range Selection & Value Toggle Bar */}
      {chartData && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', margin: '0.1rem 0' }}>
          {/* Range pills */}
          <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '2px' }}>
            {(['1M', '1Q', '1Y', '5Y', 'MAX'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setSelectedRange(r)}
                style={{
                  background: selectedRange === r ? 'var(--color-primary)' : 'transparent',
                  color: selectedRange === r ? 'white' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '0.15rem 0.45rem',
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

          {/* Mode Toggle (Value vs % Return) */}
          <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '2px' }}>
            <button
              onClick={() => setChartMode('value')}
              style={{
                background: chartMode === 'value' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                color: chartMode === 'value' ? 'white' : 'var(--text-secondary)',
                border: 'none',
                padding: '0.15rem 0.45rem',
                fontSize: '0.65rem',
                fontWeight: 600,
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {t('chart.mode_value', 'Value')}
            </button>
            <button
              onClick={() => setChartMode('percent')}
              style={{
                background: chartMode === 'percent' ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                color: chartMode === 'percent' ? '#22d3ee' : 'var(--text-secondary)',
                border: 'none',
                padding: '0.15rem 0.45rem',
                fontSize: '0.65rem',
                fontWeight: 600,
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {t('chart.mode_percent', '% Return')}
            </button>
          </div>
        </div>
      )}

      
      
      {/* Chart Canvas Area */}
      <div style={{ height: '200px', position: 'relative' }}>
        {loadingChart && !chartDataFormatted ? (
          <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }} className="pulse">
            {t('dashboard.computing_performance', 'Computing performance...')}
          </div>
        ) : chartDataFormatted ? (
          <>
            <Line 
              options={chartOptions}
              data={chartDataFormatted}
              plugins={performanceChartPlugins}
            />
            {loadingChart && (
              <div 
                className="pulse"
                style={{
                  position: 'absolute',
                  top: '0.25rem',
                  right: '0.25rem',
                  fontSize: '0.65rem',
                  color: 'var(--color-primary)',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  background: 'rgba(15, 23, 42, 0.95)',
                  backdropFilter: 'blur(4px)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                  pointerEvents: 'none'
                }}
              >
                {t('dashboard.refetching', 'Refetching...')}
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Benchmark Selector Row (Only in % Return Mode, placed at the bottom to stabilize layout) */}
      {chartMode === 'percent' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '8px', padding: '0.5rem', position: 'relative', zIndex: 10, marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Compare Benchmarks:
            </span>
            
            {/* Quick Index Toggles */}
            <button
              onClick={() => toggleBenchmark('^GSPC')}
              style={{
                background: activeBenchmarks.includes('^GSPC') ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.02)',
                border: activeBenchmarks.includes('^GSPC') ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255,255,255,0.08)',
                color: activeBenchmarks.includes('^GSPC') ? '#fbbf24' : 'var(--text-secondary)',
                fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer'
              }}
            >
              S&P 500
            </button>

            <button
              onClick={() => toggleBenchmark('ACWI')}
              style={{
                background: activeBenchmarks.includes('ACWI') ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                border: activeBenchmarks.includes('ACWI') ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(255,255,255,0.08)',
                color: activeBenchmarks.includes('ACWI') ? '#a78bfa' : 'var(--text-secondary)',
                fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer'
              }}
            >
              MSCI World
            </button>

            {/* Custom search button toggle */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowSearch(!showSearch)}
                style={{
                  background: showSearch ? 'rgba(6, 182, 212, 0.1)' : 'transparent',
                  border: '1px dashed rgba(255,255,255,0.15)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '3px'
                }}
              >
                <Search size={10} /> Add Custom Ticker
              </button>

              {/* Autocomplete suggestions box */}
              {showSearch && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 200,
                  marginTop: '4px',
                  background: 'rgba(15, 23, 42, 0.98)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '6px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  padding: '4px',
                  width: '200px'
                }}>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search e.g. BTC-USD, AAPL"
                    style={{
                      width: '100%',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '4px',
                      padding: '4px 6px',
                      fontSize: '0.7rem',
                      color: 'white',
                      outline: 'none',
                      marginBottom: '4px'
                    }}
                  />
                  {searchSuggestions.length > 0 && (
                    <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                      {searchSuggestions.map((s, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            if (s.symbol && !activeBenchmarks.includes(s.symbol)) {
                              setActiveBenchmarks(prev => [...prev, s.symbol]);
                            }
                            setShowSearch(false);
                            setSearchQuery('');
                          }}
                          style={{
                            padding: '4px 6px',
                            fontSize: '0.65rem',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            borderRadius: '3px',
                            display: 'flex',
                            justifyContent: 'space-between'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ fontWeight: 700, color: 'white' }}>{s.symbol}</span>
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{s.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Render Active Custom Benchmarks list */}
          {activeBenchmarks.filter(s => s !== '^GSPC' && s !== 'ACWI').length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.1rem' }}>
              {activeBenchmarks.filter(s => s !== '^GSPC' && s !== 'ACWI').map((sym) => (
                <div
                  key={sym}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '4px',
                    padding: '1px 4px 1px 6px',
                    fontSize: '0.6rem',
                    color: 'white'
                  }}
                >
                  <span>{sym}</span>
                  <button
                    onClick={() => removeBenchmark(sym)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '1px', display: 'flex', alignItems: 'center' }}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
