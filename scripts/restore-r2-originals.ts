import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

interface LegacyMetadata {
  sections: Record<string, LegacySection>;
}

interface LegacySection {
  images: Record<string, LegacyMedia>;
}

interface LegacyMedia {
  width: number;
  height: number;
  aspectRatio: number;
  originalFilename: string;
  type: "image" | "video";
  contentHash: string;
  urls: {
    original: string;
    thumb: string;
    preview?: string;
  };
}

interface RestoreOptions {
  metadataUrl: string;
  dest: string;
  force: boolean;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  await restoreOriginals(options);
}

async function restoreOriginals(options: RestoreOptions) {
  const destRoot = path.resolve(options.dest);
  await mkdir(destRoot, { recursive: true });

  const metadata = await fetchJson<LegacyMetadata>(options.metadataUrl);
  const items = Object.entries(metadata.sections).flatMap(([section, sectionData]) =>
    Object.entries(sectionData.images).map(([filename, media]) => ({ section, filename, media })),
  );

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Restoring ${items.length} originals to ${destRoot}`);

  for (const item of items) {
    const targetPath = safeJoin(destRoot, item.section, item.filename);
    const sidecarPath = targetPath.replace(path.extname(targetPath), ".json");

    try {
      await mkdir(path.dirname(targetPath), { recursive: true });

      if (!options.force && (await exists(targetPath))) {
        skipped += 1;
        process.stdout.write("s");
      } else {
        await downloadFile(item.media.urls.original, targetPath);
        downloaded += 1;
        process.stdout.write("+");
      }

      const actualHash = await sha256File(targetPath);
      if (actualHash !== item.media.contentHash) {
        throw new Error(`Hash mismatch for ${targetPath}: expected ${item.media.contentHash}, got ${actualHash}`);
      }

      await writeFile(
        sidecarPath,
        `${JSON.stringify(
          {
            section: item.section,
            restoredFilename: item.filename,
            originalFilename: item.media.originalFilename,
            type: item.media.type,
            contentHash: item.media.contentHash,
            width: item.media.width,
            height: item.media.height,
            aspectRatio: item.media.aspectRatio,
            urls: item.media.urls,
          },
          null,
          2,
        )}\n`,
      );
    } catch (error) {
      failed += 1;
      process.stdout.write("x");
      console.error(`\nFailed to restore ${item.section}/${item.filename}:`, error);
    }
  }

  process.stdout.write("\n");
  console.log(`Done. downloaded=${downloaded} skipped=${skipped} failed=${failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): RestoreOptions {
  const metadataUrl = readArg(args, "--metadata-url") ?? readArg(args, "-m");
  const dest = readArg(args, "--dest") ?? readArg(args, "-d") ?? "source-media-restored";

  if (!metadataUrl) {
    throw new Error("Missing metadata URL. Use --metadata-url https://.../metadata/latest.json");
  }

  return {
    metadataUrl,
    dest,
    force: args.includes("--force"),
  };
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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

async function downloadFile(url: string, dest: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error(`No response body for ${url}`);
  }

  await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>), createWriteStream(dest));
}

async function sha256File(file: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  hash.update(await readFile(file));
  return hash.digest("hex");
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function safeJoin(root: string, ...parts: string[]): string {
  const target = path.resolve(root, ...parts.filter(Boolean));
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside destination: ${target}`);
  }
  return target;
}
