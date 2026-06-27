import { build, context } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve();
const pluginDir = path.join(root, "Stashangle");
const outDir = path.join(pluginDir, "dist");
const isWatch = process.argv.includes("--watch");
const isProduction = process.env.NODE_ENV === "production" || !isWatch;

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;

const manifestPath = path.join(pluginDir, "Stashangle.yml");
const manifest = readFileSync(manifestPath, "utf8");
if (!manifest.includes(`version: ${version}`)) {
  writeFileSync(
    manifestPath,
    manifest.replace(/^version: .*/m, `version: ${version}`)
  );
}

mkdirSync(path.join(pluginDir, "tasks"), { recursive: true });
cpSync(path.join(root, "tasks", "stashangle_storage.py"), path.join(pluginDir, "tasks", "stashangle_storage.py"));

const sharedOptions = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  sourcemap: !isProduction,
  minify: true,
  legalComments: "none",
  outfile: path.join(outDir, "ui.js"),
  define: {
    __STASHANGLE_BUILD_ID__: JSON.stringify(version)
  }
};

if (isWatch) {
  const jsContext = await context(sharedOptions);
  const cssContext = await context({
    entryPoints: ["styles/stashangle.css"],
    bundle: true,
    minify: true,
    outfile: path.join(outDir, "ui.css"),
    loader: {
      ".css": "css"
    }
  });
  await Promise.all([jsContext.watch(), cssContext.watch()]);
  console.info(`[Stashangle] watching build ${version} -> Stashangle/`);
} else {
  mkdirSync(outDir, { recursive: true });
  await build(sharedOptions);
  await build({
    entryPoints: ["styles/stashangle.css"],
    bundle: true,
    minify: true,
    outfile: path.join(outDir, "ui.css"),
    loader: {
      ".css": "css"
    }
  });
  console.info(`[Stashangle] built ${version} -> Stashangle/`);
}
