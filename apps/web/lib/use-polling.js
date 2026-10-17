'use client';

import { useEffect, useRef } from 'react';

// Runs callback now and then every intervalMs while the tab is visible. Restarts when deps
// change; never overlaps runs; catches up immediately when the tab becomes visible again.
export function usePolling(callback, intervalMs, deps = []) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  });

  useEffect(() => {
    let running = false;
    const tick = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        await saved.current();
      } finally {
        running = false;
      }
    };

    tick();
    const timer = setInterval(tick, intervalMs);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, ...deps]);
}
