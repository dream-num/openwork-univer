import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, readFile, realpath, readdir, rm, stat, writeFile } from "node:fs/promises";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  checkUniverRuntimeDistributionHealth,
  ensureUniverDaemonRunning,
  parseUniverOpenHandoff,
  resolveUniverRuntimeDistribution,
  writeUniverExecutableShim,
  writeUniverExecutableShimSync,
  UniverOpenHandoffError,
  type UniverRuntimeDistribution,
  type UniverRuntimeDistributionHealth,
} from "../univer-runtime/index.js";

import { ApiError } from "../errors.js";
import type { ServerConfig, WorkspaceInfo } from "../types.js";
import { exists } from "../utils.js";
import { projectSkillsDir } from "../workspace-files.js";
import { runtimeStorageDir } from "../runtime-opencode-config-store.js";

export const UNIVER_CLI_EXTENSION_ID = "univer-cli";

const UNIVER_SKILL_NAME = "univer-cli";
const UNIVER_SKILL_REPO = {
  owner: "dream-num",
  repo: "univer-cli",
  ref: "e9066dc0f266a9ba7a109b21008c146b9473f616",
};
const UNIVER_NPM_PACKAGE = "univer-cli";
const UNIVER_BIN_NAME = process.platform === "win32" ? "univer.cmd" : "univer";
const INSTALL_METADATA_FILE = ".openwork-univer-cli.json";
const COMMAND_TIMEOUT_MS = 20_000;
const OPEN_SURFACE_TIMEOUT_MS = 60_000;
const OPENWORK_UNIVER_NODE_RUNTIME_ENV = "OPENWORK_UNIVER_NODE_RUNTIME";
const OPENWORK_UNIVER_NODE_RUNTIME_ELECTRON_ENV = "OPENWORK_UNIVER_NODE_RUNTIME_ELECTRON";

export const UNIVER_CLI_EXTENSION_ACTIONS = [
  {
    extensionId: UNIVER_CLI_EXTENSION_ID,
    action: "setup_status",
    title: "Univer distribution status",
    description: "Check the installed OpenWork Univer compatibility set and health probes.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional OpenWork workspace id. Defaults to the active context workspace." },
      },
      additionalProperties: false,
    },
  },
  {
    extensionId: UNIVER_CLI_EXTENSION_ID,
    action: "setup_install",
    title: "Prepare Univer distribution",
    description: "Materialize the offline canonical skill and repair the local executable shim when needed.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional OpenWork workspace id. Defaults to the active context workspace." },
      },
      additionalProperties: false,
    },
  },
  {
    extensionId: UNIVER_CLI_EXTENSION_ID,
    action: "setup_retry",
    title: "Retry Univer CLI setup checks",
    description: "Re-run Univer CLI setup checks without changing installed files.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional OpenWork workspace id. Defaults to the active context workspace." },
      },
      additionalProperties: false,
    },
  },
  {
    extensionId: UNIVER_CLI_EXTENSION_ID,
    action: "setup_repair",
    title: "Repair Univer distribution",
    description: "Repair the local shim and workspace skill projection from packaged offline resources.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional OpenWork workspace id. Defaults to the active context workspace." },
      },
      additionalProperties: false,
    },
  },
  {
    extensionId: UNIVER_CLI_EXTENSION_ID,
    action: "open_surface",
    title: "Open Univer surface",
    description: "Start the local Univer collab gateway if needed and return an embedded collab-client URL for a workspace .univer file.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "OpenWork workspace id containing the .univer file." },
        path: { type: "string", description: "Workspace-relative path to the .univer file." },
        worktreeId: { type: "string", description: "Optional Univer worktree id to open." },
        unitId: { type: "string", description: "Optional Univer unit id to select." },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
];

type SetupAction = "setup_status" | "setup_install" | "setup_retry" | "setup_repair";
type SurfaceAction = "open_surface";
type ProbeStatus = "ok" | "missing" | "failed" | "skipped";
type ExecutableSource = "bundled" | "override" | "unresolved";
type RegistryCheckStatus = "not_checked" | "ok" | "failed" | "skipped";

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  error: string | null;
};

type ProbeResult = {
  status: ProbeStatus;
  command?: string[];
  detail?: string;
  stdout?: string;
  stderr?: string;
};

type ExecutableVersionStatus = {
  commandVersion: string | null;
  commandOutput: string | null;
  packageVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean | null;
  checkedAt: string | null;
  registryStatus: RegistryCheckStatus;
  registryDetail: string | null;
};

