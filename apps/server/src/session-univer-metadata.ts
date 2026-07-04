import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ApiError } from "./errors.js";
import type { ServerConfig } from "./types.js";
import { ensureDir } from "./utils.js";

export type PrimaryUniverTarget = {
  path: string;
  name: string;
};

export type UniverSessionKind = "task" | "overview";
export type UniverLifecycleOrigin = "generalDirectMention";
export type SessionUniverWorktreeTerminalState = "merged" | "discarded";
export type SessionUniverWorktreeIssue = {
  kind: "multiple";
  worktreeIds: string[];
} | {
  kind: "ownershipConflict";
  worktreeId: string;
  ownerSessionId: string;
};

export type SessionUniverMetadata = {
  primaryUniverTarget?: PrimaryUniverTarget | null;
  sessionUniverWorktreeId?: string | null;
  sessionUniverWorktreeIssue?: SessionUniverWorktreeIssue | null;
  sessionUniverWorktreeTerminalState?: SessionUniverWorktreeTerminalState | null;
  univerSourceSessionId?: string | null;
  univerSessionKind?: UniverSessionKind | null;
  univerLifecycleOrigin?: UniverLifecycleOrigin | null;
};

export type SessionUniverMetadataState = {
  sessions: Record<string, SessionUniverMetadata>;
};

export type SessionUniverMetadataPatch = SessionUniverMetadata & {
  allowWorktreeReassociation?: boolean;
};

const EMPTY_SESSION_UNIVER_METADATA_STATE: SessionUniverMetadataState = { sessions: {} };

const sessionUniverMetadataStates = sqliteTable("session_univer_metadata_states", {
  workspaceId: text("workspace_id").primaryKey(),
  stateJson: text("state_json").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

type SessionUniverMetadataDb = {
  get: (workspaceId: string) => { stateJson: string; updatedAt: number } | undefined;
  upsert: (value: { workspaceId: string; stateJson: string; updatedAt: number }) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runtimeDbPath(config: ServerConfig): string {
  const override = process.env.OPENWORK_RUNTIME_DB?.trim();
  if (override) return resolve(override);
  const configPath = config.configPath?.trim();
  const configDir = configPath ? dirname(configPath) : join(homedir(), ".config", "openwork");
  return join(configDir, "runtime.sqlite");
}

function normalizeMetadataSessionId(value: string): string {
  return value.trim().slice(0, 256);
}

function normalizeOptionalString(value: unknown, field: string, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_payload", `${field} must be a string or null`);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeWorkspaceUniverPath(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "invalid_payload", "primaryUniverTarget.path is required");
  }
  if (value.includes("\u0000")) {
    throw new ApiError(400, "invalid_payload", "primaryUniverTarget.path contains null byte");
  }

  let normalized = value.trim().replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes(":/")) {
    throw new ApiError(400, "invalid_payload", "primaryUniverTarget.path must be workspace-relative");
  }
  normalized = normalized.replace(/^\.\//, "");
  normalized = normalized.replace(/^workspaces\/[^/]+\//i, "");
  normalized = normalized.replace(/^workspace\/(?:ws_[^/]+|\d+|[0-9a-f-]{6,})\//i, "");
  normalized = normalized.replace(/^workspace\//, "");

  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length) {
    throw new ApiError(400, "invalid_payload", "primaryUniverTarget.path is required");
  }
  for (const part of parts) {
    if (part === "." || part === "..") {
      throw new ApiError(400, "invalid_payload", "primaryUniverTarget.path traversal is not allowed");
    }
  }
  const path = parts.join("/");
  if (!path.toLowerCase().endsWith(".univer")) {
    throw new ApiError(400, "invalid_payload", "primaryUniverTarget.path must end with .univer");
  }
  return path;
}

function normalizePrimaryUniverTarget(value: unknown): PrimaryUniverTarget | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_payload", "primaryUniverTarget must be an object or null");
  }
  const path = normalizeWorkspaceUniverPath(value.path);
  const nameInput = normalizeOptionalString(value.name, "primaryUniverTarget.name", 160);
  return { path, name: nameInput ?? basename(path) };
}

function normalizeSessionKind(value: unknown): UniverSessionKind | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value === "task" || value === "overview") return value;
  throw new ApiError(400, "invalid_payload", "univerSessionKind must be task, overview, or null");
}

