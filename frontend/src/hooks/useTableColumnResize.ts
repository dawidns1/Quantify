import { useState, useRef, useEffect, useCallback } from 'react';

export function useTableColumnResize(storageKey: string, defaultWidths: Record<string, number> = {}) {
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const cached = localStorage.getItem(storageKey);
      return cached ? { ...defaultWidths, ...JSON.parse(cached) } : defaultWidths;
    } catch {
      return defaultWidths;
    }
  });

  const [activeDragCol, setActiveDragCol] = useState<string | null>(null);
  const activeDragColRef = useRef<string | null>(null);
  const startX = useRef<number>(0);
  const startWidth = useRef<number>(0);
  const isResizingRef = useRef<boolean>(false);

  const handleMouseDown = useCallback((e: React.MouseEvent, colId: string, minWidth = 50) => {
    e.preventDefault();
    e.stopPropagation();
    activeDragColRef.current = colId;
    setActiveDragCol(colId);
    isResizingRef.current = false;
    startX.current = e.clientX;
    const thElement = (e.target as HTMLElement).closest('th');
    if (thElement) {
      startWidth.current = thElement.getBoundingClientRect().width;
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!activeDragColRef.current) return;
      isResizingRef.current = true;
      const deltaX = moveEvent.clientX - startX.current;
      const newWidth = Math.max(minWidth, Math.round(startWidth.current + deltaX));
      setColWidths(prev => {
        const next = { ...prev, [activeDragColRef.current!]: newWidth };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}
        return next;
      });
    };

    const handleMouseUp = () => {
      activeDragColRef.current = null;
      setActiveDragCol(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setTimeout(() => {
        isResizingRef.current = false;
      }, 50);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [storageKey]);

  const resetColWidths = useCallback(() => {
    setColWidths(defaultWidths);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey, defaultWidths]);

  useEffect(() => {
    return () => {
      activeDragColRef.current = null;
    };
  }, []);

  return {
    colWidths,
    handleMouseDown,
    activeDragCol,
    isResizingRef,
    resetColWidths
  };
}