type SkillStatus = {
  installed: boolean;
  complete: boolean;
  sourceVerified: boolean;
  path: string;
  source: string;
  checks: {
    skillFile: boolean;
    references: boolean;
    inspectTools: boolean;
  };
};

type BundleStatus = {
  status: UniverRuntimeDistributionHealth["status"] | "unavailable";
  reason: string | null;
  manifest: {
    bundleVersion: string;
    coworkVersion: string;
    univerCliVersion: string;
    skillsRevision: string;
    protocolVersion: number;
  } | null;
  paths: {
    univerExecutable: string;
    skillsRoot: string;
    manifest: string;
  } | null;
};

type ExecutableStatus = {
  resolved: boolean;
  source: ExecutableSource;
  path: string | null;
  managedBinPath: string;
  packageName: string;
  installRoot: string;
  version: ExecutableVersionStatus;
};

type HealthStatus = {
  executable: ProbeResult;
  inspectTools: ProbeResult;
  sacMigrationTemplates: ProbeResult;
};

type UniverCliSetupStatus = {
  ready: boolean;
  workspace: {
    id: string;
    path: string;
  };
  skill: SkillStatus;
  executable: ExecutableStatus;
  bundle: BundleStatus;
  health: HealthStatus;
  issues: string[];
};

type InstallResult = {
  bundle?: {
    action: "ready" | "repaired";
    manifestPath: string;
    executablePath: string;
    skillsRoot: string;
  };
  skill?: {
    action: "added" | "updated";
    written: number;
    skipped: number;
    path: string;
  };
  executable?: {
    packageName: string;
    installRoot: string;
    binPath: string | null;
    skipped: boolean;
  };
};

type SetupActionResult = {
  ok: true;
  extensionId: typeof UNIVER_CLI_EXTENSION_ID;
  action: SetupAction;
  result: UniverCliSetupStatus;
  install?: InstallResult;
  context: Record<string, unknown>;
};

type UniverOpenSurface = {
  origin: string;
  univerfile: string;
  workspaceId: string;
  path: string;
  worktreeId?: string;
  unitId?: string;
};

type SurfaceActionResult = {
  ok: true;
  extensionId: typeof UNIVER_CLI_EXTENSION_ID;
  action: SurfaceAction;
  result: UniverOpenSurface;
  context: Record<string, unknown>;
};

type UniverCliActionResult = SetupActionResult | SurfaceActionResult;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringField(value: unknown, key: string): string {
  if (!isRecord(value)) return "";
  const field = value[key];
  return typeof field === "string" ? field.trim() : "";
}

function emptyExecutableVersionStatus(): ExecutableVersionStatus {
  return {
    commandVersion: null,
    commandOutput: null,
    packageVersion: null,
    latestVersion: null,
    updateAvailable: null,
    checkedAt: null,
    registryStatus: "not_checked",
    registryDetail: null,
  };
}

function parseVersionText(value: string): string | null {
  const match = value.match(/\b\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/);
  return match?.[0] ?? null;
}

function normalizedWorkspace(workspace: WorkspaceInfo): WorkspaceInfo {
  return { ...workspace, path: resolve(workspace.path) };
}

