import test from "node:test";
import assert from "node:assert/strict";
import { resolveRoute } from "../src/lib/routes";
import type { GalleryManifest } from "../src/types/gallery";

const manifest: GalleryManifest = {
  schemaVersion: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
  title: "Photos",
  rootAlbumId: "",
  albums: {
    "": {
      id: "",
      path: "",
      slug: "",
      title: "Photos",
      display: "folder",
      entries: [
        { kind: "media", id: "desert-sunset" },
        { kind: "album", id: "trail" },
      ],
      counts: { albums: 1, media: 1, images: 1, videos: 0 },
    },
    trail: {
      id: "trail",
      path: "trail",
      slug: "trail",
      title: "Trail",
      display: "inline",
      entries: [
        { kind: "media", id: "trail/01" },
        { kind: "media", id: "trail/clip" },
      ],
      counts: { albums: 0, media: 2, images: 1, videos: 1 },
    },
  },
  media: {
    "desert-sunset": media("desert-sunset", ""),
    "trail/01": media("trail/01", "trail"),
    "trail/clip": media("trail/clip", "trail"),
  },
};

test("resolves the root gallery", () => {
  const route = resolveRoute(manifest, "/");
  assert.equal(route.type, "album");
  if (route.type === "album") assert.equal(route.album.id, "");
});

test("resolves an album path", () => {
  const route = resolveRoute(manifest, "/trail");
  assert.equal(route.type, "album");
  if (route.type === "album") assert.equal(route.album.title, "Trail");
});

test("resolves media with album-local navigation", () => {
  const route = resolveRoute(manifest, "/trail/01");
  assert.equal(route.type, "media");
  if (route.type === "media") {
    assert.equal(route.closePath, "/trail");
    assert.equal(route.previousId, undefined);
    assert.equal(route.nextId, "trail/clip");
  }
});

test("resolves inlined media with parent gallery context", () => {
  const inlineManifest: GalleryManifest = {
    ...manifest,
    albums: {
      ...manifest.albums,
      "": {
        ...manifest.albums[""],
        entries: [
          { kind: "media", id: "desert-sunset" },
          { kind: "media", id: "trail/01" },
          { kind: "media", id: "trail/clip" },
        ],
        counts: { albums: 0, media: 3, images: 2, videos: 1 },
      },
    },
  };

  const route = resolveRoute(inlineManifest, "/trail/01", "");
  assert.equal(route.type, "media");
  if (route.type === "media") {
    assert.equal(route.closePath, "/");
    assert.equal(route.previousId, "desert-sunset");
    assert.equal(route.nextId, "trail/clip");
  }
});

function media(id: string, albumId: string) {
  return {
    id,
    albumId,
    slug: id.split("/").at(-1)!,
    title: id,
    type: "image" as const,
    sourcePath: `${id}.jpg`,
    originalFilename: `${id}.jpg`,
    contentHash: id,
    width: 100,
    height: 100,
    aspectRatio: 1,
    urls: { original: "/x.jpg", thumbnail: "/x.webp" },
  };
}
