import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CustomDatePickerProps {
  id?: string;
  value: string; // ISO date string: YYYY-MM-DD
  onChange: (dateStr: string) => void;
  maxDate?: string; // YYYY-MM-DD
  minDate?: string; // YYYY-MM-DD
  disabled?: boolean;
  required?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

// Helpers to format YYYY-MM-DD safely without UTC timezone shift
const pad2 = (n: number) => n.toString().padStart(2, '0');
const toDateString = (year: number, monthIndex: number, day: number) => {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
};

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  id,
  value,
  onChange,
  maxDate,
  minDate,
  disabled = false,
  className = '',
  style
}) => {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current value
  const parsedValue = useMemo(() => {
    if (!value) {
      const now = new Date();
      return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
    }
    const parts = value.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return { year: parts[0], month: parts[1] - 1, day: parts[2] };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  }, [value]);

  // View state for navigating calendar months
  const [viewYear, setViewYear] = useState(parsedValue.year);
  const [viewMonth, setViewMonth] = useState(parsedValue.month);

  // Sync view when modal opens or value changes
  useEffect(() => {
    setViewYear(parsedValue.year);
    setViewMonth(parsedValue.month);
  }, [parsedValue.year, parsedValue.month, isOpen]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Today string
  const today = new Date();
  const todayStr = toDateString(today.getFullYear(), today.getMonth(), today.getDate());

  // Yesterday string
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toDateString(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

  // Month navigation
  const handlePrevMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewYear(prev => prev - 1);
      setViewMonth(11);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewYear(prev => prev + 1);
      setViewMonth(0);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  // Month title formatted with locale
  const monthTitle = useMemo(() => {
    const d = new Date(viewYear, viewMonth, 1);
    const monthName = d.toLocaleDateString(i18n.language || 'en', { month: 'long' });
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${viewYear}`;
  }, [viewYear, viewMonth, i18n.language]);

  // Formatted date displayed in input
  const displayFormattedDate = useMemo(() => {
    if (!value) return '';
    const d = new Date(parsedValue.year, parsedValue.month, parsedValue.day);
    const localized = d.toLocaleDateString(i18n.language || 'en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    return `${value} (${localized})`;
  }, [value, parsedValue, i18n.language]);

  // Weekdays (Monday first for standard European/financial calendar)
  const weekDays = useMemo(() => {
    const days: string[] = [];
    const baseMonday = new Date(2026, 0, 5);
    for (let i = 0; i < 7; i++) {
      const d = new Date(baseMonday);
      d.setDate(baseMonday.getDate() + i);
      const name = d.toLocaleDateString(i18n.language || 'en', { weekday: 'narrow' });
      days.push(name.toUpperCase());
    }
    return days;
  }, [i18n.language]);

  // Calendar cells generation (Monday as first day of week)
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    let startDay = firstDayOfMonth.getDay() - 1;
    if (startDay === -1) startDay = 6;

    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: Array<{
      day: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isDisabled: boolean;
      isSelected: boolean;
      isToday: boolean;
    }> = [];

    // Prev month padding days
    for (let i = startDay - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dStr = toDateString(prevYear, prevMonth, d);
      const isDis = (maxDate ? dStr > maxDate : false) || (minDate ? dStr < minDate : false);
      cells.push({
        day: d,
        dateStr: dStr,
        isCurrentMonth: false,
        isDisabled: isDis,
        isSelected: dStr === value,
        isToday: dStr === todayStr
      });
    }

    // Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dStr = toDateString(viewYear, viewMonth, d);
      const isDis = (maxDate ? dStr > maxDate : false) || (minDate ? dStr < minDate : false);
      cells.push({
        day: d,
        dateStr: dStr,
        isCurrentMonth: true,
        isDisabled: isDis,
        isSelected: dStr === value,
        isToday: dStr === todayStr
      });
    }

    // Next month padding days to complete grid
    const remaining = (cells.length % 7 === 0) ? 0 : 7 - (cells.length % 7);
    for (let d = 1; d <= remaining; d++) {
      const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dStr = toDateString(nextYear, nextMonth, d);
      const isDis = (maxDate ? dStr > maxDate : false) || (minDate ? dStr < minDate : false);
      cells.push({
        day: d,
        dateStr: dStr,
        isCurrentMonth: false,
        isDisabled: isDis,
        isSelected: dStr === value,
        isToday: dStr === todayStr
      });
    }

    return cells;
  }, [viewYear, viewMonth, value, maxDate, minDate, todayStr]);

  const handleSelectDate = (dateStr: string, isDisabled: boolean) => {
    if (isDisabled || disabled) return;
    onChange(dateStr);
    setIsOpen(false);
  };

  return (
    <div 
      ref={containerRef} 
      style={{ position: 'relative', width: '100%', userSelect: 'none', ...style }}
      className={className}
    >
      {/* Input trigger */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        className="input-field"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '0.45rem 0.75rem',
          textAlign: 'left',
          fontSize: '0.8rem',
          fontWeight: 500,
          background: isOpen ? 'rgba(6, 182, 212, 0.08)' : 'rgba(255, 255, 255, 0.03)',
          borderColor: isOpen ? 'var(--color-primary)' : 'var(--panel-border)',
          transition: 'all 0.15s ease'
        }}
      >
        <span style={{ color: value ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
          {displayFormattedDate || t('modals.add_tx.label_date', 'Select date')}
        </span>
        <Calendar 
          size={14} 
          style={{ 
            color: isOpen ? 'var(--color-primary)' : 'var(--text-muted)',
            flexShrink: 0,
            marginLeft: '0.4rem'
          }} 
        />
      </button>

      {/* Floating Glassmorphic Calendar Popover */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 1000,
            minWidth: '280px',
            background: 'rgba(15, 20, 34, 0.98)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--panel-border)',
            borderRadius: '10px',
            padding: '0.8rem',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem'
          }}
        >
          {/* Calendar Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {monthTitle}
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                onClick={handlePrevMonth}
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '5px',
                  color: 'var(--text-secondary)',
                  width: '26px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '5px',
                  color: 'var(--text-secondary)',
                  width: '26px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Day of Week Headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
            {weekDays.map((name, i) => (
              <span 
                key={i} 
                style={{ 
                  fontSize: '0.66rem', 
                  fontWeight: 700, 
                  color: 'var(--text-muted)',
                  padding: '3px 0'
                }}
              >
                {name}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {calendarCells.map((cell, idx) => {
              const bg = cell.isSelected 
                ? 'linear-gradient(135deg, var(--color-primary), var(--color-accent))'
                : 'transparent';
              const color = cell.isSelected
                ? '#ffffff'
                : cell.isDisabled
                ? 'rgba(255, 255, 255, 0.18)'
                : cell.isCurrentMonth
                ? 'var(--text-primary)'
                : 'var(--text-muted)';
              const border = cell.isToday && !cell.isSelected
                ? '1px solid var(--color-primary)'
                : '1px solid transparent';
              const shadow = cell.isSelected
                ? '0 0 10px rgba(6, 182, 212, 0.4)'
                : 'none';

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={cell.isDisabled}
                  onClick={() => handleSelectDate(cell.dateStr, cell.isDisabled)}
                  style={{
                    background: bg,
                    color: color,
                    border: border,
                    boxShadow: shadow,
                    borderRadius: '5px',
                    height: '28px',
                    fontSize: '0.76rem',
                    fontFamily: 'monospace',
                    fontWeight: cell.isSelected ? 700 : 500,
                    cursor: cell.isDisabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!cell.isDisabled && !cell.isSelected) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!cell.isDisabled && !cell.isSelected) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Quick Select Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '0.45rem', marginTop: '0.2rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={() => {
                  onChange(todayStr);
                  setIsOpen(false);
                }}
                style={{
                  background: 'rgba(6, 182, 212, 0.12)',
                  border: '1px solid rgba(6, 182, 212, 0.25)',
                  color: 'var(--color-primary)',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '3px 8px',
                  cursor: 'pointer'
                }}
              >
                {t('common.today', 'Today')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(yesterdayStr);
                  setIsOpen(false);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-secondary)',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 500,
                  padding: '3px 8px',
                  cursor: 'pointer'
                }}
              >
                {t('common.yesterday', 'Yesterday')}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '0.72rem',
                cursor: 'pointer',
                padding: '3px 6px'
              }}
            >
              {t('modals.common_cancel', 'Close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
