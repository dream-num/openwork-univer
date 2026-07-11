import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync, type Dirent } from "node:fs";
import { chmod, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

export interface LocalUniverfileSummary {
  localPath: string;
  displayName: string;
  size: number;
  updatedAt: number;
}

export interface DiscoverLocalUniverfilesOptions {
  maxDepth?: number;
  maxEntries?: number;
  ignoredDirectoryNames?: readonly string[];
  includeHiddenDirectories?: boolean;
}

export interface BuildUniverExecutableShimScriptOptions {
  targetBinPath: string;
  nodeRuntimeExecutable?: string;
  electronRunAsNode?: boolean;
  platform?: NodeJS.Platform;
}

export interface WriteUniverExecutableShimOptions extends BuildUniverExecutableShimScriptOptions {
  shimPath: string;
}

export interface UniverCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error: string | null;
}

export interface EnsureUniverDaemonRunningOptions {
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  key?: string;
  dedupe?: boolean;
}

const DEFAULT_DISCOVERY_MAX_DEPTH = 8;
const DEFAULT_DISCOVERY_MAX_ENTRIES = 10_000;
const DEFAULT_DAEMON_TIMEOUT_MS = 60_000;
const DEFAULT_IGNORED_UNIVERFILE_DIRS = [
  "node_modules",
  "bower_components",
  "dist",
  "build",
  "coverage",
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  ".vite",
  ".turbo",
  ".vercel",
  ".opencode",
  ".openwork",
  "target",
  "tmp",
  "temp",
] as const;

const daemonStarts = new Map<string, Promise<UniverCommandResult>>();

export async function discoverLocalUniverfiles(
  rootPath: string,
  options: DiscoverLocalUniverfilesOptions = {},
): Promise<LocalUniverfileSummary[]> {
  const root = resolve(rootPath);
  const maxDepth = positiveInteger(options.maxDepth) ?? DEFAULT_DISCOVERY_MAX_DEPTH;
  const maxEntries = positiveInteger(options.maxEntries) ?? DEFAULT_DISCOVERY_MAX_ENTRIES;
  const ignoredDirectoryNames = new Set([
    ...DEFAULT_IGNORED_UNIVERFILE_DIRS,
    ...(options.ignoredDirectoryNames ?? []),
  ]);
  const includeHiddenDirectories = options.includeHiddenDirectories === true;
  const items: LocalUniverfileSummary[] = [];
  let visited = 0;

  async function walk(dirPath: string, depth: number): Promise<void> {
    if (depth > maxDepth || visited >= maxEntries) return;

    let entries: Dirent[];
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (visited >= maxEntries) return;
      visited += 1;
      const absolutePath = join(dirPath, entry.name);
      const relativePath = relative(root, absolutePath).replace(/\\/g, "/");
      if (!relativePath) continue;

      if (entry.isDirectory()) {
        if (!shouldIgnoreDiscoveryDirectory(relativePath, ignoredDirectoryNames, includeHiddenDirectories)) {
          await walk(absolutePath, depth + 1);
        }
        continue;
      }
      if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".univer") continue;

      try {
        const info = await stat(absolutePath);
        items.push({
          localPath: absolutePath,
          displayName: basename(absolutePath),
          size: info.size,
          updatedAt: info.mtimeMs,
        });
      } catch {
        // A file may disappear or become unreadable during discovery.
      }
    }
  }

  await walk(root, 0);
  return items.sort((left, right) => left.localPath.localeCompare(right.localPath));
}

export function buildUniverExecutableShimScript(options: BuildUniverExecutableShimScriptOptions): string {
  const platform = options.platform ?? process.platform;
  const nodeRuntimeExecutable = nonEmpty(options.nodeRuntimeExecutable);
  if (nodeRuntimeExecutable === undefined) {
    return platform === "win32"
      ? `@echo off\r\n"${options.targetBinPath}" %*\r\n`
      : `#!/bin/sh\nexec ${shellQuote(options.targetBinPath)} "$@"\n`;
  }

  if (platform === "win32") {
    const electronPrefix = options.electronRunAsNode === true ? "set ELECTRON_RUN_AS_NODE=1\r\n" : "";
    return `@echo off\r\n${electronPrefix}"${nodeRuntimeExecutable}" "${options.targetBinPath}" %*\r\n`;
  }

  const electronPrefix = options.electronRunAsNode === true ? "export ELECTRON_RUN_AS_NODE=1\n" : "";
  return `#!/bin/sh\n${electronPrefix}exec ${shellQuote(nodeRuntimeExecutable)} ${shellQuote(options.targetBinPath)} "$@"\n`;
}

