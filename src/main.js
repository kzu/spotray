import {
  pickDefaultCover,
  resolveCoverArtUrl,
} from "./lib/defaultCovers.js";
import {
  KEEP_ALIVE_EVENT,
  bindPageLifecycle,
  createWebLockKeeper,
  startHeartbeat,
} from "./lib/keepAlive.js";
import { mapPlaybackState, SPOTIFY_ATTRIBUTION } from "./lib/nowPlaying.js";
import { createReconnectController } from "./lib/reconnect.js";
import {
  DASHBOARD_STEPS,
  REDIRECT_URI,
  SPOTIFY_DASHBOARD_URL,
  WIZARD_FIELDS,
} from "./lib/wizard.js";

const sessionDefaultCover = pickDefaultCover();

const invoke = window.__TAURI__?.core?.invoke;
const listen = window.__TAURI__?.event?.listen;

const wizardEl = document.getElementById("wizard");
const playerEl = document.getElementById("player");
const dashboardStepsEl = document.getElementById("dashboard-steps");
const redirectInput = document.getElementById("redirect-uri");
const clientIdInput = document.getElementById("client-id");
const clientSecretInput = document.getElementById("client-secret");
const deviceNameInput = document.getElementById("device-name");
const coverArt = document.getElementById("cover-art");
const artPlaceholder = document.getElementById("art-placeholder");
const trackTitle = document.getElementById("track-title");
const trackArtists = document.getElementById("track-artists");
const spotifyLink = document.getElementById("spotify-link");
const playerStatus = document.getElementById("player-status");
const attributionEl = document.getElementById("spotify-attribution");
const signinStatus = document.getElementById("signin-status");

let player = null;
let currentStep = "welcome";
let reconnect = null;
let stopHeartbeat = null;
const webLock = createWebLockKeeper();

function requireInvoke() {
  if (!invoke) {
    throw new Error("Tauri bridge is not available.");
  }
  return invoke;
}

function showError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function setStep(step) {
  currentStep = step;
  document.querySelectorAll(".step").forEach((node) => {
    const active = node.dataset.step === step;
    node.hidden = !active;
    node.classList.toggle("is-active", active);
  });
  const order = ["welcome", "dashboard", "signin", "name"];
  const idx = order.indexOf(step);
  document.querySelectorAll("#wizard-progress li").forEach((node) => {
    const nodeIdx = order.indexOf(node.dataset.step);
    node.classList.toggle("is-current", node.dataset.step === step);
    node.classList.toggle("is-done", nodeIdx >= 0 && nodeIdx < idx);
  });
}

function showWizard(step = "welcome") {
  wizardEl.hidden = false;
  playerEl.hidden = true;
  setStep(step);
}

function showPlayer() {
  wizardEl.hidden = true;
  playerEl.hidden = false;
  const label = document.getElementById("attribution-label");
  if (label) {
    label.textContent = SPOTIFY_ATTRIBUTION;
  }
}

function renderDashboardSteps() {
  dashboardStepsEl.replaceChildren();
  for (const text of DASHBOARD_STEPS) {
    const li = document.createElement("li");
    li.textContent = text;
    dashboardStepsEl.appendChild(li);
  }
  redirectInput.value = REDIRECT_URI;
  clientIdInput.placeholder =
    WIZARD_FIELDS.find((f) => f.id === "clientId")?.placeholder || "";
  clientSecretInput.placeholder =
    WIZARD_FIELDS.find((f) => f.id === "clientSecret")?.placeholder || "";
}

function applyNowPlaying(view) {
  if (view.title) {
    trackTitle.textContent = view.title;
  } else {
    trackTitle.textContent = "Nothing playing";
  }
  trackArtists.textContent = view.artists || "";

  const src = resolveCoverArtUrl(view.coverArtUrl, sessionDefaultCover);
  if (src) {
    if (coverArt.getAttribute("src") !== src) {
      delete coverArt.dataset.fallback;
      coverArt.src = src;
    }
    coverArt.alt = view.coverArtUrl && view.title
      ? `Cover art for ${view.title}`
      : "Spotray default cover";
    coverArt.hidden = false;
    artPlaceholder.hidden = true;
  } else {
    coverArt.removeAttribute("src");
    coverArt.alt = "";
    coverArt.hidden = true;
    artPlaceholder.hidden = false;
  }

  if (view.spotifyUrl) {
    spotifyLink.href = view.spotifyUrl;
    spotifyLink.hidden = false;
  } else {
    spotifyLink.hidden = true;
    spotifyLink.href = "https://open.spotify.com";
  }
}

