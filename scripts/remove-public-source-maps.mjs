import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

async function strip(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await strip(path);
    else if (entry.name.endsWith(".map")) await rm(path);
  }
}
await strip("apps/web/.open-next/assets");
