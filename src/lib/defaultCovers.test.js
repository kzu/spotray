import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_COVERS,
  pickDefaultCover,
  resolveCoverArtUrl,
} from "./defaultCovers.js";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");

test("ships about a dozen default covers on disk", () => {
  assert.equal(DEFAULT_COVERS.length, 12);
  for (const href of DEFAULT_COVERS) {
    assert.match(href, /^\/assets\/covers\/.+\.jpe?g$/);
    const file = join(srcDir, href.replace(/^\//, "").replaceAll("/", "\\"));
    assert.ok(existsSync(file), `missing shipped cover ${file}`);
  }
});

test("pickDefaultCover uses the random input instead of a hardcoded file", () => {
  assert.equal(pickDefaultCover(() => 0), DEFAULT_COVERS[0]);
  assert.equal(pickDefaultCover(() => 0.5), DEFAULT_COVERS[6]);
  assert.equal(pickDefaultCover(() => 0.999), DEFAULT_COVERS[11]);
});

test("resolveCoverArtUrl keeps SDK art and only falls back when missing", () => {
  const fallback = DEFAULT_COVERS[3];
  assert.equal(
    resolveCoverArtUrl("https://i.scdn.co/image/large", fallback),
    "https://i.scdn.co/image/large",
  );
  assert.equal(resolveCoverArtUrl(null, fallback), fallback);
  assert.equal(resolveCoverArtUrl("", fallback), fallback);
  assert.equal(resolveCoverArtUrl("   ", fallback), fallback);
});
