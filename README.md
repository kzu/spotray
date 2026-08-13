<p align="center">
  <img src="img/main.png" alt="Spotray playing a track" width="420" />
</p>

# Spotray

A tray-resident Tauri app that hosts the official [Spotify Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk) so this computer appears as a **Spotify Connect** device. Control playback from your phone. Spotray only streams and shows cover art plus metadata (required by Spotify’s license).

## Requirements

- Spotify Premium
- Windows with WebView2 (for Widevine / encrypted streams)
- A free app on the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)

## Run

```bash
npm install
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

On first launch a wizard walks through creating a Dashboard app, pasting the Client ID, signing in (PKCE) so the SDK can receive an access token, and naming the device (`{display name}'s {machine name}`).

| Welcome | Developer app |
| :---: | :---: |
| <img src="img/1-welcome.png" alt="Welcome step" width="280" /> | <img src="img/2-developer.png" alt="Developer Dashboard step" width="280" /> |
| **Sign in** | **Device name** |
| <img src="img/3-signin.png" alt="Sign in with Spotify" width="280" /> | <img src="img/4-name.png" alt="Name this Connect device" width="280" /> |

The window minimizes / closes to the tray. Tray menu: **Log out**, **Show**, **Exit**.
