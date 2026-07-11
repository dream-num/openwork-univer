import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function fail(message) {
  throw new Error(`Univer compatibility validation failed: ${message}`);
}

function packageDependencies(manifest) {
  return {
    ...(isRecord(manifest.dependencies) ? manifest.dependencies : {}),
    ...(isRecord(manifest.devDependencies) ? manifest.devDependencies : {}),
    ...(isRecord(manifest.optionalDependencies) ? manifest.optionalDependencies : {}),
  };
}

async function workspacePackageJsonPaths() {
  const paths = [];
  for (const parent of ["apps", "packages", "ee/apps", "ee/packages"]) {
    const absoluteParent = join(repoRoot, parent);
    let entries;
    try {
      entries = await readdir(absoluteParent, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) paths.push(join(absoluteParent, entry.name, "package.json"));
    }
  }
  return paths;
}

const compatibility = await readJson(join(repoRoot, "univer.compatibility.json"));
if (!isRecord(compatibility) || compatibility.schemaVersion !== 1) fail("unsupported manifest schema.");
if (!isRecord(compatibility.cowork) || !isRecord(compatibility.cli) || !isRecord(compatibility.sdk)) {
  fail("cowork, cli, and sdk records are required.");
}
const coworkPackage = compatibility.cowork.package;
const coworkVersion = compatibility.cowork.version;
const coworkIntegrity = compatibility.cowork.integrity;
const cliVersion = compatibility.cli.version;
const cliIntegrity = compatibility.cli.integrity;
const cohort = compatibility.sdk.cohortVersion;
if (![coworkPackage, coworkVersion, coworkIntegrity, cliVersion, cliIntegrity, cohort].every((value) => typeof value === "string" && value.length > 0)) {
  fail("package versions and integrity values must be non-empty strings.");
}

const expectedTargets = ["darwin-arm64", "linux-x64", "linux-arm64", "win32-x64"];
if (!Array.isArray(compatibility.supportedTargets) || JSON.stringify(compatibility.supportedTargets) !== JSON.stringify(expectedTargets)) {
  fail(`supportedTargets must be exactly ${expectedTargets.join(", ")}.`);
}

const appManifest = await readJson(join(repoRoot, "apps", "app", "package.json"));
const serverManifest = await readJson(join(repoRoot, "apps", "server", "package.json"));
const runtimeManifest = await readJson(join(repoRoot, "packages", "univer-runtime-distribution", "package.json"));
const appDependencies = packageDependencies(appManifest);
if (appDependencies[coworkPackage] !== coworkVersion) {
  fail(`apps/app must depend on ${coworkPackage}@${coworkVersion}.`);
}
if (packageDependencies(serverManifest)[coworkPackage] !== undefined || packageDependencies(serverManifest)["@univer/cowork"] !== undefined) {
  fail("apps/server must own host contracts and must not depend on a Cowork package.");
}
if (packageDependencies(runtimeManifest)["univer-cli"] !== cliVersion) {
  fail(`runtime distribution must depend on univer-cli@${cliVersion}.`);
}

for (const packageJsonPath of await workspacePackageJsonPaths()) {
  let manifest;
  try {
    manifest = await readJson(packageJsonPath);
  } catch {
    continue;
  }
  for (const [name, version] of Object.entries(packageDependencies(manifest))) {
    if ((name === "univer-cli" || name.startsWith("@univer")) && typeof version === "string" && /^(?:link|file):/.test(version)) {
      fail(`${packageJsonPath} contains forbidden local Univer dependency ${name}: ${version}.`);
    }
  }
}

const installedCoworkManifest = await readJson(join(repoRoot, "apps", "app", "node_modules", "@univerjs-pro", "cowork", "package.json"));
if (installedCoworkManifest.version !== coworkVersion) {
  fail(`installed Cowork version is ${installedCoworkManifest.version ?? "<unknown>"}, expected ${coworkVersion}.`);
}
if (!isRecord(installedCoworkManifest.peerDependencies)) fail("published Cowork peerDependencies are missing.");
for (const [name, version] of Object.entries(installedCoworkManifest.peerDependencies)) {
  const declared = appDependencies[name];
  if (typeof declared !== "string") fail(`apps/app does not declare Cowork peer ${name}.`);
  if (name.startsWith("@univer") && (version !== cohort || declared !== cohort)) {
    fail(`${name} must resolve in the locked SDK cohort ${cohort}; peer=${version}, app=${declared}.`);
  }
  if (name === "rxjs" && declared !== version) fail(`rxjs declaration ${declared} does not match Cowork peer ${version}.`);
  if (name === "react" && declared !== "catalog:") fail("React must remain an OpenWork catalog dependency.");
}

const lockfile = await readFile(join(repoRoot, "pnpm-lock.yaml"), "utf8");
const runtimeLockfile = await readFile(join(repoRoot, "packages", "univer-runtime-distribution", "pnpm-lock.yaml"), "utf8");
for (const forbidden of ["@univer/cowork", "link:../../../univer-cli", "file:../../../univer-cli"]) {
  if (lockfile.includes(forbidden)) fail(`pnpm-lock.yaml still contains ${forbidden}.`);
  if (runtimeLockfile.includes(forbidden)) fail(`runtime distribution lockfile still contains ${forbidden}.`);
}
for (const required of [
  `@univerjs-pro/cowork@${coworkVersion}`,
  `univer-cli@${cliVersion}`,
  coworkIntegrity,
  cliIntegrity,
]) {
  if (!lockfile.includes(required)) fail(`pnpm-lock.yaml does not contain ${required}.`);
}
for (const required of [
  `univer-cli@${cliVersion}`,
  cliIntegrity,
  "@univerjs-pro/doc-typst-native-binding@",
  "@univerjs-pro/engine-formula-rust-binding@",
  "@univerjs-pro/uexcli@",
  "libsql@",
]) {
  if (!runtimeLockfile.includes(required)) fail(`runtime distribution lockfile does not contain ${required}.`);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  identity: compatibility.identity,
  coworkPeers: Object.keys(installedCoworkManifest.peerDependencies).length,
  supportedTargets: compatibility.supportedTargets,
}, null, 2)}\n`);
