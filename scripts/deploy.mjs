import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = path.join(root, "Stashangle");
const home = process.env.USERPROFILE ?? process.env.HOME;
if (!home) {
  throw new Error("USERPROFILE or HOME is required to deploy the plugin.");
}

const dest = path.join(home, ".stash", "plugins", "Stashangle");
const storageDest = path.join(dest, "marker-transforms.json");
const preservedStorage = existsSync(storageDest) ? readFileSync(storageDest, "utf8") : null;

mkdirSync(dest, { recursive: true });
cpSync(pluginDir, dest, { recursive: true, force: true });

if (preservedStorage) {
  writeFileSync(storageDest, preservedStorage);
  console.info("[Stashangle] Preserved existing marker-transforms.json during deploy");
} else {
  console.info("[Stashangle] Initialized marker-transforms.json during deploy");
}

const distDir = path.join(dest, "dist");
for (const stale of [
  path.join(dest, "stashangle.js"),
  path.join(dest, "stashangle.css"),
  path.join(distDir, "stashangle.js"),
  path.join(distDir, "stashangle.css"),
  path.join(distDir, "stashangle.js.map")
]) {
  if (existsSync(stale)) {
    rmSync(stale);
  }
}

console.info(`[Stashangle] Deployed ${pluginDir} -> ${dest}`);
