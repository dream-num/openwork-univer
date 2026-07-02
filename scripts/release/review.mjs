import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const args = process.argv.slice(2);
const outputJson = args.includes("--json");
const strict = args.includes("--strict");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const readText = (path) => readFileSync(path, "utf8");


const appPkg = readJson(resolve(root, "apps", "app", "package.json"));
const desktopPkg = readJson(resolve(root, "apps", "desktop", "package.json"));
const orchestratorPkg = readJson(
  resolve(root, "apps", "orchestrator", "package.json"),
);
const pinnedOpencodeVersion = String(
  readJson(resolve(root, "constants.json")).opencodeVersion ?? "",
)
  .trim()
  .replace(/^v/, "");
const serverPkg = readJson(resolve(root, "apps", "server", "package.json"));
const opencodeRouterPkg = readJson(
  resolve(root, "apps", "opencode-router", "package.json"),
);
const versions = {
  app: appPkg.version ?? null,
  desktop: desktopPkg.version ?? null,
  server: serverPkg.version ?? null,
  orchestrator: orchestratorPkg.version ?? null,
  opencodeRouter: opencodeRouterPkg.version ?? null,
  opencode: pinnedOpencodeVersion || null,
  opencodeRouterVersionPinned: desktopPkg.opencodeRouterVersion ?? null,
  orchestratorOpenworkServerRange:
    orchestratorPkg.dependencies?.["openwork-server"] ?? null,
};

const checks = [];
const warnings = [];
let ok = true;

const addCheck = (label, pass, details) => {
  checks.push({ label, ok: pass, details });
  if (!pass) ok = false;
};

const addWarning = (message) => warnings.push(message);

const libsqlNativePackageName = () => {
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "@libsql/darwin-arm64" : "@libsql/darwin-x64";
  }
  if (process.platform === "linux") {
    return process.arch === "arm64" ? "@libsql/linux-arm64-gnu" : "@libsql/linux-x64-gnu";
  }
  if (process.platform === "win32") {
    return "@libsql/win32-x64-msvc";
  }
  return null;
};

const uexcliNativePackageName = () => {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "@univerjs-pro/uexcli-darwin-arm64";
  }
  if (process.platform === "linux") {
    return process.arch === "arm64" ? "@univerjs-pro/uexcli-linux-arm64" : "@univerjs-pro/uexcli-linux-x64";
  }
  if (process.platform === "win32" && process.arch === "x64") {
    return "@univerjs-pro/uexcli-windows-x64";
  }
  return null;
};

const uexcliNativeBinaryNames = () => {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return ["uexcli-darwin-arm64", "uexcli-rs"];
  }
  if (process.platform === "linux") {
    return ["uexcli-linux", "uexcli-rs"];
  }
  if (process.platform === "win32" && process.arch === "x64") {
    return ["uexcli-windows.exe", "uexcli-rs.exe"];
  }
  return [];
};

const formulaBindingFileName = () => {
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
  return null;
};

const nodeModulePath = (root, packageName) =>
  resolve(root, "node_modules", ...packageName.split("/"));

addCheck(
  "App/desktop versions match",
  versions.app && versions.desktop && versions.app === versions.desktop,
  `${versions.app ?? "?"} vs ${versions.desktop ?? "?"}`,
);
addCheck(
  "App/openwork-orchestrator versions match",
  versions.app &&
    versions.orchestrator &&
    versions.app === versions.orchestrator,
  `${versions.app ?? "?"} vs ${versions.orchestrator ?? "?"}`,
);
addCheck(
  "App/openwork-server versions match",
  versions.app && versions.server && versions.app === versions.server,
  `${versions.app ?? "?"} vs ${versions.server ?? "?"}`,
);
addCheck(
  "App/opencode-router versions match",
  versions.app &&
    versions.opencodeRouter &&
    versions.app === versions.opencodeRouter,
  `${versions.app ?? "?"} vs ${versions.opencodeRouter ?? "?"}`,
);
addCheck(
  "OpenCodeRouter version pinned in desktop",
  versions.opencodeRouter &&
    versions.opencodeRouterVersionPinned &&
    versions.opencodeRouter === versions.opencodeRouterVersionPinned,
  `${versions.opencodeRouterVersionPinned ?? "?"} vs ${versions.opencodeRouter ?? "?"}`,
);
if (versions.opencode) {
  addCheck(
    "OpenCode version pin exists",
    Boolean(versions.opencode),
    String(versions.opencode),
  );
} else {
  addWarning(
    "OpenCode version is not pinned in constants.json.",
  );
}

const openworkServerRange = versions.orchestratorOpenworkServerRange ?? "";
const openworkServerPinned = /^\d+\.\d+\.\d+/.test(openworkServerRange);
if (!openworkServerRange) {
  addWarning("openwork-orchestrator is missing an openwork-server dependency.");
} else if (!openworkServerPinned) {
  addWarning(
    `openwork-orchestrator openwork-server dependency is not pinned (${openworkServerRange}).`,
  );
} else {
  addCheck(
    "Openwork-server dependency matches server version",
    versions.server && openworkServerRange === versions.server,
    `${openworkServerRange} vs ${versions.server ?? "?"}`,
  );
}

