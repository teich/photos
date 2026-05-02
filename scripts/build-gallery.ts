import crypto from "node:crypto";
import { spawn } from "node:child_process";
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
  display?: "folder" | "inline";
}

interface MediaMetadata {
  title?: string;
  caption?: string;
  date?: string;
}

interface BuildOptions {
  source: string;
  publicDir: string;
  mediaBaseUrl?: string;
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
  const mediaBaseUrl = readArg(args, "--media-base-url") ?? process.env.GALLERY_MEDIA_BASE_URL;
  const source = sourceIndex >= 0 ? args[sourceIndex + 1] : process.env.GALLERY_SOURCE;
  if (!source) {
    throw new Error("Missing source directory. Use --source /path/to/source-media or GALLERY_SOURCE.");
  }

  return {
    source: path.resolve(source),
    publicDir: path.resolve(publicIndex >= 0 ? args[publicIndex + 1] : "public"),
    mediaBaseUrl: mediaBaseUrl ? mediaBaseUrl.replace(/\/+$/g, "") : undefined,
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
    display: metadata?.display ?? (albumId ? "inline" : "folder"),
    parentAlbumId: parentAlbumId(albumId),
    childAlbumIds: [],
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
      album.childAlbumIds?.push(child.id);
      if (child.display === "inline") {
        entries.push(...child.entries);
        album.counts.albums += child.counts.albums;
        album.counts.media += child.counts.media;
        album.counts.images += child.counts.images;
        album.counts.videos += child.counts.videos;
      } else {
        entries.push({ kind: "album", id: child.id });
        album.counts.albums += 1;
      }
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

  if (!metadata?.order?.length) {
    sortEntriesChronologically(state.manifest, entries);
  }
  album.coverMediaId = pickCoverMediaId(state.manifest, album, metadata?.cover);
  return album;
}

function parentAlbumId(albumId: string): string | undefined {
  if (!albumId) return undefined;
  const parts = albumId.split("/");
  parts.pop();
  return parts.join("/");
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
  const posterName = `${hash}.jpg`;
  const previewName = `${hash}.mp4`;
  const publicOriginal = path.join(state.options.publicDir, "media", "originals", originalName);
  const publicThumbnail = path.join(state.options.publicDir, "media", "thumbnails", thumbnailName);
  const publicPreview = path.join(state.options.publicDir, "media", "previews", previewName);
  const publicPoster = path.join(state.options.publicDir, "media", "posters", posterName);

  await mkdir(path.dirname(publicOriginal), { recursive: true });
  await mkdir(path.dirname(publicThumbnail), { recursive: true });
  await mkdir(path.dirname(publicPreview), { recursive: true });
  await mkdir(path.dirname(publicPoster), { recursive: true });
  await copyIfNeeded(absolutePath, publicOriginal, state.options.force);

  const dimensions = type === "image" ? await imageDimensions(absolutePath) : await safeVideoDimensions(absolutePath);
  let previewGenerated = false;
  let posterGenerated = false;

  if (type === "image") {
    await thumbnailImage(absolutePath, publicThumbnail, state.options.force);
  } else {
    previewGenerated = await safeVideoPreview(absolutePath, publicPreview, state.options.force);
    posterGenerated = await safeVideoPoster(absolutePath, publicPoster, state.options.force);
  }

  const title = metadata?.title ?? titleFromSlug(path.basename(filename, ext));
  const sourcePath = path.relative(state.options.source, absolutePath).split(path.sep).join("/");
  const urls =
    type === "image"
      ? {
          original: assetUrl(state, `media/originals/${originalName}`),
          thumbnail: assetUrl(state, `media/thumbnails/${thumbnailName}`),
        }
      : {
          original: assetUrl(state, `media/originals/${originalName}`),
          thumbnail: posterGenerated ? assetUrl(state, `media/posters/${posterName}`) : "",
          poster: posterGenerated ? assetUrl(state, `media/posters/${posterName}`) : undefined,
          preview: previewGenerated ? assetUrl(state, `media/previews/${previewName}`) : assetUrl(state, `media/originals/${originalName}`),
        };

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
    captureDate: metadata?.date ?? (await captureDateForMedia(type, absolutePath)),
    urls,
  };

