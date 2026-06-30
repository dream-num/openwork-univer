import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  checkUniverCoworkBundleHealth,
  resolveUniverCoworkBundle,
  type UniverCoworkBundle,
  type UniverCoworkBundleHealth,
} from "@univer/cowork/node";

import { ApiError } from "../errors.js";
import { installHubSkill } from "../skill-hub.js";
import type { ServerConfig, WorkspaceInfo } from "../types.js";
import { exists } from "../utils.js";
import { projectSkillsDir } from "../workspace-files.js";
import { runtimeStorageDir } from "../runtime-opencode-config-store.js";

export const UNIVER_CLI_EXTENSION_ID = "univer-cli";

const UNIVER_SKILL_NAME = "univer-cli";
const UNIVER_SKILL_REPO = { owner: "dream-num", repo: "skills", ref: "main" };
const UNIVER_NPM_PACKAGE = "univer-cli";
const UNIVER_BIN_NAME = process.platform === "win32" ? "univer.cmd" : "univer";
const INSTALL_METADATA_FILE = ".openwork-univer-cli.json";
const COMMAND_TIMEOUT_MS = 20_000;
const OPEN_SURFACE_TIMEOUT_MS = 60_000;
const NPM_INSTALL_TIMEOUT_MS = 120_000;

export const UNIVER_CLI_EXTENSION_ACTIONS = [
  {
    extensionId: UNIVER_CLI_EXTENSION_ID,
    action: "setup_status",
    title: "Univer bundle status",
    description: "Check whether the bundled Univer executable, skill package, and health checks are ready.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional OpenWork workspace id. Defaults to the active context workspace." },
        executablePath: { type: "string", description: "Optional development override for an existing univer executable." },
        checkForUpdates: { type: "boolean", description: "Legacy managed installs only: checks the npm registry for the latest managed univer-cli version." },
        autoUpdate: { type: "boolean", description: "Legacy managed installs only: updates the managed executable if the registry check finds a newer version." },
      },
      additionalProperties: false,
    },
  },
  {
    extensionId: UNIVER_CLI_EXTENSION_ID,
    action: "setup_install",
    title: "Prepare Univer bundle",
    description: "Prepare the built-in Univer bundle by repairing the local executable shim when needed.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional OpenWork workspace id. Defaults to the active context workspace." },
        executablePath: { type: "string", description: "Optional development override for an existing univer executable." },
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
        executablePath: { type: "string", description: "Optional development override for an existing univer executable." },
      },
      additionalProperties: false,
    },
  },
  {
    extensionId: UNIVER_CLI_EXTENSION_ID,
    action: "setup_repair",
    title: "Repair Univer bundle",
    description: "Repair the local shim/cache for the built-in Univer bundle and re-run setup checks.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional OpenWork workspace id. Defaults to the active context workspace." },
        executablePath: { type: "string", description: "Optional development override for an existing univer executable." },
      },
      additionalProperties: false,
    },
  },
  {
    extensionId: UNIVER_CLI_EXTENSION_ID,
    action: "setup_update",
    title: "Update legacy managed Univer CLI",
    description: "Legacy managed installs only: update the OpenWork-managed univer-cli executable from the npm registry.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional OpenWork workspace id. Defaults to the active context workspace." },
        checkForUpdates: { type: "boolean", description: "When true, checks the npm registry after updating." },
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
        executablePath: { type: "string", description: "Optional development override for an existing univer executable." },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
];

type SetupAction = "setup_status" | "setup_install" | "setup_retry" | "setup_repair" | "setup_update";
type SurfaceAction = "open_surface";
type ProbeStatus = "ok" | "missing" | "failed" | "skipped";
type ExecutableSource = "bundled" | "managed" | "override" | "system" | "unresolved";
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
  status: UniverCoworkBundleHealth["status"] | "unavailable";
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
  url: string;
  viewerUrl: string;
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