const desktopRuntimeDeps = desktopPkg.dependencies ?? {};
const embeddedServerDeps = serverPkg.dependencies ?? {};
const stagedEmbeddedServerDeps = new Set([
  "@univer/cowork",
]);
const missingEmbeddedServerDeps = Object.keys(embeddedServerDeps)
  .filter((name) => !desktopRuntimeDeps[name] && !stagedEmbeddedServerDeps.has(name))
  .sort();
addCheck(
  "Desktop includes or stages embedded server runtime dependencies",
  missingEmbeddedServerDeps.length === 0,
  missingEmbeddedServerDeps.length
    ? missingEmbeddedServerDeps.join(", ")
    : "all server dependencies declared or staged",
);

const stagedUniverCliRoot = resolve(
  root,
  "apps",
  "desktop",
  "server",
  "vendor",
  "univer-cowork",
  "resources",
  "univer-cli",
);
if (existsSync(stagedUniverCliRoot)) {
  const nativeLibsqlPackage = libsqlNativePackageName();
  const nativeUexcliPackage = uexcliNativePackageName();
  const nativeFormulaBindingFile = formulaBindingFileName();
  const requiredUniverCliRuntimePaths = [
    resolve(stagedUniverCliRoot, "package.json"),
    resolve(stagedUniverCliRoot, "dist", "bin", "univer.js"),
    resolve(stagedUniverCliRoot, "dist", "internal", "daemon.js"),
    resolve(nodeModulePath(stagedUniverCliRoot, "libsql"), "index.js"),
    resolve(nodeModulePath(stagedUniverCliRoot, "@neon-rs/load"), "dist", "index.js"),
    resolve(nodeModulePath(stagedUniverCliRoot, "detect-libc"), "lib", "detect-libc.js"),
    resolve(nodeModulePath(stagedUniverCliRoot, "@univerjs-pro/uexcli"), "package.json"),
    resolve(nodeModulePath(stagedUniverCliRoot, "@univerjs-pro/uexcli"), "bin", "cli.js"),
    resolve(nodeModulePath(stagedUniverCliRoot, "@univerjs-pro/engine-formula-rust-binding"), "package.json"),
    resolve(nodeModulePath(stagedUniverCliRoot, "@univerjs-pro/engine-formula-rust-binding"), "index.js"),
    ...(nativeLibsqlPackage
      ? [resolve(nodeModulePath(stagedUniverCliRoot, nativeLibsqlPackage), "index.node")]
      : []),
    ...(nativeUexcliPackage
      ? [
          resolve(nodeModulePath(stagedUniverCliRoot, nativeUexcliPackage), "package.json"),
          ...uexcliNativeBinaryNames().map((name) =>
            resolve(nodeModulePath(stagedUniverCliRoot, nativeUexcliPackage), name),
          ),
        ]
      : []),
    ...(nativeFormulaBindingFile
      ? [resolve(nodeModulePath(stagedUniverCliRoot, "@univerjs-pro/engine-formula-rust-binding"), nativeFormulaBindingFile)]
      : []),
  ];
  const missingUniverCliRuntimePaths = requiredUniverCliRuntimePaths
    .filter((path) => !existsSync(path))
    .map((path) => path.replace(`${root}/`, ""));
  addCheck(
    "Staged Univer CLI includes daemon, formula, and exchange runtime dependencies",
    missingUniverCliRuntimePaths.length === 0,
    missingUniverCliRuntimePaths.length
      ? missingUniverCliRuntimePaths.join(", ")
      : "daemon, formula, and exchange runtime dependencies staged",
  );
} else {
  addWarning(
    "Staged Univer CLI bundle missing (run pnpm --filter @openwork/desktop build:electron).",
  );
}

const sidecarManifestPath = resolve(
  root,
  "apps",
  "orchestrator",
  "dist",
  "sidecars",
  "openwork-orchestrator-sidecars.json",
);
if (existsSync(sidecarManifestPath)) {
  const manifest = readJson(sidecarManifestPath);
  addCheck(
    "Sidecar manifest version matches openwork-orchestrator",
    versions.orchestrator && manifest.version === versions.orchestrator,
    `${manifest.version ?? "?"} vs ${versions.orchestrator ?? "?"}`,
  );
  const serverEntry = manifest.entries?.["openwork-server"]?.version;
  const routerEntry = manifest.entries?.["opencode-router"]?.version;
  if (serverEntry) {
    addCheck(
      "Sidecar manifest openwork-server version matches",
      versions.server && serverEntry === versions.server,
      `${serverEntry ?? "?"} vs ${versions.server ?? "?"}`,
    );
  }
  if (routerEntry) {
    addCheck(
      "Sidecar manifest opencode-router version matches",
      versions.opencodeRouter && routerEntry === versions.opencodeRouter,
      `${routerEntry ?? "?"} vs ${versions.opencodeRouter ?? "?"}`,
    );
  }
} else {
  addWarning(
    "Sidecar manifest missing (run pnpm --filter openwork-orchestrator build:sidecars).",
  );
}

if (!process.env.SOURCE_DATE_EPOCH) {
  addWarning(
    "SOURCE_DATE_EPOCH is not set (sidecar manifests will include current time).",
  );
}

const report = { ok, versions, checks, warnings };

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Release review");
  for (const check of checks) {
    const status = check.ok ? "ok" : "fail";
    console.log(`- ${status}: ${check.label} (${check.details})`);
  }
  if (warnings.length) {
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }
}

if (strict && !ok) {
  process.exit(1);
}
