import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import * as tar from "tar";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const desktopRoot = join(repoRoot, "apps", "desktop");
const compatibilityPath = join(repoRoot, "univer.compatibility.json");
const runtimePackageRoot = join(repoRoot, "packages", "univer-runtime-distribution");
const outputRoot = resolveOutputRoot(process.argv.slice(2));

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value, key, context) {
  const field = value[key];
  if (typeof field !== "string" || field.trim().length === 0) {
    throw new Error(`${context}.${key} must be a non-empty string.`);
  }
  return field.trim();
}

function requiredRecord(value, key, context) {
  const field = value[key];
  if (!isRecord(field)) throw new Error(`${context}.${key} must be an object.`);
  return field;
}

function resolveOutputRoot(args) {
  const index = args.indexOf("--outdir");
  if (index === -1) return join(desktopRoot, "univer-distribution");
  const value = args[index + 1];
  if (!value) throw new Error("--outdir requires a path.");
  const resolved = resolve(repoRoot, value);
  if (resolved === repoRoot || resolved === desktopRoot) {
    throw new Error(`Refusing unsafe Univer distribution output path: ${resolved}`);
  }
  return resolved;
}

async function readCompatibility() {
  const parsed = JSON.parse(await readFile(compatibilityPath, "utf8"));
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
    throw new Error("univer.compatibility.json must use schemaVersion 1.");
  }
  const source = requiredRecord(parsed, "source", "compatibility");
  const cli = requiredRecord(parsed, "cli", "compatibility");
  const distribution = requiredRecord(parsed, "distribution", "compatibility");
  return {
    raw: parsed,
    identity: requiredString(parsed, "identity", "compatibility"),
    cliVersion: requiredString(cli, "version", "compatibility.cli"),
    sourceCommit: requiredString(source, "commit", "compatibility.source"),
    sourceArchiveUrl: requiredString(source, "archiveUrl", "compatibility.source"),
    sourceSkillPath: requiredString(source, "skillPath", "compatibility.source"),
    expectedSkillDigest: requiredString(source, "skillDigest", "compatibility.source"),
    executablePath: requiredString(distribution, "univerExecutable", "compatibility.distribution"),
    skillsPath: requiredString(distribution, "skillsRoot", "compatibility.distribution"),
  };
}

function hostTarget() {
  const target = `${process.platform}-${process.arch}`;
  if (target === "darwin-x64") {
    throw new Error("darwin-x64 is not a supported OpenWork Univer distribution target.");
  }
  return target;
}

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