  state.manifest.media[id] = record;
  return record;
}

function assetUrl(state: BuildState, key: string): string {
  return state.options.mediaBaseUrl ? `${state.options.mediaBaseUrl.replace(/\/+$/g, "")}/${key}` : `/${key}`;
}

function readArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
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

function sortEntriesChronologically(manifest: GalleryManifest, entries: GalleryEntry[]) {
  const indexed = new Map(entries.map((entry, index) => [entry, index]));
  entries.sort((a, b) => {
    const aTime = entryCaptureTime(manifest, a);
    const bTime = entryCaptureTime(manifest, b);
    if (aTime !== undefined && bTime !== undefined && aTime !== bTime) return aTime - bTime;
    if (aTime !== undefined && bTime === undefined) return -1;
    if (aTime === undefined && bTime !== undefined) return 1;
    return (indexed.get(a) ?? 0) - (indexed.get(b) ?? 0);
  });
}

function entryCaptureTime(manifest: GalleryManifest, entry: GalleryEntry): number | undefined {
  if (entry.kind === "media") return parseCaptureTime(manifest.media[entry.id]?.captureDate);

  const album = manifest.albums[entry.id];
  if (!album) return undefined;
  const times = album.entries
    .map((childEntry) => entryCaptureTime(manifest, childEntry))
    .filter((time): time is number => time !== undefined);
  return times.length ? Math.min(...times) : undefined;
}

function parseCaptureTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = normalizeExifDate(value) ?? value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : undefined;
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

async function videoDimensions(file: string): Promise<{ width: number; height: number }> {
  const stdout = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    file,
  ]);
  const parsed = JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number }> };
  const stream = parsed.streams?.[0];
  return {
    width: stream?.width ?? 16,
    height: stream?.height ?? 9,
  };
}

async function safeVideoDimensions(file: string): Promise<{ width: number; height: number }> {
  try {
    return await videoDimensions(file);
  } catch (error) {
    warnVideoProcessing("read video dimensions", file, error);
    return { width: 16, height: 9 };
  }
}

async function thumbnailImage(source: string, dest: string, force: boolean) {
  if (!force && (await exists(dest))) return;
  await sharp(source).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 82 }).toFile(dest);
}

async function videoPreview(source: string, dest: string, force: boolean) {
  if (!force && (await exists(dest))) return;
  await run("ffmpeg", [
    "-y",
    "-i",
    source,
    "-an",
    "-vf",
    "scale='min(960,iw)':-2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-movflags",
    "+faststart",
    "-pix_fmt",
    "yuv420p",
    dest,
  ]);
}

async function safeVideoPreview(source: string, dest: string, force: boolean): Promise<boolean> {
  try {
    await videoPreview(source, dest, force);
    return true;
  } catch (error) {
    warnVideoProcessing("generate video preview", source, error);
    return false;
  }
}

async function videoPoster(source: string, dest: string, force: boolean) {
  if (!force && (await exists(dest))) return;
  await run("ffmpeg", [
    "-y",
    "-i",
    source,
    "-frames:v",
    "1",
    "-vf",
    "scale='min(1200,iw)':-2",
    "-q:v",
    "3",
    dest,
  ]);
}

async function safeVideoPoster(source: string, dest: string, force: boolean): Promise<boolean> {
  try {
    await videoPoster(source, dest, force);
    return true;
  } catch (error) {
    warnVideoProcessing("generate video poster", source, error);
    return false;
  }
}

async function captureDateForMedia(type: MediaKind, file: string): Promise<string | undefined> {
  return type === "image" ? imageCaptureDate(file) : safeVideoCaptureDate(file);
}

