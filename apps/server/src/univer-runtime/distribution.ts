import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, existsSync, readFileSync } from "node:fs";
import { access, lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export interface UniverCompatibilityManifest {
  schemaVersion: 1;
  identity: string;
  cowork: {
    package: string;
    version: string;
    integrity: string;
  };
  sdk: {
    cohortVersion: string;
  };
  cli: {
    package: string;
    version: string;
    integrity: string;
  };
  source: {
    repository: string;
    tag: string;
    commit: string;
    archiveUrl: string;
    skillPath: string;
    skillDigestAlgorithm: string;
    skillDigest: string;
  };
  distribution: {
    univerExecutable: string;
    skillsRoot: string;
    provenance: string;
  };
  supportedTargets: string[];
}

export interface UniverRuntimeDistribution {
  root: string;
  manifestPath: string;
  manifest: UniverCompatibilityManifest;
  univerExecutablePath: string;
  skillsRoot: string;
  provenancePath: string;
}

export type UniverRuntimeDistributionHealth =
  | { status: "healthy"; distribution: UniverRuntimeDistribution }
  | { status: "repairable"; distribution: UniverRuntimeDistribution; reason: string }
  | { status: "fatal"; reason: string; distribution?: UniverRuntimeDistribution };

export interface ResolveUniverRuntimeDistributionOptions {
  root?: string;
  manifestPath?: string;
}

export interface CheckUniverRuntimeDistributionHealthOptions extends ResolveUniverRuntimeDistributionOptions {
  runtimeExecutablePath?: string;
  versionProbeExecutablePath?: string;
  versionProbeCwd?: string;
  versionProbeEnv?: NodeJS.ProcessEnv;
  versionProbeTimeoutMs?: number;
}

interface DistributionProvenance {
  schemaVersion: 1;
  compatibilityIdentity: string;
  target: string;
  cliVersion: string;
  sourceCommit: string;
  skillDigest: string;
  skillFiles: number;
  generatedAt: string;
}

export function resolveUniverRuntimeDistribution(
  options: ResolveUniverRuntimeDistributionOptions = {},
): UniverRuntimeDistribution {
  const root = resolve(options.root ?? defaultDistributionRoot());
  const manifestPath = resolve(options.manifestPath ?? join(root, "compatibility.json"));
  const manifest = readCompatibilityManifest(manifestPath);
  return {
    root,
    manifestPath,
    manifest,
    univerExecutablePath: resolveDistributionResource(root, manifest.distribution.univerExecutable),
    skillsRoot: resolveDistributionResource(root, manifest.distribution.skillsRoot),
    provenancePath: resolveDistributionResource(root, manifest.distribution.provenance),
  };
}

export async function checkUniverRuntimeDistributionHealth(
  options: CheckUniverRuntimeDistributionHealthOptions = {},
): Promise<UniverRuntimeDistributionHealth> {
  let distribution: UniverRuntimeDistribution;
  try {
    distribution = resolveUniverRuntimeDistribution(options);
  } catch (error) {
    return { status: "fatal", reason: errorMessage(error) };
  }

  const immutableIssue = await immutableDistributionIssue(distribution, options);
  if (immutableIssue !== undefined) return { status: "fatal", reason: immutableIssue, distribution };

  const runtimeExecutablePath = nonEmpty(options.runtimeExecutablePath);
  if (runtimeExecutablePath !== undefined) {
    const runtimeIssue = await executableAccessIssue(resolve(runtimeExecutablePath));
    if (runtimeIssue !== undefined) return { status: "repairable", distribution, reason: runtimeIssue };
  }
  return { status: "healthy", distribution };
}

function defaultDistributionRoot(): string {
  const configured = process.env.OPENWORK_TEST_UNIVER_DISTRIBUTION_ROOT?.trim();
  if (configured) return configured;
  const resourcesPath = process.resourcesPath?.trim();
  if (resourcesPath) {
    const packaged = join(resourcesPath, "univer-distribution");
    if (existsSync(join(packaged, "compatibility.json"))) return packaged;
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../desktop/univer-distribution");
}

function resolveDistributionResource(root: string, resourcePath: string): string {
  const candidate = resolve(root, resourcePath);
  if (candidate === root || !candidate.startsWith(`${root}${sep}`)) {
    throw new Error(`Univer distribution resource escapes its root: ${resourcePath}`);
  }
  return candidate;
}

function readCompatibilityManifest(path: string): UniverCompatibilityManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read Univer compatibility manifest at ${path}: ${errorMessage(error)}`);
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
    throw new Error(`Invalid Univer compatibility manifest at ${path}: expected schemaVersion 1.`);
  }
  const cowork = readRequiredRecord(parsed, "cowork", path);
  const sdk = readRequiredRecord(parsed, "sdk", path);
  const cli = readRequiredRecord(parsed, "cli", path);
  const source = readRequiredRecord(parsed, "source", path);
  const distribution = readRequiredRecord(parsed, "distribution", path);
  return {
    schemaVersion: 1,
    identity: readRequiredString(parsed, "identity", path),
    cowork: {
      package: readRequiredString(cowork, "package", path),
      version: readRequiredString(cowork, "version", path),
      integrity: readRequiredString(cowork, "integrity", path),
    },
    sdk: { cohortVersion: readRequiredString(sdk, "cohortVersion", path) },
    cli: {
      package: readRequiredString(cli, "package", path),
      version: readRequiredString(cli, "version", path),
      integrity: readRequiredString(cli, "integrity", path),
    },
    source: {
      repository: readRequiredString(source, "repository", path),
      tag: readRequiredString(source, "tag", path),
      commit: readRequiredString(source, "commit", path),
      archiveUrl: readRequiredString(source, "archiveUrl", path),
      skillPath: readRequiredString(source, "skillPath", path),
      skillDigestAlgorithm: readRequiredString(source, "skillDigestAlgorithm", path),
      skillDigest: readRequiredString(source, "skillDigest", path),
    },
    distribution: {
      univerExecutable: readRequiredString(distribution, "univerExecutable", path),
      skillsRoot: readRequiredString(distribution, "skillsRoot", path),
      provenance: readRequiredString(distribution, "provenance", path),
    },
    supportedTargets: readRequiredStringArray(parsed, "supportedTargets", path),
  };
}

async function immutableDistributionIssue(
  distribution: UniverRuntimeDistribution,
  options: CheckUniverRuntimeDistributionHealthOptions,
): Promise<string | undefined> {
  const target = hostTarget();
  if (!distribution.manifest.supportedTargets.includes(target)) {
    return `Univer compatibility set does not support ${target}.`;
  }
  const executableIssue = await executableAccessIssue(distribution.univerExecutablePath);
  if (executableIssue !== undefined) return executableIssue;

  const packageVersion = await readDeployedCliVersion(distribution.univerExecutablePath);
  if (packageVersion !== distribution.manifest.cli.version) {
    return `Packaged univer-cli version ${packageVersion ?? "<unknown>"} does not match ${distribution.manifest.cli.version}.`;
  }
  const skillIssue = await skillRootIssue(distribution.skillsRoot);
  if (skillIssue !== undefined) return skillIssue;
  const skill = await skillTreeDigest(distribution.skillsRoot);
  if (skill.digest !== distribution.manifest.source.skillDigest) {
    return `Packaged Univer skill digest ${skill.digest} does not match ${distribution.manifest.source.skillDigest}.`;
  }

  const provenance = await readProvenance(distribution.provenancePath);
  if (provenance === null) return `Invalid Univer distribution provenance at ${distribution.provenancePath}.`;
  if (provenance.compatibilityIdentity !== distribution.manifest.identity) return "Univer provenance compatibility identity does not match the manifest.";
  if (provenance.cliVersion !== distribution.manifest.cli.version) return "Univer provenance CLI version does not match the manifest.";
  if (provenance.sourceCommit !== distribution.manifest.source.commit) return "Univer provenance source commit does not match the manifest.";
  if (provenance.skillDigest !== skill.digest || provenance.skillFiles !== skill.files) return "Univer provenance skill tree does not match the packaged payload.";
  if (provenance.target !== target) return `Univer distribution target ${provenance.target} does not match host ${target}.`;

  const probeCommand = options.versionProbeExecutablePath ?? distribution.univerExecutablePath;
  const commandVersion = await readUniverCommandVersion(probeCommand, {
    ...(options.versionProbeCwd !== undefined ? { cwd: options.versionProbeCwd } : {}),
    ...(options.versionProbeEnv !== undefined ? { env: options.versionProbeEnv } : {}),
    ...(options.versionProbeTimeoutMs !== undefined ? { timeoutMs: options.versionProbeTimeoutMs } : {}),
  });
  if (commandVersion !== distribution.manifest.cli.version) {
    return `Packaged univer command version ${commandVersion ?? "<unknown>"} does not match ${distribution.manifest.cli.version}.`;
  }
  return undefined;
}

function hostTarget(): string {
  return `${process.platform}-${process.arch}`;
}

async function executableAccessIssue(path: string): Promise<string | undefined> {
  try {
    await access(path, constants.R_OK | constants.X_OK);
    return undefined;
  } catch {
    return `Univer executable is missing or not executable at ${path}.`;
  }
}

async function readDeployedCliVersion(executablePath: string): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(resolve(dirname(executablePath), "..", "package.json"), "utf8"));
    if (!isRecord(parsed)) return null;
    return typeof parsed.version === "string" ? parsed.version.trim() : null;
  } catch {
    return null;
  }
}

async function skillRootIssue(path: string): Promise<string | undefined> {
  for (const file of [
    join(path, "SKILL.md"),
    join(path, "references", "evidence-tools.md"),
    join(path, "inspect-tools", "tools.manifest.json"),
  ]) {
    try {
      await access(file, constants.R_OK);
    } catch {
      return `Packaged univer-cli skill is incomplete; missing ${file}.`;
    }
  }
  return undefined;
}

async function skillTreeDigest(root: string): Promise<{ digest: string; files: number }> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`Symlink in packaged Univer skill: ${path}`);
      if (info.isDirectory()) await visit(path);
      else if (info.isFile()) files.push(path);
      else throw new Error(`Unsupported entry in packaged Univer skill: ${path}`);
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

async function readProvenance(path: string): Promise<DistributionProvenance | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isRecord(parsed) || parsed.schemaVersion !== 1) return null;
    const skillFiles = parsed.skillFiles;
    if (typeof skillFiles !== "number" || !Number.isInteger(skillFiles) || skillFiles <= 0) return null;
    return {
      schemaVersion: 1,
      compatibilityIdentity: readRequiredString(parsed, "compatibilityIdentity", path),
      target: readRequiredString(parsed, "target", path),
      cliVersion: readRequiredString(parsed, "cliVersion", path),
      sourceCommit: readRequiredString(parsed, "sourceCommit", path),
      skillDigest: readRequiredString(parsed, "skillDigest", path),
      skillFiles,
      generatedAt: readRequiredString(parsed, "generatedAt", path),
    };
  } catch {
    return null;
  }
}

async function readUniverCommandVersion(
  command: string,
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
): Promise<string | null> {
  const stdout = await new Promise<string | null>((resolveProbe) => {
    const child = spawn(command, ["--version"], { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveProbe(value);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(null);
    }, positiveInteger(options.timeoutMs) ?? 10_000);
    child.stdout?.on("data", (chunk) => { output += chunk.toString(); });
    child.once("error", () => finish(null));
    child.once("exit", (exitCode) => finish(exitCode === 0 ? output : null));
  });
  if (stdout === null) return null;
  const match = stdout.match(/\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/);
  return match?.[0] ?? null;
}

function readRequiredRecord(value: Record<string, unknown>, key: string, path: string): Record<string, unknown> {
  const field = value[key];
  if (!isRecord(field)) throw new Error(`Invalid Univer compatibility manifest at ${path}: ${key} must be an object.`);
  return field;
}

function readRequiredString(value: Record<string, unknown>, key: string, path: string): string {
  const field = value[key];
  if (typeof field !== "string" || field.trim().length === 0) {
    throw new Error(`Invalid Univer compatibility manifest at ${path}: ${key} must be a non-empty string.`);
  }
  return field.trim();
}

function readRequiredStringArray(value: Record<string, unknown>, key: string, path: string): string[] {
  const field = value[key];
  if (!Array.isArray(field) || field.length === 0) {
    throw new Error(`Invalid Univer compatibility manifest at ${path}: ${key} must be a non-empty string array.`);
  }
  const result: string[] = [];
  for (const entry of field) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new Error(`Invalid Univer compatibility manifest at ${path}: ${key} must be a non-empty string array.`);
    }
    result.push(entry.trim());
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
