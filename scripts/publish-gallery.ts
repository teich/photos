import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

interface PublishOptions {
  source: string;
  mediaBaseUrl: string;
  rcloneDest: string;
  force: boolean;
  skipSync: boolean;
  skipDeploy: boolean;
}

const DEFAULT_SOURCE = "~/Pictures/gallery-source";
const DEFAULT_MEDIA_BASE_URL = "https://blobs.zednine.com";
const DEFAULT_RCLONE_DEST = "r2:photos/media";

const options = parseArgs(process.argv.slice(2));

await run("npm", [
  "run",
  "process-media",
  "--",
  "--source",
  options.source,
  "--media-base-url",
  options.mediaBaseUrl,
  ...(options.force ? ["--force"] : []),
]);

if (!options.skipSync) {
  await run("rclone", ["copy", "public/media", options.rcloneDest, "--progress"]);
}

if (!options.skipDeploy) {
  await run("npm", ["run", "deploy"]);
}

function parseArgs(args: string[]): PublishOptions {
  const source = readArg(args, "--source") ?? process.env.GALLERY_SOURCE ?? DEFAULT_SOURCE;
  const mediaBaseUrl = readArg(args, "--media-base-url") ?? process.env.GALLERY_MEDIA_BASE_URL ?? DEFAULT_MEDIA_BASE_URL;
  const rcloneDest = readArg(args, "--rclone-dest") ?? process.env.GALLERY_RCLONE_DEST ?? DEFAULT_RCLONE_DEST;

  return {
    source: expandHome(source),
    mediaBaseUrl: mediaBaseUrl.replace(/\/+$/g, ""),
    rcloneDest,
    force: args.includes("--force"),
    skipSync: args.includes("--skip-sync"),
    skipDeploy: args.includes("--skip-deploy"),
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

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

async function run(command: string, args: string[]): Promise<void> {
  console.log(`\n> ${[command, ...args].join(" ")}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${code ?? "unknown"}`));
      }
    });
  });
}
