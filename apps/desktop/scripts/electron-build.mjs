import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
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
const serverCoworkPackageRoot = resolve(repoRoot, "apps", "server", "node_modules", "@univer", "cowork");

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

function requirePath(path, label) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${label}: ${path}`);
  }
  return path;
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
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

function targetLibsqlNativePackageName() {
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "@libsql/darwin-arm64" : "@libsql/darwin-x64";
  }
  if (process.platform === "linux") {
    return process.arch === "arm64" ? "@libsql/linux-arm64-gnu" : "@libsql/linux-x64-gnu";
  }
  if (process.platform === "win32") {
    return "@libsql/win32-x64-msvc";
  }
  throw new Error(`Unsupported libsql native platform: ${process.platform}/${process.arch}`);
}

function targetUexcliNativePackageName() {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "@univerjs-pro/uexcli-darwin-arm64";
  }
  if (process.platform === "linux") {
    return process.arch === "arm64" ? "@univerjs-pro/uexcli-linux-arm64" : "@univerjs-pro/uexcli-linux-x64";
  }
  if (process.platform === "win32" && process.arch === "x64") {
    return "@univerjs-pro/uexcli-windows-x64";
  }
  throw new Error(`Unsupported uexcli native platform: ${process.platform}/${process.arch}`);
}

function targetFormulaBindingFileName() {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "univer-formula.darwin-arm64.node";
  }
  if (process.platform === "linux") {
    return process.arch === "arm64"
      ? "univer-formula.linux-arm64-gnu.node"
      : "univer-formula.linux-x64-gnu.node";
  }
  if (process.platform === "win32" && process.arch === "x64") {
    return "univer-formula.win32-x64-msvc.node";
  }
  throw new Error(`Unsupported formula binding platform: ${process.platform}/${process.arch}`);
}

function nodeModulePath(root, packageName) {
  return resolve(root, "node_modules", ...packageName.split("/"));
}

function copyNodeModulePackage(sourceRoot, targetNodeModules, packageName) {
  const sourcePath = realpathSync(requirePath(nodeModulePath(sourceRoot, packageName), `${packageName} package`));
  const targetPath = resolve(targetNodeModules, ...packageName.split("/"));
  rmSync(targetPath, { recursive: true, force: true });
  mkdirSync(dirname(targetPath), { recursive: true });
  cpSync(sourcePath, targetPath, { recursive: true, dereference: true });
}

function stageUniverCliRuntimeDependencies(sourceUniverPackageRoot, targetUniverRoot) {
  const targetNodeModules = resolve(targetUniverRoot, "node_modules");
  const sourceLibsqlRoot = realpathSync(requirePath(nodeModulePath(sourceUniverPackageRoot, "libsql"), "libsql package"));
  const sourceLibsqlPackageRoot = dirname(dirname(sourceLibsqlRoot));
  const sourceUexcliRoot = realpathSync(requirePath(
    nodeModulePath(sourceUniverPackageRoot, "@univerjs-pro/uexcli"),
    "@univerjs-pro/uexcli package",
  ));
  const sourceUexcliPackageRoot = dirname(dirname(dirname(sourceUexcliRoot)));
  const requiredPackages = [
    "libsql",
    "@neon-rs/load",
    "detect-libc",
    targetLibsqlNativePackageName(),
    "@univerjs-pro/uexcli",
    targetUexcliNativePackageName(),
    "@univerjs-pro/engine-formula-rust-binding",
  ];

  for (const packageName of requiredPackages) {
    const sourceRoot = packageName === "libsql"
      || packageName === "@univerjs-pro/uexcli"
      || packageName === "@univerjs-pro/engine-formula-rust-binding"
      ? sourceUniverPackageRoot
      : packageName.startsWith("@univerjs-pro/uexcli-")
        ? sourceUexcliPackageRoot
        : sourceLibsqlPackageRoot;
    copyNodeModulePackage(sourceRoot, targetNodeModules, packageName);
  }

  const formulaBindingPath = nodeModulePath(targetUniverRoot, "@univerjs-pro/engine-formula-rust-binding");
  const formulaBindingFileName = targetFormulaBindingFileName();
  removeMatchingFiles(
    formulaBindingPath,
    (filePath) => filePath.endsWith(".node") && !filePath.endsWith(`/${formulaBindingFileName}`),
  );
}

function stageUniverCoworkPackage() {
  const sourceRoot = realpathSync(requirePath(serverCoworkPackageRoot, "@univer/cowork package"));
  const sourceManifestPath = requirePath(
    resolve(sourceRoot, "resources", "univer-bundle.json"),
    "@univer/cowork bundle manifest",
  );
  const sourceManifest = readJsonFile(sourceManifestPath);
  const sourceResources = sourceManifest.resources ?? {};
  const sourceUniverExecutable = requirePath(
    resolve(sourceRoot, sourceResources.univerExecutable ?? ""),
    "bundled univer executable",
  );
  const sourceUniverDist = requirePath(resolve(sourceUniverExecutable, "..", ".."), "univer CLI dist");
  const sourceUniverPackageRoot = requirePath(resolve(sourceUniverDist, ".."), "univer CLI package");
  const sourceSkillsRoot = requirePath(
    resolve(sourceRoot, sourceResources.skillsRoot ?? ""),
    "bundled univer-cli skill",
  );

  const targetRoot = resolve(packagedServerRoot, "vendor", "univer-cowork");
  const targetResources = resolve(targetRoot, "resources");
  const targetUniverRoot = resolve(targetResources, "univer-cli");
  const targetUniverDist = resolve(targetUniverRoot, "dist");
  const targetSkillsRoot = resolve(targetResources, "skills", "univer-cli");
  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(targetResources, { recursive: true });
  mkdirSync(targetUniverRoot, { recursive: true });

  copyFileSync(requirePath(resolve(sourceRoot, "package.json"), "@univer/cowork package.json"), resolve(targetRoot, "package.json"));
  const readmePath = resolve(sourceRoot, "README.md");
  if (existsSync(readmePath)) {
    copyFileSync(readmePath, resolve(targetRoot, "README.md"));
  }
  cpSync(requirePath(resolve(sourceRoot, "runtime"), "@univer/cowork runtime"), resolve(targetRoot, "runtime"), { recursive: true });
  copyFileSync(
    requirePath(resolve(sourceRoot, sourceResources.skillMetadata ?? ""), "bundled univer-cli skill metadata"),
    resolve(targetResources, "univer-cli-skill.json"),
  );
  copyFileSync(requirePath(resolve(sourceUniverPackageRoot, "package.json"), "univer CLI package.json"), resolve(targetUniverRoot, "package.json"));
  cpSync(sourceUniverDist, targetUniverDist, { recursive: true });
  stageUniverCliRuntimeDependencies(sourceUniverPackageRoot, targetUniverRoot);
  cpSync(sourceSkillsRoot, targetSkillsRoot, { recursive: true });

  const stagedManifest = {
    ...sourceManifest,
    resources: {
      univerExecutable: "resources/univer-cli/dist/bin/univer.js",
      skillsRoot: "resources/skills/univer-cli",
      skillMetadata: "resources/univer-cli-skill.json",
    },
  };
  writeFileSync(resolve(targetResources, "univer-bundle.json"), `${JSON.stringify(stagedManifest, null, 2)}\n`);
  chmodSync(resolve(targetUniverDist, "bin", "univer.js"), 0o755);
}

function patchPackagedServerUniverCoworkImport() {
  const extensionPath = resolve(packagedServerRoot, "dist", "extensions", "univer-cli.js");
  const source = readFileSync(extensionPath, "utf8");
  const patched = source.replace(
    'from "@univer/cowork/node"',
    'from "../../../../univer-cowork/runtime/node.js"',
  );
  if (patched === source) {
    throw new Error(`Could not patch @univer/cowork import in ${extensionPath}`);
  }
  writeFileSync(extensionPath, patched, "utf8");
}

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
stageUniverCoworkPackage();
patchPackagedServerUniverCoworkImport();
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