function normalizeLifecycleOrigin(value: unknown): UniverLifecycleOrigin | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value === "generalDirectMention") return value;
  throw new ApiError(400, "invalid_payload", "univerLifecycleOrigin must be generalDirectMention or null");
}

function normalizeWorktreeTerminalState(value: unknown): SessionUniverWorktreeTerminalState | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value === "merged" || value === "discarded") return value;
  throw new ApiError(400, "invalid_payload", "sessionUniverWorktreeTerminalState must be merged, discarded, or null");
}

function normalizeWorktreeIssue(value: unknown): SessionUniverWorktreeIssue | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_payload", "sessionUniverWorktreeIssue must be an object or null");
  }
  if (value.kind === "ownershipConflict") {
    const worktreeId = normalizeOptionalString(value.worktreeId, "sessionUniverWorktreeIssue.worktreeId", 256);
    const ownerSessionId = normalizeOptionalString(value.ownerSessionId, "sessionUniverWorktreeIssue.ownerSessionId", 128);
    if (!worktreeId || !ownerSessionId) {
      throw new ApiError(400, "invalid_payload", "sessionUniverWorktreeIssue ownership conflict requires worktreeId and ownerSessionId");
    }
    return { kind: "ownershipConflict", worktreeId, ownerSessionId };
  }
  if (value.kind !== "multiple") {
    throw new ApiError(400, "invalid_payload", "sessionUniverWorktreeIssue.kind must be multiple or ownershipConflict");
  }
  if (!Array.isArray(value.worktreeIds)) {
    throw new ApiError(400, "invalid_payload", "sessionUniverWorktreeIssue.worktreeIds must be an array");
  }

  const worktreeIds: string[] = [];
  for (const rawId of value.worktreeIds) {
    if (typeof rawId !== "string") {
      throw new ApiError(400, "invalid_payload", "sessionUniverWorktreeIssue.worktreeIds must contain strings");
    }
    const id = rawId.trim().slice(0, 256);
    if (id && !worktreeIds.includes(id)) worktreeIds.push(id);
    if (worktreeIds.length >= 16) break;
  }
  if (worktreeIds.length < 2) {
    throw new ApiError(400, "invalid_payload", "sessionUniverWorktreeIssue.worktreeIds must contain at least two ids");
  }

  return { kind: "multiple", worktreeIds };
}

function normalizeSessionUniverMetadata(value: unknown): SessionUniverMetadata | null {
  if (!isRecord(value)) return null;
  const primaryUniverTarget = normalizePrimaryUniverTarget(value.primaryUniverTarget);
  const sessionUniverWorktreeId = normalizeOptionalString(value.sessionUniverWorktreeId, "sessionUniverWorktreeId", 256);
  const sessionUniverWorktreeIssue = normalizeWorktreeIssue(value.sessionUniverWorktreeIssue);
  const sessionUniverWorktreeTerminalState = normalizeWorktreeTerminalState(value.sessionUniverWorktreeTerminalState);
  const univerSourceSessionId = normalizeOptionalString(value.univerSourceSessionId, "univerSourceSessionId", 256);
  const univerSessionKind = normalizeSessionKind(value.univerSessionKind);
  const univerLifecycleOrigin = normalizeLifecycleOrigin(value.univerLifecycleOrigin);

  const metadata: SessionUniverMetadata = {};
  if (primaryUniverTarget !== undefined) metadata.primaryUniverTarget = primaryUniverTarget;
  if (sessionUniverWorktreeId !== undefined) metadata.sessionUniverWorktreeId = sessionUniverWorktreeId;
  if (sessionUniverWorktreeIssue !== undefined) metadata.sessionUniverWorktreeIssue = sessionUniverWorktreeIssue;
  if (sessionUniverWorktreeTerminalState !== undefined) metadata.sessionUniverWorktreeTerminalState = sessionUniverWorktreeTerminalState;
  if (univerSourceSessionId !== undefined) metadata.univerSourceSessionId = univerSourceSessionId;
  if (univerSessionKind !== undefined) metadata.univerSessionKind = univerSessionKind;
  if (univerLifecycleOrigin !== undefined) metadata.univerLifecycleOrigin = univerLifecycleOrigin;
  return hasSessionUniverMetadata(metadata) ? metadata : null;
}