async function imageCaptureDate(file: string): Promise<string | undefined> {
  const metadata = await sharp(file).metadata();
  if (!metadata.exif) return undefined;
  return parseExifCaptureDate(metadata.exif);
}

async function safeVideoCaptureDate(file: string): Promise<string | undefined> {
  try {
    return await videoCaptureDate(file);
  } catch (error) {
    warnVideoProcessing("read video capture date", file, error);
    return undefined;
  }
}

async function videoCaptureDate(file: string): Promise<string | undefined> {
  const stdout = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format_tags=creation_time:stream_tags=creation_time",
    "-of",
    "json",
    file,
  ]);
  const parsed = JSON.parse(stdout) as {
    format?: { tags?: Record<string, string> };
    streams?: Array<{ tags?: Record<string, string> }>;
  };
  return parsed.format?.tags?.creation_time ?? parsed.streams?.find((stream) => stream.tags?.creation_time)?.tags?.creation_time;
}

function parseExifCaptureDate(exif: Buffer): string | undefined {
  const tiffStart = exif.subarray(0, 6).equals(Buffer.from("Exif\0\0")) ? 6 : 0;
  if (exif.length < tiffStart + 8) return undefined;

  const byteOrder = exif.toString("ascii", tiffStart, tiffStart + 2);
  const littleEndian = byteOrder === "II";
  if (!littleEndian && byteOrder !== "MM") return undefined;

  const readUInt16 = (offset: number) => (littleEndian ? exif.readUInt16LE(offset) : exif.readUInt16BE(offset));
  const readUInt32 = (offset: number) => (littleEndian ? exif.readUInt32LE(offset) : exif.readUInt32BE(offset));
  if (readUInt16(tiffStart + 2) !== 42) return undefined;

  const readAscii = (entryOffset: number): string | undefined => {
    const type = readUInt16(entryOffset + 2);
    const count = readUInt32(entryOffset + 4);
    if (type !== 2 || count === 0) return undefined;
    const valueOffset = count <= 4 ? entryOffset + 8 : tiffStart + readUInt32(entryOffset + 8);
    if (valueOffset < 0 || valueOffset + count > exif.length) return undefined;
    return exif
      .toString("ascii", valueOffset, valueOffset + count)
      .replace(/\0+$/g, "")
      .trim();
  };

  const findEntry = (ifdOffset: number, tag: number): number | undefined => {
    const offset = tiffStart + ifdOffset;
    if (offset < 0 || offset + 2 > exif.length) return undefined;
    const entryCount = readUInt16(offset);
    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = offset + 2 + index * 12;
      if (entryOffset + 12 > exif.length) return undefined;
      if (readUInt16(entryOffset) === tag) return entryOffset;
    }
    return undefined;
  };

  const ifd0Offset = readUInt32(tiffStart + 4);
  const exifIfdEntry = findEntry(ifd0Offset, 0x8769);
  if (exifIfdEntry !== undefined) {
    const exifIfdOffset = readUInt32(exifIfdEntry + 8);
    const originalDate = findEntry(exifIfdOffset, 0x9003);
    const digitizedDate = findEntry(exifIfdOffset, 0x9004);
    const date = originalDate !== undefined ? readAscii(originalDate) : digitizedDate !== undefined ? readAscii(digitizedDate) : undefined;
    const normalized = normalizeExifDate(date);
    if (normalized) return normalized;
  }

  const imageDate = findEntry(ifd0Offset, 0x0132);
  return imageDate !== undefined ? normalizeExifDate(readAscii(imageDate)) : undefined;
}

function normalizeExifDate(value: string | undefined): string | undefined {
  const match = value?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

async function copyIfNeeded(source: string, dest: string, force: boolean) {
  if (!force && (await exists(dest))) return;
  await copyFile(source, dest);
}

async function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${command} exited with ${code ?? "unknown"}: ${stderr.trim()}`));
      }
    });
  });
}

function warnVideoProcessing(action: string, file: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(`Could not ${action} for ${file}. Falling back to original video. ${detail}`);
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
