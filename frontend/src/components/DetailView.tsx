import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, TrendingUp, DollarSign, BarChart2, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

interface MetricCardProps {
  label: string;
  value: string | number | null;
  suffix?: string;
  icon: React.ReactNode;
  color?: string;
  sub?: string;
  comparison?: React.ReactNode;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, suffix = '', icon, color = 'var(--color-primary)', sub, comparison }) => {
  const displayVal = value !== null && value !== undefined 
    ? (typeof value === 'number' ? value.toFixed(2) : value) + suffix
    : 'N/A';

  return (
    <div className="metric-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="lbl">{label}</span>
        <div style={{ color }}>{icon}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem' }}>
        <span className="val" style={{ color: value === null ? 'var(--text-muted)' : 'var(--text-primary)' }}>
          {displayVal}
        </span>
        {sub && <span className="sub">{sub}</span>}
      </div>
      {comparison && <div className="peer-comparison-container">{comparison}</div>}
    </div>
  );
};

const ensureYYYYMMDD = (val: any): string => {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) {
    return String(val);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const SCALE_GROUPS: Record<string, string> = {
  price: 'USD',
  sma_50: 'USD',
  sma_200: 'USD',
  ps: 'PS',
  forward_ps: 'PS',
  pe: 'PE',
  psg: 'PSG',
  forward_psg: 'PSG'
};

interface ChartConfig {
  leftGroup: string | null;
  rightGroup: string | null;
  curves: string[];
}

const buildChartLayout = (selectedCurves: string[]): ChartConfig[] => {
  const charts: ChartConfig[] = [];

  selectedCurves.forEach((curveId) => {
    const group = SCALE_GROUPS[curveId];
    if (!group) return;

    // 1. Try to find a chart where this group is already mapped to one of the axes
    let placed = false;
    for (const chart of charts) {
      if (chart.leftGroup === group || chart.rightGroup === group) {
        chart.curves.push(curveId);
        placed = true;
        break;
      }
    }

    if (placed) return;

    // 2. Try to find a chart with a free axis
    for (const chart of charts) {
      if (chart.leftGroup === null) {
        chart.leftGroup = group;
        chart.curves.push(curveId);
        placed = true;
        break;
      } else if (chart.rightGroup === null) {
        chart.rightGroup = group;
        chart.curves.push(curveId);
        placed = true;
        break;
      }
    }

    if (placed) return;

    // 3. Create a new chart
    charts.push({
      leftGroup: group,
      rightGroup: null,
      curves: [curveId]
    });
  });

  return charts;
};

interface DetailViewProps {
  ticker: string;
  onClose: () => void;
  apiBaseUrl: string;
  defaultTimeframe?: '1Y' | '2Y' | '3Y';
  stocks?: any[];
}

export const DetailView: React.FC<DetailViewProps> = ({ ticker, onClose, apiBaseUrl, defaultTimeframe, stocks = [] }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const getCategoryLabel = (cat: string) => {
    switch(cat) {
      case 'Price & Technicals': return t('detail.categoryPriceTechnicals', 'Price & Technicals');
      case 'Valuation Multiples': return t('detail.categoryValuationMultiples', 'Valuation Multiples');
      case 'Growth-Adjusted (PSSG)': return t('detail.categoryGrowthAdjusted', 'Growth-Adjusted (PSSG)');
      default: return cat;
    }
  };

  const getCurveName = (id: string) => {
    switch(id) {
      case 'price': 
        return t('detail.curveSharePrice', 'Share Price ({{symbol}})', { symbol: currency === 'PLN' ? 'zł' : (currency === 'EUR' ? '€' : '$') });
      case 'sma_50': return t('detail.curveSMA50', '50-Day SMA ($)');
      case 'sma_200': return t('detail.curveSMA200', '200-Day SMA ($)');
      case 'ps': return t('detail.curveTrailingPS', 'Trailing P/S');
      case 'forward_ps': return t('detail.curveForwardPS', 'Forward P/S (Daily)');
      case 'pe': return t('detail.curveTrailingPE', 'Trailing P/E');
      case 'psg': return t('detail.curveTrailingPSG', 'Trailing PSSG');
      case 'forward_psg': return t('detail.curveForwardPSG', 'Forward PSSG (Daily)');
      default: return id;
    }
  };
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'1Y' | '2Y' | '3Y'>(() => {
    return defaultTimeframe || '2Y';
  });
  
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [priceTrend, setPriceTrend] = useState<'up' | 'down' | null>(null);
  const [isMarketOpen, setIsMarketOpen] = useState<boolean>(false);
  const [currency, setCurrency] = useState<string>('USD');
  
  // Active curves (persistent in localStorage)
  const [selectedCurves, setSelectedCurves] = useState<string[]>(() => {
    const cached = localStorage.getItem('detail_selected_curves');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error('Error parsing detail_selected_curves', e);
      }
    }
    return ['price', 'ps', 'pe']; // default curves
  });

  const curveDefinitions = useMemo(() => [
    {
      id: 'price',
      name: `Share Price (${currency === 'PLN' ? 'zł' : (currency === 'EUR' ? '€' : '$')})`,
      category: 'Price & Technicals',
      axis: 'y', // left
      color: 'hsl(217, 91%, 60%)',
      borderColor: 'hsl(217, 91%, 60%)',
      backgroundColor: 'rgba(59, 130, 246, 0.04)',
      fill: true,
      borderWidth: 2.5,
      borderDash: [],
    },
    {
      id: 'sma_50',
      name: '50-Day SMA ($)',
      category: 'Price & Technicals',
      axis: 'y', // left
      color: 'hsl(197, 90%, 55%)',
      borderColor: 'hsl(197, 90%, 55%)',
      backgroundColor: 'transparent',
      fill: false,
      borderWidth: 1.5,
      borderDash: [4, 4],
    },
    {
      id: 'sma_200',
      name: '200-Day SMA ($)',
      category: 'Price & Technicals',
      axis: 'y', // left
      color: 'hsl(325, 90%, 65%)',
      borderColor: 'hsl(325, 90%, 65%)',
      backgroundColor: 'transparent',
      fill: false,
      borderWidth: 1.5,
      borderDash: [6, 4],
    },
    {
      id: 'ps',
      name: 'Trailing P/S',
      category: 'Valuation Multiples',
      axis: 'y1', // right
      color: 'hsl(32, 95%, 55%)',
      borderColor: 'hsl(32, 95%, 55%)',
      backgroundColor: 'transparent',
      fill: false,
      borderWidth: 2,
      borderDash: [],
    },
    {
      id: 'forward_ps',
      name: 'Forward P/S (Daily)',
      category: 'Valuation Multiples',
      axis: 'y1', // right
      color: 'hsl(47, 95%, 60%)',
      borderColor: 'hsl(47, 95%, 60%)',
      backgroundColor: 'transparent',
      fill: false,
      borderWidth: 2,
      borderDash: [5, 4],
    },
    {
      id: 'pe',
      name: 'Trailing P/E',
      category: 'Valuation Multiples',
      axis: 'y1', // right
      color: 'hsl(350, 70%, 50%)',
      borderColor: 'hsl(350, 70%, 50%)',
      backgroundColor: 'transparent',
      fill: false,
      borderWidth: 2,
      borderDash: [],
    },
    {
      id: 'psg',
      name: 'Trailing PSSG',
      category: 'Growth-Adjusted (PSSG)',
      axis: 'y1', // right
      color: 'hsl(142, 70%, 45%)',
      borderColor: 'hsl(142, 70%, 45%)',
      backgroundColor: 'transparent',
      fill: false,
      borderWidth: 2,
      borderDash: [],
    },
    {
      id: 'forward_psg',
      name: 'Forward PSSG (Daily)',
      category: 'Growth-Adjusted (PSSG)',
      axis: 'y1', // right
      color: 'hsl(263, 90%, 65%)',
      borderColor: 'hsl(263, 90%, 65%)',
      backgroundColor: 'transparent',
      fill: false,
      borderWidth: 2,
      borderDash: [5, 4],
    },
  ], []);

  const toggleCurve = (id: string) => {
    setSelectedCurves(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('detail_selected_curves', JSON.stringify(next));
      return next;
    });
  };

  const groupedCurves = useMemo(() => {
    const groups: Record<string, typeof curveDefinitions> = {};
    curveDefinitions.forEach(c => {
      if (!groups[c.category]) {
        groups[c.category] = [];
      }
      groups[c.category].push(c);
    });
    return groups;
  }, [curveDefinitions]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${apiBaseUrl}/api/stocks/${ticker}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(t('detail.errorLoadFailed', 'Failed to load details for {{ticker}}', { ticker }));
        }
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [ticker, apiBaseUrl]);

  useEffect(() => {
    if (data?.overview?.price) {
      setLivePrice(data.overview.price);
    }
  }, [data]);

  useEffect(() => {
    if (!ticker) return;

    let intervalId: any = null;

    const fetchLivePrice = () => {
      fetch(`${apiBaseUrl}/api/stocks/${ticker}/price`)
        .then((res) => {
          if (!res.ok) throw new Error("Price fetch failed");
          return res.json();
        })
        .then((priceData) => {
          const newPrice = priceData.price;
          setIsMarketOpen(priceData.is_market_open);
          if (priceData.currency) {
            setCurrency(priceData.currency);
          }

          if (newPrice !== null && newPrice !== undefined) {
            setLivePrice((prevPrice) => {
              if (prevPrice !== null) {
                if (newPrice > prevPrice) {
                  setPriceTrend('up');
                  setTimeout(() => setPriceTrend(null), 1000);
                } else if (newPrice < prevPrice) {
                  setPriceTrend('down');
                  setTimeout(() => setPriceTrend(null), 1000);
                }
              }
              return newPrice;
            });
          }

          // If market is open, set up the interval if not already set
          if (priceData.is_market_open && !intervalId) {
            intervalId = setInterval(fetchLivePrice, 5000);
          } else if (!priceData.is_market_open && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        })
        .catch((err) => console.error("Error polling live price:", err));
    };

    // Initial fetch
    fetchLivePrice();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [ticker, apiBaseUrl]);

  const overview = data?.overview || {};
  const history = data?.history || [];

  // Calculate sector medians
  const peerStocks = useMemo(() => {
    if (!stocks || stocks.length === 0 || !overview.sector) return [];
    return stocks.filter((s: any) => s.sector === overview.sector);
  }, [stocks, overview.sector]);

  const calculateMedian = (values: number[]): number | null => {
    if (!values || values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const half = Math.floor(sorted.length / 2);
    if (sorted.length % 2 !== 0) {
      return sorted[half];
    }
    return (sorted[half - 1] + sorted[half]) / 2.0;
  };

  const sectorMedians = useMemo(() => {
    if (peerStocks.length === 0) return null;
    
    const pes = peerStocks
      .map((s: any) => s.trailing_pe)
      .filter((v: any) => v !== null && v !== undefined && typeof v === 'number' && v > 0);
      
    const pss = peerStocks
      .map((s: any) => s.trailing_ps)
      .filter((v: any) => v !== null && v !== undefined && typeof v === 'number' && v > 0);
      
    const psgs = peerStocks
      .map((s: any) => s.psg_1y)
      .filter((v: any) => v !== null && v !== undefined && typeof v === 'number' && v > 0);
      
    return {
      pe: calculateMedian(pes),
      ps: calculateMedian(pss),
      psg: calculateMedian(psgs),
      count: peerStocks.length
    };
  }, [peerStocks, overview.sector]);

  const renderPeerComparison = (currentVal: number | null, medianVal: number | null | undefined, suffix: string = '') => {
    if (currentVal === null || currentVal === undefined || medianVal === null || medianVal === undefined || medianVal === 0) {
      return null;
    }
    const diff = ((currentVal - medianVal) / medianVal) * 100;
    const absDiff = Math.abs(diff);
    
    if (diff < -0.5) {
      return (
        <div className="peer-comparison discount">
          <span>{t('detail.discountText', 'Trades at a {{diff}}% discount to peer median ({{median}}{{suffix}})', { diff: absDiff.toFixed(1), median: medianVal.toFixed(2), suffix })}</span>
        </div>
      );
    } else if (diff > 0.5) {
      return (
        <div className="peer-comparison premium">
          <span>{t('detail.premiumText', 'Trades at a {{diff}}% premium to peer median ({{median}}{{suffix}})', { diff: diff.toFixed(1), median: medianVal.toFixed(2), suffix })}</span>
        </div>
      );
    } else {
      return (
        <div className="peer-comparison neutral">
          <span>{t('detail.alignedText', 'Aligned with peer median ({{median}}{{suffix}})', { median: medianVal.toFixed(2), suffix })}</span>
        </div>
      );
    }
  };

  const filteredHistory = useMemo(() => {
    if (timeframe === '1Y') {
      return history.slice(-252);
    } else if (timeframe === '2Y') {
      return history.slice(-504);
    }
    return history;
  }, [history, timeframe]);

  const labels = useMemo(() => filteredHistory.map((h: any) => ensureYYYYMMDD(h.date)), [filteredHistory]);

  // Calculate charts layout dynamically
  const chartsLayout = useMemo(() => buildChartLayout(selectedCurves), [selectedCurves]);

  // Helper to build data and options for a specific chart config
  const getChartDataAndOptions = (chartConfig: ChartConfig, filteredHistory: any[], labels: string[]) => {
    const datasets = curveDefinitions
      .filter(c => chartConfig.curves.includes(c.id))
      .map(c => {
        const group = SCALE_GROUPS[c.id];
        const axisId = group === chartConfig.leftGroup ? 'y' : 'y1';
        return {
          label: getCurveName(c.id),
          data: filteredHistory.map((h: any) => h[c.id]),
          borderColor: c.borderColor,
          backgroundColor: c.backgroundColor,
          fill: c.fill,
          tension: 0.15,
          borderWidth: c.borderWidth,
          borderDash: c.borderDash,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHitRadius: 10, // Increase hit area for easier mouse snapping
          yAxisID: axisId,
          spanGaps: true,
        };
      });

    const hasLeft = chartConfig.leftGroup !== null;
    const hasRight = chartConfig.rightGroup !== null;

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 150
      },
      transitions: {
        active: {
          animation: {
            duration: 0 // Disable hover active state animations for zero lag
          }
        }
      },
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      layout: {
        padding: { left: 5, right: 15, top: 15, bottom: 5 }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          ticks: {
            color: 'rgba(255, 255, 255, 0.7)',
            font: { family: 'Outfit', size: 10 },
            maxTicksLimit: 12,
          }
        },
        y: {
          display: hasLeft,
          position: 'left' as const,
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          ticks: {
            color: 'rgba(255, 255, 255, 0.7)',
            font: { family: 'Outfit', size: 10 },
            callback: (val: any) => {
              if (chartConfig.leftGroup === 'USD') return `$${val.toFixed(0)}`;
              return val.toFixed(1);
            }
          },
          title: {
            display: true,
            text: chartConfig.leftGroup || '',
            color: 'rgba(255, 255, 255, 0.5)',
            font: { family: 'Outfit', size: 9, weight: 'bold' }
          }
        },
        y1: {
          display: hasRight,
          position: 'right' as const,
          grid: {
            drawOnChartArea: !hasLeft,
            color: 'rgba(255, 255, 255, 0.04)'
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.7)',
            font: { family: 'Outfit', size: 10 },
            callback: (val: any) => {
              if (chartConfig.rightGroup === 'USD') return `$${val.toFixed(0)}`;
              return val.toFixed(1);
            }
          },
          title: {
            display: true,
            text: chartConfig.rightGroup || '',
            color: 'rgba(255, 255, 255, 0.5)',
            font: { family: 'Outfit', size: 9, weight: 'bold' }
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          align: 'end' as const,
          labels: {
            color: 'rgba(255, 255, 255, 0.7)',
            font: { family: 'Outfit', size: 10 },
            usePointStyle: true,
            pointStyle: 'line',
            padding: 8
          }
        },
        tooltip: {
          backgroundColor: 'rgba(10, 14, 23, 0.98)',
          titleColor: '#ffffff',
          bodyColor: '#e5e7eb',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          borderWidth: 1,
          titleFont: { family: 'Outfit', weight: 'bold' as const },
          bodyFont: { family: 'Outfit' },
          padding: 10,
          boxPadding: 4,
          animation: {
            duration: 0 // Snap tooltip instantly
          },
          callbacks: {
            title: (context: any) => ensureYYYYMMDD(context[0].label),
            label: (context: any) => {
              const label = context.dataset.label || '';
              const value = context.parsed.y;
              if (value === null || value === undefined) return `${label}: N/A`;
              const isUSD = (context.dataset.yAxisID === 'y' && chartConfig.leftGroup === 'USD') ||
                            (context.dataset.yAxisID === 'y1' && chartConfig.rightGroup === 'USD');
              return `${label}: ${isUSD ? '$' : ''}${value.toFixed(2)}`;
            },
            labelTextColor: () => '#e5e7eb'
          }
        }
      }
    };

    return { data: { labels, datasets }, options };
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div className="pulse" style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          {t('detail.loadingHistorical', 'Loading historical dataset for {{ticker}}...', { ticker })}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-red)', marginBottom: '1rem' }}>{t('detail.errorMsg', 'Error: {{error}}', { error: error || t('detail.noDataFound', 'No data found') })}</p>
        <button className="glow-btn" onClick={onClose}>
          <ArrowLeft size={16} /> {t('detail.backToScreener', 'Back to Screener')}
        </button>
      </div>
    );
  }

  const formatMarketCap = (num: number | null) => {
    if (!num) return 'N/A';
    if (num >= 1e12) return (num / 1e12).toFixed(2) + ' T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + ' B';
    return (num / 1e6).toFixed(2) + ' M';
  };

  const formatPercent = (val: number | null) => {
    if (val === null || val === undefined) return null;
    return val * 100;
  };

  const getPSGColor = (val: number | null) => {
    if (val === null) return 'var(--text-muted)';
    if (val < 1.0) return 'var(--color-green)';
    if (val <= 1.5) return 'var(--text-secondary)';
    return 'var(--color-red)';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header section */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="glow-btn" style={{ padding: '0.5rem 1rem' }} onClick={onClose}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
              {overview.name} <span style={{ color: 'var(--color-primary)', fontSize: '1.3rem' }}>({overview.symbol})</span>
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.1rem' }}>
              {overview.sector ? `${overview.sector} • ${overview.industry}` : t('detail.nasdaqConstituent', 'NASDAQ 100 Constituent')}
            </p>
          </div>
        </div>
        
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {isMarketOpen ? (
              <span className="live-badge open" title={t('detail.marketSessionActive', 'Market Session Active')}>
                <span className="live-dot pulse"></span> {t('detail.liveSession', 'LIVE SESSION')}
              </span>
            ) : (
              <span className="live-badge closed" title={t('detail.marketSessionClosed', 'Market Session Closed')}>
                <span className="live-dot"></span> {t('detail.marketClosed', 'MARKET CLOSED')}
              </span>
            )}
            <span 
              style={{ 
                fontSize: '1.8rem', 
                fontWeight: 800, 
                transition: 'color 0.25s ease',
                color: priceTrend === 'up' ? 'var(--color-green)' : (priceTrend === 'down' ? 'var(--color-red)' : 'var(--text-primary)') 
              }}
            >
              {currency === 'PLN' ? '' : (currency === 'EUR' ? '€' : '$')}
              {livePrice !== null ? livePrice.toFixed(2) : (overview.price ? overview.price.toFixed(2) : 'N/A')}
              {currency === 'PLN' ? ' zł' : ''}
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('detail.currentPrice', 'Current Price')}</div>
        </div>
      </div>

      {/* Main detail layout */}
      <div className="detail-layout">
        {/* Sidebar metrics list */}
        <div className="side-panel">
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
              {t('detail.indicatorChecklist', 'Indicator Card Checklist')}
            </h3>
            
            <MetricCard 
              label={t('detail.marketCap', 'Market Cap')} 
              value={formatMarketCap(overview.market_cap)} 
              icon={<DollarSign size={18} />} 
              color="hsl(217, 91%, 60%)" 
            />
            <MetricCard 
              label={t('detail.trailingPS', 'Trailing P/S')} 
              value={overview.trailing_ps} 
              icon={<BarChart2 size={18} />} 
              color="hsl(32, 95%, 55%)"
              comparison={renderPeerComparison(overview.trailing_ps, sectorMedians?.ps, 'x')}
            />
            <MetricCard 
              label={t('detail.trailingPE', 'Trailing P/E')} 
              value={overview.trailing_pe} 
              icon={<BarChart2 size={18} />} 
              color="hsl(350, 70%, 50%)"
              comparison={renderPeerComparison(overview.trailing_pe, sectorMedians?.pe, 'x')}
            />
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <MetricCard 
                  label={t('detail.fwdPS1y', 'FWD P/S (1y)')} 
                  value={overview.forward_ps_1y} 
                  icon={<Activity size={14} />} 
                  color="var(--text-secondary)"
                />
                <MetricCard 
                  label={t('detail.revGrowth1y', 'Rev Growth (1y)')} 
                  value={formatPercent(overview.rev_growth_1y)} 
                  suffix="%" 
                  icon={<TrendingUp size={14} />} 
                  color={overview.rev_growth_1y && overview.rev_growth_1y > 0 ? 'var(--color-green)' : 'var(--color-red)'}
                />
                <MetricCard 
                  label={t('detail.pssgRatio1y', 'PSSG Ratio (1y)')} 
                  value={overview.psg_1y} 
                  icon={<Activity size={14} />} 
                  color={getPSGColor(overview.psg_1y)}
                  sub={overview.psg_1y ? (overview.psg_1y < 1.0 ? t('detail.undervalued', 'Undervalued') : t('detail.overvalued', 'Overvalued')) : undefined}
                  comparison={renderPeerComparison(overview.psg_1y, sectorMedians?.psg)}
                />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <MetricCard 
                  label={t('detail.fwdPS2y', 'FWD P/S (2y)')} 
                  value={overview.forward_ps_2y} 
                  icon={<Activity size={14} />} 
                  color="var(--text-secondary)"
                />
                <MetricCard 
                  label={t('detail.revGrowth2y', 'Rev Growth (2y)')} 
                  value={formatPercent(overview.rev_growth_2y)} 
                  suffix="%" 
                  icon={<TrendingUp size={14} />} 
                  color={overview.rev_growth_2y && overview.rev_growth_2y > 0 ? 'var(--color-green)' : 'var(--color-red)'}
                />
                <MetricCard 
                  label={t('detail.pssgRatio2y', 'PSSG Ratio (2y)')} 
                  value={overview.psg_2y} 
                  icon={<Activity size={14} />} 
                  color={getPSGColor(overview.psg_2y)}
                  sub={overview.psg_2y ? (overview.psg_2y < 1.0 ? t('detail.undervalued', 'Undervalued') : t('detail.overvalued', 'Overvalued')) : undefined}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Charts dashboard */}
        <div className="glass-panel charts-dashboard">
          <div className="chart-header">
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>{t('detail.interactiveDashboard', 'Interactive Valuation Dashboard')}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.1rem' }}>{t('detail.dashboardDesc', 'Overlay and align price history with multiples expansion/contraction curves')}</p>
            </div>
            
            <div className="time-toggles">
              <button className={timeframe === '1Y' ? 'active' : ''} onClick={() => setTimeframe('1Y')}>1Y</button>
              <button className={timeframe === '2Y' ? 'active' : ''} onClick={() => setTimeframe('2Y')}>2Y</button>
              <button className={timeframe === '3Y' ? 'active' : ''} onClick={() => setTimeframe('3Y')}>3Y</button>
            </div>
          </div>

          {/* Grouped Chart Curves Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--panel-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.4rem', marginBottom: '0.1rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t('detail.selectIndicators', 'Select Indicators to Chart')}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {t('detail.selectedIndicatorCount', '{{count}} selected', { count: selectedCurves.length })}
              </span>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '0.25rem' }}>
              {Object.entries(groupedCurves).map(([category, items]) => (
                <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {getCategoryLabel(category)}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {items.map(curve => {
                      const isActive = selectedCurves.includes(curve.id);
                      return (
                        <label 
                          key={curve.id}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem', 
                            fontSize: '0.8rem', 
                            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            userSelect: 'none'
                          }}
                        >
                          <input 
                            type="checkbox"
                            checked={isActive}
                            onChange={() => toggleCurve(curve.id)}
                            style={{ accentColor: curve.color }}
                          />
                          <span style={{ display: 'inline-block', width: '10px', height: '3px', background: curve.color, borderRadius: '1.5px' }}></span>
                          {getCurveName(curve.id)}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dynamic Unified Chart Canvases */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
            {chartsLayout.length > 0 ? (
              chartsLayout.map((chartConfig, idx) => {
                const { data: cData, options: cOptions } = getChartDataAndOptions(chartConfig, filteredHistory, labels);
                const chartHeight = chartsLayout.length === 1 ? '400px' : '280px';
                return (
                  <div key={idx} className="chart-container" style={{ height: chartHeight, width: '100%', position: 'relative', background: 'rgba(255,255,255,0.015)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1rem' }}>
                    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
                      <Line data={cData} options={cOptions as any} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', border: '1px dashed var(--panel-border)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                {t('detail.selectToPlot', 'Select one or more indicators above to plot.')}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            <Activity size={14} />
            <span>{t('detail.chartNote', 'Note: Metrics with different units are dynamically split into separate, independently scaled dual-axis charts.')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
