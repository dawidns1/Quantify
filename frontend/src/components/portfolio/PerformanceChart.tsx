import { useState, useMemo, memo } from 'react';
import { Activity, ChevronUp, ChevronDown, X } from 'lucide-react';
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

// Register custom top positioner to place the tooltip cleanly at the top of the chart area and to the side of the vertical line
(Tooltip.positioners as any).top = function(this: any, items: any) {
  if (!items || items.length === 0) return false;
  const x = items[0].element.x;
  const chart = this.chart;
  const topY = chart.scales.y.top;
  
  // Offset to the left if in the right half of the chart, otherwise offset to the right
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
  chartData: { dates: string[]; nav: number[]; cost_basis: number[] } | null;
  loadingChart: boolean;
  baseCurrency: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onClose?: () => void;
}

export const PerformanceChart = memo(function PerformanceChart({
  chartData,
  loadingChart,
  baseCurrency,
  onMoveUp,
  onMoveDown,
  onClose
}: PerformanceChartProps) {
  const [selectedRange, setSelectedRange] = useState<'1M' | '1Q' | '1Y' | '5Y' | 'MAX'>('1M');

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

    return {
      dates: chartData.dates.slice(startIndex),
      nav: chartData.nav.slice(startIndex),
      cost_basis: chartData.cost_basis.slice(startIndex)
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
          intersect: false
        }
      }
    };
  }, []);

  // Memoized Chart Data
  const chartDataFormatted = useMemo(() => {
    if (!filteredData) return null;
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
  }, [filteredData]);

  if (!loadingChart && (!chartData || !chartData.dates || chartData.dates.length === 0)) {
    return null;
  }

  return (
    <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Activity size={14} className="gradient-text" /> Performance ({baseCurrency})
          </h4>
          {!loadingChart && performanceIndicator && (
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
        {(onMoveUp || onMoveDown || onClose) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {onMoveUp && (
              <button 
                onClick={(e) => { e.stopPropagation(); onMoveUp(); }} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }} 
                title="Move Up" 
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
                title="Move Down" 
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
                title="Hide Card" 
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-red)'} 
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Date range selection pills */}
      {!loadingChart && chartData && (
        <div style={{ display: 'flex', justifyContent: 'flex-start', margin: '0.1rem 0' }}>
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
        </div>
      )}
      
      <div style={{ height: '200px', position: 'relative' }}>
        {loadingChart && !chartDataFormatted ? (
          <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }} className="pulse">
            Computing performance...
          </div>
        ) : chartDataFormatted ? (
          <>
            <Line 
              options={chartOptions}
              data={chartDataFormatted}
              plugins={performanceChartPlugins}
            />
            {loadingChart && (
              <div style={{
                position: 'absolute',
                top: '0.25rem',
                right: '0.25rem',
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                padding: '0.2rem 0.45rem',
                borderRadius: '4px',
                fontSize: '0.65rem',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                pointerEvents: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                fontWeight: 600
              }} className="pulse">
                Refetching...
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
});