function normalizeWorkspaceRelativePath(input: string): string {
  let normalized = input.trim().replace(/\\/g, "/");
  normalized = normalized.replace(/^\/+/, "");
  normalized = normalized.replace(/^\.\//, "");
  normalized = normalized.replace(/^workspaces\/[^/]+\//i, "");
  normalized = normalized.replace(/^workspace\/(?:ws_[^/]+|\d+|[0-9a-f-]{6,})\//i, "");
  normalized = normalized.replace(/^workspace\//i, "");
  normalized = normalized.replace(/^\/+/, "");

  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length) {
    throw new ApiError(400, "invalid_univer_path", "A .univer path is required.");
  }
  for (const part of parts) {
    if (part === "." || part === "..") {
      throw new ApiError(400, "invalid_univer_path", "Path traversal is not allowed.");
    }
  }
  return parts.join("/");
}

function isWithinRoot(root: string, candidate: string): boolean {
  return candidate !== root && candidate.startsWith(`${root}${sep}`);
}

async function realpathIfPresent(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

async function resolveUniverfilePath(workspace: WorkspaceInfo, args: Record<string, unknown>): Promise<{ absolutePath: string; relativePath: string }> {
  const rawPath = readStringField(args, "path") || readStringField(args, "file") || readStringField(args, "univerfile");
  if (!rawPath) {
    throw new ApiError(400, "invalid_univer_path", "A workspace-relative .univer path is required.");
  }
  const workspaceRoot = await realpathIfPresent(workspace.path);
  const candidate = isAbsolute(rawPath)
    ? resolve(rawPath)
    : resolve(workspaceRoot, normalizeWorkspaceRelativePath(rawPath));
  const absolutePath = await realpathIfPresent(candidate);
  if (!isWithinRoot(workspaceRoot, absolutePath)) {
    throw new ApiError(400, "invalid_univer_path", "The .univer path must stay inside the workspace.");
  }
  if (!absolutePath.toLowerCase().endsWith(".univer")) {
    throw new ApiError(400, "invalid_univer_path", "Expected a .univer file.");
  }
  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(absolutePath);
  } catch {
    throw new ApiError(404, "univer_file_not_found", "The .univer file was not found.", { path: rawPath });
  }
  if (!fileStat.isFile()) {
    throw new ApiError(400, "invalid_univer_path", "The .univer path must point to a file.");
  }
  return {
    absolutePath,
    relativePath: relative(workspaceRoot, absolutePath).replace(/\\/g, "/"),
  };
}

function workspaceForSetup(config: ServerConfig, args: Record<string, unknown>, context: Record<string, unknown>): WorkspaceInfo {
  const requestedWorkspaceId = readStringField(args, "workspaceId") || readStringField(context, "workspaceId");
  if (requestedWorkspaceId) {
    const aliasWorkspaceId = requestedWorkspaceId.startsWith("rem_") ? requestedWorkspaceId.slice("rem_".length) : "";
    const match =
      config.workspaces.find((workspace) => workspace.id === requestedWorkspaceId) ??
      (aliasWorkspaceId ? config.workspaces.find((workspace) => workspace.id === aliasWorkspaceId) : undefined);
    if (!match) throw new ApiError(404, "workspace_not_found", "Workspace not found for Univer CLI setup");
    return normalizedWorkspace(match);
  }

  const directoryCandidates = [readStringField(context, "directory"), readStringField(context, "worktree")]
    .filter((value) => value.length > 0)
    .map((value) => resolve(value));
  for (const candidate of directoryCandidates) {
    const match = config.workspaces.find((workspace) => {
      const workspaceRoot = resolve(workspace.path);
      return candidate === workspaceRoot || candidate.startsWith(`${workspaceRoot}/`) || candidate.startsWith(`${workspaceRoot}\\`);
    });
    if (match) return normalizedWorkspace(match);
  }

  const fallback = config.workspaces[0];
  if (!fallback) throw new ApiError(404, "workspace_not_found", "Workspace not found for Univer CLI setup");
  return normalizedWorkspace(fallback);
}

function univerCliRoot(config: ServerConfig): string {
  return join(runtimeStorageDir(config), "extensions", UNIVER_CLI_EXTENSION_ID);
}

function workspaceDaemonHome(config: ServerConfig, workspace: WorkspaceInfo): string {
  const key = createHash("sha256")
    .update(workspace.id)
    .update("\0")
    .update(workspace.path)
    .digest("base64url")
    .slice(0, 24);
  return join(univerCliRoot(config), "daemon", key);
}

export function univerCliManagedBinDir(config: ServerConfig): string {
  return join(univerCliRoot(config), "bin");
}

export function univerCliManagedExecutablePath(config: ServerConfig): string {
  return join(univerCliManagedBinDir(config), UNIVER_BIN_NAME);
}

function bundledExecutableShimPath(config: ServerConfig): string {
  return univerCliManagedExecutablePath(config);
}

function tryResolveBundledDistribution(): UniverRuntimeDistribution | null {
  try {
    return resolveUniverRuntimeDistribution();
  } catch {
    return null;
  }
}

function bundledNodeRuntimeExecutable(): string {
  const override = process.env[OPENWORK_UNIVER_NODE_RUNTIME_ENV]?.trim();
  if (override) return override;
  return typeof process.versions.electron === "string" && process.versions.electron.length > 0
    ? process.execPath
    : "";
}

function bundledNodeRuntimeUsesElectron(): boolean {
  return process.env[OPENWORK_UNIVER_NODE_RUNTIME_ELECTRON_ENV] === "1"
    || (typeof process.versions.electron === "string" && process.versions.electron.length > 0);
}

function executableShimOptions(shimPath: string, targetBinPath: string) {
  const runtimeExecutable = bundledNodeRuntimeExecutable();
  return {
    shimPath,
    targetBinPath,
    ...(runtimeExecutable ? {
      nodeRuntimeExecutable: runtimeExecutable,
      electronRunAsNode: bundledNodeRuntimeUsesElectron(),
    } : {}),
  };
}

function ensureBundledExecutableShimSync(config: ServerConfig, bundle: UniverRuntimeDistribution): string | null {
  if (config.readOnly) return null;
  const binPath = bundledExecutableShimPath(config);
  try {
    return writeUniverExecutableShimSync(executableShimOptions(binPath, bundle.univerExecutablePath));
  } catch {
    return null;
  }
}

async function ensureBundledExecutableShim(config: ServerConfig, bundle: UniverRuntimeDistribution): Promise<string> {
  if (config.readOnly) {
    throw new ApiError(403, "read_only", "OpenWork is running read-only; the bundled Univer runtime shim cannot be repaired.");
  }
  const binPath = bundledExecutableShimPath(config);
  return writeUniverExecutableShim(executableShimOptions(binPath, bundle.univerExecutablePath));
}

export function univerCliManagedRuntimeEnv(config: ServerConfig): Record<string, string> {
  const bundle = tryResolveBundledDistribution();
  if (bundle) {
    ensureBundledExecutableShimSync(config, bundle);
  }
  const binDir = univerCliManagedBinDir(config);
  const existingPath = process.env.PATH ?? "";
  return {
    OPENWORK_UNIVER_BIN: univerCliManagedExecutablePath(config),
    PATH: existingPath ? `${binDir}${delimiter}${existingPath}` : binDir,
  };
}

function skillDir(workspaceRoot: string): string {
  return join(projectSkillsDir(workspaceRoot), UNIVER_SKILL_NAME);
}

async function readSkillInstallSource(path: string): Promise<string> {
  const raw = await readFile(join(path, INSTALL_METADATA_FILE), "utf8").catch(() => "");
  if (!raw) return "unknown";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.source)) return "unknown";
    const owner = typeof parsed.source.owner === "string" ? parsed.source.owner : "";
    const repo = typeof parsed.source.repo === "string" ? parsed.source.repo : "";
    const ref = typeof parsed.source.ref === "string" ? parsed.source.ref : "";
    if (owner === UNIVER_SKILL_REPO.owner && repo === UNIVER_SKILL_REPO.repo && ref === UNIVER_SKILL_REPO.ref) {
      return `${owner}/${repo}@${ref}`;
    }
    return [owner, repo].filter(Boolean).join("/") || "unknown";
  } catch {
    return "unknown";
  }
}

