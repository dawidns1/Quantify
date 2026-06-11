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
      transitions: {
        active: {
          animation: {
            duration: 0 // Disable active hover transition animation for instant snap
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { 
            color: 'rgba(255, 255, 255, 0.85)', 
            font: { family: 'Outfit', size: 10, weight: 'normal' as const } 
          }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.12)' },
          ticks: { 
            color: 'rgba(255, 255, 255, 0.85)', 
            font: { family: 'Outfit', size: 10, weight: 'normal' as const } 
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          labels: { 
            color: 'rgba(255, 255, 255, 0.95)', 
            font: { family: 'Outfit', size: 11, weight: 'bold' as const }, 
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
          borderColor: 'rgba(255, 255, 255, 0.18)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          titleFont: { family: 'Outfit', size: 12, weight: 'bold' as const },
          bodyFont: { family: 'Outfit', size: 12 },
          animation: {
            duration: 0 // Disable tooltip animation for instant snapping
          }
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
          backgroundColor: 'rgba(6, 182, 212, 0.06)',
          borderColor: '#06b6d4', // Premium glowing cyan
          borderWidth: 2,
          pointRadius: 0, // Set to 0 to prevent initial draw lag
          pointHoverRadius: 4,
          pointHitRadius: 10, // Increase interaction hit area
          tension: 0.15
        },
        {
          label: 'Invested Capital (Cost Basis)',
          data: chartData.cost_basis,
          fill: false,
          borderColor: 'rgba(255, 255, 255, 0.85)', // Brighter dashed white line
          borderWidth: 1.5,
          borderDash: [5, 5],
          pointRadius: 0, // Set to 0 to prevent initial draw lag
          pointHoverRadius: 3,
          pointHitRadius: 8, // Increase interaction hit area
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
                padding: '0.2rem 0.55rem',
                color: 'var(--text-secondary)',
                fontSize: '0.7rem',
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
        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)' }}>
          Showing NAV vs. Total Cost Basis in {baseCurrency} (Scroll to Zoom, Drag to Pan)
        </span>
      </div>
      <div style={{ height: '220px', position: 'relative' }}>
        {loadingChart && !chartDataFormatted ? (
          <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'rgba(255,255,255,0.6)' }} className="pulse">
            Computing historical performance data...
          </div>
        ) : chartDataFormatted ? (
          <>
            <Line 
              ref={chartRef}
              options={chartOptions}
              data={chartDataFormatted}
            />
            {loadingChart && (
              <div style={{
                position: 'absolute',
                top: '0.5rem',
                right: '0.5rem',
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                padding: '0.25rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.7rem',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                pointerEvents: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
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
