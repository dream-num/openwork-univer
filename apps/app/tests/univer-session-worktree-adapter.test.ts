import { describe, expect, test } from "bun:test";

import { resolveSessionUniverWorktreePersistence } from "../src/react-app/domains/session/univer-session-worktree-adapter";
import type { OpenTarget } from "../src/react-app/domains/session/artifacts/open-target";

function univerTarget(value: string, worktreeId: string, reason = "artifact tool metadata"): OpenTarget {
  return {
    id: `file:${value}`,
    kind: "file",
    value,
    name: value.split("/").filter(Boolean).pop() ?? value,
    preview: "univer",
    confidence: 95,
    reason,
    worktreeId,
  };
}

describe("Session Univer worktree adapter", () => {
  test("persists an explicit worktree artifact for the current Primary Univerfile", () => {
    expect(resolveSessionUniverWorktreePersistence({
      primaryUniverTarget: { path: "./reports/budget.univer", name: "budget.univer" },
      univerSessionKind: "task",
    }, [
      univerTarget("reports/budget.univer", "wt_1"),
    ])).toEqual({
      primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
      sessionUniverWorktreeId: "wt_1",
      sessionUniverWorktreeIssue: null,
      univerSessionKind: "task",
    });
  });

  test("does not infer ownership from another target or UI-only target route", () => {
    expect(resolveSessionUniverWorktreePersistence({
      primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
      univerSessionKind: "task",
    }, [
      univerTarget("reports/other.univer", "wt_other"),
      univerTarget("reports/budget.univer", "wt_viewed", "Primary Univerfile"),
    ])).toBeNull();
  });

  test("does not overwrite existing, overview, or terminal ownership state", () => {
    const target = [univerTarget("reports/budget.univer", "wt_1")];

    const existingOwnerResult = resolveSessionUniverWorktreePersistence({
      primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
      sessionUniverWorktreeId: "wt_existing",
      univerSessionKind: "task",
    }, target);
    expect(existingOwnerResult).toEqual({
      primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
      sessionUniverWorktreeIssue: {
        kind: "multiple",
        worktreeIds: ["wt_existing", "wt_1"],
      },
      univerSessionKind: "task",
    });
    expect(existingOwnerResult).not.toHaveProperty("sessionUniverWorktreeId");
    expect(resolveSessionUniverWorktreePersistence({
      primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
      univerSessionKind: "overview",
    }, target)).toBeNull();
    expect(resolveSessionUniverWorktreePersistence({
      primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
      sessionUniverWorktreeTerminalState: "merged",
      univerSessionKind: "task",
    }, target)).toBeNull();
  });

  test("marks multiple explicit worktrees as a split issue instead of choosing one", () => {
    expect(resolveSessionUniverWorktreePersistence({
      primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
      univerSessionKind: "task",
    }, [
      univerTarget("reports/budget.univer", "wt_1"),
      univerTarget("reports/budget.univer", "wt_2"),
    ])).toEqual({
      primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
      sessionUniverWorktreeIssue: {
        kind: "multiple",
        worktreeIds: ["wt_1", "wt_2"],
      },
      univerSessionKind: "task",
    });

    expect(resolveSessionUniverWorktreePersistence({
      primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
      sessionUniverWorktreeId: "wt_existing",
      univerSessionKind: "task",
    }, [
      univerTarget("reports/budget.univer", "wt_new"),
    ])).toEqual({
      primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
      sessionUniverWorktreeIssue: {
        kind: "multiple",
        worktreeIds: ["wt_existing", "wt_new"],
      },
      univerSessionKind: "task",
    });
  });
});