export async function inspectUniverSkillPackage(workspaceRoot: string): Promise<SkillStatus> {
  const path = skillDir(workspaceRoot);
  const skillFile = await exists(join(path, "SKILL.md"));
  const references = await exists(join(path, "references", "evidence-tools.md"));
  const inspectTools = await exists(join(path, "inspect-tools", "tools.manifest.json"));
  const source = await readSkillInstallSource(path);
  const installed = skillFile || references || inspectTools;
  const complete = skillFile && references && inspectTools;
  return {
    installed,
    complete,
    sourceVerified: source === `${UNIVER_SKILL_REPO.owner}/${UNIVER_SKILL_REPO.repo}@${UNIVER_SKILL_REPO.ref}`,
    path,
    source,
    checks: {
      skillFile,
      references,
      inspectTools,
    },
  };
}

async function inspectBundledSkillPackage(bundle: UniverRuntimeDistribution | null): Promise<SkillStatus | null> {
  if (!bundle) return null;
  const path = bundle.skillsRoot;
  const skillFile = await exists(join(path, "SKILL.md"));
  const references = await exists(join(path, "references", "evidence-tools.md"));
  const inspectTools = await exists(join(path, "inspect-tools", "tools.manifest.json"));
  const installed = skillFile || references || inspectTools;
  const complete = skillFile && references && inspectTools;
  return {
    installed,
    complete,
    sourceVerified: complete,
    path,
    source: `bundled:${bundle.manifest.source.repository}@${bundle.manifest.source.commit}`,
    checks: {
      skillFile,
      references,
      inspectTools,
    },
  };
}

async function writeSkillInstallMetadata(path: string): Promise<void> {
  const content = JSON.stringify({
    source: UNIVER_SKILL_REPO,
    skill: UNIVER_SKILL_NAME,
    installedAt: new Date().toISOString(),
  }, null, 2) + "\n";
  await writeFile(join(path, INSTALL_METADATA_FILE), content, "utf8");
}

