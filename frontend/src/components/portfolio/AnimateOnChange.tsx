import React, { useEffect, useRef, useState } from 'react';

interface AnimateOnChangeProps {
  value: any;
  contextId?: string | null; // prevents flashes when row/portfolio changes
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function AnimateOnChange({
  value,
  contextId = null,
  children,
  className = '',
  style = {}
}: AnimateOnChangeProps) {
  const [flashClass, setFlashClass] = useState('');
  const prevValue = useRef(value);
  const prevContextId = useRef(contextId);

  useEffect(() => {
    // If context changed (e.g. portfolio changed, or rows rearranged), reset silently without animating
    if (prevContextId.current !== contextId) {
      prevValue.current = value;
      prevContextId.current = contextId;
      setFlashClass('');
      return;
    }

    if (prevValue.current !== value) {
      // Parse numeric values (cleaning currencies and formatting strings if necessary)
      const cleanVal = typeof value === 'number' 
        ? value 
        : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
      const cleanPrev = typeof prevValue.current === 'number' 
        ? prevValue.current 
        : parseFloat(String(prevValue.current).replace(/[^0-9.-]/g, ''));

      let cls = 'flash-neutral';
      if (!isNaN(cleanVal) && !isNaN(cleanPrev)) {
        if (cleanVal > cleanPrev) {
          cls = 'flash-up';
        } else if (cleanVal < cleanPrev) {
          cls = 'flash-down';
        }
      }

      // Re-trigger animation if it's already flashing
      setFlashClass('');
      // Small timeout to allow the browser to process class removal and reset animation
      const rAF = requestAnimationFrame(() => {
        setFlashClass(cls);
      });

      prevValue.current = value;

      const timer = setTimeout(() => {
        setFlashClass('');
      }, 1200); // 1.2s matches CSS animation duration

      return () => {
        cancelAnimationFrame(rAF);
        clearTimeout(timer);
      };
    }
  }, [value, contextId]);

  return (
    <span className={`${className} ${flashClass}`} style={{ ...style }}>
      {children}
    </span>
  );
}
