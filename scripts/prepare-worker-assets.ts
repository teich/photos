import { rm, stat } from "node:fs/promises";
import path from "node:path";

const mediaDir = path.resolve("dist", "media");

try {
  await stat(mediaDir);
  await rm(mediaDir, { recursive: true, force: true });
  console.log(`Removed generated media from ${mediaDir}; production media should be served from R2.`);
} catch {
  // No generated media was copied into dist.
}
