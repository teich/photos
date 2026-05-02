import crypto from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { AlbumRecord, GalleryEntry, GalleryManifest, MediaKind, MediaRecord } from "../src/types/gallery";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".tif", ".tiff"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm"]);

interface AlbumMetadata {
  title?: string;
  cover?: string;
  description?: string;
  order?: string[];
}

interface MediaMetadata {
  title?: string;
  caption?: string;
  date?: string;
}

interface BuildOptions {
  source: string;
  publicDir: string;
  force: boolean;
}

interface BuildState {
  options: BuildOptions;
  manifest: GalleryManifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await buildGallery(options);
  await mkdir(options.publicDir, { recursive: true });
  await writeFile(path.join(options.publicDir, "gallery.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${path.join(options.publicDir, "gallery.json")}`);
}

export async function buildGallery(options: BuildOptions): Promise<GalleryManifest> {
  const state: BuildState = {
    options,
    manifest: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      title: "Photos",
      rootAlbumId: "",
      albums: {},
      media: {},
    },
  };

  await scanAlbum(state, options.source, "");
  state.manifest.title = state.manifest.albums[""]?.title ?? state.manifest.title;
  return state.manifest;
}

function parseArgs(args: string[]): BuildOptions {
  const sourceIndex = args.findIndex((arg) => arg === "--source" || arg === "-s");
  const publicIndex = args.findIndex((arg) => arg === "--public-dir");
  const source = sourceIndex >= 0 ? args[sourceIndex + 1] : process.env.GALLERY_SOURCE;
  if (!source) {
    throw new Error("Missing source directory. Use --source /path/to/source-media or GALLERY_SOURCE.");
  }

  return {
    source: path.resolve(source),
    publicDir: path.resolve(publicIndex >= 0 ? args[publicIndex + 1] : "public"),
    force: args.includes("--force"),
  };
}

async function scanAlbum(state: BuildState, absoluteDir: string, albumId: string): Promise<AlbumRecord> {
  const metadata = await readJson<AlbumMetadata>(path.join(absoluteDir, "index.json"));
  const dirents = await readdir(absoluteDir, { withFileTypes: true });
  const names = orderNames(
    dirents.filter((dirent) => dirent.name !== "index.json" && !dirent.name.startsWith(".")).map((dirent) => dirent.name),
    metadata?.order,
  );
  const entries: GalleryEntry[] = [];
  const album: AlbumRecord = {
    id: albumId,
    path: albumId,
    slug: albumId.split("/").at(-1) ?? "",
    title: metadata?.title ?? (albumId ? titleFromSlug(path.basename(albumId)) : "Photos"),
    description: metadata?.description,
    entries,
    counts: { albums: 0, media: 0, images: 0, videos: 0 },
  };

  state.manifest.albums[albumId] = album;

  for (const name of names) {
    const absolutePath = path.join(absoluteDir, name);
    const info = await stat(absolutePath);
    const childSlug = slugFromName(name);
    const childId = albumId ? `${albumId}/${childSlug}` : childSlug;

    if (info.isDirectory()) {
      const child = await scanAlbum(state, absolutePath, childId);
      entries.push({ kind: "album", id: child.id });
      album.counts.albums += 1;
      continue;
    }

    if (!info.isFile()) continue;
    const kind = mediaKind(name);
    if (!kind) continue;

    const media = await processMedia(state, absolutePath, name, albumId, childId, kind);
    entries.push({ kind: "media", id: media.id });
    album.counts.media += 1;
    if (kind === "image") album.counts.images += 1;
    if (kind === "video") album.counts.videos += 1;
  }

  album.coverMediaId = pickCoverMediaId(state.manifest, album, metadata?.cover);
  return album;
}

async function processMedia(
  state: BuildState,
  absolutePath: string,
  filename: string,
  albumId: string,
  id: string,
  type: MediaKind,
): Promise<MediaRecord> {
  const metadata = await readJson<MediaMetadata>(sidecarPath(absolutePath));
  const hash = await hashFile(absolutePath);
  const ext = path.extname(filename).toLowerCase();
  const originalName = `${hash}${ext}`;
  const thumbnailName = `${hash}.webp`;
  const publicOriginal = path.join(state.options.publicDir, "media", "originals", originalName);
  const publicThumbnail = path.join(state.options.publicDir, "media", "thumbnails", thumbnailName);

  await mkdir(path.dirname(publicOriginal), { recursive: true });
  await mkdir(path.dirname(publicThumbnail), { recursive: true });
  await copyIfNeeded(absolutePath, publicOriginal, state.options.force);

  const dimensions = type === "image" ? await imageDimensions(absolutePath) : { width: 16, height: 9 };
  if (type === "image") {
    await thumbnailImage(absolutePath, publicThumbnail, state.options.force);
  }

  const title = metadata?.title ?? titleFromSlug(path.basename(filename, ext));
  const sourcePath = path.relative(state.options.source, absolutePath).split(path.sep).join("/");
  const urls =
    type === "image"
      ? { original: `/media/originals/${originalName}`, thumbnail: `/media/thumbnails/${thumbnailName}` }
      : { original: `/media/originals/${originalName}`, thumbnail: "", poster: "" };

  const record: MediaRecord = {
    id,
    albumId,
    slug: path.basename(id),
    title,
    caption: metadata?.caption,
    type,
    sourcePath,
    originalFilename: filename,
    contentHash: hash,
    width: dimensions.width,
    height: dimensions.height,
    aspectRatio: dimensions.width / dimensions.height,
    captureDate: metadata?.date,
    urls,
  };

  state.manifest.media[id] = record;
  return record;
}

function mediaKind(name: string): MediaKind | undefined {
  const extension = path.extname(name).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return undefined;
}

function orderNames(names: string[], order: string[] | undefined): string[] {
  if (!order?.length) return [...names].sort(naturalSort);
  const orderIndex = new Map(order.map((name, index) => [name, index]));
  return [...names].sort((a, b) => {
    const aIndex = orderIndex.get(a);
    const bIndex = orderIndex.get(b);
    if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
    if (aIndex !== undefined) return -1;
    if (bIndex !== undefined) return 1;
    return naturalSort(a, b);
  });
}

function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

function pickCoverMediaId(manifest: GalleryManifest, album: AlbumRecord, coverName?: string): string | undefined {
  if (coverName) {
    const coverSlug = slugFromName(coverName);
    const coverId = album.id ? `${album.id}/${coverSlug}` : coverSlug;
    if (manifest.media[coverId]) return coverId;
  }

  for (const entry of album.entries) {
    if (entry.kind === "media") return entry.id;
    const child = manifest.albums[entry.id];
    if (child?.coverMediaId) return child.coverMediaId;
  }

  return undefined;
}

async function imageDimensions(file: string): Promise<{ width: number; height: number }> {
  const metadata = await sharp(file).metadata();
  return {
    width: metadata.width ?? 1200,
    height: metadata.height ?? 900,
  };
}

async function thumbnailImage(source: string, dest: string, force: boolean) {
  if (!force && (await exists(dest))) return;
  await sharp(source).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 82 }).toFile(dest);
}

async function copyIfNeeded(source: string, dest: string, force: boolean) {
  if (!force && (await exists(dest))) return;
  await copyFile(source, dest);
}

async function hashFile(file: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  hash.update(await readFile(file));
  return hash.digest("hex").slice(0, 24);
}

async function readJson<T>(file: string): Promise<T | undefined> {
  if (!(await exists(file))) return undefined;
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function sidecarPath(file: string): string {
  return file.replace(path.extname(file), ".json");
}

function slugFromName(name: string): string {
  return path
    .basename(name, path.extname(name))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleFromSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
