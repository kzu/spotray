use crate::wizard::{OAUTH_PORT, OAUTH_SCOPES, REDIRECT_URI};
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use rand::Rng;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use url::Url;

const AUTH_URL: &str = "https://accounts.spotify.com/authorize";
const TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const ME_URL: &str = "https://api.spotify.com/v1/me";

#[derive(Debug, Clone)]
pub struct AuthRequest {
    pub url: String,
    pub verifier: String,
    pub state: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    pub expires_in: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MeResponse {
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub id: Option<String>,
}

pub fn random_string(len: usize) -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut rng = rand::thread_rng();
    (0..len)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

pub fn code_challenge_s256(verifier: &str) -> String {
    let hash = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hash)
}

pub fn build_auth_request(client_id: &str) -> AuthRequest {
    let verifier = random_string(64);
    let state = random_string(24);
    let challenge = code_challenge_s256(&verifier);
    let mut url = Url::parse(AUTH_URL).expect("static authorize url");
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("client_id", client_id);
        q.append_pair("response_type", "code");
        q.append_pair("redirect_uri", REDIRECT_URI);
        q.append_pair("scope", OAUTH_SCOPES);
        q.append_pair("code_challenge_method", "S256");
        q.append_pair("code_challenge", &challenge);
        q.append_pair("state", &state);
        q.append_pair("show_dialog", "true");
    }
    AuthRequest {
        url: url.to_string(),
        verifier,
        state,
    }
}

fn write_html(stream: &mut std::net::TcpStream, status: u16, message: &str) {
    let reason = if status == 200 { "OK" } else { "Error" };
    let body = format!(
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Spotray</title>\
         <style>body{{font-family:Georgia,serif;background:#121212;color:#fff;display:grid;\
         place-items:center;min-height:100vh;margin:0}}main{{max-width:28rem;text-align:center;\
         line-height:1.5}}p{{opacity:.8}}</style></head><body><main><h1>Spotray</h1><p>{message}</p>\
         </main></body></html>"
    );
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

pub fn wait_for_callback(expected_state: &str) -> Result<String, String> {
    let listener = TcpListener::bind(("127.0.0.1", OAUTH_PORT)).map_err(|e| {
        format!("Could not listen on {REDIRECT_URI} ({e}). Is another Spotray window already signing in?")
    })?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("socket: {e}"))?;

    let deadline = Instant::now() + Duration::from_secs(180);
    loop {
        if Instant::now() > deadline {
            return Err("Timed out waiting for Spotify sign-in. Try again.".into());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
                let mut buf = [0u8; 8192];
                let n = stream.read(&mut buf).unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]);
                let first = req.lines().next().unwrap_or("");
                let path = first.split_whitespace().nth(1).unwrap_or("/");
                if !path.starts_with("/callback") {
                    write_html(&mut stream, 404, "Not the Spotify redirect.");
                    continue;
                }
                let parsed = Url::parse(&format!("http://127.0.0.1{path}"))
                    .map_err(|e| format!("bad callback url: {e}"))?;
                let params: HashMap<String, String> =
                    parsed.query_pairs().into_owned().collect();

                if let Some(err) = params.get("error") {
                    write_html(
                        &mut stream,
                        400,
                        "Sign-in was cancelled. You can close this tab.",
                    );
                    return Err(format!("Spotify returned: {err}"));
                }

                let state = params.get("state").cloned().unwrap_or_default();
                if state != expected_state {
                    write_html(&mut stream, 400, "Sign-in state did not match.");
                    return Err("OAuth state mismatch. Try signing in again.".into());
                }

                let code = params
                    .get("code")
                    .cloned()
                    .filter(|c| !c.is_empty())
                    .ok_or_else(|| "Spotify did not return an authorization code".to_string())?;

                write_html(
                    &mut stream,
                    200,
                    "You're signed in. Return to Spotray — you can close this tab.",
                );
                return Ok(code);
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(80));
            }
            Err(e) => return Err(format!("callback listen: {e}")),
        }
    }
}

fn apply_client_auth(
    mut req: ureq::Request,
    client_id: &str,
    client_secret: Option<&str>,
) -> ureq::Request {
    if let Some(secret) = client_secret.filter(|s| !s.is_empty()) {
        let basic = STANDARD.encode(format!("{client_id}:{secret}"));
        req = req.set("Authorization", &format!("Basic {basic}"));
    }
    req
}

pub fn exchange_code(
    client_id: &str,
    client_secret: Option<&str>,
    code: &str,
    verifier: &str,
) -> Result<TokenResponse, String> {
    let req = apply_client_auth(
        ureq::post(TOKEN_URL).set("Content-Type", "application/x-www-form-urlencoded"),
        client_id,
        client_secret,
    );
    let response = req
        .send_form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", REDIRECT_URI),
            ("client_id", client_id),
            ("code_verifier", verifier),
        ])
        .map_err(ureq_err)?;
    response
        .into_json::<TokenResponse>()
        .map_err(|e| format!("token parse: {e}"))
}

pub fn refresh_access_token(
    client_id: &str,
    client_secret: Option<&str>,
    refresh_token: &str,
) -> Result<TokenResponse, String> {
    let req = apply_client_auth(
        ureq::post(TOKEN_URL).set("Content-Type", "application/x-www-form-urlencoded"),
        client_id,
        client_secret,
    );
    let response = req
        .send_form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", client_id),
        ])
        .map_err(ureq_err)?;
    response
        .into_json::<TokenResponse>()
        .map_err(|e| format!("refresh parse: {e}"))
}

pub fn fetch_me(access_token: &str) -> Result<MeResponse, String> {
    let response = ureq::get(ME_URL)
        .set("Authorization", &format!("Bearer {access_token}"))
        .call()
        .map_err(ureq_err)?;
    response
        .into_json::<MeResponse>()
        .map_err(|e| format!("profile parse: {e}"))
}

pub fn expires_at_from_now(expires_in: i64) -> i64 {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    now + expires_in
}

pub fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn ureq_err(err: ureq::Error) -> String {
    match err {
        ureq::Error::Status(code, response) => {
            let body = response.into_string().unwrap_or_default();
            format!("Spotify HTTP {code}: {body}")
        }
        other => format!("Spotify request failed: {other}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn challenge_is_url_safe_sha256() {
        // RFC 7636 appendix B
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            code_challenge_s256(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn auth_url_includes_pkce_and_redirect() {
        let req = build_auth_request("test-client-id");
        let url = Url::parse(&req.url).unwrap();
        assert_eq!(url.host_str(), Some("accounts.spotify.com"));
        let pairs: HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(pairs.get("client_id").unwrap(), "test-client-id");
        assert_eq!(pairs.get("response_type").unwrap(), "code");
        assert_eq!(pairs.get("redirect_uri").unwrap(), REDIRECT_URI);
        assert_eq!(pairs.get("code_challenge_method").unwrap(), "S256");
        assert_eq!(
            pairs.get("code_challenge").unwrap(),
            &code_challenge_s256(&req.verifier)
        );
        assert!(pairs.get("scope").unwrap().contains("streaming"));
        assert_eq!(pairs.get("state").unwrap(), &req.state);
        assert_eq!(req.verifier.len(), 64);
    }

    #[test]
    fn expiry_is_in_the_future() {
        let at = expires_at_from_now(3600);
        assert!(at > now_unix());
        assert!(at <= now_unix() + 3605);
    }
}
