import type { ActiveWorktree, CoworkSnapshot, ReviewableWorktree } from "@univer/cowork";
import { create } from "zustand";

export type UniverLiveWorktreeState = "working" | "ready" | "conflict";
export type UniverSessionReviewKind =
  | "none"
  | "unknown"
  | "working"
  | "ready"
  | "conflict"
  | "missing"
  | "multiple"
  | "ownershipConflict"
  | "merged"
  | "discarded";

export type UniverLiveWorktreeStatus = {
  worktreeId: string;
  state: UniverLiveWorktreeState;
  displayName: string;
  headCommit: number;
};

export type UniverTargetWorktreeStatus = {
  targetPath: string;
  updatedAt: number;
  unitCount: number;
  worktrees: Record<string, UniverLiveWorktreeStatus>;
};

export type UniverSessionReviewState = {
  kind: UniverSessionReviewKind;
  label: string | null;
  title: string | null;
  actionable: boolean;
  priority: number;
  ownerSessionId?: string;
  ownerSessionTitle?: string;
};

type UniverWorktreeStatusStore = {
  byWorkspaceId: Record<string, Record<string, UniverTargetWorktreeStatus>>;
  updateTargetSnapshot: (workspaceId: string, targetPath: string, snapshot: CoworkSnapshot) => void;
};

type SessionWorktreeOwner = {
  sessionUniverWorktreeId?: string | null;
  sessionUniverWorktreeIssue?: {
    kind: "multiple";
    worktreeIds: string[];
  } | {
    kind: "ownershipConflict";
    worktreeId: string;
    ownerSessionId: string;
  } | null;
  sessionUniverWorktreeTerminalState?: "merged" | "discarded" | null;
};

export function normalizeUniverTargetPath(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function statusFromReviewableWorktree(worktree: ReviewableWorktree): UniverLiveWorktreeStatus {
  const hasConflict =
    worktree.reviewSummary?.mergeable === false ||
    (worktree.reviewSummary?.counts.conflict ?? 0) > 0;
  return {
    worktreeId: worktree.worktreeId,
    state: hasConflict ? "conflict" : "ready",
    displayName: worktree.displayName,
    headCommit: worktree.headCommit,
  };
}

function statusFromActiveWorktree(worktree: ActiveWorktree): UniverLiveWorktreeStatus {
  return {
    worktreeId: worktree.worktreeId,
    state: "working",
    displayName: worktree.displayName,
    headCommit: worktree.headCommit,
  };
}

export function statusFromCoworkSnapshot(
  targetPath: string,
  snapshot: Pick<CoworkSnapshot, "activeWorktrees" | "reviewableWorktrees" | "units">,
): UniverTargetWorktreeStatus {
  const worktrees: Record<string, UniverLiveWorktreeStatus> = {};
  for (const worktree of snapshot.activeWorktrees) {
    worktrees[worktree.worktreeId] = statusFromActiveWorktree(worktree);
  }
  for (const worktree of snapshot.reviewableWorktrees) {
    worktrees[worktree.worktreeId] = statusFromReviewableWorktree(worktree);
  }
  return {
    targetPath,
    updatedAt: Date.now(),
    unitCount: snapshot.units.length,
    worktrees,
  };
}

function reviewStateFromLiveWorktree(status: UniverLiveWorktreeStatus): UniverSessionReviewState {
  if (status.state === "conflict") {
    return {
      kind: "conflict",
      label: "Conflict",
      title: `${status.displayName} has conflicts`,
      actionable: true,
      priority: 60,
    };
  }
  if (status.state === "ready") {
    return {
      kind: "ready",
      label: "Review",
      title: `${status.displayName} is ready for review`,
      actionable: true,
      priority: 50,
    };
  }
  return {
    kind: "working",
    label: "Working",
    title: `${status.displayName} is in progress`,
    actionable: false,
    priority: 40,
  };
}

export function deriveSessionUniverReviewState(
  session: SessionWorktreeOwner,
  targetStatus: UniverTargetWorktreeStatus | null | undefined,
): UniverSessionReviewState {
  if (session.sessionUniverWorktreeTerminalState === "merged") {
    return {
      kind: "merged",
      label: "Merged",
      title: "Changes were merged into the Primary Univer Target",
      actionable: false,
      priority: 5,
    };
  }
  if (session.sessionUniverWorktreeTerminalState === "discarded") {
    return {
      kind: "discarded",
      label: "Discarded",
      title: "Changes were discarded",
      actionable: false,
      priority: 5,
    };
  }
  if (session.sessionUniverWorktreeIssue?.kind === "multiple") {
    const count = session.sessionUniverWorktreeIssue.worktreeIds.length;
    return {
      kind: "multiple",
      label: "Split",
      title: count > 0
        ? `${count} active worktrees need splitting into separate tasks`
        : "Multiple active worktrees need splitting into separate tasks",
      actionable: true,
      priority: 58,
    };
  }
  if (session.sessionUniverWorktreeIssue?.kind === "ownershipConflict") {
    return {
      kind: "ownershipConflict",
      label: "Attention",
      title: "Worktree is owned by another task",
      actionable: true,
      priority: 57,
      ownerSessionId: session.sessionUniverWorktreeIssue.ownerSessionId,
    };
  }

  const worktreeId = session.sessionUniverWorktreeId?.trim();
  if (!worktreeId) {
    return {
      kind: "none",
      label: null,
      title: null,
      actionable: false,
      priority: 10,
    };
  }

  if (!targetStatus) {
    return {
      kind: "unknown",
      label: null,
      title: worktreeId,
      actionable: false,
      priority: 30,
    };
  }

  const live = targetStatus.worktrees[worktreeId];
  if (!live) {
    return {
      kind: "missing",
      label: "Attention",
      title: `${worktreeId} is missing or stale`,
      actionable: true,
      priority: 55,
    };
  }

  return reviewStateFromLiveWorktree(live);
}

export const useUniverWorktreeStatusStore = create<UniverWorktreeStatusStore>((set) => ({
  byWorkspaceId: {},
  updateTargetSnapshot: (workspaceId, targetPath, snapshot) => {
    const normalizedWorkspaceId = workspaceId.trim();
    const normalizedPath = normalizeUniverTargetPath(targetPath);
    if (!normalizedWorkspaceId || !normalizedPath || snapshot.loadState !== "ready") return;
    const nextStatus = statusFromCoworkSnapshot(normalizedPath, snapshot);
    set((state) => ({
      byWorkspaceId: {
        ...state.byWorkspaceId,
        [normalizedWorkspaceId]: {
          ...(state.byWorkspaceId[normalizedWorkspaceId] ?? {}),
          [normalizedPath]: nextStatus,
        },
      },
    }));
  },
}));