export function normalizeSessionUniverMetadataPatch(value: unknown): SessionUniverMetadataPatch {
  if (!isRecord(value)) {
    throw new ApiError(400, "invalid_payload", "metadata patch must be an object");
  }
  const metadata = normalizeSessionUniverMetadata(value) ?? {};
  const allowWorktreeReassociation = value.allowWorktreeReassociation === true;
  return { ...metadata, allowWorktreeReassociation };
}

export function normalizeSessionUniverMetadataState(value: unknown): SessionUniverMetadataState {
  if (!isRecord(value) || !isRecord(value.sessions)) return EMPTY_SESSION_UNIVER_METADATA_STATE;

  const sessions: Record<string, SessionUniverMetadata> = {};
  for (const [sessionId, rawMetadata] of Object.entries(value.sessions)) {
    const normalizedSessionId = normalizeMetadataSessionId(sessionId);
    if (!normalizedSessionId) continue;
    const metadata = normalizeSessionUniverMetadata(rawMetadata);
    if (!metadata) continue;
    sessions[normalizedSessionId] = metadata;
  }
  return { sessions };
}

function hasSessionUniverMetadata(metadata: SessionUniverMetadata): boolean {
  return Boolean(
      metadata.primaryUniverTarget ??
      metadata.sessionUniverWorktreeId ??
      metadata.sessionUniverWorktreeIssue ??
      metadata.sessionUniverWorktreeTerminalState ??
      metadata.univerSourceSessionId ??
      metadata.univerSessionKind ??
      metadata.univerLifecycleOrigin,
  );
}

function mergeMetadataPatch(
  current: SessionUniverMetadata | undefined,
  patch: SessionUniverMetadataPatch,
): SessionUniverMetadata | null {
  const next: SessionUniverMetadata = current ? { ...current } : {};

  if (patch.primaryUniverTarget !== undefined) {
    const currentTarget = current?.primaryUniverTarget ?? null;
    const patchTarget = patch.primaryUniverTarget;
    if (currentTarget && patchTarget === null) {
      throw new ApiError(409, "primary_univer_target_locked", "A bound session cannot clear its Primary Univer Target");
    }
    if (currentTarget && patchTarget && currentTarget.path !== patchTarget.path) {
      throw new ApiError(409, "primary_univer_target_locked", "A bound session cannot switch Primary Univer Target");
    }
    next.primaryUniverTarget = patchTarget;
  }

  if (patch.sessionUniverWorktreeId !== undefined) {
    const currentWorktreeId = current?.sessionUniverWorktreeId ?? null;
    const patchWorktreeId = patch.sessionUniverWorktreeId;
    const changesWorktree =
      currentWorktreeId &&
      (patchWorktreeId === null || (patchWorktreeId !== null && patchWorktreeId !== currentWorktreeId));
    const clearsForOwnershipConflict =
      patchWorktreeId === null && patch.sessionUniverWorktreeIssue?.kind === "ownershipConflict";
    if (changesWorktree && !clearsForOwnershipConflict && patch.allowWorktreeReassociation !== true) {
      throw new ApiError(
        409,
        "session_univer_worktree_locked",
        "A session-owned Univer worktree cannot be reassociated without explicit confirmation",
      );
    }
    next.sessionUniverWorktreeId = patchWorktreeId;
  }

  if (patch.sessionUniverWorktreeIssue !== undefined) {
    next.sessionUniverWorktreeIssue = patch.sessionUniverWorktreeIssue;
    if (patch.sessionUniverWorktreeIssue?.kind === "ownershipConflict") {
      next.sessionUniverWorktreeId = null;
    }
  }
  if (patch.univerSourceSessionId !== undefined) {
    next.univerSourceSessionId = patch.univerSourceSessionId;
  }
  if (patch.sessionUniverWorktreeTerminalState !== undefined) {
    next.sessionUniverWorktreeTerminalState = patch.sessionUniverWorktreeTerminalState;
  }
  if (patch.univerSessionKind !== undefined) {
    next.univerSessionKind = patch.univerSessionKind;
  }
  if (patch.univerLifecycleOrigin !== undefined) {
    next.univerLifecycleOrigin = patch.univerLifecycleOrigin;
  }

  if (next.primaryUniverTarget === null) delete next.primaryUniverTarget;
  if (next.sessionUniverWorktreeId === null) delete next.sessionUniverWorktreeId;
  if (next.sessionUniverWorktreeIssue === null) delete next.sessionUniverWorktreeIssue;
  if (next.sessionUniverWorktreeTerminalState === null) delete next.sessionUniverWorktreeTerminalState;
  if (next.univerSourceSessionId === null) delete next.univerSourceSessionId;
  if (next.univerSessionKind === null) delete next.univerSessionKind;
  if (next.univerLifecycleOrigin === null) delete next.univerLifecycleOrigin;
  return hasSessionUniverMetadata(next) ? next : null;
}

