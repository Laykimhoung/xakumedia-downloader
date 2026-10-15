import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function buildDesktop() {
  console.log("[build-desktop] Bundling Electron Main and Preload scripts...");

  const mainBuild = build({
    entryPoints: [path.join(rootDir, "desktop/main/index.ts")],
    outfile: path.join(rootDir, "desktop/dist/main.cjs"),
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    external: ["electron"],
    sourcemap: "inline",
  });

  const preloadBuild = build({
    entryPoints: [path.join(rootDir, "desktop/preload/index.ts")],
    outfile: path.join(rootDir, "desktop/dist/preload.cjs"),
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    external: ["electron"],
    sourcemap: "inline",
  });

  await Promise.all([mainBuild, preloadBuild]);
  console.log("[build-desktop] Desktop bundles created in desktop/dist/");
}

buildDesktop().catch((err) => {
  console.error("[build-desktop] Build failed:", err);
  process.exit(1);
});
