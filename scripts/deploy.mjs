import { copyFileSync, cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.USERPROFILE ?? process.env.HOME;
if (!home) {
  throw new Error("USERPROFILE or HOME is required to deploy the plugin.");
}

const dest = path.join(home, ".stash", "plugins", "Stashangle");
const distDir = path.join(dest, "dist");

mkdirSync(distDir, { recursive: true });

copyFileSync(path.join(root, "Stashangle.yml"), path.join(dest, "Stashangle.yml"));

const storageDest = path.join(dest, "marker-transforms.json");
if (!existsSync(storageDest)) {
  copyFileSync(path.join(root, "marker-transforms.json"), storageDest);
  console.info("[Stashangle] Initialized marker-transforms.json during deploy");
} else {
  console.info("[Stashangle] Preserved existing marker-transforms.json during deploy");
}

for (const file of ["ui.js", "ui.css"]) {
  copyFileSync(path.join(root, "dist", file), path.join(distDir, file));
}

cpSync(path.join(root, "tasks"), path.join(dest, "tasks"), { recursive: true, force: true });

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

console.info(`[Stashangle] Deployed to ${dest} (dist/ui.js)`);
