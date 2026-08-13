/** First retry after the SDK reports the device is offline. */
export const RECONNECT_MIN_MS = 1_000;

/** Cap so a flaky network does not wait minutes between tries. */
export const RECONNECT_MAX_MS = 30_000;

/** How long to wait for `ready` after `connect()` returns true. */
export const READY_WAIT_MS = 12_000;

/**
 * Exponential backoff: 1s, 2s, 4s, … capped at `maxMs`.
 * `attempt` is the number of failed tries so far (0 = first retry).
 */
export function nextReconnectDelay(
  attempt,
  { minMs = RECONNECT_MIN_MS, maxMs = RECONNECT_MAX_MS } = {},
) {
  const n = Math.max(0, Number.isFinite(attempt) ? attempt : 0);
  return Math.min(maxMs, minMs * 2 ** n);
}

/**
 * Schedules `connect()` after the Web Playback SDK goes offline.
 * Call `markReady()` from the SDK `ready` listener and `stop()` on logout.
 */
export function createReconnectController({
  connect,
  onStatus,
  setTimeoutFn = globalThis.setTimeout.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout.bind(globalThis),
  minMs = RECONNECT_MIN_MS,
  maxMs = RECONNECT_MAX_MS,
  readyWaitMs = READY_WAIT_MS,
} = {}) {
  if (typeof connect !== "function") {
    throw new Error("createReconnectController requires connect().");
  }

  let attempt = 0;
  let timer = null;
  let readyTimer = null;
  let stopped = false;
  let inFlight = false;
  let phase = "idle";

  function cancelTimers() {
    if (timer != null) {
      clearTimeoutFn(timer);
      timer = null;
    }
    if (readyTimer != null) {
      clearTimeoutFn(readyTimer);
      readyTimer = null;
    }
  }

  function emit(extra = {}) {
    onStatus?.({
      phase,
      attempt,
      ...extra,
    });
  }

  function armReadyWait() {
    if (readyWaitMs <= 0) return;
    readyTimer = setTimeoutFn(() => {
      readyTimer = null;
      if (stopped || phase === "idle") return;
      attempt += 1;
      inFlight = false;
      schedule("ready-timeout");
    }, readyWaitMs);
  }

  async function run() {
    if (stopped || inFlight) return;
    inFlight = true;
    phase = "connecting";
    emit();
    try {
      const ok = await connect();
      if (stopped) return;
      if (ok) {
        armReadyWait();
        return;
      }
      attempt += 1;
      inFlight = false;
      schedule("connect-failed");
    } catch (error) {
      if (stopped) return;
      attempt += 1;
      inFlight = false;
      schedule(error);
    }
  }

  function schedule(reason) {
    if (stopped) return false;
    inFlight = false;
    if (timer != null) return false;
    cancelTimers();
    const delay = nextReconnectDelay(attempt, { minMs, maxMs });
    phase = "waiting";
    emit({
      delay,
      reason: reason instanceof Error ? reason.message : reason,
    });
    timer = setTimeoutFn(() => {
      timer = null;
      return run();
    }, delay);
    return true;
  }

  function flush() {
    if (stopped || inFlight || phase !== "waiting") return false;
    cancelTimers();
    void run();
    return true;
  }

  function markReady() {
    if (stopped) return;
    attempt = 0;
    inFlight = false;
    phase = "idle";
    cancelTimers();
    emit();
  }

  function markFatal() {
    stopped = true;
    inFlight = false;
    phase = "idle";
    cancelTimers();
    emit({ fatal: true });
  }

  function stop() {
    stopped = true;
    inFlight = false;
    phase = "idle";
    cancelTimers();
  }

  return {
    schedule,
    flush,
    markReady,
    markFatal,
    stop,
    get attempt() {
      return attempt;
    },
    get stopped() {
      return stopped;
    },
    get phase() {
      return phase;
    },
    get inFlight() {
      return inFlight;
    },
  };
}
