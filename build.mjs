import { build } from "esbuild";
import path from "node:path";

const outDir = path.resolve("dist");

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  sourcemap: true,
  minify: true,
  outfile: path.join(outDir, "ui.js")
});

await build({
  entryPoints: ["styles/stashangle.css"],
  bundle: true,
  minify: true,
  outfile: path.join(outDir, "ui.css"),
  loader: {
    ".css": "css"
  }
});
