/** Web Lock name held so Chromium is less likely to freeze a hidden WebView. */
export const WEBVIEW_KEEP_ALIVE_LOCK = "spotray-webview";

/** Dispatched from Rust into the page so timers still run when the window is hidden. */
export const KEEP_ALIVE_EVENT = "spotray-keep-alive";

/** How often to poke the SDK while the player exists. */
export const HEARTBEAT_MS = 20_000;

/**
 * Chromium flags for WebView2.
 * Must include wry's default `--disable-features` list — setting
 * `additionalBrowserArgs` replaces those defaults.
 */
export const WEBVIEW2_BROWSER_ARGS = [
  "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
].join(" ");

/**
 * Hold an exclusive Web Lock for the life of the player.
 * Chrome/WebView2 treats a held lock as a reason not to discard the page.
 * No-ops when the Web Locks API is missing.
 */
export function createWebLockKeeper({
  lockName = WEBVIEW_KEEP_ALIVE_LOCK,
  locks = globalThis.navigator?.locks,
} = {}) {
  let release;
  let held = false;

  function acquire() {
    if (held) return true;
    if (!locks || typeof locks.request !== "function") return false;
    held = true;
    const untilRelease = new Promise((resolve) => {
      release = resolve;
    });
    try {
      Promise.resolve(locks.request(lockName, { mode: "exclusive" }, () => untilRelease)).catch(
        () => {
          held = false;
          release = null;
        },
      );
      return true;
    } catch {
      held = false;
      release = null;
      return false;
    }
  }

  function drop() {
    if (release) {
      release();
    }
    release = null;
    held = false;
  }

  return {
    acquire,
    drop,
    get held() {
      return held;
    },
  };
}

/**
 * Repeat `tick` on an interval. Returns a stop function.
 */
export function startHeartbeat(
  tick,
  {
    intervalMs = HEARTBEAT_MS,
    setIntervalFn = globalThis.setInterval.bind(globalThis),
    clearIntervalFn = globalThis.clearInterval.bind(globalThis),
  } = {},
) {
  if (typeof tick !== "function") {
    throw new Error("startHeartbeat requires tick().");
  }
  const id = setIntervalFn(() => {
    void tick();
  }, intervalMs);
  return () => clearIntervalFn(id);
}

/**
 * Call `onWake` when the document becomes visible again or the page resumes
 * after a freeze. Returns an unbind function.
 */
export function bindPageLifecycle(onWake, target = globalThis.document) {
  if (typeof onWake !== "function" || !target?.addEventListener) {
    return () => {};
  }

  const onVisibility = () => {
    if (target.visibilityState === "visible") {
      onWake("page-visible");
    }
  };
  const onResume = () => onWake("page-resume");

  target.addEventListener("visibilitychange", onVisibility);
  target.addEventListener("resume", onResume);

  return () => {
    target.removeEventListener("visibilitychange", onVisibility);
    target.removeEventListener("resume", onResume);
  };
}
