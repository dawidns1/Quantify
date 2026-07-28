import { supabase } from '../supabaseClient';

export interface TelemetryLogEvent {
  id: string;
  timestamp: string;
  eventType: 'performance' | 'error' | 'interaction';
  actionName: string;
  durationMs?: number;
  status: 'success' | 'error' | 'pending';
  errorMessage?: string;
  metadata?: Record<string, any>;
}

interface ActiveTrace {
  actionName: string;
  startTime: number;
  eventType: 'performance' | 'interaction';
  metadata?: Record<string, any>;
  backgroundedCount: number;
  backgroundStartTime?: number;
  totalBackgroundMs: number;
}

class TelemetryManager {
  private activeTraces: Map<string, ActiveTrace> = new Map();
  private localLogs: TelemetryLogEvent[] = [];
  private readonly MAX_LOCAL_LOGS = 150;
  private readonly STORAGE_KEY = 'quantifi_telemetry_logs_v1';

  constructor() {
    this.loadFromStorage();
    this.setupVisibilityListener();
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.localLogs = JSON.parse(stored);
      }
    } catch (e) {
      this.localLogs = [];
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.localLogs.slice(-this.MAX_LOCAL_LOGS)));
    } catch (e) {
      // Ignore storage errors
    }
  }

  private setupVisibilityListener() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      const now = performance.now();
      const isHidden = document.hidden;
      if (isHidden) {
        this.activeTraces.forEach((trace) => {
          trace.backgroundStartTime = now;
          trace.backgroundedCount = (trace.backgroundedCount || 0) + 1;
        });
        if (this.activeTraces.size > 0) {
          this.logError('tab_switched_background', 'App switched to background during active fetch', {
            active_traces: Array.from(this.activeTraces.values()).map(t => t.actionName)
          });
        }
      } else {
        this.activeTraces.forEach((trace) => {
          if (trace.backgroundStartTime) {
            const bgMs = now - trace.backgroundStartTime;
            trace.totalBackgroundMs = (trace.totalBackgroundMs || 0) + bgMs;
            trace.backgroundStartTime = undefined;
          }
        });
        if (this.activeTraces.size > 0) {
          this.logError('tab_returned_foreground', 'App returned to foreground', {
            active_traces: Array.from(this.activeTraces.values()).map(t => t.actionName)
          });
        }
      }
    });
  }

  /**
   * Start high-precision timing trace for a user action or API sync
   */
  public startTrace(actionName: string, eventType: 'performance' | 'interaction' = 'performance', metadata?: Record<string, any>): string {
    const traceId = `${actionName}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = performance.now();
    this.activeTraces.set(traceId, {
      actionName,
      startTime: now,
      eventType,
      metadata,
      backgroundedCount: 0,
      backgroundStartTime: typeof document !== 'undefined' && document.hidden ? now : undefined,
      totalBackgroundMs: 0
    });
    return traceId;
  }

  /**
   * Complete a timing trace and send to Supabase + local storage
   */
  public async endTrace(traceId: string, status: 'success' | 'error' = 'success', errorMessage?: string, extraMeta?: Record<string, any>): Promise<TelemetryLogEvent | null> {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return null;

    const endTime = performance.now();
    let totalBgMs = trace.totalBackgroundMs;
    if (trace.backgroundStartTime) {
      totalBgMs += (endTime - trace.backgroundStartTime);
    }

    const durationMs = Math.round((endTime - trace.startTime) * 100) / 100;
    this.activeTraces.delete(traceId);

    const wasBackgrounded = trace.backgroundedCount > 0 || totalBgMs > 50;

    const event: TelemetryLogEvent = {
      id: traceId,
      timestamp: new Date().toISOString(),
      eventType: trace.eventType,
      actionName: trace.actionName,
      durationMs,
      status,
      errorMessage,
      metadata: {
        ...(trace.metadata || {}),
        ...(extraMeta || {}),
        was_backgrounded: wasBackgrounded,
        tab_switches: trace.backgroundedCount,
        background_time_ms: Math.round(totalBgMs)
      }
    };

    this.localLogs.unshift(event);
    if (this.localLogs.length > this.MAX_LOCAL_LOGS) {
      this.localLogs.pop();
    }
    this.saveToStorage();

    // Asynchronously log to Supabase in background
    this.persistToSupabase(event);

    return event;
  }

  /**
   * Log an error directly
   */
  public async logError(actionName: string, errorMessage: string, metadata?: Record<string, any>): Promise<TelemetryLogEvent> {
    const event: TelemetryLogEvent = {
      id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      eventType: 'error',
      actionName,
      status: 'error',
      errorMessage,
      metadata
    };

    this.localLogs.unshift(event);
    if (this.localLogs.length > this.MAX_LOCAL_LOGS) {
      this.localLogs.pop();
    }
    this.saveToStorage();

    this.persistToSupabase(event);
    return event;
  }

  /**
   * Persist event to Supabase public.app_telemetry_logs
   */
  private async persistToSupabase(event: TelemetryLogEvent) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id || null;

      await supabase.from('app_telemetry_logs').insert([{
        user_id: userId,
        portfolio_id: event.metadata?.portfolio_id || null,
        event_type: event.eventType,
        action_name: event.actionName,
        duration_ms: event.durationMs || null,
        status: event.status,
        error_message: event.errorMessage || null,
        metadata: event.metadata || {}
      }]);
    } catch (e) {
      // Safe silent fallback if database table RLS or network fails
      console.warn('[Telemetry] Suppressed remote log error:', e);
    }
  }

  /**
   * Get all local telemetry logs
   */
  public getLogs(): TelemetryLogEvent[] {
    return [...this.localLogs];
  }

  /**
   * Clear local telemetry logs
   */
  public clearLogs() {
    this.localLogs = [];
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

export const telemetry = new TelemetryManager();
