pub const SPOTIFY_DASHBOARD_URL: &str = "https://developer.spotify.com/dashboard";
pub const REDIRECT_URI: &str = "http://127.0.0.1:30303/callback";
pub const OAUTH_PORT: u16 = 30303;

/// Paste-back fields the wizard asks for after the Dashboard steps.
pub const CLIENT_ID_FIELD: &str = "Client ID";
pub const CLIENT_SECRET_FIELD: &str = "Client Secret";

pub const OAUTH_SCOPES: &str = "streaming user-read-email user-read-private";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dashboard_url_is_official() {
        assert_eq!(
            SPOTIFY_DASHBOARD_URL,
            "https://developer.spotify.com/dashboard"
        );
        assert!(SPOTIFY_DASHBOARD_URL.starts_with("https://developer.spotify.com/"));
    }

    #[test]
    fn redirect_uri_is_local_callback() {
        assert_eq!(REDIRECT_URI, "http://127.0.0.1:30303/callback");
        assert_eq!(OAUTH_PORT, 30303);
    }

    #[test]
    fn streaming_scope_is_requested() {
        assert!(OAUTH_SCOPES.split_whitespace().any(|s| s == "streaming"));
    }

    #[test]
    fn paste_back_field_labels() {
        assert_eq!(CLIENT_ID_FIELD, "Client ID");
        assert_eq!(CLIENT_SECRET_FIELD, "Client Secret");
    }
}
