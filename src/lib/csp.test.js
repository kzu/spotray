import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { directiveAllowsOrigin, parseCsp } from "./csp.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function shippedTauriConfig() {
  return JSON.parse(
    readFileSync(join(repoRoot, "src-tauri", "tauri.conf.json"), "utf8"),
  );
}

test("shipped CSP frame-src allows the official SDK embed iframe", () => {
  const config = shippedTauriConfig();
  const csp = config.app.security.csp;
  assert.equal(typeof csp, "string");
  const directives = parseCsp(csp);

  // default-src 'self' must NOT be the only framing rule — the SDK iframe is
  // https://sdk.scdn.co/embedded/index.html and would be blocked otherwise.
  assert.ok(
    Object.prototype.hasOwnProperty.call(directives, "frame-src"),
    "frame-src must be set so it does not inherit default-src 'self'",
  );
  assert.ok(
    directiveAllowsOrigin(directives["frame-src"], "https://sdk.scdn.co"),
    `frame-src must allow https://sdk.scdn.co, got: ${directives["frame-src"]}`,
  );
  assert.ok(
    directives["frame-src"].includes("'self'"),
    "frame-src should still allow same-origin frames",
  );
});

test("shipped CSP child-src also allows the official SDK origin", () => {
  const directives = parseCsp(shippedTauriConfig().app.security.csp);
  assert.ok(Object.prototype.hasOwnProperty.call(directives, "child-src"));
  assert.ok(
    directiveAllowsOrigin(directives["child-src"], "https://sdk.scdn.co"),
  );
});

test("shipped Permissions-Policy delegates encrypted-media and autoplay to the SDK iframe", () => {
  const headers = shippedTauriConfig().app.security.headers;
  assert.ok(headers, "security.headers must be present");
  const policy = headers["Permissions-Policy"];
  assert.equal(typeof policy, "string");
  assert.match(policy, /encrypted-media/);
  assert.match(policy, /autoplay/);
  assert.match(policy, /sdk\.scdn\.co/);
});
