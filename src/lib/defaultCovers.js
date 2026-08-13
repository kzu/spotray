/** Bundled fallback album art shown when Spotify reports no cover. */
export const DEFAULT_COVERS = [
  "/assets/covers/01-orbital-vinyl.jpg",
  "/assets/covers/02-glass-waves.jpg",
  "/assets/covers/03-nebula-cans.jpg",
  "/assets/covers/04-cockpit-eq.jpg",
  "/assets/covers/05-membrane.jpg",
  "/assets/covers/06-orbit-cassette.jpg",
  "/assets/covers/07-city-streams.jpg",
  "/assets/covers/08-hull-key.jpg",
  "/assets/covers/09-ice-aurora.jpg",
  "/assets/covers/10-tuning-fork.jpg",
  "/assets/covers/11-dish-stars.jpg",
  "/assets/covers/12-linen-grille.jpg",
];

/**
 * Pick one bundled cover. Pass a custom `random` (0–1) in tests.
 * Production calls this once per session so the idle art does not flicker.
 */
export function pickDefaultCover(random = Math.random) {
  const n = DEFAULT_COVERS.length;
  if (n === 0) return null;
  const value = typeof random === "function" ? random() : Number(random);
  const unit = Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
  return DEFAULT_COVERS[Math.floor(unit * n)];
}

/** Prefer the SDK cover; otherwise use the session fallback. Never invent a track title. */
export function resolveCoverArtUrl(coverArtUrl, fallbackCover) {
  if (typeof coverArtUrl === "string" && coverArtUrl.trim()) {
    return coverArtUrl;
  }
  return fallbackCover || null;
}