function assertSingleTargetOverviewSession(
  sessions: Record<string, SessionUniverMetadata>,
  sessionId: string,
  metadata: SessionUniverMetadata | null,
) {
  if (metadata?.univerSessionKind !== "overview" || !metadata.primaryUniverTarget) return;
  const targetPath = metadata.primaryUniverTarget.path;
  for (const [otherSessionId, otherMetadata] of Object.entries(sessions)) {
    if (otherSessionId === sessionId) continue;
    if (
      otherMetadata.univerSessionKind === "overview" &&
      otherMetadata.primaryUniverTarget?.path === targetPath
    ) {
      throw new ApiError(
        409,
        "target_overview_session_exists",
        "A Target Overview Session already exists for this Primary Univer Target",
      );
    }
  }
}

function assertSingleLiveWorktreeOwner(
  sessions: Record<string, SessionUniverMetadata>,
  sessionId: string,
  metadata: SessionUniverMetadata | null,
) {
  const targetPath = metadata?.primaryUniverTarget?.path;
  const worktreeId = metadata?.sessionUniverWorktreeId?.trim();
  if (!targetPath || !worktreeId || metadata?.sessionUniverWorktreeTerminalState) return;

  for (const [otherSessionId, other] of Object.entries(sessions)) {
    if (otherSessionId === sessionId) continue;
    if (other.sessionUniverWorktreeTerminalState) continue;
    if (other.primaryUniverTarget?.path !== targetPath) continue;
    if (other.sessionUniverWorktreeId?.trim() !== worktreeId) continue;
    throw new ApiError(
      409,
      "session_univer_worktree_already_owned",
      "A live Univer worktree is already owned by another task session",
    );
  }
}

async function openSessionUniverMetadataDb(path: string): Promise<SessionUniverMetadataDb> {
  await ensureDir(dirname(path));
  if (typeof process.versions.bun === "string") {
    const { Database } = await import("bun:sqlite");
    const { drizzle } = await import("drizzle-orm/bun-sqlite");
    const sqlite = new Database(path, { create: true });
    sqlite.run("CREATE TABLE IF NOT EXISTS session_univer_metadata_states (workspace_id TEXT PRIMARY KEY NOT NULL, state_json TEXT NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL)");
    const db = drizzle(sqlite);
    return {
      get: (workspaceId) => db
        .select()
        .from(sessionUniverMetadataStates)
        .where(eq(sessionUniverMetadataStates.workspaceId, workspaceId))
        .get(),
      upsert: ({ workspaceId, stateJson, updatedAt }) => {
        db
          .insert(sessionUniverMetadataStates)
          .values({ workspaceId, stateJson, schemaVersion: 1, updatedAt })
          .onConflictDoUpdate({
            target: sessionUniverMetadataStates.workspaceId,
            set: { stateJson, schemaVersion: 1, updatedAt },
          })
          .run();
      },
    };
  }

  const { DatabaseSync } = await import("node:sqlite");
  const sqlite = new DatabaseSync(path);
  sqlite.exec("CREATE TABLE IF NOT EXISTS session_univer_metadata_states (workspace_id TEXT PRIMARY KEY NOT NULL, state_json TEXT NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL)");
  const get = sqlite.prepare("SELECT state_json AS stateJson, updated_at AS updatedAt FROM session_univer_metadata_states WHERE workspace_id = ?");
  const upsert = sqlite.prepare("INSERT INTO session_univer_metadata_states (workspace_id, state_json, schema_version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(workspace_id) DO UPDATE SET state_json = excluded.state_json, schema_version = excluded.schema_version, updated_at = excluded.updated_at");
  return {
    get: (workspaceId) => {
      const row = get.get(workspaceId);
      if (!isRecord(row) || typeof row.stateJson !== "string" || typeof row.updatedAt !== "number") return undefined;
      return { stateJson: row.stateJson, updatedAt: row.updatedAt };
    },
    upsert: ({ workspaceId, stateJson, updatedAt }) => {
      upsert.run(workspaceId, stateJson, updatedAt);
    },
  };
}

