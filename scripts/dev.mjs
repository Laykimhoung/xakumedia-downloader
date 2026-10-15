import { spawn } from "child_process";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function waitForViteServer(url, timeoutMs = 20000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve(true);
        } else {
          retry();
        }
      });
      req.on("error", () => retry());
      req.end();
    };

    const retry = () => {
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Timed out waiting for Vite server at ${url}`));
      } else {
        setTimeout(check, 300);
      }
    };

    check();
  });
}

async function startDev() {
  console.log("[dev] Starting Vite dev server for frontend...");

  // 1. Start Vite in frontend
  const viteProcess = spawn(
    "npm.cmd",
    ["--prefix", "frontend", "run", "dev"],
    {
      cwd: rootDir,
      stdio: "pipe",
      shell: true,
    }
  );

  viteProcess.stdout?.on("data", (data) => {
    const msg = data.toString();
    if (msg.includes("Local:") || msg.includes("ready in")) {
      process.stdout.write(`[vite] ${msg}`);
    }
  });

  viteProcess.stderr?.on("data", (data) => {
    process.stderr.write(`[vite error] ${data.toString()}`);
  });

  // 2. Wait until Vite is responding
  const devUrl = "http://localhost:5173";
  await waitForViteServer(devUrl);
  console.log(`[dev] Vite server responsive at ${devUrl}`);

  // 3. Build desktop main and preload scripts
  console.log("[dev] Compiling desktop Electron scripts...");
  const { execSync } = await import("child_process");
  execSync("node scripts/build-desktop.mjs", { cwd: rootDir, stdio: "inherit" });

  // 4. Launch Electron
  console.log("[dev] Launching Electron window...");
  const electronProcess = spawn(
    "npx.cmd",
    ["--prefix", "frontend", "electron", "desktop/dist/main.cjs"],
    {
      cwd: rootDir,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: devUrl,
      },
    }
  );

  electronProcess.on("close", (code) => {
    console.log(`[dev] Electron closed with exit code ${code}. Stopping Vite...`);
    viteProcess.kill();
    process.exit(code ?? 0);
  });
}

startDev().catch((err) => {
  console.error("[dev] Failed to start dev environment:", err);
  process.exit(1);
});
