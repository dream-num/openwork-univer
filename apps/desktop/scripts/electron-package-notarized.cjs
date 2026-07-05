const { spawnSync } = require("node:child_process");
const path = require("node:path");
const {
  loadLocalNotarizationEnv,
  requireNotarizationEnv,
  requireSigningEnv,
} = require("./notarization-env.cjs");

const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "../..");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

function main() {
  if (process.platform !== "darwin") {
    throw new Error("package:electron:notarized is only supported on macOS");
  }

  const { envPath } = loadLocalNotarizationEnv(repoRoot);
  process.env.MACOS_NOTARIZE = "true";
  requireNotarizationEnv();
  requireSigningEnv();

  console.log(`[electron-package-notarized] loaded notarization env: ${envPath}`);
  run("pnpm", ["run", "build:electron"], desktopRoot);
  run("pnpm", [
    "exec",
    "electron-builder",
    "--config",
    "electron-builder.yml",
    "--mac",
    "dmg",
    "zip",
    "--publish",
    "never",
  ], desktopRoot);
  run(process.execPath, [path.join(__dirname, "electron-notarize-artifacts.cjs")], desktopRoot);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
