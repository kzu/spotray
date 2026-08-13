/** Visible attribution required when displaying Spotify content. */
export const SPOTIFY_ATTRIBUTION = "Streaming from Spotify";

/**
 * Convert a Spotify URI (`spotify:track:…`) to an open.spotify.com content link.
 * Returns null when the URI is missing or not a spotify: URI.
 */
export function uriToSpotifyUrl(uri) {
  if (!uri || typeof uri !== "string") {
    return null;
  }
  const parts = uri.split(":");
  if (parts.length < 3 || parts[0] !== "spotify") {
    return null;
  }
  const type = parts[1];
  const id = parts.slice(2).join(":");
  if (!type || !id) {
    return null;
  }
  return `https://open.spotify.com/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
}

/**
 * Pick the largest album image URL. Does not invent a fallback image.
 */
export function pickCoverArtUrl(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return null;
  }
  const withUrl = images.filter((image) => image && typeof image.url === "string" && image.url);
  if (withUrl.length === 0) {
    return null;
  }
  return [...withUrl].sort((a, b) => (b.width || 0) - (a.width || 0))[0].url;
}

const EMPTY_VIEW = Object.freeze({
  title: null,
  artists: "",
  coverArtUrl: null,
  spotifyUrl: null,
  paused: true,
  attribution: SPOTIFY_ATTRIBUTION,
});

/**
 * Map a Web Playback SDK `player_state_changed` payload (or getCurrentState)
 * to the now-playing view model. A missing/null track does not invent art or titles.
 */
export function mapPlaybackState(state) {
  const track = state && state.track_window && state.track_window.current_track;
  if (!track) {
    return { ...EMPTY_VIEW };
  }

  const title = typeof track.name === "string" && track.name.trim() ? track.name : null;
  const artists = Array.isArray(track.artists)
    ? track.artists
        .map((artist) => (artist && artist.name ? String(artist.name) : ""))
        .filter(Boolean)
        .join(", ")
    : "";
  const coverArtUrl = pickCoverArtUrl(track.album && track.album.images);
  const spotifyUrl = uriToSpotifyUrl(track.uri);

  return {
    title,
    artists,
    coverArtUrl,
    spotifyUrl,
    paused: Boolean(state.paused),
    attribution: SPOTIFY_ATTRIBUTION,
  };
}
