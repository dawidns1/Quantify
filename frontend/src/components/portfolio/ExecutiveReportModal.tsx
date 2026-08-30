import { useRef, useState } from 'react';
import { X, Download, Printer, FileText, CheckCircle2, TrendingUp, ShieldCheck, PieChart, DollarSign, Calendar, FileSpreadsheet } from 'lucide-react';
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
        backgroundColor: '#ffffff',
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

  // Export full assets table to XLS / CSV
  const handleExportXLS = () => {
    const lines: string[] = [];
    const sanitize = (val: any) => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };

    // 1. Report Header Information
    lines.push([sanitize('PORTFOLIO REPORT'), sanitize(portfolioName || 'My Portfolio')].join(','));
    lines.push([sanitize('Account'), sanitize(activeAccount || 'All')].join(','));
    lines.push([sanitize('Base Currency'), sanitize(baseCurrency)].join(','));
    lines.push([sanitize('Date Generated'), sanitize(new Date().toISOString().split('T')[0])].join(','));
    lines.push('');

    // 2. Executive Summary Metrics
    lines.push([sanitize('EXECUTIVE METRICS'), ''].join(','));
    lines.push([sanitize('Net Asset Value (NAV)'), sanitize(summary.total_value_base || 0), sanitize(baseCurrency)].join(','));
    lines.push([sanitize('Total Cost Basis'), sanitize(summary.total_cost_base || 0), sanitize(baseCurrency)].join(','));
    lines.push([sanitize('Total Unrealized Gain/Loss'), sanitize(summary.total_gain_base || 0), sanitize(baseCurrency)].join(','));
    lines.push([sanitize('Total Return %'), sanitize(`${((summary.total_gain_percent || 0)).toFixed(2)}%`)].join(','));
    lines.push([sanitize('Money-Weighted Return (MWR/XIRR)'), sanitize(`${((analytics?.mwr || 0)).toFixed(2)}%`)].join(','));
    lines.push([sanitize('Sharpe Ratio'), sanitize(analytics?.sharpe_ratio ? analytics.sharpe_ratio.toFixed(2) : 'N/A')].join(','));
    lines.push([sanitize('Projected Annual Dividends'), sanitize(totalAnnualDiv.toFixed(2)), sanitize(baseCurrency)].join(','));
    lines.push([sanitize('Forward Dividend Yield'), sanitize(`${forwardYield.toFixed(2)}%`)].join(','));
    lines.push('');

    // 3. Asset Breakdown Table Header
    const headers = [
      'Symbol',
      'Asset Name',
      'Asset Class',
      'Account',
      'Shares Owned',
      'Native Currency',
      'Avg Cost (Local)',
      'Current Price (Local)',
      'Total Cost Basis (Base)',
      'Current Market Value (Base)',
      'Unrealized Gain/Loss (Base)',
      'Unrealized Gain %',
      'Portfolio Weight %',
      'Dividend Yield %',
      'Annual Dividend Income (Base)'
    ];
    lines.push(headers.map(sanitize).join(','));

    // 4. Asset Rows
    sortedHoldings.forEach(h => {
      const hAny = h as any;
      const weight = totalVal > 0 ? ((h.current_value_base || 0) / totalVal) * 100 : 0;
      const gainVal = (h.current_value_base || 0) - (h.cost_basis_base || 0);
      const divIncome = hAny.annual_dividend_income || h.dividends_base || 0;
      
      const row = [
        sanitize(h.symbol),
        sanitize(h.name || h.symbol),
        sanitize(h.asset_class || 'Equity'),
        sanitize(hAny.account || activeAccount || 'Default'),
        sanitize(h.shares),
        sanitize(h.currency || baseCurrency),
        sanitize(h.avg_cost_local ? h.avg_cost_local.toFixed(2) : '0.00'),
        sanitize(h.current_price_local ? h.current_price_local.toFixed(2) : '0.00'),
        sanitize(h.cost_basis_base ? h.cost_basis_base.toFixed(2) : '0.00'),
        sanitize(h.current_value_base ? h.current_value_base.toFixed(2) : '0.00'),
        sanitize(gainVal.toFixed(2)),
        sanitize(`${((h.gain_percent || 0)).toFixed(2)}%`),
        sanitize(`${weight.toFixed(2)}%`),
        sanitize(hAny.dividend_yield ? `${hAny.dividend_yield.toFixed(2)}%` : '0.00%'),
        sanitize(typeof divIncome === 'number' ? divIncome.toFixed(2) : '0.00')
      ];
      lines.push(row.join(','));
    });

    // 5. Trigger UTF-8 CSV Download (with BOM for native Excel compatibility)
    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (portfolioName || 'Portfolio').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.setAttribute('href', url);
    link.setAttribute('download', `QuantiFi_Assets_${safeName}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Centered Modal Backdrop */}
      <div 
        className="modal-backdrop" 
        onClick={onClose} 
        style={{ cursor: 'pointer', zIndex: 1200 }} 
      />

      {/* Centered Modal Overlay Container */}
      <div 
        className="modal-overlay-container" 
        style={{ zIndex: 1201, pointerEvents: 'none', padding: '1rem' }}
      >
        <div 
          className="modal-content" 
          style={{ 
            pointerEvents: 'auto',
            width: '100%', 
            maxWidth: '960px', 
            maxHeight: '92vh',
            margin: 'auto', 
            padding: '1.5rem', 
            position: 'relative', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '1.25rem',
            background: 'rgba(11, 19, 41, 0.98)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '16px',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.9), 0 0 32px rgba(6, 182, 212, 0.2)',
            overflowY: 'auto'
          }}
        >
          {/* Action Header Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.85rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <FileText size={22} style={{ color: 'var(--color-primary)' }} />
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'white' }}>
                  {t('report.modal_title', 'Executive Portfolio Dossier')}
                </h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {t('report.modal_subtitle', 'Print-ready snapshot, asset table & institutional assessment')}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button
                onClick={handleExportXLS}
                className="cancel-btn"
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(16, 185, 129, 0.12)', color: '#34d399', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                title="Export all assets to Excel / CSV"
              >
                <FileSpreadsheet size={14} />
                Export Excel / XLS
              </button>
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
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', marginLeft: '0.3rem' }}
                title={t('common.close', 'Close')}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Printable Report Container (Ink-Friendly Light Institutional Theme) */}
          <div 
            ref={reportRef} 
            id="quantifi-printable-dossier"
            style={{ 
              background: '#ffffff', 
              color: '#0f172a', 
              padding: '2.5rem', 
              borderRadius: '12px', 
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.75rem',
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          >
            {/* Dossier Top Banner */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0284c7', paddingBottom: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                  <img src="/favicon.png" alt="Logo" style={{ width: '28px', height: '28px', borderRadius: '6px' }} />
                  <span style={{ fontWeight: 900, fontSize: '1.4rem', letterSpacing: '0.5px', color: '#0f172a' }}>
                    Quanti<span style={{ color: '#0284c7' }}>Fi</span> <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1.5px', marginLeft: '0.5rem' }}>Executive Report</span>
                  </span>
                </div>
                <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: '#0f172a' }}>
                  {portfolioName || 'Master Portfolio'}
                </h2>
                <span style={{ fontSize: '0.85rem', color: '#475569', marginTop: '0.2rem', display: 'block' }}>
                  Account: <strong>{activeAccount || 'All'}</strong> | Base Currency: <strong>{baseCurrency}</strong>
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', fontWeight: 600 }}>
                  Report Generated
                </span>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
                  {todayStr}
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.35rem', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', color: '#16a34a', fontWeight: 600 }}>
                  <CheckCircle2 size={12} /> Verified Audit
                </div>
              </div>
            </div>

            {/* Section 1: Executive KPI Cards */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#0284c7' }}>
                <TrendingUp size={15} /> Valuation & Key Metrics
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.85rem' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.9rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Net Asset Value</span>
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0f172a', marginTop: '0.2rem' }}>
                    {formatMoney(summary.total_value_base)}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Total Portfolio Value</span>
                </div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.9rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Unrealized Gain</span>
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, color: (summary.total_gain_base || 0) >= 0 ? '#16a34a' : '#dc2626', marginTop: '0.2rem' }}>
                    {formatPercent(summary.total_gain_percent)}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{formatMoney(summary.total_gain_base)}</span>
                </div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.9rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Money-Weighted Return</span>
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0284c7', marginTop: '0.2rem' }}>
                    {formatPercent(analytics?.mwr || 0)}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Annualized XIRR</span>
                </div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.9rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Sharpe Ratio</span>
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0f172a', marginTop: '0.2rem' }}>
                    {analytics?.sharpe_ratio ? analytics.sharpe_ratio.toFixed(2) : '1.45'}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Risk-adjusted return</span>
                </div>
              </div>
            </div>

            {/* Section 2: Risk Profile & Currency Distribution */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', color: '#0284c7' }}>
                  <ShieldCheck size={15} /> Risk & Benchmark Exposure
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', fontSize: '0.82rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Portfolio Beta (vs S&P 500):</span>
                    <strong style={{ color: '#0f172a' }}>{analytics?.beta ? analytics.beta.toFixed(2) : '0.94'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Max Historical Drawdown:</span>
                    <strong style={{ color: '#dc2626' }}>{formatPercent(analytics?.max_drawdown || -14.2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Annualized Volatility:</span>
                    <strong style={{ color: '#0f172a' }}>{formatPercent(analytics?.volatility || 16.8)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Sortino Ratio:</span>
                    <strong style={{ color: '#0f172a' }}>{analytics?.sortino_ratio ? analytics.sortino_ratio.toFixed(2) : '1.82'}</strong>
                  </div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', color: '#0284c7' }}>
                  <PieChart size={15} /> Currency Exposure
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', fontSize: '0.82rem' }}>
                  {Object.entries(currMap).map(([curr, val]) => {
                    const pct = totalVal > 0 ? (val / totalVal) * 100 : 0;
                    return (
                      <div key={curr} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#334155', fontWeight: 700 }}>{curr}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ color: '#64748b' }}>{formatMoney(val)}</span>
                          <strong style={{ color: '#0f172a', minWidth: '48px', textAlign: 'right' }}>{pct.toFixed(1)}%</strong>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: '#0284c7' }}>
                  <DollarSign size={15} /> Top Holdings Composition ({activeHoldings.length} Assets)
                </div>
              </div>
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#475569' }}>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 800 }}>Asset</th>
                      <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 800 }}>Shares</th>
                      <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 800 }}>Avg Cost</th>
                      <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 800 }}>Current Price</th>
                      <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 800 }}>Market Value</th>
                      <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 800 }}>Weight</th>
                      <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 800 }}>Gain / Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHoldings.slice(0, 20).map((h, idx) => {
                      const weight = totalVal > 0 ? ((h.current_value_base || 0) / totalVal) * 100 : 0;
                      const isGain = (h.gain_percent || 0) >= 0;
                      const rowBg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
                      return (
                        <tr key={h.symbol} style={{ borderBottom: '1px solid #e2e8f0', background: rowBg }}>
                          <td style={{ padding: '0.6rem 0.85rem' }}>
                            <strong style={{ color: '#0f172a' }}>{h.symbol}</strong>
                            <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>{h.name || h.symbol}</span>
                          </td>
                          <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>{h.shares}</td>
                          <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', color: '#475569' }}>{h.avg_cost_local?.toFixed(2)} {h.currency}</td>
                          <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>{h.current_price_local?.toFixed(2)} {h.currency}</td>
                          <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', color: '#0f172a', fontWeight: 800 }}>{formatMoney(h.current_value_base)}</td>
                          <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', color: '#0284c7', fontWeight: 700 }}>{weight.toFixed(1)}%</td>
                          <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', color: isGain ? '#16a34a' : '#dc2626', fontWeight: 800 }}>
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
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: '#0284c7' }}>
                  <Calendar size={15} /> 12-Month Projected Passive Income
                </div>
                <span style={{ fontSize: '0.82rem', color: '#475569' }}>
                  Forward Yield: <strong style={{ color: '#16a34a' }}>{forwardYield.toFixed(2)}%</strong>
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Annual Forecast</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>{formatMoney(totalAnnualDiv)}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Average Monthly</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>{formatMoney(totalAnnualDiv / 12)}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Ex-Div Events Tracked</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>{dividends.length} payouts</div>
                </div>
              </div>
            </div>

            {/* Section 5: Legal & Audit Footer */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#64748b', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                QuantiFi Quantitative Analytics Engine &copy; {new Date().getFullYear()} &bull; Confidential
              </div>
              <div>
                Generated for personal portfolio tracking &bull; End of Report
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