export async function writeUniverExecutableShim(options: WriteUniverExecutableShimOptions): Promise<string> {
  await mkdir(dirname(options.shimPath), { recursive: true });
  await writeFile(options.shimPath, buildUniverExecutableShimScript(options), "utf8");
  await chmod(options.shimPath, 0o755).catch(() => undefined);
  return options.shimPath;
}

export function writeUniverExecutableShimSync(options: WriteUniverExecutableShimOptions): string {
  mkdirSync(dirname(options.shimPath), { recursive: true });
  writeFileSync(options.shimPath, buildUniverExecutableShimScript(options), "utf8");
  chmodSync(options.shimPath, 0o755);
  return options.shimPath;
}

export async function ensureUniverDaemonRunning(
  options: EnsureUniverDaemonRunningOptions,
): Promise<UniverCommandResult> {
  if (options.dedupe === false) return startUniverDaemonOnce(options);
  const key = options.key ?? daemonStartKey(options);
  const existing = daemonStarts.get(key);
  if (existing !== undefined) return existing;

  const starting = startUniverDaemonOnce(options);
  daemonStarts.set(key, starting);
  try {
    return await starting;
  } finally {
    if (daemonStarts.get(key) === starting) daemonStarts.delete(key);
  }
}

function shouldIgnoreDiscoveryDirectory(
  relativePath: string,
  ignoredDirectoryNames: ReadonlySet<string>,
  includeHiddenDirectories: boolean,
): boolean {
  return relativePath.split("/").filter(Boolean).some((segment) => {
    if (!includeHiddenDirectories && segment.startsWith(".")) return true;
    return ignoredDirectoryNames.has(segment);
  });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function startUniverDaemonOnce(options: EnsureUniverDaemonRunningOptions): Promise<UniverCommandResult> {
  const timeoutMs = positiveInteger(options.timeoutMs) ?? DEFAULT_DAEMON_TIMEOUT_MS;
  const firstStart = await runCommand(options.command, ["daemon", "start"], options.cwd, timeoutMs, options.env);
  if (firstStart.ok || !isDaemonBuildMismatch(firstStart)) return firstStart;
  const stopped = await runCommand(options.command, ["daemon", "stop"], options.cwd, timeoutMs, options.env);
  if (!stopped.ok) return mergeCommandFailures(firstStart, stopped);
  return runCommand(options.command, ["daemon", "start"], options.cwd, timeoutMs, options.env);
}

function isDaemonBuildMismatch(result: UniverCommandResult): boolean {
  return /Daemon build mismatch/i.test(`${result.stdout}\n${result.stderr}`);
}

function mergeCommandFailures(first: UniverCommandResult, second: UniverCommandResult): UniverCommandResult {
  return {
    ok: false,
    stdout: [first.stdout, second.stdout].filter(Boolean).join("\n"),
    stderr: [first.stderr, second.stderr].filter(Boolean).join("\n"),
    exitCode: second.exitCode,
    signal: second.signal,
    error: second.error ?? first.error,
  };
}

function daemonStartKey(options: EnsureUniverDaemonRunningOptions): string {
  const env = options.env ?? process.env;
  return [options.command, env.HOME ?? "", env.UNIVER_HOME ?? "", env.XDG_CONFIG_HOME ?? "", env.XDG_DATA_HOME ?? ""].join("\0");
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv | undefined,
): Promise<UniverCommandResult> {
  return new Promise((resolveCommand) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: UniverCommandResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveCommand(result);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ ok: false, stdout, stderr, exitCode: null, signal: "SIGTERM", error: `Timed out after ${timeoutMs}ms.` });
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", (error) => {
      finish({ ok: false, stdout, stderr, exitCode: null, signal: null, error: error.message });
    });
    child.once("exit", (exitCode, signal) => {
      finish({ ok: exitCode === 0, stdout, stderr, exitCode, signal, error: null });
    });
  });
}

function positiveInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