function readBooleanField(value: unknown, key: string): boolean {
  if (!isRecord(value)) return false;
  return value[key] === true;
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

export function univerCliManagedBinDir(config: ServerConfig): string {
  return join(univerCliRoot(config), "bin");
}

export function univerCliManagedExecutablePath(config: ServerConfig): string {
  return join(univerCliManagedBinDir(config), UNIVER_BIN_NAME);
}

function managedNpmInstallRoot(config: ServerConfig): string {
  return join(univerCliRoot(config), "npm");
}

function packageBinPath(config: ServerConfig): string {
  return join(managedNpmInstallRoot(config), "node_modules", ".bin", UNIVER_BIN_NAME);
}

function bundledExecutableShimPath(config: ServerConfig): string {
  return univerCliManagedExecutablePath(config);
}

function tryResolveBundledCoworkBundle(): UniverCoworkBundle | null {
  try {
    return resolveUniverCoworkBundle();
  } catch {
    return null;
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function shimContent(targetBinPath: string): string {
  return process.platform === "win32"
    ? `@echo off\r\n"${targetBinPath}" %*\r\n`
    : `#!/bin/sh\nexec ${shellQuote(targetBinPath)} "$@"\n`;
}

function ensureBundledExecutableShimSync(config: ServerConfig, bundle: UniverCoworkBundle): string | null {
  if (config.readOnly) return null;
  const binPath = bundledExecutableShimPath(config);
  try {
    mkdirSync(dirname(binPath), { recursive: true });
    writeFileSync(binPath, shimContent(bundle.univerExecutablePath), "utf8");
    chmodSync(binPath, 0o755);
    return binPath;
  } catch {
    return null;
  }
}

async function ensureBundledExecutableShim(config: ServerConfig, bundle: UniverCoworkBundle): Promise<string> {
  if (config.readOnly) {
    throw new ApiError(403, "read_only", "OpenWork is running read-only; the bundled Univer runtime shim cannot be repaired.");
  }
  const binPath = bundledExecutableShimPath(config);
  await mkdir(dirname(binPath), { recursive: true });
  await writeFile(binPath, shimContent(bundle.univerExecutablePath), "utf8");
  await chmod(binPath, 0o755).catch(() => undefined);
  return binPath;
}

export function univerCliManagedRuntimeEnv(config: ServerConfig): Record<string, string> {
  const bundle = tryResolveBundledCoworkBundle();
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

async function inspectBundledSkillPackage(bundle: UniverCoworkBundle | null): Promise<SkillStatus | null> {
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
    source: `bundled:dream-num/skills@${bundle.manifest.skillsRevision}`,
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

function executableOverride(args: Record<string, unknown>): string {
  return readStringField(args, "executablePath") || process.env.OPENWORK_UNIVER_EXECUTABLE?.trim() || "";
}

async function executableOnPath(): Promise<string | null> {
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir.trim()) continue;
    const candidate = resolve(dir, UNIVER_BIN_NAME);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next PATH segment.
    }
  }
  return null;
}

async function resolveExecutable(config: ServerConfig, args: Record<string, unknown>, bundle: UniverCoworkBundle | null): Promise<ExecutableStatus> {
  const override = executableOverride(args);
  const managedBinPath = univerCliManagedExecutablePath(config);
  const installRoot = managedNpmInstallRoot(config);
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

  const managedExists = await exists(managedBinPath);
  if (managedExists) {
    return {
      resolved: true,
      source: "managed",
      path: managedBinPath,
      managedBinPath,
      packageName: UNIVER_NPM_PACKAGE,
      installRoot,
      version: emptyExecutableVersionStatus(),
    };
  }

  const systemBinPath = await executableOnPath();
  if (systemBinPath) {
    return {
      resolved: true,
      source: "system",
      path: systemBinPath,
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

function isDaemonBuildMismatch(result: CommandResult): boolean {
  return /Daemon build mismatch/i.test(`${result.stdout}\n${result.stderr}`);
}

function mergeCommandFailures(first: CommandResult, second: CommandResult): CommandResult {
  return {
    ok: false,
    stdout: [first.stdout, second.stdout].filter(Boolean).join("\n"),
    stderr: [first.stderr, second.stderr].filter(Boolean).join("\n"),
    exitCode: second.exitCode,
    signal: second.signal,
    error: second.error ?? first.error,
  };
}

async function startUniverDaemon(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<CommandResult> {
  const firstStart = await runCommand(command, ["daemon", "start"], cwd, OPEN_SURFACE_TIMEOUT_MS, env);
  if (firstStart.ok || !isDaemonBuildMismatch(firstStart)) {
    return firstStart;
  }

  const stopped = await runCommand(command, ["daemon", "stop"], cwd, OPEN_SURFACE_TIMEOUT_MS, env);
  if (!stopped.ok) {
    return mergeCommandFailures(firstStart, stopped);
  }

  return runCommand(command, ["daemon", "start"], cwd, OPEN_SURFACE_TIMEOUT_MS, env);
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

async function readManagedPackageVersion(config: ServerConfig): Promise<string | null> {
  const packageJsonPath = join(managedNpmInstallRoot(config), "node_modules", UNIVER_NPM_PACKAGE, "package.json");
  const raw = await readFile(packageJsonPath, "utf8").catch(() => "");
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const version = parsed.version;
    return typeof version === "string" && version.trim() ? version.trim() : null;
  } catch {
    return null;
  }
}

function parseNpmVersion(stdout: string): string | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === "string" && parsed.trim()) return parsed.trim();
  } catch {
    // Fall through to plain npm output parsing.
  }
  return parseVersionText(trimmed);
}

async function checkRegistryLatestVersion(workspace: WorkspaceInfo): Promise<Pick<
  ExecutableVersionStatus,
  "latestVersion" | "checkedAt" | "registryStatus" | "registryDetail"
>> {
  const checkedAt = new Date().toISOString();
  const result = await runCommand("npm", ["view", UNIVER_NPM_PACKAGE, "version", "--json"], workspace.path);
  if (!result.ok) {
    const detail = result.error ?? (result.stderr.trim() || result.stdout.trim() || `Exit ${result.exitCode ?? "unknown"}`);
    return {
      latestVersion: null,
      checkedAt,
      registryStatus: "failed",
      registryDetail: detail,
    };
  }
  const latestVersion = parseNpmVersion(result.stdout);
  return {
    latestVersion,
    checkedAt,
    registryStatus: latestVersion ? "ok" : "failed",
    registryDetail: latestVersion ? null : "npm registry response did not include a version.",
  };
}

async function executableVersionStatus(
  config: ServerConfig,
  workspace: WorkspaceInfo,
  executable: ExecutableStatus,
  health: HealthStatus,
  checkForUpdates: boolean,
): Promise<ExecutableVersionStatus> {
  const commandOutput = health.executable.stdout?.trim() || null;
  const packageVersion = await readManagedPackageVersion(config);
  const commandVersion = commandOutput ? parseVersionText(commandOutput) : null;
  const checked = checkForUpdates
    ? await checkRegistryLatestVersion(workspace)
    : {
        latestVersion: null,
        checkedAt: null,
        registryStatus: "not_checked" as const,
        registryDetail: null,
      };
  const currentManagedVersion = executable.source === "managed" ? packageVersion ?? commandVersion : null;
  const updateAvailable = checked.latestVersion && currentManagedVersion
    ? checked.latestVersion !== currentManagedVersion
    : null;
  return {
    commandVersion,
    commandOutput,
    packageVersion,
    latestVersion: checked.latestVersion,
    updateAvailable,
    checkedAt: checked.checkedAt,
    registryStatus: checked.registryStatus,
    registryDetail: checked.registryDetail,
  };
}

function bundleStatusFromHealth(health: UniverCoworkBundleHealth | null): BundleStatus {
  if (!health) {
    return {
      status: "unavailable",
      reason: "The @univer/cowork bundle could not be resolved.",
      manifest: null,
      paths: null,
    };
  }
  const bundle = health.status === "fatal" ? health.bundle : health.bundle;
  return {
    status: health.status,
    reason: health.status === "healthy" ? null : health.reason,
    manifest: bundle
      ? {
          bundleVersion: bundle.manifest.bundleVersion,
          coworkVersion: bundle.manifest.coworkVersion,
          univerCliVersion: bundle.manifest.univerCliVersion,
          skillsRevision: bundle.manifest.skillsRevision,
          protocolVersion: bundle.manifest.protocolVersion,
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

async function readBundleHealth(config: ServerConfig): Promise<UniverCoworkBundleHealth | null> {
  try {
    const bundle = tryResolveBundledCoworkBundle();
    if (bundle && !config.readOnly) {
      ensureBundledExecutableShimSync(config, bundle);
    }
    return await checkUniverCoworkBundleHealth(
      config.readOnly ? {} : { runtimeExecutablePath: univerCliManagedExecutablePath(config) }
    );
  } catch {
    return null;
  }
}

function setupIssues(skill: SkillStatus, executable: ExecutableStatus, bundle: BundleStatus, health: HealthStatus): string[] {
  const issues: string[] = [];
  if (bundle.status === "fatal") issues.push(`The bundled Univer components are inconsistent: ${bundle.reason ?? "unknown error"}`);
  if (bundle.status === "repairable") issues.push(`The bundled Univer runtime needs local repair: ${bundle.reason ?? "repair required"}`);
  if (!skill.complete) issues.push("The univer-cli skill package is incomplete.");
  if (!skill.sourceVerified) issues.push("The univer-cli skill package source is not verified as dream-num/skills.");
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
  const bundle = bundleHealth && bundleHealth.status !== "fatal" ? bundleHealth.bundle : bundleHealth?.bundle ?? tryResolveBundledCoworkBundle();
  const bundledSkill = await inspectBundledSkillPackage(bundle);
  const skill = bundledSkill ?? await inspectUniverSkillPackage(workspace.path);
  const executable = await resolveExecutable(config, args, bundle);
  const health = await healthStatus(workspace, executable);
  const shouldCheckForUpdates =
    executable.source !== "bundled" &&
    (readBooleanField(args, "checkForUpdates") || readBooleanField(args, "autoUpdate"));
  const version = await executableVersionStatus(
    config,
    workspace,
    executable,
    health,
    shouldCheckForUpdates,
  );
  const executableWithVersion: ExecutableStatus = {
    ...executable,
    version: executable.source === "bundled"
      ? { ...version, packageVersion: bundle?.manifest.univerCliVersion ?? version.packageVersion }
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

async function installUniverSkillPackage(workspaceRoot: string): Promise<InstallResult["skill"]> {
  const result = await installHubSkill(workspaceRoot, {
    name: UNIVER_SKILL_NAME,
    overwrite: true,
    repo: UNIVER_SKILL_REPO,
  });
  await writeSkillInstallMetadata(result.path);
  return {
    action: result.action,
    written: result.written,
    skipped: result.skipped,
    path: result.path,
  };
}

async function writeExecutableShim(config: ServerConfig, targetBinPath: string): Promise<string> {
  const binPath = univerCliManagedExecutablePath(config);
  await mkdir(dirname(binPath), { recursive: true });
  await writeFile(binPath, shimContent(targetBinPath), "utf8");
  await chmod(binPath, 0o755).catch(() => undefined);
  return binPath;
}

async function installManagedExecutable(config: ServerConfig): Promise<InstallResult["executable"]> {
  const installRoot = managedNpmInstallRoot(config);
  await mkdir(installRoot, { recursive: true });
  const packageSpec = `${UNIVER_NPM_PACKAGE}@latest`;
  const npmResult = await runCommand("npm", ["install", "--prefix", installRoot, "--no-audit", "--no-fund", packageSpec], installRoot, NPM_INSTALL_TIMEOUT_MS);
  if (!npmResult.ok) {
    throw new ApiError(502, "univer_npm_install_failed", "Failed to install univer-cli with npm.", {
      stdout: npmResult.stdout,
      stderr: npmResult.stderr,
      error: npmResult.error,
      exitCode: npmResult.exitCode,
    });
  }

  const binPath = packageBinPath(config);
  if (!(await exists(binPath))) {
    throw new ApiError(502, "univer_bin_not_found", "npm install completed but the univer bin was not found.", {
      binPath,
      packageName: UNIVER_NPM_PACKAGE,
    });
  }
  const shimPath = await writeExecutableShim(config, binPath);
  return {
    packageName: UNIVER_NPM_PACKAGE,
    installRoot,
    binPath: shimPath,
    skipped: false,
  };
}

async function installSetup(config: ServerConfig, workspace: WorkspaceInfo, args: Record<string, unknown>, repair: boolean): Promise<InstallResult> {
  if (config.readOnly) {
    throw new ApiError(403, "read_only", "OpenWork is running read-only; Univer CLI setup cannot install files.");
  }
  const bundleHealth = await readBundleHealth(config);
  if (bundleHealth) {
    if (bundleHealth.status === "fatal") {
      throw new ApiError(409, "univer_bundle_inconsistent", "Bundled Univer components are inconsistent.", {
        reason: bundleHealth.reason,
      });
    }
    const binPath = await ensureBundledExecutableShim(config, bundleHealth.bundle);
    return {
      bundle: {
        action: repair || bundleHealth.status === "repairable" ? "repaired" : "ready",
        manifestPath: bundleHealth.bundle.manifestPath,
        executablePath: binPath,
        skillsRoot: bundleHealth.bundle.skillsRoot,
      },
    };
  }
  const skill = await installUniverSkillPackage(workspace.path);
  const override = executableOverride(args);
  if (override) {
    const resolvedOverride = resolve(override);
    if (!(await exists(resolvedOverride))) {
      throw new ApiError(400, "univer_override_not_found", "The Univer executable override path does not exist.", {
        path: resolvedOverride,
      });
    }
    const binPath = await writeExecutableShim(config, resolvedOverride);
    return {
      skill,
      executable: {
        packageName: UNIVER_NPM_PACKAGE,
        installRoot: managedNpmInstallRoot(config),
        binPath,
        skipped: true,
      },
    };
  }
  const existingManagedBin = await exists(univerCliManagedExecutablePath(config));
  const executable = repair || !existingManagedBin
    ? await installManagedExecutable(config)
    : {
        packageName: UNIVER_NPM_PACKAGE,
        installRoot: managedNpmInstallRoot(config),
        binPath: univerCliManagedExecutablePath(config),
        skipped: true,
      };
  return { skill, executable };
}

async function updateManagedSetup(config: ServerConfig): Promise<InstallResult> {
  if (config.readOnly) {
    throw new ApiError(403, "read_only", "OpenWork is running read-only; Univer CLI setup cannot update files.");
  }
  const bundleHealth = await readBundleHealth(config);
  if (bundleHealth) {
    if (bundleHealth.status === "fatal") {
      throw new ApiError(409, "univer_bundle_inconsistent", "Bundled Univer components are inconsistent.", {
        reason: bundleHealth.reason,
      });
    }
    const binPath = await ensureBundledExecutableShim(config, bundleHealth.bundle);
    return {
      bundle: {
        action: bundleHealth.status === "repairable" ? "repaired" : "ready",
        manifestPath: bundleHealth.bundle.manifestPath,
        executablePath: binPath,
        skillsRoot: bundleHealth.bundle.skillsRoot,
      },
    };
  }
  const executable = await installManagedExecutable(config);
  return { executable };
}

function isSetupAction(action: string): action is SetupAction {
  return action === "setup_status" || action === "setup_install" || action === "setup_retry" || action === "setup_repair" || action === "setup_update";
}

function isSurfaceAction(action: string): action is SurfaceAction {
  return action === "open_surface";
}

function surfaceCommandEnv(config: ServerConfig, workspace: WorkspaceInfo): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...univerCliManagedRuntimeEnv(config),
    UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT: workspace.path,
  };
}

function isLoopbackHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function readRequiredSurfaceString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || !field.trim()) {
    throw new ApiError(502, "univer_open_invalid_response", `univer open response is missing ${key}.`, { response: value });
  }
  return field;
}

function readOptionalSurfaceString(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}

function parseOpenSurface(stdout: string, workspace: WorkspaceInfo, target: { absolutePath: string; relativePath: string }): UniverOpenSurface {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch (error) {
    throw new ApiError(502, "univer_open_invalid_response", "univer open did not return JSON.", {
      error: error instanceof Error ? error.message : String(error),
      stdout,
    });
  }
  if (!isRecord(parsed)) {
    throw new ApiError(502, "univer_open_invalid_response", "univer open returned an invalid response.", { response: parsed });
  }

  const url = readRequiredSurfaceString(parsed, "url");
  const viewerUrl = readRequiredSurfaceString(parsed, "viewerUrl");
  const univerfile = readRequiredSurfaceString(parsed, "univerfile");
  if (resolve(univerfile) !== target.absolutePath) {
    throw new ApiError(502, "univer_open_invalid_response", "univer open returned a different .univer path.", { univerfile });
  }
  if (!isLoopbackHttpUrl(url) || !isLoopbackHttpUrl(viewerUrl)) {
    throw new ApiError(502, "univer_open_untrusted_url", "univer open returned a non-local gateway URL.", { url, viewerUrl });
  }
  return {
    url,
    viewerUrl,
    univerfile,
    workspaceId: workspace.id,
    path: target.relativePath,
    worktreeId: readOptionalSurfaceString(parsed, "worktreeId"),
    unitId: readOptionalSurfaceString(parsed, "unitId"),
  };
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
  const env = surfaceCommandEnv(config, workspace);
  const daemon = await startUniverDaemon(setup.executable.path, workspace.path, env);
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
  const opened = await runCommand(setup.executable.path, openArgs, workspace.path, OPEN_SURFACE_TIMEOUT_MS, env);
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
    install = await installSetup(config, workspace, args, action === "setup_repair");
  } else if (action === "setup_update") {
    install = await updateManagedSetup(config);
  }
  const statusArgs = action === "setup_update" ? { ...args, checkForUpdates: true } : args;
  let result = await univerCliSetupStatus(config, statusArgs, { ...context, workspaceId: workspace.id });
  if (
    action === "setup_status" &&
    readBooleanField(args, "autoUpdate") &&
    result.executable.source === "managed" &&
    result.executable.version.updateAvailable === true
  ) {
    install = await updateManagedSetup(config);
    result = await univerCliSetupStatus(config, { ...args, checkForUpdates: true, autoUpdate: false }, { ...context, workspaceId: workspace.id });
  }
  return {
    ok: true,
    extensionId: UNIVER_CLI_EXTENSION_ID,
    action,
    result,
    ...(install ? { install } : {}),
    context,
  };
}
