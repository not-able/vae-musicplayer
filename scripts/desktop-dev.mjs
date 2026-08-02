import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const viteCliPath = fileURLToPath(
  new URL("../node_modules/vite/bin/vite.js", import.meta.url)
);
const electronExecutable = require("electron");
const rendererUrl = "http://127.0.0.1:5173/";

let electronProcess = null;
let viteProcess = null;
let isShuttingDown = false;

function spawnProcess(command, argumentsList, environment = process.env) {
  return spawn(command, argumentsList, {
    cwd: projectRoot,
    env: environment,
    stdio: "inherit"
  });
}

async function waitForRenderer(timeoutMilliseconds = 30_000) {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    if (viteProcess?.exitCode !== null) {
      throw new Error("Vite exited before the development server became available.");
    }

    try {
      const response = await fetch(rendererUrl, {
        signal: AbortSignal.timeout(1_000)
      });

      if (response.ok) {
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "TimeoutError") {
        await delay(200);
        continue;
      }
    }

    await delay(200);
  }

  throw new Error(`Vite did not become available at ${rendererUrl} within 30 seconds.`);
}

async function stopProcess(childProcess) {
  if (childProcess === null || childProcess.exitCode !== null) {
    return;
  }

  childProcess.kill();
  await Promise.race([once(childProcess, "exit"), delay(3_000)]);

  if (childProcess.exitCode === null) {
    childProcess.kill("SIGKILL");
    await once(childProcess, "exit");
  }
}

async function shutdown(exitCode) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  await Promise.all([stopProcess(electronProcess), stopProcess(viteProcess)]);
  process.exit(exitCode);
}

process.on("SIGINT", () => {
  void shutdown(130);
});
process.on("SIGTERM", () => {
  void shutdown(143);
});

async function run() {
  viteProcess = spawnProcess(process.execPath, [
    viteCliPath,
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort"
  ]);

  await waitForRenderer();

  electronProcess = spawnProcess(electronExecutable, [projectRoot], {
    ...process.env,
    ELECTRON_RENDERER_URL: rendererUrl
  });

  viteProcess.once("exit", () => {
    if (!isShuttingDown && electronProcess?.exitCode === null) {
      electronProcess.kill();
    }
  });

  const [electronExitCode] = await once(electronProcess, "exit");

  if (!isShuttingDown) {
    await stopProcess(viteProcess);
    process.exitCode = typeof electronExitCode === "number" ? electronExitCode : 1;
  }
}

run().catch((error) => {
  console.error("Failed to start Electron development mode.", error);
  void shutdown(1);
});
