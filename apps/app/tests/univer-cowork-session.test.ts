import { describe, expect, test } from "bun:test";

import { isCollectibleArtifactTarget } from "../src/react-app/domains/session/artifacts/open-target";
import {
  targetFromPrimaryUniverfile,
  targetFromSelection,
  targetWithSessionWorktreeOwner,
} from "../src/react-app/domains/session/artifacts/univer-cowork-session";

describe("Univer cowork session targets", () => {
  test("opens bound Primary Univerfile and routed units through the artifact panel", () => {
    const target = targetFromPrimaryUniverfile({
      path: "reports/budget.univer",
      name: "budget.univer",
    }, "wt_session");

    expect(target).not.toBeNull();
    expect(target?.exists).toBe(true);
    expect(target && isCollectibleArtifactTarget(target)).toBe(true);

    const unitTarget = target ? targetFromSelection(target, { type: "unit", unitId: "unit_1" }) : null;

    expect(unitTarget?.unitId).toBe("unit_1");
    expect(unitTarget?.worktreeId).toBeUndefined();
    expect(unitTarget?.sessionWorktreeId).toBe("wt_session");
    expect(unitTarget?.exists).toBe(true);
    expect(unitTarget && isCollectibleArtifactTarget(unitTarget)).toBe(true);
  });

  test("keeps the session worktree owner separate from the current route", () => {
    const target = targetFromPrimaryUniverfile({
      path: "reports/budget.univer",
      name: "budget.univer",
    });
    if (!target) throw new Error("expected Univer target");

    const worktreeTarget = targetFromSelection(target, { type: "reviewableWorktree", worktreeId: "wt_session" });
    const unitTarget = targetFromSelection(worktreeTarget, { type: "unit", unitId: "unit_1" });
    const unitTargetWithOwner = targetWithSessionWorktreeOwner(unitTarget, "wt_session");

    expect(unitTargetWithOwner.unitId).toBe("unit_1");
    expect(unitTargetWithOwner.worktreeId).toBeUndefined();
    expect(unitTargetWithOwner.sessionWorktreeId).toBe("wt_session");
  });
});