function executableOverride(): string {
  return process.env.OPENWORK_UNIVER_EXECUTABLE?.trim() || "";
}

async function resolveExecutable(config: ServerConfig, bundle: UniverRuntimeDistribution | null): Promise<ExecutableStatus> {
  const override = executableOverride();
  const managedBinPath = univerCliManagedExecutablePath(config);
  const installRoot = bundle?.root ?? univerCliRoot(config);
  if (override) {
    const resolvedOverride = resolve(override);
    return {
      resolved: await exists(resolvedOverride),
      source: "override",
      path: resolvedOverride,
      managedBinPath,
      packageName: UNIVER_NPM_PACKAGE,
      installRoot,
      version: emptyExecutableVersionStatus(),
    };
  }

  if (bundle) {
    const shimPath = ensureBundledExecutableShimSync(config, bundle) ?? bundle.univerExecutablePath;
    return {
      resolved: await exists(shimPath),
      source: "bundled",
      path: shimPath,
      managedBinPath,
      packageName: UNIVER_NPM_PACKAGE,
      installRoot,
      version: emptyExecutableVersionStatus(),
    };
  }

  return {
    resolved: false,
    source: "unresolved",
    path: null,
    managedBinPath,
    packageName: UNIVER_NPM_PACKAGE,
    installRoot,
    version: emptyExecutableVersionStatus(),
  };
}

function commandLabel(command: string, args: string[]): string[] {
  return [command, ...args];
}

