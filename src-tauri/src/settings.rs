use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Settings {
    #[serde(default)]
    pub client_id: String,
    #[serde(default)]
    pub client_secret: Option<String>,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub access_token_expires_at: Option<i64>,
    #[serde(default)]
    pub device_name: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
}

impl Settings {
    pub fn has_client_id(&self) -> bool {
        !self.client_id.trim().is_empty()
    }

    pub fn has_tokens(&self) -> bool {
        self.refresh_token
            .as_deref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
            || self
                .access_token
                .as_deref()
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false)
    }

    pub fn has_device_name(&self) -> bool {
        self.device_name
            .as_deref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
    }

    pub fn is_configured(&self) -> bool {
        self.has_client_id() && self.has_tokens() && self.has_device_name()
    }
}

pub fn save_settings(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create settings dir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| format!("write settings: {e}"))
}

pub fn load_settings(path: &Path) -> Result<Option<Settings>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path).map_err(|e| format!("read settings: {e}"))?;
    if raw.trim().is_empty() {
        return Ok(None);
    }
    let settings: Settings =
        serde_json::from_str(&raw).map_err(|e| format!("parse settings: {e}"))?;
    Ok(Some(settings))
}

/// Clears stored Spotify credentials and device name by removing the settings file.
pub fn clear_settings(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("clear settings: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path(label: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("spotray-settings-{label}-{nanos}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("settings.json")
    }

    fn sample() -> Settings {
        Settings {
            client_id: "cid-123".into(),
            client_secret: Some("secret".into()),
            access_token: Some("at".into()),
            refresh_token: Some("rt".into()),
            access_token_expires_at: Some(1_700_000_000),
            device_name: Some("Kzu's DESKTOP-ABC".into()),
            display_name: Some("Kzu".into()),
        }
    }

    #[test]
    fn save_then_load_roundtrip() {
        let path = temp_path("roundtrip");
        let original = sample();
        save_settings(&path, &original).unwrap();
        let loaded = load_settings(&path).unwrap().expect("settings present");
        assert_eq!(loaded, original);
        assert!(loaded.is_configured());
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn load_missing_file_is_none() {
        let path = temp_path("missing");
        let _ = std::fs::remove_file(&path);
        assert!(load_settings(&path).unwrap().is_none());
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn clear_settings_removes_credentials() {
        let path = temp_path("clear");
        save_settings(&path, &sample()).unwrap();
        assert!(path.exists());
        clear_settings(&path).unwrap();
        assert!(!path.exists());
        assert!(load_settings(&path).unwrap().is_none());
        // second clear is idempotent
        clear_settings(&path).unwrap();
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn unconfigured_without_tokens_or_name() {
        let only_id = Settings {
            client_id: "cid".into(),
            ..Settings::default()
        };
        assert!(only_id.has_client_id());
        assert!(!only_id.has_tokens());
        assert!(!only_id.is_configured());
    }
}
