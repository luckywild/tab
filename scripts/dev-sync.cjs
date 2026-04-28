#!/usr/bin/env node

const chokidar = require("chokidar");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

function parseArgs(argv) {
  const out = { starfishDir: process.env.STARFISH_DIR || null };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--starfish" || a === "-s") {
      out.starfishDir = argv[i + 1] || null;
      i++;
      continue;
    }
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
  }

  return out;
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("exit", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} ${args.join(" ")} failed with code ${code}`));
    });
  });
}

function runResult(cmd, args, opts) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("exit", (code) => resolve(code || 0));
  });
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function checkJs(repoRoot) {
  // Hard fail on JS syntax errors.
  return runResult("bun", ["run", "check"], { cwd: repoRoot });
}

async function lint(repoRoot) {
  // Lint is warnings-only by default; still useful signal in dev output.
  return runResult("bun", ["run", "lint"], { cwd: repoRoot });
}

async function syncToStarfish(repoRoot, starfishDir) {
  const pluginsDir = path.join(starfishDir, "plugins");
  const srcDir = path.join(repoRoot, "src");

  const entrySrc = path.join(srcDir, "wildtab.js");
  const folderSrc = path.join(srcDir, "wildtab");

  const entryDst = path.join(pluginsDir, "wildtab.js");
  const folderDst = path.join(pluginsDir, "wildtab");

  if (!fs.existsSync(pluginsDir) || !fs.statSync(pluginsDir).isDirectory()) {
    throw new Error(`Expected Starfish plugins dir at ${pluginsDir}`);
  }

  if (!fs.existsSync(entrySrc) || !fs.existsSync(folderSrc)) {
    throw new Error("Expected src/wildtab.js and src/wildtab/ to exist");
  }

  ensureDir(folderDst);

  await run("rsync", ["-a", "--delete", `${folderSrc}/`, `${folderDst}/`], { cwd: repoRoot });
  await run("cp", [entrySrc, entryDst], { cwd: repoRoot });
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log("Usage: bun run dev -- --starfish /path/to/starfish");
    console.log("Or: STARFISH_DIR=/path/to/starfish bun run dev");
    process.exit(0);
  }

  const repoRoot = path.resolve(__dirname, "..");
  const starfishDir = args.starfishDir ? path.resolve(args.starfishDir) : null;

  if (!starfishDir) {
    console.error("Missing Starfish directory. Pass --starfish /path/to/starfish or set STARFISH_DIR.");
    process.exit(2);
  }

  const watchDir = path.join(repoRoot, "src");

  console.log(`[dev] repo: ${repoRoot}`);
  console.log(`[dev] starfish: ${starfishDir}`);

  let running = false;
  let pending = false;

  async function rebuildSync() {
    if (running) {
      pending = true;
      return;
    }

    running = true;
    try {
      const jsOk = (await checkJs(repoRoot)) === 0;
      if (!jsOk) {
        console.error("[dev] JavaScript syntax errors detected; not syncing to Starfish.");
        return;
      }

      await lint(repoRoot);
      await syncToStarfish(repoRoot, starfishDir);
      console.log("[dev] synced");
    } catch (err) {
      console.error("[dev] build/sync failed:", err && err.message ? err.message : err);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        setTimeout(rebuildSync, 50);
      }
    }
  }

  await rebuildSync();

  const watcher = chokidar.watch(watchDir, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 150,
      pollInterval: 50,
    },
  });

  watcher.on("all", (event, filePath) => {
    console.log(`[dev] ${event}: ${path.relative(repoRoot, filePath)}`);
    rebuildSync();
  });

  process.on("SIGINT", async () => {
    await watcher.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
