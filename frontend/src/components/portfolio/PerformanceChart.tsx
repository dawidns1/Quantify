import { useMemo, useRef } from 'react';
import { Activity } from 'lucide-react';
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
import zoomPlugin from 'chartjs-plugin-zoom';

// Register ChartJS elements
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin
);

interface PerformanceChartProps {
  chartData: { dates: string[]; nav: number[]; cost_basis: number[] } | null;
  loadingChart: boolean;
  baseCurrency: string;
}

export function PerformanceChart({
  chartData,
  loadingChart,
  baseCurrency
}: PerformanceChartProps) {
  const chartRef = useRef<any>(null);

  // Memoized Chart Options to prevent redraw flickering & enable zoom/pan
  const chartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 250 // smooth, fast animation when toggled or updated
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: 'rgba(255, 255, 255, 0.4)', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: 'rgba(255, 255, 255, 0.4)', font: { size: 10 } }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          labels: { color: 'rgba(255, 255, 255, 0.7)', font: { size: 11 }, boxWidth: 12, padding: 10 }
        },
        tooltip: {
          mode: 'index' as const,
          intersect: false,
          backgroundColor: 'rgba(13, 17, 28, 0.95)',
          titleColor: 'var(--text-primary)',
          bodyColor: 'var(--text-secondary)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 6
        },
        zoom: {
          zoom: {
            wheel: {
              enabled: true
            },
            pinch: {
              enabled: true
            },
            mode: 'x' as const
          },
          pan: {
            enabled: true,
            mode: 'x' as const
          }
        }
      }
    };
  }, []);

  // Memoized Chart Data
  const chartDataFormatted = useMemo(() => {
    if (!chartData || !chartData.dates || chartData.dates.length === 0) return null;
    return {
      labels: chartData.dates,
      datasets: [
        {
          label: 'Net Asset Value (NAV)',
          data: chartData.nav,
          fill: true,
          backgroundColor: 'rgba(6, 182, 212, 0.08)',
          borderColor: 'var(--color-primary)',
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
          tension: 0.15
        },
        {
          label: 'Invested Capital (Cost Basis)',
          data: chartData.cost_basis,
          fill: false,
          borderColor: 'rgba(255, 255, 255, 0.35)',
          borderWidth: 1.5,
          borderDash: [5, 5],
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.05
        }
      ]
    };
  }, [chartData]);

  if (!loadingChart && (!chartData || !chartData.dates || chartData.dates.length === 0)) {
    return null;
  }

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Activity size={16} className="gradient-text" /> Portfolio Performance History
          {!loadingChart && chartDataFormatted && (
            <button
              onClick={() => chartRef.current?.resetZoom()}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '4px',
                padding: '0.15rem 0.45rem',
                color: 'var(--text-secondary)',
                fontSize: '0.65rem',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)',
                marginLeft: '0.5rem',
                fontWeight: 600
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              Reset Zoom
            </button>
          )}
        </h4>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Showing NAV vs. Total Cost Basis in {baseCurrency} (Scroll to Zoom, Drag to Pan)
        </span>
      </div>
      <div style={{ height: '220px', position: 'relative' }}>
        {loadingChart ? (
          <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }} className="pulse">
            Computing historical performance data...
          </div>
        ) : chartDataFormatted ? (
          <Line 
            ref={chartRef}
            options={chartOptions}
            data={chartDataFormatted}
          />
        ) : null}
      </div>
    </div>
  );
}
