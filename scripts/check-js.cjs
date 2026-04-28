#!/usr/bin/env node

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      walk(p, out);
    } else if (ent.isFile() && p.endsWith(".js")) {
      out.push(p);
    }
  }
}

const repoRoot = path.resolve(__dirname, "..");
const srcDir = path.join(repoRoot, "src");

if (!fs.existsSync(srcDir)) {
  console.error(`Missing ${srcDir}`);
  process.exit(2);
}

const files = [];
walk(srcDir, files);

let ok = true;
for (const f of files) {
  const r = spawnSync(process.execPath, ["--check", f], { stdio: "pipe" });
  if (r.status !== 0) {
    ok = false;
    process.stderr.write(`Syntax error in ${path.relative(repoRoot, f)}\n`);
    if (r.stderr && r.stderr.length) process.stderr.write(r.stderr);
  }
}

process.exit(ok ? 0 : 1);
