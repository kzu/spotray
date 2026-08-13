import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DASHBOARD_STEPS,
  REDIRECT_URI,
  SDK_SCRIPT_SRC,
  SPOTIFY_DASHBOARD_URL,
  WIZARD_FIELDS,
} from "./wizard.js";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");

test("wizard Dashboard URL is the official site", () => {
  assert.equal(SPOTIFY_DASHBOARD_URL, "https://developer.spotify.com/dashboard");
});

test("wizard lists step-by-step Dashboard actions and paste-back fields", () => {
  const joined = DASHBOARD_STEPS.join(" ").toLowerCase();
  assert.ok(DASHBOARD_STEPS.length >= 5);
  assert.match(joined, /create app/);
  assert.match(joined, /client id/);
  assert.match(joined, /redirect/);
  assert.match(joined, /paste/);
  const clientId = WIZARD_FIELDS.find((field) => field.id === "clientId");
  assert.ok(clientId);
  assert.equal(clientId.required, true);
  assert.equal(clientId.pasteBack, true);
  assert.equal(REDIRECT_URI, "http://127.0.0.1:30303/callback");
});

test("shipped HTML loads the official Web Playback SDK and wizard paste-back", () => {
  const html = readFileSync(join(srcDir, "index.html"), "utf8");
  assert.match(html, new RegExp(SDK_SCRIPT_SRC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /https:\/\/sdk\.scdn\.co\/spotify-player\.js/);
  assert.match(html, /id="open-dashboard"/);
  assert.match(html, /id="client-id"/);
  assert.match(html, /cover-art|now-playing/);
});

test("shipped player constructs Spotify.Player with getOAuthToken and connect", () => {
  const main = readFileSync(join(srcDir, "main.js"), "utf8");
  assert.match(main, /new Spotify\.Player/);
  assert.match(main, /getOAuthToken/);
  assert.match(main, /\.connect\s*\(/);
  assert.match(main, /player_state_changed/);
  assert.match(main, /mapPlaybackState/);
});
