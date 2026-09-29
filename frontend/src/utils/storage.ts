/**
 * Resilient LocalStorage utility with quota management and portfolio cache purging
 */

/**
 * Safely set an item in localStorage with quota exhaustion protection
 */
export function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err: any) {
    if (
      err?.name === 'QuotaExceededError' ||
      err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err?.code === 22 ||
      err?.code === 1014
    ) {
      console.warn('[Storage] Quota exceeded. Evicting historical chart and analytics cache...');
      evictTransientCaches();
      try {
        localStorage.setItem(key, value);
      } catch (retryErr) {
        console.warn('[Storage] Failed to store item after eviction:', key, retryErr);
      }
    }
  }
}

/**
 * Remove transient/large cache keys to free up localStorage capacity
 */
function evictTransientCaches(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Evict chart data first, then analytics, then forecast
      if (
        k.startsWith('cached_chart_data_') ||
        k.startsWith('cached_analytics_') ||
        k.startsWith('cached_dividend_forecast_') ||
        k.startsWith('cached_upcoming_events_')
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.warn('[Storage] Error during cache eviction:', e);
  }
}

/**
 * Purge all localStorage entries associated with a deleted or removed portfolio
 */
export function purgePortfolioStorage(portfolioId: string): void {
  if (!portfolioId) return;
  try {
    const targetMarker = `_${portfolioId}_`;
    const endMarker = `_${portfolioId}`;
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.includes(targetMarker) || k.endsWith(endMarker)) {
        keysToRemove.push(k);
      }
    }

    keysToRemove.forEach(k => localStorage.removeItem(k));
    console.log(`[Storage] Purged ${keysToRemove.length} cache items for portfolio ${portfolioId}`);
  } catch (e) {
    console.warn('[Storage] Error purging portfolio cache:', e);
  }
}