function whenSdkReady() {
  if (window.Spotify?.Player || window.__spotifyWebPlaybackSdkReady) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Spotify Web Playback SDK did not load.")),
      20000,
    );
    window.addEventListener(
      "spotify-sdk-ready",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function formatReconnectStatus({ phase, delay }) {
  if (phase === "connecting") return "Reconnecting…";
  if (phase === "waiting") {
    const seconds = Math.max(1, Math.round((delay || 0) / 1000));
    return `Device went offline — reconnecting in ${seconds}s…`;
  }
  return "Device went offline — reconnecting…";
}

function tearDownPlayer() {
  if (stopHeartbeat) {
    stopHeartbeat();
    stopHeartbeat = null;
  }
  if (reconnect) {
    reconnect.stop();
    reconnect = null;
  }
  if (player) {
    try {
      player.disconnect();
    } catch {
      /* ignore */
    }
    player = null;
  }
}

async function tickPlayerKeepAlive() {
  if (!player) return;
  try {
    await player.getCurrentState();
  } catch {
    reconnect?.schedule("heartbeat");
  }
}

async function startPlayer() {
  const api = requireInvoke();
  const config = await api("get_player_config");
  await whenSdkReady();

  tearDownPlayer();
  webLock.acquire();

  player = new Spotify.Player({
    name: config.deviceName,
    getOAuthToken: (cb) => {
      api("get_access_token")
        .then((token) => cb(token))
        .catch((err) => {
          playerStatus.textContent = String(err);
        });
    },
    volume: 1,
  });

  reconnect = createReconnectController({
    connect: () => player.connect(),
    onStatus: (status) => {
      if (status.fatal || status.phase === "idle") return;
      playerStatus.textContent = formatReconnectStatus(status);
    },
  });

  player.addListener("ready", ({ device_id }) => {
    reconnect?.markReady();
    playerStatus.textContent = `Ready as ${config.deviceName}`;
    console.info("Spotify Connect ready", device_id);
  });

  player.addListener("not_ready", () => {
    playerStatus.textContent = "Device went offline — reconnecting…";
    reconnect?.schedule("not_ready");
  });

  player.addListener("player_state_changed", (state) => {
    const view = mapPlaybackState(state);
    applyNowPlaying(view);
    if (reconnect && reconnect.phase !== "idle") return;
    if (view.title) {
      playerStatus.textContent = view.paused ? "Paused" : "Now playing";
    } else {
      playerStatus.textContent = `Ready as ${config.deviceName} — pick it on your phone`;
    }
  });

  player.addListener("initialization_error", ({ message }) => {
    reconnect?.markFatal();
    playerStatus.textContent = message || "This environment cannot stream Spotify.";
  });
  player.addListener("authentication_error", ({ message }) => {
    reconnect?.markFatal();
    playerStatus.textContent = message || "Spotify authentication failed.";
  });
  player.addListener("account_error", ({ message }) => {
    reconnect?.markFatal();
    playerStatus.textContent = message || "Spotify Premium is required to stream.";
  });
  player.addListener("playback_error", ({ message }) => {
    playerStatus.textContent = message || "Playback failed.";
  });

  applyNowPlaying(mapPlaybackState(null));
  playerStatus.textContent = `Connecting as ${config.deviceName}…`;
  const ok = await player.connect();
  if (!ok) {
    playerStatus.textContent = "Could not connect the Spotify player.";
    reconnect.schedule("initial-connect");
  }

  stopHeartbeat = startHeartbeat(tickPlayerKeepAlive);
}

async function bootstrap() {
  renderDashboardSteps();
  applyNowPlaying(mapPlaybackState(null));

  if (!invoke) {
    showWizard("welcome");
    return;
  }

  if (listen) {
    await listen("logged-out", () => {
      tearDownPlayer();
      webLock.drop();
      clientIdInput.value = "";
      clientSecretInput.value = "";
      deviceNameInput.value = "";
      showWizard("welcome");
    });
  }

  bindPageLifecycle(() => {
    reconnect?.flush();
  });

  window.addEventListener(KEEP_ALIVE_EVENT, () => {
    void tickPlayerKeepAlive();
    reconnect?.flush();
  });

  const status = await invoke("get_setup_status");
  if (status.clientId) {
    clientIdInput.value = status.clientId;
  }
  if (status.deviceName) {
    deviceNameInput.value = status.deviceName;
  }

  if (status.configured) {
    showPlayer();
    await startPlayer();
    return;
  }

  if (status.hasTokens) {
    const fallback = await invoke("get_default_device_name");
    deviceNameInput.value = status.deviceName || fallback;
    showWizard("name");
    return;
  }

  if (status.hasClientId) {
    showWizard("signin");
    return;
  }

  showWizard("welcome");
}

document.getElementById("welcome-next").addEventListener("click", () => {
  setStep("dashboard");
});

document.getElementById("open-dashboard").addEventListener("click", async () => {
  if (invoke) {
    await invoke("open_spotify_dashboard");
    return;
  }
  window.open(SPOTIFY_DASHBOARD_URL, "_blank", "noopener");
});

document.getElementById("copy-redirect").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(REDIRECT_URI);
    document.getElementById("copy-redirect").textContent = "Copied";
    setTimeout(() => {
      document.getElementById("copy-redirect").textContent = "Copy";
    }, 1400);
  } catch {
    redirectInput.select();
  }
});

