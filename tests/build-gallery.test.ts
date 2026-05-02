import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { buildGallery } from "../scripts/build-gallery";

test("buildGallery respects album metadata, cover, and order", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gallery-source-"));
  const output = await mkdtemp(path.join(os.tmpdir(), "gallery-public-"));

  try {
    await writeFile(
      path.join(root, "index.json"),
      JSON.stringify({ title: "My Photos", order: ["trail", "desert.jpg"] }),
    );
    await image(path.join(root, "desert.jpg"), 1200, 800);

    const trail = path.join(root, "trail");
    await mkdir(trail);
    await writeFile(
      path.join(trail, "index.json"),
      JSON.stringify({ title: "Trail", cover: "02.jpg", order: ["02.jpg", "01.jpg"] }),
    );
    await image(path.join(trail, "01.jpg"), 900, 1200);
    await image(path.join(trail, "02.jpg"), 1600, 900);

    const manifest = await buildGallery({ source: root, publicDir: output, force: false });

    assert.equal(manifest.title, "My Photos");
    assert.deepEqual(manifest.albums[""].entries.map((entry) => entry.id), ["trail", "desert"]);
    assert.equal(manifest.albums.trail.title, "Trail");
    assert.equal(manifest.albums.trail.coverMediaId, "trail/02");
    assert.deepEqual(manifest.albums.trail.entries.map((entry) => entry.id), ["trail/02", "trail/01"]);
    assert.equal(manifest.media["trail/01"].aspectRatio, 0.75);
    assert.match(manifest.media.desert.urls.original, /^\/media\/originals\//);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  }
});

async function image(file: string, width: number, height: number) {
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#8f7a5f",
    },
  })
    .jpeg()
    .toFile(file);
}