async function ensureSourceArchive(compatibility) {
  const cacheRoot = join(desktopRoot, ".cache", "univer-cli-source");
  const archivePath = join(cacheRoot, `${compatibility.sourceCommit}.tar.gz`);
  try {
    await lstat(archivePath);
    return archivePath;
  } catch {
    // Fetch the immutable source archive below.
  }

  await mkdir(cacheRoot, { recursive: true });
  const token = githubToken();
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "openwork-univer-distribution-builder",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const response = await fetch(compatibility.sourceArchiveUrl, { redirect: "follow", headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch locked univer-cli source archive: HTTP ${response.status}.`);
  }
  const temporaryPath = `${archivePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, Buffer.from(await response.arrayBuffer()));
  await rename(temporaryPath, archivePath);
  return archivePath;
}

function githubToken() {
  const configured = process.env.UNIVER_CLI_SOURCE_TOKEN?.trim()
    || process.env.GITHUB_TOKEN?.trim()
    || process.env.GH_TOKEN?.trim();
  if (configured) return configured;
  const result = spawnSync("gh", ["auth", "token"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

async function inspectArchive(archivePath, sourceSkillPath) {
  const marker = `/${sourceSkillPath}/`;
  const selected = new Map();
  await tar.t({
    file: archivePath,
    onentry: (entry) => {
      const normalized = entry.path.replaceAll("\\", "/");
      const markerIndex = normalized.indexOf(marker);
      if (markerIndex < 0) return;
      const relativePath = normalized.slice(markerIndex + marker.length);
      if (!relativePath) return;
      const segments = relativePath.split("/").filter(Boolean);
      if (segments.some((segment) => segment === "." || segment === "..")) {
        throw new Error(`Unsafe path in univer-cli source archive: ${entry.path}`);
      }
      if (entry.type !== "File" && entry.type !== "Directory") {
        throw new Error(`Unsupported ${entry.type} entry in canonical Univer skill: ${entry.path}`);
      }
      selected.set(normalized, {
        relativePath,
        strip: normalized.slice(0, markerIndex + marker.length - 1).split("/").filter(Boolean).length,
      });
    },
  });
  if (selected.size === 0) {
    throw new Error(`Canonical skill path ${sourceSkillPath} was not found in ${archivePath}.`);
  }
  const stripValues = new Set(Array.from(selected.values(), (entry) => entry.strip));
  if (stripValues.size !== 1) throw new Error("Canonical skill archive entries have inconsistent roots.");
  return { selected, strip: Array.from(stripValues)[0] };
}

async function extractSkill(archivePath, compatibility) {
  const skillsRoot = join(outputRoot, compatibility.skillsPath);
  await mkdir(skillsRoot, { recursive: true });
  const { selected, strip } = await inspectArchive(archivePath, compatibility.sourceSkillPath);
  await tar.x({
    cwd: skillsRoot,
    file: archivePath,
    filter: (entryPath) => selected.has(entryPath.replaceAll("\\", "/")),
    preservePaths: false,
    strip,
  });

  for (const required of [
    "SKILL.md",
    "references/evidence-tools.md",
    "inspect-tools/tools.manifest.json",
  ]) {
    const path = join(skillsRoot, ...required.split("/"));
    const info = await lstat(path);
    if (!info.isFile()) throw new Error(`Canonical Univer skill is missing ${required}.`);
  }
  return skillsRoot;
}

async function skillTreeDigest(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are forbidden in the canonical Univer skill: ${path}`);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      } else {
        throw new Error(`Unsupported filesystem entry in canonical Univer skill: ${path}`);
      }
    }
  }
  await visit(root);
  files.sort((left, right) => Buffer.compare(
    Buffer.from(relative(root, left).split(sep).join("/")),
    Buffer.from(relative(root, right).split(sep).join("/")),
  ));
  const digest = createHash("sha256");
  for (const path of files) {
    const relativePath = relative(root, path).split(sep).join("/");
    const contentDigest = createHash("sha256").update(await readFile(path)).digest("hex");
    digest.update(relativePath);
    digest.update("\0");
    digest.update(contentDigest);
    digest.update("\n");
  }
  return { digest: digest.digest("hex"), files: files.length };
}

async function deployRuntime(compatibility) {
  const runtimeRoot = join(outputRoot, "runtime");
  const deployWorkspace = join(desktopRoot, ".cache", "univer-runtime-deploy-workspace");
  await rm(deployWorkspace, { recursive: true, force: true });
  await mkdir(deployWorkspace, { recursive: true });
  await copyFile(join(runtimePackageRoot, "package.json"), join(deployWorkspace, "package.json"));
  await copyFile(join(runtimePackageRoot, "pnpm-lock.yaml"), join(deployWorkspace, "pnpm-lock.yaml"));
  await writeFile(join(deployWorkspace, "pnpm-workspace.yaml"), `packages:\n  - "."\nallowBuilds:\n  univer-cli: false\n`, "utf8");
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  run(
    pnpm,
    ["--filter", "@openwork/univer-runtime-distribution", "deploy", "--prod", "--legacy", runtimeRoot],
    deployWorkspace,
    { CI: "true", PNPM_CONFIG_CONFIRM_MODULES_PURGE: "false" },
  );
  const packageJsonPath = join(runtimeRoot, "node_modules", "univer-cli", "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  if (!isRecord(packageJson) || packageJson.version !== compatibility.cliVersion) {
    throw new Error(`Deployed univer-cli version ${packageJson?.version ?? "<unknown>"} does not match ${compatibility.cliVersion}.`);
  }
  const executablePath = join(outputRoot, ...compatibility.executablePath.split("/"));
  await chmod(executablePath, 0o755);
  return executablePath;
}

const compatibility = await readCompatibility();
const target = hostTarget();
if (!Array.isArray(compatibility.raw.supportedTargets) || !compatibility.raw.supportedTargets.includes(target)) {
  throw new Error(`Unsupported OpenWork Univer distribution target: ${target}.`);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
const executablePath = await deployRuntime(compatibility);
const archivePath = await ensureSourceArchive(compatibility);
const skillsRoot = await extractSkill(archivePath, compatibility);
const skill = await skillTreeDigest(skillsRoot);
if (skill.digest !== compatibility.expectedSkillDigest) {
  throw new Error(`Canonical Univer skill digest ${skill.digest} does not match ${compatibility.expectedSkillDigest}.`);
}

await copyFile(compatibilityPath, join(outputRoot, "compatibility.json"));
await writeFile(join(outputRoot, "provenance.json"), `${JSON.stringify({
  schemaVersion: 1,
  compatibilityIdentity: compatibility.identity,
  target,
  cliVersion: compatibility.cliVersion,
  sourceCommit: compatibility.sourceCommit,
  skillDigest: skill.digest,
  skillFiles: skill.files,
  generatedAt: new Date().toISOString(),
}, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({
  ok: true,
  compatibility: compatibility.identity,
  target,
  outputRoot,
  executablePath,
  skillsRoot,
  skillDigest: skill.digest,
  skillFiles: skill.files,
}, null, 2)}\n`);
