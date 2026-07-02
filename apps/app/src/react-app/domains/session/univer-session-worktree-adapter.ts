import type { OpenTarget } from "./artifacts/open-target";

type PrimaryUniverTargetRef = {
  path: string;
  name?: string | null;
};

export type SessionUniverWorktreeOwner = {
  primaryUniverTarget?: PrimaryUniverTargetRef | null;
  sessionUniverWorktreeId?: string | null;
  sessionUniverWorktreeIssue?: {
    kind: "multiple";
    worktreeIds: string[];
  } | null;
  sessionUniverWorktreeTerminalState?: "merged" | "discarded" | null;
  univerSessionKind?: "task" | "overview" | null;
};

export type SessionUniverWorktreePersistenceCandidate = {
  primaryUniverTarget: {
    path: string;
    name: string;
  };
  sessionUniverWorktreeId: string;
  sessionUniverWorktreeIssue?: null;
  univerSessionKind: "task";
};

export type SessionUniverWorktreeIssueCandidate = {
  primaryUniverTarget: {
    path: string;
    name: string;
  };
  sessionUniverWorktreeIssue: {
    kind: "multiple";
    worktreeIds: string[];
  };
  univerSessionKind: "task";
};

export type SessionUniverWorktreeMetadataCandidate =
  | SessionUniverWorktreePersistenceCandidate
  | SessionUniverWorktreeIssueCandidate;

function normalizeTargetPath(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function basename(value: string): string {
  return value.split("/").filter(Boolean).pop() ?? value;
}

function isPrimaryUniverfileRouteReason(reason: string): boolean {
  return reason === "Primary Univerfile" || reason === "Primary Univer Target";
}

function isExplicitWorktreeArtifact(target: OpenTarget): boolean {
  return (
    target.kind === "file" &&
    target.preview === "univer" &&
    Boolean(target.worktreeId?.trim()) &&
    !isPrimaryUniverfileRouteReason(target.reason)
  );
}

export function resolveSessionUniverWorktreePersistence(
  session: SessionUniverWorktreeOwner | null | undefined,
  targets: OpenTarget[],
): SessionUniverWorktreeMetadataCandidate | null {
  const primaryTargetPath = normalizeTargetPath(session?.primaryUniverTarget?.path);
  const primaryTargetName = session?.primaryUniverTarget?.name?.trim();
  if (!primaryTargetPath || session?.univerSessionKind === "overview") return null;
  if (session?.sessionUniverWorktreeTerminalState) return null;

  const existingWorktreeId = session?.sessionUniverWorktreeId?.trim() ?? "";
  const candidateWorktreeIds: string[] = [];
  for (const target of targets) {
    if (!isExplicitWorktreeArtifact(target)) continue;
    if (normalizeTargetPath(target.value) !== primaryTargetPath) continue;
    const sessionUniverWorktreeId = target.worktreeId?.trim();
    if (!sessionUniverWorktreeId) continue;
    if (!candidateWorktreeIds.includes(sessionUniverWorktreeId)) {
      candidateWorktreeIds.push(sessionUniverWorktreeId);
    }
  }

  const nextWorktreeIds = existingWorktreeId
    ? [existingWorktreeId, ...candidateWorktreeIds.filter((worktreeId) => worktreeId !== existingWorktreeId)]
    : candidateWorktreeIds;
  if (nextWorktreeIds.length > 1) {
    return {
      primaryUniverTarget: {
        path: primaryTargetPath,
        name: primaryTargetName || basename(primaryTargetPath),
      },
      sessionUniverWorktreeIssue: {
        kind: "multiple",
        worktreeIds: nextWorktreeIds,
      },
      univerSessionKind: "task",
    };
  }

  if (existingWorktreeId || candidateWorktreeIds.length === 0) return null;

  return {
    primaryUniverTarget: {
      path: primaryTargetPath,
      name: primaryTargetName || basename(primaryTargetPath),
    },
    sessionUniverWorktreeId: candidateWorktreeIds[0],
    sessionUniverWorktreeIssue: null,
    univerSessionKind: "task",
  };
}
