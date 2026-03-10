type StartupPerfState = {
  bootTs: number;
  marks: Map<string, number>;
};

const STARTUP_PERF_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_STARTUP_PERF === '1';

declare global {
  interface Window {
    __startupPerfState__?: StartupPerfState;
  }
}

const fallbackState: StartupPerfState = {
  bootTs: getNow(),
  marks: new Map<string, number>(),
};

function getNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function getState(): StartupPerfState {
  if (typeof window === 'undefined') {
    return fallbackState;
  }

  if (!window.__startupPerfState__) {
    window.__startupPerfState__ = {
      bootTs: getNow(),
      marks: new Map<string, number>(),
    };
  }

  return window.__startupPerfState__;
}

function toInfo(meta?: string): string {
  return meta ? ` | ${meta}` : '';
}

function log(message: string): void {
  if (!STARTUP_PERF_ENABLED) return;
   
  console.log(`[StartupPerf] ${message}`);
}

export function startupPerfPoint(label: string, meta?: string): void {
  if (!STARTUP_PERF_ENABLED) return;
  const state = getState();
  const elapsed = getNow() - state.bootTs;
  log(`${label} @ +${elapsed.toFixed(1)}ms${toInfo(meta)}`);
}

export function startupPerfStart(label: string): void {
  if (!STARTUP_PERF_ENABLED) return;
  const state = getState();
  state.marks.set(label, getNow());
}

export function startupPerfEnd(label: string, meta?: string): number | null {
  if (!STARTUP_PERF_ENABLED) return null;
  const state = getState();
  const startedAt = state.marks.get(label);
  if (typeof startedAt !== 'number') {
    return null;
  }

  state.marks.delete(label);
  const duration = getNow() - startedAt;
  log(`${label}: ${duration.toFixed(1)}ms${toInfo(meta)}`);
  return duration;
}
