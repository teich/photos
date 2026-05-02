import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
      JSON.stringify({ title: "Trail", cover: "02.jpg", display: "folder", order: ["02.jpg", "01.jpg"] }),
    );
    await image(path.join(trail, "01.jpg"), 900, 1200);
    await image(path.join(trail, "02.jpg"), 1600, 900);

    const manifest = await buildGallery({ source: root, publicDir: output, force: false });

    assert.equal(manifest.title, "My Photos");
    assert.deepEqual(manifest.albums[""].entries.map((entry) => entry.id), ["trail", "desert"]);
    assert.equal(manifest.albums.trail.title, "Trail");
    assert.equal(manifest.albums.trail.display, "folder");
    assert.equal(manifest.albums.trail.coverMediaId, "trail/02");
    assert.deepEqual(manifest.albums.trail.entries.map((entry) => entry.id), ["trail/02", "trail/01"]);
    assert.equal(manifest.media["trail/01"].aspectRatio, 0.75);
    assert.match(manifest.media.desert.urls.original, /^\/media\/originals\//);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  }
});

test("buildGallery inlines child directories by default", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gallery-source-"));
  const output = await mkdtemp(path.join(os.tmpdir(), "gallery-public-"));

  try {
    const day = path.join(root, "day-one");
    await mkdir(day);
    await image(path.join(day, "01.jpg"), 1200, 800);
    await image(path.join(root, "cover.jpg"), 900, 900);

    const manifest = await buildGallery({ source: root, publicDir: output, force: false });

    assert.equal(manifest.albums["day-one"].display, "inline");
    assert.deepEqual(manifest.albums[""].entries.map((entry) => entry.id), ["cover", "day-one/01"]);
    assert.equal(manifest.albums[""].counts.media, 2);
    assert.equal(manifest.albums[""].counts.albums, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  }
});

test("buildGallery sorts media chronologically by capture date", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gallery-source-"));
  const output = await mkdtemp(path.join(os.tmpdir(), "gallery-public-"));

  try {
    await image(path.join(root, "03.jpg"), 1200, 800, "2026:01:03 10:00:00");
    await image(path.join(root, "01.jpg"), 1200, 800, "2026:01:01 10:00:00");
    await image(path.join(root, "02.jpg"), 1200, 800, "2026:01:02 10:00:00");

    const manifest = await buildGallery({ source: root, publicDir: output, force: false });

    assert.deepEqual(manifest.albums[""].entries.map((entry) => entry.id), ["01", "02", "03"]);
    assert.equal(manifest.media["01"].captureDate, "2026-01-01T10:00:00");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  }
});

test("buildGallery lets sidecar dates participate in chronological sorting", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gallery-source-"));
  const output = await mkdtemp(path.join(os.tmpdir(), "gallery-public-"));

  try {
    await image(path.join(root, "b.jpg"), 1200, 800);
    await writeFile(path.join(root, "b.json"), JSON.stringify({ date: "2026-01-02T10:00:00" }));
    await image(path.join(root, "a.jpg"), 1200, 800);
    await writeFile(path.join(root, "a.json"), JSON.stringify({ date: "2026-01-01T10:00:00" }));

    const manifest = await buildGallery({ source: root, publicDir: output, force: false });

    assert.deepEqual(manifest.albums[""].entries.map((entry) => entry.id), ["a", "b"]);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  }
});

test("buildGallery creates video preview and poster URLs", async (context) => {
  if (!(await commandWorks("ffmpeg")) || !(await commandWorks("ffprobe"))) {
    context.skip("ffmpeg and ffprobe are required for video processing");
    return;
  }

  const root = await mkdtemp(path.join(os.tmpdir(), "gallery-source-"));
  const output = await mkdtemp(path.join(os.tmpdir(), "gallery-public-"));

  try {
    await video(path.join(root, "clip.mp4"));
    const manifest = await buildGallery({ source: root, publicDir: output, force: false });
    const clip = manifest.media.clip;

    assert.equal(clip.type, "video");
    assert.equal(clip.width, 64);
    assert.equal(clip.height, 36);
    assert.match(clip.urls.original, /^\/media\/originals\//);
    assert.match(clip.urls.preview ?? "", /^\/media\/previews\/.+\.mp4$/);
    assert.match(clip.urls.poster ?? "", /^\/media\/posters\/.+\.jpg$/);
    assert.equal(clip.urls.thumbnail, clip.urls.poster);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  }
});

test("buildGallery can write media URLs against a public media base", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gallery-source-"));
  const output = await mkdtemp(path.join(os.tmpdir(), "gallery-public-"));

  try {
    await image(path.join(root, "cover.jpg"), 900, 900);

    const manifest = await buildGallery({
      source: root,
      publicDir: output,
      mediaBaseUrl: "https://blobs.zednine.com/",
      force: false,
    });

    assert.match(manifest.media.cover.urls.original, /^https:\/\/blobs\.zednine\.com\/media\/originals\//);
    assert.match(manifest.media.cover.urls.thumbnail, /^https:\/\/blobs\.zednine\.com\/media\/thumbnails\//);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  }
});

async function image(file: string, width: number, height: number, captureDate?: string) {
  let pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#8f7a5f",
    },
  }).jpeg();
  if (captureDate) {
    pipeline = pipeline.withExif({
      IFD0: { DateTime: captureDate },
      IFD2: { DateTimeOriginal: captureDate },
    });
  }
  await pipeline.toFile(file);
}

async function video(file: string) {
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=64x36:rate=12:duration=0.5",
    "-pix_fmt",
    "yuv420p",
    file,
  ]);
}

async function commandWorks(command: string): Promise<boolean> {
  try {
    await run(command, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

async function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${code ?? "unknown"}: ${stderr.trim()}`));
      }
    });
  });
}
