import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "..");
const repoRoot = resolve(desktopRoot, "../..");
const electronSidecarDir = resolve(desktopRoot, "resources", "sidecars");
const electronHelperDir = resolve(desktopRoot, "resources", "helpers");
const electronRoot = resolve(desktopRoot, "electron");
const packagedServerRoot = resolve(desktopRoot, "server");

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const nodeCmd = process.execPath;

function needsShell(command) {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: needsShell(command),
    env: env ? { ...process.env, ...env } : process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function removeMatchingFiles(root, shouldRemove) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = resolve(root, entry.name);
    if (entry.isDirectory()) {
      removeMatchingFiles(entryPath, shouldRemove);
      continue;
    }
    if (entry.isFile() && shouldRemove(entryPath)) {
      unlinkSync(entryPath);
    }
  }
}

function prunePackagedServerDist() {
  const distRoot = resolve(packagedServerRoot, "dist");
  rmSync(resolve(distRoot, "bin"), { recursive: true, force: true });
  removeMatchingFiles(distRoot, (filePath) => /\.test\.js(?:\.map)?$/.test(filePath));
}

run(nodeCmd, [resolve(repoRoot, "scripts", "validate-univer-compatibility.mjs")], repoRoot);
run(nodeCmd, [resolve(repoRoot, "scripts", "prepare-univer-distribution.mjs")], repoRoot);
run(nodeCmd, [resolve(__dirname, "prepare-sidecar.mjs"), "--force", "--outdir", electronSidecarDir], desktopRoot);
run(nodeCmd, [resolve(__dirname, "prepare-computer-use-helper.mjs"), "--force", "--outdir", electronHelperDir], desktopRoot);
// Build the server TS → JS so Electron can import it in-process
run(pnpmCmd, ["--filter", "openwork-server", "build"], repoRoot);
// OPENWORK_ELECTRON_BUILD tells Vite to emit relative asset paths so
// index.html resolves /assets/* correctly when loaded via file:// from
// inside the packaged .app bundle.
run(pnpmCmd, ["--filter", "@openwork/app", "build"], repoRoot, {
  OPENWORK_ELECTRON_BUILD: "1",
});
const coworkViewerAsset = resolve(
  repoRoot,
  "apps",
  "app",
  "dist",
  "assets",
  "viewer.js",
);
if (!existsSync(coworkViewerAsset)) {
  throw new Error(
    "Renderer build did not emit the Cowork viewer asset at apps/app/dist/assets/viewer.js.",
  );
}
// Copy constants.json next to server dist so the packaged asar can resolve it.
// Also patch the compiled import path so it works from both dev and packaged layouts.
const serverDistDir = resolve(repoRoot, "apps", "server", "dist");
const constantsSrc = resolve(repoRoot, "constants.json");
copyFileSync(constantsSrc, resolve(serverDistDir, "constants.json"));
const serverJsPath = resolve(serverDistDir, "server.js");
const serverJsSrc = readFileSync(serverJsPath, "utf8");
const patched = serverJsSrc.replace(
  /from\s+["']\.\.\/\.\.\/\.\.\/constants\.json["']/,
  'from "./constants.json"',
);
if (patched !== serverJsSrc) {
  writeFileSync(serverJsPath, patched, "utf8");
}
rmSync(packagedServerRoot, { recursive: true, force: true });
cpSync(serverDistDir, resolve(packagedServerRoot, "dist"), { recursive: true });
copyFileSync(resolve(repoRoot, "apps", "server", "package.json"), resolve(packagedServerRoot, "package.json"));
prunePackagedServerDist();
for (const fileName of readdirSync(electronRoot).filter((name) => name.endsWith(".mjs")).sort()) {
  run(nodeCmd, ["--check", resolve(electronRoot, fileName)], repoRoot);
}
run(nodeCmd, [resolve(__dirname, "check-electron-bridge.mjs")], repoRoot);

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      renderer: "apps/app/dist",
      electronMain: "apps/desktop/electron/main.mjs",
      electronPreload: "apps/desktop/electron/preload.mjs",
    },
    null,
    2,
  )}\n`,
);