document.getElementById("dashboard-next").addEventListener("click", async () => {
  showError("dashboard-error");
  const clientId = clientIdInput.value.trim();
  if (!clientId) {
    showError("dashboard-error", "Paste the Client ID from the Spotify Dashboard.");
    return;
  }
  try {
    if (invoke) {
      await invoke("save_client_credentials", {
        clientId,
        clientSecret: clientSecretInput.value.trim() || null,
      });
    }
    setStep("signin");
  } catch (err) {
    showError("dashboard-error", String(err));
  }
});

document.getElementById("signin-start").addEventListener("click", async () => {
  showError("signin-error");
  const button = document.getElementById("signin-start");
  button.disabled = true;
  signinStatus.textContent = "Complete sign-in in your browser…";
  try {
    const result = await requireInvoke()("start_oauth");
    deviceNameInput.value = result.defaultDeviceName;
    signinStatus.textContent = `Signed in as ${result.displayName}.`;
    setStep("name");
  } catch (err) {
    showError("signin-error", String(err));
    signinStatus.textContent = "Sign-in did not finish.";
  } finally {
    button.disabled = false;
  }
});

document.getElementById("name-save").addEventListener("click", async () => {
  showError("name-error");
  const deviceName = deviceNameInput.value.trim();
  if (!deviceName) {
    showError("name-error", "Give this player a name.");
    return;
  }
  try {
    await requireInvoke()("save_device_name", { deviceName });
    showPlayer();
    await startPlayer();
  } catch (err) {
    showError("name-error", String(err));
  }
});

document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => setStep(button.dataset.back));
});

coverArt.addEventListener("error", () => {
  if (coverArt.dataset.fallback === "1" || !sessionDefaultCover) {
    coverArt.hidden = true;
    artPlaceholder.hidden = false;
    return;
  }
  coverArt.dataset.fallback = "1";
  coverArt.src = sessionDefaultCover;
});

spotifyLink.addEventListener("click", async (event) => {
  if (!invoke) return;
  event.preventDefault();
  const href = spotifyLink.getAttribute("href");
  if (href) {
    await invoke("open_external", { url: href });
  }
});

bootstrap().catch((err) => {
  console.error(err);
  showWizard("welcome");
  showError("dashboard-error", String(err));
});
