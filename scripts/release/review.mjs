import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

const docTypstNativePackageName = () => {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "@univerjs-pro/doc-typst-native-binding-darwin-arm64";
  }
  if (process.platform === "linux") {
    return process.arch === "arm64"
      ? "@univerjs-pro/doc-typst-native-binding-linux-arm64-gnu"
      : "@univerjs-pro/doc-typst-native-binding-linux-x64-gnu";
  }
  if (process.platform === "win32" && process.arch === "x64") {
    return "@univerjs-pro/doc-typst-native-binding-win32-x64-msvc";
  }
  return null;
};

const docTypstBindingFileName = () => {
  if (process.platform === "darwin" && process.arch === "arm64") return "doc-typst.darwin-arm64.node";
  if (process.platform === "linux") {
    return process.arch === "arm64" ? "doc-typst.linux-arm64-gnu.node" : "doc-typst.linux-x64-gnu.node";
  }
  if (process.platform === "win32" && process.arch === "x64") return "doc-typst.win32-x64-msvc.node";
  return null;
};

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
const stagedEmbeddedServerDeps = new Set();
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

const stagedUniverDistributionRoot = resolve(root, "apps", "desktop", "univer-distribution");
const stagedUniverCliRoot = resolve(stagedUniverDistributionRoot, "runtime", "node_modules", "univer-cli");
if (existsSync(stagedUniverCliRoot)) {
  const compatibility = readJson(resolve(stagedUniverDistributionRoot, "compatibility.json"));
  const provenance = readJson(resolve(stagedUniverDistributionRoot, "provenance.json"));
  const realUniverCliRoot = realpathSync(stagedUniverCliRoot);
  const dependencyRoot = (packageName) =>
    resolve(dirname(realUniverCliRoot), ...packageName.split("/"));
  const dependencySibling = (packageRoot, packageName) => {
    const realPackageRoot = realpathSync(packageRoot);
    const packageNameValue = String(readJson(resolve(realPackageRoot, "package.json")).name ?? "");
    const nodeModulesRoot = packageNameValue.startsWith("@")
      ? dirname(dirname(realPackageRoot))
      : dirname(realPackageRoot);
    return resolve(nodeModulesRoot, ...packageName.split("/"));
  };
  const nativeLibsqlPackage = libsqlNativePackageName();
  const nativeUexcliPackage = uexcliNativePackageName();
  const nativeFormulaBindingFile = formulaBindingFileName();
  const nativeDocTypstPackage = docTypstNativePackageName();
  const nativeDocTypstFile = docTypstBindingFileName();
  const libsqlRoot = dependencyRoot("libsql");
  const uexcliRoot = dependencyRoot("@univerjs-pro/uexcli");
  const formulaBindingRoot = dependencyRoot("@univerjs-pro/engine-formula-rust-binding");
  const docTypstRoot = dependencyRoot("@univerjs-pro/doc-typst-native-binding");
  const requiredUniverCliRuntimePaths = [
    resolve(stagedUniverDistributionRoot, "compatibility.json"),
    resolve(stagedUniverDistributionRoot, "provenance.json"),
    resolve(stagedUniverDistributionRoot, "skill", "univer-cli", "SKILL.md"),
    resolve(stagedUniverDistributionRoot, "skill", "univer-cli", "references", "evidence-tools.md"),
    resolve(stagedUniverDistributionRoot, "skill", "univer-cli", "inspect-tools", "tools.manifest.json"),
    resolve(stagedUniverCliRoot, "package.json"),
    resolve(stagedUniverCliRoot, "bin", "univer.js"),
    resolve(stagedUniverCliRoot, "internal", "daemon.js"),
    resolve(libsqlRoot, "index.js"),
    resolve(uexcliRoot, "package.json"),
    resolve(uexcliRoot, "bin", "cli.js"),
    resolve(formulaBindingRoot, "package.json"),
    resolve(formulaBindingRoot, "index.js"),
    resolve(docTypstRoot, "package.json"),
    resolve(docTypstRoot, "index.js"),
    ...(nativeLibsqlPackage
      ? [resolve(dependencySibling(libsqlRoot, nativeLibsqlPackage), "index.node")]
      : []),
    ...(nativeUexcliPackage
      ? [
          resolve(dependencySibling(uexcliRoot, nativeUexcliPackage), "package.json"),
          ...uexcliNativeBinaryNames().map((name) =>
            resolve(dependencySibling(uexcliRoot, nativeUexcliPackage), name),
          ),
        ]
      : []),
    ...(nativeFormulaBindingFile
      ? [resolve(formulaBindingRoot, nativeFormulaBindingFile)]
      : []),
    ...(nativeDocTypstPackage && nativeDocTypstFile
      ? [resolve(dependencySibling(docTypstRoot, nativeDocTypstPackage), nativeDocTypstFile)]
      : []),
  ];
  const missingUniverCliRuntimePaths = requiredUniverCliRuntimePaths
    .filter((path) => !existsSync(path))
    .map((path) => path.replace(`${root}/`, ""));
  addCheck(
    "Offline Univer Distribution includes CLI, skill, and native closure",
    missingUniverCliRuntimePaths.length === 0
      && compatibility.identity === provenance.compatibilityIdentity
      && compatibility.cli?.version === provenance.cliVersion
      && compatibility.source?.commit === provenance.sourceCommit,
    missingUniverCliRuntimePaths.length
      ? missingUniverCliRuntimePaths.join(", ")
      : `${compatibility.identity}; CLI, skill, libsql, UEX, formula, and Doc Typst present`,
  );
} else {
  addWarning(
    "Offline Univer Distribution missing (run pnpm prepare:univer-distribution).",
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
