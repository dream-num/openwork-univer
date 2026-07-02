import { describe, expect, test } from "bun:test";

import { buildUniverSessionSystemContext, combineSystemContexts } from "../src/react-app/domains/session/univer-session-context";

describe("Univer session context", () => {
  test("skips General Sessions", () => {
    expect(buildUniverSessionSystemContext({})).toBeNull();
    expect(buildUniverSessionSystemContext(null)).toBeNull();
  });

  test("includes only minimal Primary Univerfile context for bound sessions", () => {
    const context = buildUniverSessionSystemContext({
      primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
      sessionUniverWorktreeId: "wt_123",
      univerSessionKind: "task",
    });

    expect(context).toContain("Primary Univerfile: reports/budget.univer");
    expect(context).toContain("Univerfile name: budget.univer");
    expect(context).toContain("Session Univer Worktree: wt_123");
    expect(context).toContain("Do not switch or infer another Primary Univerfile");
    expect(context).not.toContain("unit inventory");
    expect(context).not.toContain("workspace file");
    expect(context).not.toContain("snapshot");
  });

  test("combines environment and Univer contexts without empty blocks", () => {
    expect(combineSystemContexts([null, "  ", "A", "B"])).toBe("A\n\nB");
    expect(combineSystemContexts([null, undefined, ""])).toBeUndefined();
  });
});
