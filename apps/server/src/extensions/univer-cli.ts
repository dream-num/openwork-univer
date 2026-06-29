import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";

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
const NPM_INSTALL_TIMEOUT_MS = 120_000;

export const UNIVER_CLI_EXTENSION_ACTIONS = [
  {
    extensionId: UNIVER_CLI_EXTENSION_ID,
    action: "setup_status",
    title: "Univer CLI setup status",
    description: "Check whether the Univer executable, skill package, and installer health checks are ready.",
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
    action: "setup_install",
    title: "Install Univer CLI setup",
    description: "Install the canonical univer-cli skill package and provision an OpenWork-managed univer executable.",
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
    title: "Repair Univer CLI setup",
    description: "Reinstall the canonical univer-cli skill package, repair the managed executable shim, and re-run setup checks.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional OpenWork workspace id. Defaults to the active context workspace." },
        executablePath: { type: "string", description: "Optional development override for an existing univer executable." },
      },
      additionalProperties: false,
    },
  },
];

type SetupAction = "setup_status" | "setup_install" | "setup_retry" | "setup_repair";
type ProbeStatus = "ok" | "missing" | "failed" | "skipped";
type ExecutableSource = "managed" | "override" | "system" | "unresolved";

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

type ExecutableStatus = {
  resolved: boolean;
  source: ExecutableSource;
  path: string | null;
  managedBinPath: string;
  packageName: string;
  installRoot: string;
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
  health: HealthStatus;
  issues: string[];
};

type InstallResult = {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringField(value: unknown, key: string): string {
  if (!isRecord(value)) return "";
  const field = value[key];
  return typeof field === "string" ? field.trim() : "";
}

function normalizedWorkspace(workspace: WorkspaceInfo): WorkspaceInfo {
  return { ...workspace, path: resolve(workspace.path) };
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

export function univerCliManagedRuntimeEnv(config: ServerConfig): Record<string, string> {
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

async function resolveExecutable(config: ServerConfig, args: Record<string, unknown>): Promise<ExecutableStatus> {
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
    };
  }

  return {
    resolved: false,
    source: "unresolved",
    path: null,
    managedBinPath,
    packageName: UNIVER_NPM_PACKAGE,
    installRoot,
  };
}

function commandLabel(command: string, args: string[]): string[] {
  return [command, ...args];
}

async function runCommand(command: string, args: string[], cwd: string, timeoutMs = COMMAND_TIMEOUT_MS): Promise<CommandResult> {
  return new Promise((resolveCommand) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
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

function setupIssues(skill: SkillStatus, executable: ExecutableStatus, health: HealthStatus): string[] {
  const issues: string[] = [];
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
  const skill = await inspectUniverSkillPackage(workspace.path);
  const executable = await resolveExecutable(config, args);
  const health = await healthStatus(workspace, executable);
  const issues = setupIssues(skill, executable, health);
  return {
    ready: issues.length === 0,
    workspace: {
      id: workspace.id,
      path: workspace.path,
    },
    skill,
    executable,
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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function writeExecutableShim(config: ServerConfig, targetBinPath: string): Promise<string> {
  const binPath = univerCliManagedExecutablePath(config);
  await mkdir(dirname(binPath), { recursive: true });
  const content = process.platform === "win32"
    ? `@echo off\r\n"${targetBinPath}" %*\r\n`
    : `#!/bin/sh\nexec ${shellQuote(targetBinPath)} "$@"\n`;
  await writeFile(binPath, content, "utf8");
  await chmod(binPath, 0o755).catch(() => undefined);
  return binPath;
}

async function installManagedExecutable(config: ServerConfig): Promise<InstallResult["executable"]> {
  const installRoot = managedNpmInstallRoot(config);
  await mkdir(installRoot, { recursive: true });
  const npmResult = await runCommand("npm", ["install", "--prefix", installRoot, "--no-audit", "--no-fund", UNIVER_NPM_PACKAGE], installRoot, NPM_INSTALL_TIMEOUT_MS);
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

function isSetupAction(action: string): action is SetupAction {
  return action === "setup_status" || action === "setup_install" || action === "setup_retry" || action === "setup_repair";
}

export async function callUniverCliExtensionAction(
  config: ServerConfig,
  action: string,
  args: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<SetupActionResult | null> {
  if (!isSetupAction(action)) return null;
  const workspace = workspaceForSetup(config, args, context);
  let install: InstallResult | undefined;
  if (action === "setup_install" || action === "setup_repair") {
    install = await installSetup(config, workspace, args, action === "setup_repair");
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
