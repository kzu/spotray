import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  HEARTBEAT_MS,
  KEEP_ALIVE_EVENT,
  WEBVIEW2_BROWSER_ARGS,
  WEBVIEW_KEEP_ALIVE_LOCK,
  bindPageLifecycle,
  createWebLockKeeper,
  startHeartbeat,
} from "./keepAlive.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function shippedTauriConfig() {
  return JSON.parse(
    readFileSync(join(repoRoot, "src-tauri", "tauri.conf.json"), "utf8"),
  );
}

test("WebView2 args keep wry defaults and disable background throttling", () => {
  assert.match(WEBVIEW2_BROWSER_ARGS, /msWebOOUI/);
  assert.match(WEBVIEW2_BROWSER_ARGS, /msPdfOOUI/);
  assert.match(WEBVIEW2_BROWSER_ARGS, /msSmartScreenProtection/);
  assert.match(WEBVIEW2_BROWSER_ARGS, /CalculateNativeWinOcclusion/);
  assert.match(WEBVIEW2_BROWSER_ARGS, /disable-background-timer-throttling/);
  assert.match(WEBVIEW2_BROWSER_ARGS, /disable-backgrounding-occluded-windows/);
  assert.match(WEBVIEW2_BROWSER_ARGS, /disable-renderer-backgrounding/);
});

test("shipped window config matches keep-alive flags", () => {
  const win = shippedTauriConfig().app.windows[0];
  assert.equal(win.backgroundThrottling, "disabled");
  assert.equal(win.additionalBrowserArgs, WEBVIEW2_BROWSER_ARGS);
});

test("createWebLockKeeper holds an exclusive lock until drop", async () => {
  let released = false;
  const locks = {
    request(name, options, callback) {
      assert.equal(name, WEBVIEW_KEEP_ALIVE_LOCK);
      assert.equal(options.mode, "exclusive");
      return Promise.resolve(callback());
    },
  };
  const keeper = createWebLockKeeper({ locks });
  assert.equal(keeper.acquire(), true);
  assert.equal(keeper.held, true);
  assert.equal(keeper.acquire(), true);
  keeper.drop();
  assert.equal(keeper.held, false);
  released = true;
  assert.equal(released, true);
});

test("createWebLockKeeper no-ops without the Web Locks API", () => {
  const keeper = createWebLockKeeper({ locks: null });
  assert.equal(keeper.acquire(), false);
  assert.equal(keeper.held, false);
  keeper.drop();
});

test("startHeartbeat ticks until stopped", () => {
  const calls = [];
  const handles = [];
  const stop = startHeartbeat(() => calls.push("tick"), {
    intervalMs: HEARTBEAT_MS,
    setIntervalFn: (fn, ms) => {
      assert.equal(ms, HEARTBEAT_MS);
      handles.push(fn);
      return 7;
    },
    clearIntervalFn: (id) => {
      assert.equal(id, 7);
      handles.cleared = true;
    },
  });
  handles[0]();
  assert.deepEqual(calls, ["tick"]);
  stop();
  assert.equal(handles.cleared, true);
});

test("bindPageLifecycle wakes on visible and resume", () => {
  const reasons = [];
  const listeners = new Map();
  const target = {
    visibilityState: "hidden",
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  const unbind = bindPageLifecycle((reason) => reasons.push(reason), target);
  listeners.get("visibilitychange")();
  assert.deepEqual(reasons, []);
  target.visibilityState = "visible";
  listeners.get("visibilitychange")();
  listeners.get("resume")();
  assert.deepEqual(reasons, ["page-visible", "page-resume"]);
  unbind();
  assert.equal(listeners.size, 0);
});

test("keep-alive event name is stable for the Rust poke", () => {
  assert.equal(KEEP_ALIVE_EVENT, "spotray-keep-alive");
  const rust = readFileSync(
    join(repoRoot, "src-tauri", "src", "keep_alive.rs"),
    "utf8",
  );
  assert.match(rust, /spotray-keep-alive/);
});
