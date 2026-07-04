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
    expect(context).toContain("Do not create a different Primary Univerfile from this bound session");
    expect(context).toContain("Do not merge or discard a Session Univer Worktree unless the user explicitly asks");
    expect(context).not.toContain("unit inventory");
    expect(context).not.toContain("workspace file");
    expect(context).not.toContain("snapshot");
  });

  test("allows explicit new-file handoff only for General-origin first-stage context", () => {
    const context = buildUniverSessionSystemContext({
      primaryUniverTarget: { path: "reports/source.univer", name: "source.univer" },
      univerLifecycleOrigin: "generalDirectMention",
      univerSessionKind: "task",
    });

    expect(context).toContain("started the current run as a General Session");
    expect(context).toContain("use `univer new`");
    expect(context).toContain("route that new Univerfile into a separate session");
    expect(context).not.toContain("Do not create a different Primary Univerfile from this bound session");
  });

  test("combines environment and Univer contexts without empty blocks", () => {
    expect(combineSystemContexts([null, "  ", "A", "B"])).toBe("A\n\nB");
    expect(combineSystemContexts([null, undefined, ""])).toBeUndefined();
  });
});
