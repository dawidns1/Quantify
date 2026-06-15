import { useState, useMemo } from 'react';
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

interface PerformanceChartProps {
  chartData: { dates: string[]; nav: number[]; cost_basis: number[] } | null;
  loadingChart: boolean;
  baseCurrency: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onClose?: () => void;
}

export function PerformanceChart({
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

  // Memoized Chart Options
  const chartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 200 // fast, responsive duration
      },
      transitions: {
        active: {
          animation: {
            duration: 0 // snap tooltips instantly
          }
        }
      },
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
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          ticks: { 
            color: 'rgba(255, 255, 255, 0.75)', 
            font: { family: 'Outfit', size: 9 } 
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          labels: { 
            color: 'rgba(255, 255, 255, 0.9)', 
            font: { family: 'Outfit', size: 10, weight: 'bold' as const }, 
            boxWidth: 15, 
            usePointStyle: true,
            pointStyle: 'line',
            padding: 8
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
          padding: 10,
          cornerRadius: 6,
          titleFont: { family: 'Outfit', size: 11, weight: 'bold' as const },
          bodyFont: { family: 'Outfit', size: 11 },
          animation: {
            duration: 0
          }
        }
      }
    };
  }, []);

  // Memoized Chart Data
  const chartDataFormatted = useMemo(() => {
    if (!filteredData || !filteredData.dates || filteredData.dates.length === 0) return null;
    return {
      labels: filteredData.dates,
      datasets: [
        {
          label: 'NAV',
          data: filteredData.nav,
          fill: true,
          backgroundColor: 'rgba(6, 182, 212, 0.04)',
          borderColor: '#06b6d4', // Glowing cyan
          borderWidth: 1.75,
          pointRadius: 0, 
          pointHoverRadius: 4,
          pointHitRadius: 10,
          tension: 0.15
        },
        {
          label: 'Cost Basis',
          data: filteredData.cost_basis,
          fill: false,
          borderColor: 'rgba(255, 255, 255, 0.65)',
          borderWidth: 1.25,
          borderDash: [4, 4],
          pointRadius: 0,
          pointHoverRadius: 3,
          pointHitRadius: 8,
          tension: 0.05
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Activity size={14} className="gradient-text" /> Performance ({baseCurrency})
        </h4>
        
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
}
