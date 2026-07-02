import { describe, expect, test } from "bun:test";

describe("session route Univer task routing", () => {
  test("routes overview and terminal Univer sessions into a new bound task on send", async () => {
    const source = await Bun.file(new URL("../src/react-app/shell/session-route.tsx", import.meta.url)).text();
    const createBranchStart = source.indexOf("sourceSession.univerSessionKind === \"overview\"");
    const createBranchEnd = source.indexOf("targetSessionId = created.id;", createBranchStart);
    const createBranch = source.slice(createBranchStart, createBranchEnd);

    expect(createBranchStart).toBeGreaterThan(0);
    expect(createBranchEnd).toBeGreaterThan(createBranchStart);
    expect(createBranch).toContain("sourceSession.sessionUniverWorktreeTerminalState");
    expect(createBranch).toContain("opencodeClient.session.create");
    expect(createBranch).toContain("title: seededTitle");
    expect(createBranch).toContain("univerSourceSessionId: sourceSession.id");
  });

  test("creates missing-state recovery tasks without inheriting the old worktree id", async () => {
    const source = await Bun.file(new URL("../src/react-app/shell/session-route.tsx", import.meta.url)).text();
    const handlerStart = source.indexOf("const handleCreateTaskFromUniverSession");
    const handlerEnd = source.indexOf("const handleOpenUniverTargetOverview", handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThan(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    expect(handler).toContain("sourceSession.id");
    expect(handler).not.toContain("sessionUniverWorktreeId");
  });
});
