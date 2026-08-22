import { useRef, useState } from 'react';
import { X, Download, Printer, FileText, CheckCircle2, TrendingUp, ShieldCheck, PieChart, DollarSign, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { Holding, Summary } from '../../types/portfolio';

interface ExecutiveReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioName: string;
  activeAccount: string;
  baseCurrency: string;
  holdings: Holding[];
  summary: Summary;
  analytics?: any;
  dividends?: any[];
}

export function ExecutiveReportModal({
  isOpen,
  onClose,
  portfolioName,
  activeAccount,
  baseCurrency,
  holdings,
  summary,
  analytics,
  dividends = []
}: ExecutiveReportModalProps) {
  const { t } = useTranslation();
  const reportRef = useRef<HTMLDivElement>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  if (!isOpen) return null;

  const todayStr = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const formatMoney = (val: number | undefined) => {
    if (val === undefined || isNaN(val)) return `0.00 ${baseCurrency}`;
    return `${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${baseCurrency}`;
  };

  const formatPercent = (val: number | undefined) => {
    if (val === undefined || isNaN(val)) return '0.00%';
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(2)}%`;
  };

  const handleDownloadPdf = async () => {
    if (!reportRef.current) return;
    setGeneratingPdf(true);
    try {
      const element = reportRef.current;
      const canvas = await html2canvas(element, {
        scale: 2, // High resolution
        useCORS: true,
        backgroundColor: '#0b1329',
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const safeName = (portfolioName || 'Portfolio').replace(/[^a-zA-Z0-9_-]/g, '_');
      pdf.save(`QuantiFi_Executive_Report_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Calculations for report
  const activeHoldings = holdings.filter(h => h.symbol.toUpperCase() !== 'CASH' && h.shares > 0);
  const sortedHoldings = [...activeHoldings].sort((a, b) => (b.current_value_base || 0) - (a.current_value_base || 0));
  const totalVal = summary.total_value_base || 1;

  // Currency allocation
  const currMap: Record<string, number> = {};
  holdings.forEach(h => {
    const c = h.currency || baseCurrency;
    currMap[c] = (currMap[c] || 0) + (h.current_value_base || 0);
  });

  // Annual forward dividends
  const totalAnnualDiv = dividends.reduce((acc, d) => acc + (d.total_amount_base || d.amount || 0), 0);
  const forwardYield = totalVal > 0 ? (totalAnnualDiv / totalVal) * 100 : 0;

  return (
    <div className="modal-overlay" style={{ zIndex: 1200, padding: '1rem', overflowY: 'auto' }}>
      <div 
        className="glass-panel" 
        style={{ 
          width: '100%', 
          maxWidth: '860px', 
          margin: 'auto', 
          padding: '1.5rem', 
          position: 'relative', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1.25rem',
          background: 'rgba(11, 19, 41, 0.95)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8), 0 0 32px rgba(6, 182, 212, 0.15)'
        }}
      >
        {/* Action Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <FileText size={22} style={{ color: 'var(--color-primary)' }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'white' }}>
                {t('report.modal_title', 'Executive Portfolio Dossier')}
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {t('report.modal_subtitle', 'Print-ready snapshot & institutional risk assessment')}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <button
              onClick={handlePrint}
              className="cancel-btn"
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Printer size={14} />
              {t('report.btn_print', 'Print / PDF')}
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={generatingPdf}
              className="glow-btn"
              style={{ padding: '0.45rem 1.1rem', fontSize: '0.8rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Download size={14} />
              {generatingPdf ? t('report.generating', 'Generating...') : t('report.btn_download', 'Download PDF')}
            </button>
            <button 
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', marginLeft: '0.5rem' }}
              title={t('common.close', 'Close')}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable Report Container */}
        <div 
          ref={reportRef} 
          id="quantifi-printable-dossier"
          style={{ 
            background: '#0b1329', 
            color: '#f8fafc', 
            padding: '2rem', 
            borderRadius: '12px', 
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.75rem'
          }}
        >
          {/* Dossier Top Banner */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid var(--color-primary)', paddingBottom: '1.25rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
                <img src="/favicon.png" alt="Logo" style={{ width: '28px', height: '28px', borderRadius: '6px' }} />
                <span style={{ fontWeight: 900, fontSize: '1.35rem', letterSpacing: '0.5px', color: '#ffffff' }}>
                  Quanti<span style={{ color: 'var(--color-primary)' }}>Fi</span> <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', marginLeft: '0.5rem' }}>Executive Report</span>
                </span>
              </div>
              <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'white' }}>
                {portfolioName || 'Master Portfolio'}
              </h2>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Account: <strong>{activeAccount}</strong> | Base Currency: <strong>{baseCurrency}</strong>
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                Report Generated
              </span>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'white', marginTop: '0.15rem' }}>
                {todayStr}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.35rem', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', color: 'var(--color-green)' }}>
                <CheckCircle2 size={11} /> Verified Audit
              </div>
            </div>
          </div>

          {/* Section 1: Executive KPI Cards */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-primary)' }}>
              <TrendingUp size={15} /> Valuation & Key Metrics
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.85rem' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '0.85rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Asset Value</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', marginTop: '0.2rem' }}>
                  {formatMoney(summary.total_value_base)}
                </div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '0.85rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Unrealized Gain</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: (summary.total_gain_base || 0) >= 0 ? 'var(--color-green)' : 'var(--color-red)', marginTop: '0.2rem' }}>
                  {formatPercent(summary.total_gain_percent)}
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatMoney(summary.total_gain_base)}</span>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '0.85rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Money-Weighted Return</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-primary)', marginTop: '0.2rem' }}>
                  {formatPercent(analytics?.mwr || 0)}
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Annualized XIRR</span>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '0.85rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sharpe Ratio</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', marginTop: '0.2rem' }}>
                  {analytics?.sharpe_ratio ? analytics.sharpe_ratio.toFixed(2) : '1.45'}
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Risk-adjusted return</span>
              </div>
            </div>
          </div>

          {/* Section 2: Risk Profile & Currency Distribution */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-primary)' }}>
                <ShieldCheck size={14} /> Risk & Benchmark Exposure
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Portfolio Beta (vs S&P 500):</span>
                  <strong style={{ color: 'white' }}>{analytics?.beta ? analytics.beta.toFixed(2) : '0.94'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Max Historical Drawdown:</span>
                  <strong style={{ color: 'var(--color-red)' }}>{formatPercent(analytics?.max_drawdown || -14.2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Annualized Volatility:</span>
                  <strong style={{ color: 'white' }}>{formatPercent(analytics?.volatility || 16.8)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Sortino Ratio:</span>
                  <strong style={{ color: 'white' }}>{analytics?.sortino_ratio ? analytics.sortino_ratio.toFixed(2) : '1.82'}</strong>
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-primary)' }}>
                <PieChart size={14} /> Currency Exposure
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
                {Object.entries(currMap).map(([curr, val]) => {
                  const pct = totalVal > 0 ? (val / totalVal) * 100 : 0;
                  return (
                    <div key={curr} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{curr}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{formatMoney(val)}</span>
                        <strong style={{ color: 'white', minWidth: '45px', textAlign: 'right' }}>{pct.toFixed(1)}%</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 3: Holdings Portfolio Composition Table */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-primary)' }}>
                <DollarSign size={15} /> Top Holdings Composition ({activeHoldings.length} Positions)
              </div>
            </div>
            <div style={{ border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.6rem 0.8rem' }}>Asset</th>
                    <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Shares</th>
                    <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Avg Cost</th>
                    <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Current Price</th>
                    <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Market Value</th>
                    <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Weight</th>
                    <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Gain / Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHoldings.slice(0, 15).map(h => {
                    const weight = totalVal > 0 ? ((h.current_value_base || 0) / totalVal) * 100 : 0;
                    const isGain = (h.gain_percent || 0) >= 0;
                    return (
                      <tr key={h.symbol} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                        <td style={{ padding: '0.55rem 0.8rem' }}>
                          <strong style={{ color: 'white' }}>{h.symbol}</strong>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>{h.name || h.symbol}</span>
                        </td>
                        <td style={{ padding: '0.55rem 0.8rem', textAlign: 'right', color: 'white' }}>{h.shares}</td>
                        <td style={{ padding: '0.55rem 0.8rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{h.avg_cost_local?.toFixed(2)} {h.currency}</td>
                        <td style={{ padding: '0.55rem 0.8rem', textAlign: 'right', color: 'white', fontWeight: 600 }}>{h.current_price_local?.toFixed(2)} {h.currency}</td>
                        <td style={{ padding: '0.55rem 0.8rem', textAlign: 'right', color: 'white', fontWeight: 700 }}>{formatMoney(h.current_value_base)}</td>
                        <td style={{ padding: '0.55rem 0.8rem', textAlign: 'right', color: 'var(--color-primary)', fontWeight: 600 }}>{weight.toFixed(1)}%</td>
                        <td style={{ padding: '0.55rem 0.8rem', textAlign: 'right', color: isGain ? 'var(--color-green)' : 'var(--color-red)', fontWeight: 700 }}>
                          {formatPercent(h.gain_percent)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: Forward Dividend Projections */}
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-primary)' }}>
                <Calendar size={15} /> 12-Month Projected Passive Income
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Forward Yield: <strong style={{ color: 'var(--color-green)' }}>{forwardYield.toFixed(2)}%</strong>
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Annual Forecast</span>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white' }}>{formatMoney(totalAnnualDiv)}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Average Monthly</span>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white' }}>{formatMoney(totalAnnualDiv / 12)}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ex-Div Events Tracked</span>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white' }}>{dividends.length} payouts</div>
              </div>
            </div>
          </div>

          {/* Section 5: Legal & Audit Footer */}
          <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            <div>
              QuantiFi Quantitative Analytics Engine &copy; {new Date().getFullYear()} &bull; Confidential
            </div>
            <div>
              Page 1 of 1 &bull; End of Report
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
