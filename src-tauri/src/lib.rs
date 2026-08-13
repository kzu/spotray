mod device_name;
mod keep_alive;
mod oauth;
mod settings;
mod wizard;

use settings::Settings;
use std::path::PathBuf;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_opener::OpenerExt;

pub const TRAY_LOG_OUT: &str = "Log out";
pub const TRAY_SHOW: &str = "Show";
pub const TRAY_EXIT: &str = "Exit";
pub const EVENT_LOGGED_OUT: &str = "logged-out";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupStatus {
    configured: bool,
    has_client_id: bool,
    has_tokens: bool,
    has_device_name: bool,
    client_id: Option<String>,
    device_name: Option<String>,
    display_name: Option<String>,
    dashboard_url: String,
    redirect_uri: String,
    client_id_field: &'static str,
    client_secret_field: &'static str,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OAuthResult {
    display_name: String,
    default_device_name: String,
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    Ok(dir.join("settings.json"))
}

fn load_or_default(app: &tauri::AppHandle) -> Result<Settings, String> {
    Ok(settings::load_settings(&settings_path(app)?)?.unwrap_or_default())
}

fn persist(app: &tauri::AppHandle, settings: &Settings) -> Result<(), String> {
    settings::save_settings(&settings_path(app)?, settings)
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn perform_logout(app: &tauri::AppHandle) -> Result<(), String> {
    settings::clear_settings(&settings_path(app)?)?;
    let _ = app.emit(EVENT_LOGGED_OUT, ());
    show_main_window(app);
    Ok(())
}

#[tauri::command]
fn get_setup_status(app: tauri::AppHandle) -> Result<SetupStatus, String> {
    let s = load_or_default(&app)?;
    Ok(SetupStatus {
        configured: s.is_configured(),
        has_client_id: s.has_client_id(),
        has_tokens: s.has_tokens(),
        has_device_name: s.has_device_name(),
        client_id: s.has_client_id().then(|| s.client_id.clone()),
        device_name: s.device_name.clone(),
        display_name: s.display_name.clone(),
        dashboard_url: wizard::SPOTIFY_DASHBOARD_URL.to_string(),
        redirect_uri: wizard::REDIRECT_URI.to_string(),
        client_id_field: wizard::CLIENT_ID_FIELD,
        client_secret_field: wizard::CLIENT_SECRET_FIELD,
    })
}

#[tauri::command]
fn open_spotify_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    app.opener()
        .open_url(wizard::SPOTIFY_DASHBOARD_URL, None::<&str>)
        .map_err(|e| format!("open dashboard: {e}"))
}

#[tauri::command]
fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let allowed = url == wizard::SPOTIFY_DASHBOARD_URL
        || url.starts_with("https://open.spotify.com/")
        || url.starts_with("https://accounts.spotify.com/")
        || url.starts_with("https://developer.spotify.com/");
    if !allowed {
        return Err("That link is not allowed to open from Spotray.".into());
    }
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("open url: {e}"))
}

#[tauri::command]
fn save_client_credentials(
    app: tauri::AppHandle,
    client_id: String,
    client_secret: Option<String>,
) -> Result<(), String> {
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() {
        return Err(format!("{} is required.", wizard::CLIENT_ID_FIELD));
    }
    let mut s = load_or_default(&app)?;
    s.client_id = client_id;
    s.client_secret = client_secret.and_then(|v| {
        let t = v.trim().to_string();
        if t.is_empty() {
            None
        } else {
            Some(t)
        }
    });
    persist(&app, &s)
}

