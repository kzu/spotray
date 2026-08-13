import assert from "node:assert/strict";
import test from "node:test";
import {
  mapPlaybackState,
  pickCoverArtUrl,
  SPOTIFY_ATTRIBUTION,
  uriToSpotifyUrl,
} from "./nowPlaying.js";

const SAMPLE_TRACK = {
  name: "Come Together",
  uri: "spotify:track:2EqlS6tkEnglzr7tkKAAYD",
  artists: [{ name: "The Beatles" }, { name: "George Martin" }],
  album: {
    name: "Abbey Road",
    images: [
      { url: "https://i.scdn.co/image/small", width: 64, height: 64 },
      { url: "https://i.scdn.co/image/large", width: 640, height: 640 },
      { url: "https://i.scdn.co/image/medium", width: 300, height: 300 },
    ],
  },
};

test("maps a representative Web Playback current_track", () => {
  const view = mapPlaybackState({
    paused: false,
    track_window: { current_track: SAMPLE_TRACK },
  });
  assert.equal(view.title, "Come Together");
  assert.equal(view.artists, "The Beatles, George Martin");
  assert.equal(view.coverArtUrl, "https://i.scdn.co/image/large");
  assert.equal(
    view.spotifyUrl,
    "https://open.spotify.com/track/2EqlS6tkEnglzr7tkKAAYD",
  );
  assert.equal(view.paused, false);
  assert.equal(view.attribution, SPOTIFY_ATTRIBUTION);
});

test("paused flag is forwarded from SDK state", () => {
  const view = mapPlaybackState({
    paused: true,
    track_window: { current_track: SAMPLE_TRACK },
  });
  assert.equal(view.paused, true);
  assert.equal(view.title, "Come Together");
});

test("no-track and null states do not invent art or titles", () => {
  const empties = [
    null,
    undefined,
    {},
    { track_window: {} },
    { track_window: { current_track: null } },
    { track_window: { current_track: undefined } },
  ];
  for (const state of empties) {
    const view = mapPlaybackState(state);
    assert.equal(view.title, null, `title invented for ${JSON.stringify(state)}`);
    assert.equal(view.coverArtUrl, null, `art invented for ${JSON.stringify(state)}`);
    assert.equal(view.artists, "");
    assert.equal(view.spotifyUrl, null);
    assert.equal(view.paused, true);
    assert.equal(view.attribution, SPOTIFY_ATTRIBUTION);
  }
});

test("track with no images or uri does not invent them", () => {
  const view = mapPlaybackState({
    paused: false,
    track_window: {
      current_track: {
        name: "Untitled",
        uri: "",
        artists: [],
        album: { images: [] },
      },
    },
  });
  assert.equal(view.title, "Untitled");
  assert.equal(view.coverArtUrl, null);
  assert.equal(view.spotifyUrl, null);
  assert.equal(view.artists, "");
});

test("uriToSpotifyUrl only accepts spotify URIs", () => {
  assert.equal(uriToSpotifyUrl("spotify:album:abc"), "https://open.spotify.com/album/abc");
  assert.equal(uriToSpotifyUrl("https://open.spotify.com/track/x"), null);
  assert.equal(uriToSpotifyUrl(""), null);
  assert.equal(uriToSpotifyUrl(null), null);
});

test("pickCoverArtUrl prefers the widest image and refuses empty lists", () => {
  assert.equal(pickCoverArtUrl(null), null);
  assert.equal(pickCoverArtUrl([]), null);
  assert.equal(
    pickCoverArtUrl([{ url: "a", width: 10 }, { url: "b", width: 99 }]),
    "b",
  );
});