const dbByPath = new Map<string, Promise<SessionUniverMetadataDb>>();
const updateQueueByWorkspace = new Map<string, Promise<void>>();

async function sessionUniverMetadataDb(config: ServerConfig): Promise<SessionUniverMetadataDb> {
  const path = runtimeDbPath(config);
  const existing = dbByPath.get(path);
  if (existing) return existing;
  const db = openSessionUniverMetadataDb(path);
  dbByPath.set(path, db);
  return db;
}

export async function readSessionUniverMetadataState(
  config: ServerConfig,
  workspaceId: string,
): Promise<{ state: SessionUniverMetadataState; updatedAt: number | null }> {
  const db = await sessionUniverMetadataDb(config);
  const row = db.get(workspaceId);
  if (!row) return { state: EMPTY_SESSION_UNIVER_METADATA_STATE, updatedAt: null };
  try {
    return { state: normalizeSessionUniverMetadataState(JSON.parse(row.stateJson)), updatedAt: row.updatedAt };
  } catch {
    return { state: EMPTY_SESSION_UNIVER_METADATA_STATE, updatedAt: row.updatedAt };
  }
}

export async function writeSessionUniverMetadataState(
  config: ServerConfig,
  workspaceId: string,
  state: SessionUniverMetadataState,
): Promise<{ state: SessionUniverMetadataState; updatedAt: number }> {
  const db = await sessionUniverMetadataDb(config);
  const next = normalizeSessionUniverMetadataState(state);
  const updatedAt = Date.now();
  db.upsert({ workspaceId, stateJson: JSON.stringify(next), updatedAt });
  return { state: next, updatedAt };
}

export async function updateSessionUniverMetadataState(
  config: ServerConfig,
  workspaceId: string,
  updater: (current: SessionUniverMetadataState) => SessionUniverMetadataState,
): Promise<{ state: SessionUniverMetadataState; updatedAt: number }> {
  const key = `${runtimeDbPath(config)}:${workspaceId}`;
  const previous = updateQueueByWorkspace.get(key) ?? Promise.resolve();
  let release = () => {};
  const queued = new Promise<void>((resolveQueued) => {
    release = resolveQueued;
  });
  const currentQueue = previous.then(() => queued, () => queued);
  updateQueueByWorkspace.set(key, currentQueue);

  await previous.catch(() => undefined);
  try {
    const current = await readSessionUniverMetadataState(config, workspaceId);
    return await writeSessionUniverMetadataState(config, workspaceId, updater(current.state));
  } finally {
    release();
    if (updateQueueByWorkspace.get(key) === currentQueue) {
      updateQueueByWorkspace.delete(key);
    }
  }
}

export async function updateSessionUniverMetadata(
  config: ServerConfig,
  workspaceId: string,
  sessionId: string,
  patch: SessionUniverMetadataPatch,
): Promise<{ metadata: SessionUniverMetadata | null; state: SessionUniverMetadataState; updatedAt: number }> {
  const normalizedSessionId = normalizeMetadataSessionId(sessionId);
  if (!normalizedSessionId) {
    throw new ApiError(400, "invalid_payload", "sessionId is required");
  }

  const result = await updateSessionUniverMetadataState(config, workspaceId, (current) => {
    const sessions = { ...current.sessions };
    const metadata = mergeMetadataPatch(sessions[normalizedSessionId], patch);
    assertSingleTargetOverviewSession(sessions, normalizedSessionId, metadata);
    assertSingleLiveWorktreeOwner(sessions, normalizedSessionId, metadata);
    if (metadata) sessions[normalizedSessionId] = metadata;
    else delete sessions[normalizedSessionId];
    return { sessions };
  });

  return {
    metadata: result.state.sessions[normalizedSessionId] ?? null,
    state: result.state,
    updatedAt: result.updatedAt,
  };
}

export function mergeSessionUniverMetadata<T extends { id: string }>(
  session: T,
  state: SessionUniverMetadataState,
): T & SessionUniverMetadata {
  const metadata = state.sessions[session.id];
  return metadata ? { ...session, ...metadata } : session;
}
