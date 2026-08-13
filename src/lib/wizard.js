/** Official Spotify Developer Dashboard — opened via OS shell-open. */
export const SPOTIFY_DASHBOARD_URL = "https://developer.spotify.com/dashboard";

/** Redirect URI the user must add on the Dashboard (must match the Rust OAuth listener). */
export const REDIRECT_URI = "http://127.0.0.1:30303/callback";

export const SDK_SCRIPT_SRC = "https://sdk.scdn.co/spotify-player.js";

export const WIZARD_FIELDS = [
  {
    id: "clientId",
    label: "Client ID",
    required: true,
    placeholder: "Paste the Client ID from app Settings",
    pasteBack: true,
  },
  {
    id: "clientSecret",
    label: "Client Secret",
    required: false,
    placeholder: "Optional — paste if your app shows one",
    pasteBack: true,
  },
];

export const DASHBOARD_STEPS = [
  "Click Open Spotify Developer Dashboard. Log in with the Spotify account you want to stream from (Premium required).",
  "Click Create app.",
  "Give the app a name and a short description. If asked which APIs you will use, include Web Playback SDK.",
  "Under Redirect URIs, add exactly the URI shown below, accept the Developer Terms, then Save.",
  "Open the new app and click Settings. Copy the Client ID.",
  "Paste the Client ID into the field below. You can also paste the Client Secret if one is shown — it is optional for this app.",
  "Come back here and continue. Spotray will open a Spotify sign-in page to obtain an access token the player can use.",
];

export const WELCOME_COPY = {
  title: "This machine becomes a speaker",
  body: "Spotray hosts the official Spotify Web Playback SDK so it appears as a Spotify Connect device. Play, pause, and skip from your phone. This window only streams and shows what is playing.",
};
