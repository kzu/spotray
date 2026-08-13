/**
 * Parse a CSP policy string into a map of directive → tokens.
 * Used to inspect the shipped Tauri CSP (the real config the WebView gets).
 */
export function parseCsp(policy) {
  if (typeof policy !== "string" || !policy.trim()) {
    return {};
  }
  const directives = {};
  for (const part of policy.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const name = tokens[0].toLowerCase();
    directives[name] = tokens.slice(1);
  }
  return directives;
}

/** Origins a directive list actually allows (explicit tokens, not default-src fallback). */
export function directiveAllowsOrigin(tokens, origin) {
  if (!Array.isArray(tokens)) return false;
  return tokens.some((token) => token === origin || token === "*");
}
