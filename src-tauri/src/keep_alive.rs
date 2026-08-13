use std::time::Duration;
use tauri::Manager;

/// Must match `KEEP_ALIVE_EVENT` in `src/lib/keepAlive.js`.
pub const EVENT_NAME: &str = "spotray-keep-alive";

/// Frequent enough to beat Spotify's idle drop and Chromium's hidden-page freeze.
pub const INTERVAL: Duration = Duration::from_secs(20);

pub fn script() -> String {
    format!("window.dispatchEvent(new Event('{EVENT_NAME}'))")
}

/// Poke the hidden WebView on a timer. JS intervals are throttled once the
/// window is in the tray; `eval` still runs and wakes the page.
pub fn spawn(app: tauri::AppHandle) {
    std::thread::Builder::new()
        .name("spotray-webview-keep-alive".into())
        .spawn(move || loop {
            std::thread::sleep(INTERVAL);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval(&script());
            }
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_dispatches_named_event() {
        assert_eq!(
            script(),
            "window.dispatchEvent(new Event('spotray-keep-alive'))"
        );
    }

    #[test]
    fn interval_is_short_enough_to_beat_idle() {
        assert!(INTERVAL.as_secs() >= 5);
        assert!(INTERVAL.as_secs() <= 30);
    }
}