async function runCommand(command: string, args: string[], cwd: string, timeoutMs = COMMAND_TIMEOUT_MS, env: NodeJS.ProcessEnv = process.env): Promise<CommandResult> {
  return new Promise((resolveCommand) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveCommand({
        ...result,
        stdout: result.stdout.slice(0, 8_000),
        stderr: result.stderr.slice(0, 8_000),
      });
    };
    timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish({
        ok: false,
        stdout,
        stderr,
        exitCode: null,
        signal: "SIGTERM",
        error: `Timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      finish({
        ok: false,
        stdout,
        stderr,
        exitCode: null,
        signal: null,
        error: error.message,
      });
    });
    child.once("exit", (exitCode, signal) => {
      finish({
        ok: exitCode === 0,
        stdout,
        stderr,
        exitCode,
        signal,
        error: null,
      });
    });
  });
}

function probeFromCommand(command: string, args: string[], result: CommandResult, requireJson: boolean): ProbeResult {
  const detail = result.error ?? (result.ok ? "" : `Exit ${result.exitCode ?? "unknown"}${result.signal ? ` signal ${result.signal}` : ""}`);
  if (!result.ok) {
    return {
      status: "failed",
      command: commandLabel(command, args),
      detail,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  }
  if (requireJson) {
    try {
      JSON.parse(result.stdout);
    } catch (error) {
      return {
        status: "failed",
        command: commandLabel(command, args),
        detail: `Expected JSON output: ${error instanceof Error ? error.message : String(error)}`,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
      };
    }
  }
  return {
    status: "ok",
    command: commandLabel(command, args),
    stdout: result.stdout.trim().slice(0, 2_000),
    stderr: result.stderr.trim().slice(0, 2_000),
  };
}

async function probeExecutable(command: string, cwd: string): Promise<ProbeResult> {
  for (const args of [["--version"], ["help"], ["--help"]]) {
    const result = await runCommand(command, args, cwd);
    if (result.ok) return probeFromCommand(command, args, result, false);
  }
  const result = await runCommand(command, ["help"], cwd);
  return probeFromCommand(command, ["help"], result, false);
}

async function probeJsonCommand(command: string, args: string[], cwd: string): Promise<ProbeResult> {
  const result = await runCommand(command, args, cwd);
  return probeFromCommand(command, args, result, true);
}

async function healthStatus(workspace: WorkspaceInfo, executable: ExecutableStatus): Promise<HealthStatus> {
  if (!executable.resolved || !executable.path) {
    const skipped: ProbeResult = { status: "skipped", detail: "No resolved univer executable." };
    return {
      executable: skipped,
      inspectTools: skipped,
      sacMigrationTemplates: skipped,
    };
  }
  return {
    executable: await probeExecutable(executable.path, workspace.path),
    inspectTools: await probeJsonCommand(executable.path, ["inspect", "tools", "list", "--json"], workspace.path),
    sacMigrationTemplates: await probeJsonCommand(executable.path, ["sac", "migration", "templates", "--json"], workspace.path),
  };
}

function executableVersionStatus(
  executable: ExecutableStatus,
  health: HealthStatus,
  bundle: UniverRuntimeDistribution | null,
): ExecutableVersionStatus {
  const commandOutput = health.executable.stdout?.trim() || null;
  const commandVersion = commandOutput ? parseVersionText(commandOutput) : null;
  return {
    commandVersion,
    commandOutput,
    packageVersion: executable.source === "bundled" ? bundle?.manifest.cli.version ?? null : null,
    latestVersion: null,
    updateAvailable: null,
    checkedAt: null,
    registryStatus: "not_checked",
    registryDetail: null,
  };
}

function bundleStatusFromHealth(health: UniverRuntimeDistributionHealth | null): BundleStatus {
  if (!health) {
    return {
      status: "unavailable",
      reason: "The Offline-Ready Univer Distribution could not be resolved.",
      manifest: null,
      paths: null,
    };
  }
  const bundle = health.status === "fatal" ? health.distribution : health.distribution;
  return {
    status: health.status,
    reason: health.status === "healthy" ? null : health.reason,
    manifest: bundle
      ? {
          bundleVersion: bundle.manifest.identity,
          coworkVersion: bundle.manifest.cowork.version,
          univerCliVersion: bundle.manifest.cli.version,
          skillsRevision: bundle.manifest.source.commit,
          protocolVersion: bundle.manifest.schemaVersion,
        }
      : null,
    paths: bundle
      ? {
          univerExecutable: bundle.univerExecutablePath,
          skillsRoot: bundle.skillsRoot,
          manifest: bundle.manifestPath,
        }
      : null,
  };
}

async function readBundleHealth(config: ServerConfig): Promise<UniverRuntimeDistributionHealth | null> {
  try {
    const bundle = tryResolveBundledDistribution();
    if (!bundle) return null;
    const runtimeExecutablePath = config.readOnly
      ? bundle.univerExecutablePath
      : ensureBundledExecutableShimSync(config, bundle) ?? bundledExecutableShimPath(config);
    return await checkUniverRuntimeDistributionHealth({
      root: bundle.root,
      runtimeExecutablePath,
      versionProbeExecutablePath: runtimeExecutablePath,
      versionProbeCwd: bundle.root,
    });
  } catch {
    return null;
  }
}

function setupIssues(skill: SkillStatus, executable: ExecutableStatus, bundle: BundleStatus, health: HealthStatus): string[] {
  const issues: string[] = [];
  if (bundle.status === "fatal") issues.push(`The bundled Univer components are inconsistent: ${bundle.reason ?? "unknown error"}`);
  if (bundle.status === "repairable") issues.push(`The bundled Univer runtime needs local repair: ${bundle.reason ?? "repair required"}`);
  if (!skill.complete) issues.push("The univer-cli skill package is incomplete.");
  if (!skill.sourceVerified) issues.push("The univer-cli skill package source is not verified as dream-num/univer-cli.");
  if (!executable.resolved) issues.push("No usable univer executable is resolved.");
  if (health.executable.status !== "ok") issues.push("The univer executable version/help probe failed.");
  if (health.inspectTools.status !== "ok") issues.push("The managed inspect tools probe failed.");
  if (health.sacMigrationTemplates.status !== "ok") issues.push("The SaC migration template probe failed.");
  return issues;
}

export async function univerCliSetupStatus(config: ServerConfig, args: Record<string, unknown>, context: Record<string, unknown>): Promise<UniverCliSetupStatus> {
  const workspace = workspaceForSetup(config, args, context);
  const bundleHealth = await readBundleHealth(config);
  const bundleStatus = bundleStatusFromHealth(bundleHealth);
  const bundle = bundleHealth && bundleHealth.status !== "fatal"
    ? bundleHealth.distribution
    : bundleHealth?.distribution ?? tryResolveBundledDistribution();
  const bundledSkill = await inspectBundledSkillPackage(bundle);
  const skill = bundledSkill ?? await inspectUniverSkillPackage(workspace.path);
  const executable = await resolveExecutable(config, bundle);
  const health = await healthStatus(workspace, executable);
  const version = executableVersionStatus(executable, health, bundle);
  const executableWithVersion: ExecutableStatus = {
    ...executable,
    version: executable.source === "bundled"
      ? { ...version, packageVersion: bundle?.manifest.cli.version ?? version.packageVersion }
      : version,
  };
  const issues = setupIssues(skill, executableWithVersion, bundleStatus, health);
  return {
    ready: issues.length === 0,
    workspace: {
      id: workspace.id,
      path: workspace.path,
    },
    skill,
    executable: executableWithVersion,
    bundle: bundleStatus,
    health,
    issues,
  };
}

async function countFiles(root: string): Promise<number> {
  let count = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) count += await countFiles(join(root, entry.name));
    else if (entry.isFile()) count += 1;
  }
  return count;
}

async function materializeBundledSkillPackage(
  workspaceRoot: string,
  bundle: UniverRuntimeDistribution,
): Promise<InstallResult["skill"]> {
  const path = skillDir(workspaceRoot);
  const existed = await exists(path);
  await rm(path, { recursive: true, force: true });
  await cp(bundle.skillsRoot, path, { recursive: true, errorOnExist: true });
  await writeSkillInstallMetadata(path);
  return {
    action: existed ? "updated" : "added",
    written: await countFiles(path),
    skipped: 0,
    path,
  };
}

async function writeExecutableShim(config: ServerConfig, targetBinPath: string): Promise<string> {
  const binPath = univerCliManagedExecutablePath(config);
  return writeUniverExecutableShim(executableShimOptions(binPath, targetBinPath));
}

async function installSetup(config: ServerConfig, workspace: WorkspaceInfo, repair: boolean): Promise<InstallResult> {
  if (config.readOnly) {
    throw new ApiError(403, "read_only", "OpenWork is running read-only; Univer CLI setup cannot install files.");
  }
  const bundleHealth = await readBundleHealth(config);
  if (!bundleHealth) {
    throw new ApiError(409, "univer_distribution_unavailable", "The Offline-Ready Univer Distribution is unavailable.");
  }
  if (bundleHealth.status === "fatal") {
    throw new ApiError(409, "univer_distribution_inconsistent", "The Offline-Ready Univer Distribution is inconsistent.", {
      reason: bundleHealth.reason,
    });
  }
  const bundle = bundleHealth.distribution;
  const skill = await materializeBundledSkillPackage(workspace.path, bundle);
  const override = executableOverride();
  let binPath: string;
  if (override) {
    const resolvedOverride = resolve(override);
    if (!(await exists(resolvedOverride))) {
      throw new ApiError(400, "univer_override_not_found", "The Univer executable override path does not exist.", {
        path: resolvedOverride,
      });
    }
    binPath = await writeExecutableShim(config, resolvedOverride);
  } else {
    binPath = await ensureBundledExecutableShim(config, bundle);
  }
  return {
    bundle: {
      action: repair || bundleHealth.status === "repairable" ? "repaired" : "ready",
      manifestPath: bundle.manifestPath,
      executablePath: binPath,
      skillsRoot: bundle.skillsRoot,
    },
    skill,
  };
}

function isSetupAction(action: string): action is SetupAction {
  return action === "setup_status" || action === "setup_install" || action === "setup_retry" || action === "setup_repair";
}

function isSurfaceAction(action: string): action is SurfaceAction {
  return action === "open_surface";
}

function surfaceCommandEnv(config: ServerConfig, workspace: WorkspaceInfo): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...univerCliManagedRuntimeEnv(config),
    UNIVER_HOME: workspaceDaemonHome(config, workspace),
    UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT: workspace.path,
  };
}

function isRecoverableDaemonStartFailure(result: CommandResult): boolean {
  const text = `${result.stdout}\n${result.stderr}\n${result.error ?? ""}`;
  return result.signal === "SIGTERM"
    || /Daemon RPC timeout/i.test(text)
    || /Timed out waiting for daemon startup/i.test(text);
}

function mergeDaemonRecoveryFailure(first: CommandResult, stopped: CommandResult, second: CommandResult): CommandResult {
  return {
    ok: false,
    stdout: [first.stdout, stopped.stdout, second.stdout].filter(Boolean).join("\n"),
    stderr: [first.stderr, stopped.stderr, second.stderr].filter(Boolean).join("\n"),
    exitCode: second.exitCode,
    signal: second.signal,
    error: second.error ?? stopped.error ?? first.error,
  };
}

async function ensureOpenSurfaceDaemonRunning(options: {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}): Promise<CommandResult> {
  const first = await ensureUniverDaemonRunning(options);
  if (first.ok || !isRecoverableDaemonStartFailure(first)) {
    return first;
  }

  const stopped = await runCommand(options.command, ["daemon", "stop"], options.cwd, COMMAND_TIMEOUT_MS, options.env);
  const second = await ensureUniverDaemonRunning({ ...options, dedupe: false });
  if (second.ok) {
    return second;
  }
  return mergeDaemonRecoveryFailure(first, stopped, second);
}

function parseOpenSurface(stdout: string, workspace: WorkspaceInfo, target: { absolutePath: string; relativePath: string }): UniverOpenSurface {
  try {
    const handoff = parseUniverOpenHandoff(stdout, { expectedUniverfile: target.absolutePath });
    return {
      origin: handoff.origin,
      univerfile: handoff.univerfile,
      workspaceId: workspace.id,
      path: target.relativePath,
      ...(handoff.worktreeId ? { worktreeId: handoff.worktreeId } : {}),
      ...(handoff.unitId ? { unitId: handoff.unitId } : {}),
    };
  } catch (error) {
    if (error instanceof UniverOpenHandoffError) {
      const code = error.code === "untrustedOrigin" ? "univer_open_untrusted_url" : "univer_open_invalid_response";
      const message = error.code === "untrustedOrigin"
        ? "univer open returned a non-local gateway origin."
        : "univer open returned an invalid response.";
      throw new ApiError(502, code, message, {
        error: error.message,
        handoffCode: error.code,
        stdout,
      });
    }
    throw new ApiError(502, "univer_open_invalid_response", "univer open returned an invalid response.", {
      error: error instanceof Error ? error.message : String(error),
      stdout,
    });
  }
}

async function openUniverSurface(config: ServerConfig, args: Record<string, unknown>, context: Record<string, unknown>): Promise<SurfaceActionResult> {
  const workspace = workspaceForSetup(config, args, context);
  if (workspace.workspaceType === "remote") {
    throw new ApiError(400, "univer_remote_workspace_unsupported", "Embedded Univer preview is available for local workspaces only.");
  }
  const setup = await univerCliSetupStatus(config, args, { ...context, workspaceId: workspace.id });
  if (!setup.ready || !setup.executable.path) {
    throw new ApiError(409, "univer_setup_incomplete", "Univer CLI setup is incomplete.", { status: setup });
  }

  const target = await resolveUniverfilePath(workspace, args);
  const localWorkspace = { ...workspace, path: await realpathIfPresent(workspace.path) };
  const env = surfaceCommandEnv(config, localWorkspace);
  const daemon = await ensureOpenSurfaceDaemonRunning({
    command: setup.executable.path,
    cwd: localWorkspace.path,
    env,
    timeoutMs: OPEN_SURFACE_TIMEOUT_MS,
  });
  if (!daemon.ok) {
    throw new ApiError(502, "univer_daemon_start_failed", "Failed to start the Univer daemon.", {
      stdout: daemon.stdout,
      stderr: daemon.stderr,
      error: daemon.error,
      exitCode: daemon.exitCode,
    });
  }

  const worktreeId = readStringField(args, "worktreeId") || readStringField(args, "worktree");
  const unitId = readStringField(args, "unitId") || readStringField(args, "unit");
  const openArgs = ["open", target.absolutePath, "--json"];
  if (worktreeId) openArgs.push("--worktree", worktreeId);
  if (unitId) openArgs.push("--unit", unitId);
  const opened = await runCommand(setup.executable.path, openArgs, localWorkspace.path, OPEN_SURFACE_TIMEOUT_MS, env);
  if (!opened.ok) {
    throw new ApiError(502, "univer_open_failed", "Failed to open the Univer collab surface.", {
      stdout: opened.stdout,
      stderr: opened.stderr,
      error: opened.error,
      exitCode: opened.exitCode,
    });
  }

  return {
    ok: true,
    extensionId: UNIVER_CLI_EXTENSION_ID,
    action: "open_surface",
    result: parseOpenSurface(opened.stdout, workspace, target),
    context,
  };
}

export async function callUniverCliExtensionAction(
  config: ServerConfig,
  action: string,
  args: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<UniverCliActionResult | null> {
  if (isSurfaceAction(action)) return openUniverSurface(config, args, context);
  if (!isSetupAction(action)) return null;
  const workspace = workspaceForSetup(config, args, context);
  let install: InstallResult | undefined;
  if (action === "setup_install" || action === "setup_repair") {
    install = await installSetup(config, workspace, action === "setup_repair");
  }
  const result = await univerCliSetupStatus(config, args, { ...context, workspaceId: workspace.id });
  return {
    ok: true,
    extensionId: UNIVER_CLI_EXTENSION_ID,
    action,
    result,
    ...(install ? { install } : {}),
    context,
  };
}