#[tauri::command]
async fn start_oauth(app: tauri::AppHandle) -> Result<OAuthResult, String> {
    let current = load_or_default(&app)?;
    if !current.has_client_id() {
        return Err("Save a Client ID before signing in.".into());
    }
    let client_id = current.client_id.clone();
    let client_secret = current.client_secret.clone();
    let request = oauth::build_auth_request(&client_id);

    app.opener()
        .open_url(&request.url, None::<&str>)
        .map_err(|e| format!("open Spotify sign-in: {e}"))?;

    let expected_state = request.state.clone();
    let code = tauri::async_runtime::spawn_blocking(move || oauth::wait_for_callback(&expected_state))
        .await
        .map_err(|e| format!("oauth wait: {e}"))??;

    let verifier = request.verifier.clone();
    let secret_for_exchange = client_secret.clone();
    let client_id_for_exchange = client_id.clone();
    let tokens = tauri::async_runtime::spawn_blocking(move || {
        oauth::exchange_code(
            &client_id_for_exchange,
            secret_for_exchange.as_deref(),
            &code,
            &verifier,
        )
    })
    .await
    .map_err(|e| format!("oauth exchange: {e}"))??;

    let access = tokens.access_token.clone();
    let me = tauri::async_runtime::spawn_blocking(move || oauth::fetch_me(&access))
        .await
        .map_err(|e| format!("profile: {e}"))??;

    let display_name = me
        .display_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| {
            me.id
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(device_name::os_username);

    let mut s = load_or_default(&app)?;
    s.access_token = Some(tokens.access_token);
    if let Some(refresh) = tokens.refresh_token {
        s.refresh_token = Some(refresh);
    }
    s.access_token_expires_at = Some(oauth::expires_at_from_now(tokens.expires_in));
    s.display_name = Some(display_name.clone());
    persist(&app, &s)?;

    Ok(OAuthResult {
        default_device_name: device_name::format_device_name(
            &display_name,
            &device_name::machine_name(),
        ),
        display_name,
    })
}

#[tauri::command]
fn get_default_device_name(app: tauri::AppHandle) -> Result<String, String> {
    let s = load_or_default(&app)?;
    Ok(device_name::default_device_name(s.display_name.as_deref()))
}

#[tauri::command]
fn save_device_name(app: tauri::AppHandle, device_name: String) -> Result<(), String> {
    let device_name = device_name.trim().to_string();
    if device_name.is_empty() {
        return Err("Give this player a name.".into());
    }
    let mut s = load_or_default(&app)?;
    s.device_name = Some(device_name);
    persist(&app, &s)
}

#[tauri::command]
fn get_player_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let s = load_or_default(&app)?;
    if !s.is_configured() {
        return Err("Setup is not finished.".into());
    }
    Ok(serde_json::json!({
        "deviceName": s.device_name,
        "displayName": s.display_name,
    }))
}

#[tauri::command]
async fn get_access_token(app: tauri::AppHandle) -> Result<String, String> {
    let mut s = load_or_default(&app)?;
    if !s.has_client_id() {
        return Err("No Client ID stored. Log out and run the wizard again.".into());
    }

    let still_valid = s
        .access_token
        .as_deref()
        .filter(|t| !t.is_empty())
        .zip(s.access_token_expires_at)
        .map(|(token, exp)| (token.to_string(), exp > oauth::now_unix() + 60));

    if let Some((token, true)) = still_valid {
        return Ok(token);
    }

    let refresh = s
        .refresh_token
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .ok_or_else(|| "No refresh token. Log out and sign in again.".to_string())?
        .to_string();

    let client_id = s.client_id.clone();
    let secret = s.client_secret.clone();
    let tokens = tauri::async_runtime::spawn_blocking(move || {
        oauth::refresh_access_token(&client_id, secret.as_deref(), &refresh)
    })
    .await
    .map_err(|e| format!("refresh: {e}"))??;
    s.access_token = Some(tokens.access_token.clone());
    if let Some(new_refresh) = tokens.refresh_token {
        s.refresh_token = Some(new_refresh);
    }
    s.access_token_expires_at = Some(oauth::expires_at_from_now(tokens.expires_in));
    persist(&app, &s)?;
    Ok(tokens.access_token)
}

#[tauri::command]
fn logout(app: tauri::AppHandle) -> Result<(), String> {
    perform_logout(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_setup_status,
            open_spotify_dashboard,
            open_external,
            save_client_credentials,
            start_oauth,
            get_default_device_name,
            save_device_name,
            get_player_config,
            get_access_token,
            logout,
        ])
        .setup(|app| {
            let logout = MenuItemBuilder::with_id("logout", TRAY_LOG_OUT).build(app)?;
            let show = MenuItemBuilder::with_id("show", TRAY_SHOW).build(app)?;
            let exit = MenuItemBuilder::with_id("exit", TRAY_EXIT).build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&logout, &show, &exit])
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .expect("default window icon"),
                )
                .menu(&menu)
                .tooltip("Spotray — Spotify Connect")
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "logout" => {
                        let _ = perform_logout(app);
                    }
                    "show" => show_main_window(app),
                    "exit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            keep_alive::spawn(app.handle().clone());

            if let Some(window) = app.get_webview_window("main") {
                let window_for_events = window.clone();
                window.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = window_for_events.hide();
                    }
                    WindowEvent::Resized(_) => {
                        if window_for_events.is_minimized().unwrap_or(false) {
                            let _ = window_for_events.hide();
                        }
                    }
                    _ => {}
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_labels_are_literal() {
        assert_eq!(TRAY_LOG_OUT, "Log out");
        assert_eq!(TRAY_SHOW, "Show");
        assert_eq!(TRAY_EXIT, "Exit");
    }

    #[test]
    fn dashboard_constant_matches_wizard() {
        assert_eq!(
            wizard::SPOTIFY_DASHBOARD_URL,
            "https://developer.spotify.com/dashboard"
        );
    }
}
