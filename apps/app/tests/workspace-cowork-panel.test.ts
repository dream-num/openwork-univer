import { describe, expect, test } from "bun:test";

describe("workspace cowork panel", () => {
  test("loads selected review details automatically instead of asking users to refresh", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/panel/workspace-cowork-panel.tsx", import.meta.url)).text();

    expect(source).toContain("pendingReviewSummaryLoadsRef");
    expect(source).toContain("controller.loadReviewSummary(worktreeId)");
    expect(source).toContain("Loading review details...");
    expect(source).not.toContain("Click refresh to load review details.");
  });

  test("offers a clean new task path from missing worktree state", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/panel/workspace-cowork-panel.tsx", import.meta.url)).text();

    expect(source).toContain("Worktree missing or stale");
    expect(source).toContain("onCreateTaskFromHere");
    expect(source).toContain("Create new task");
    expect(source).toContain("controller.refresh()");
  });

  test("summarizes terminal session worktrees in the Univerfile panel", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/panel/workspace-cowork-panel.tsx", import.meta.url)).text();

    expect(source).toContain("terminalState === \"merged\"");
    expect(source).toContain("Merged into current Univerfile");
    expect(source).toContain("terminalState === \"discarded\"");
    expect(source).toContain("Changes discarded");
  });

  test("keeps refresh read-only and makes reassociation explicit", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/panel/workspace-cowork-panel.tsx", import.meta.url)).text();

    expect(source).toContain("Refresh status");
    expect(source).toContain("controller.refresh()");
    expect(source).toContain("Manual reassociation");
    expect(source).toContain("allowWorktreeReassociation: true");
    expect(source).toContain("reassociateWorktree");
    expect(source).toContain("Multiple active worktrees in this session");
    expect(source).toContain("Split into new task");
  });

  test("makes duplicate worktree ownership recovery task-centered", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/panel/workspace-cowork-panel.tsx", import.meta.url)).text();

    expect(source).toContain("ownershipConflictIssue");
    expect(source).toContain("This worktree belongs to another task");
    expect(source).toContain("Open owning task");
    expect(source).toContain("onOpenOwningTask(ownershipConflictIssue.ownerSessionId)");
    expect(source).toContain("ownershipConflictIssue");
    expect(source).toContain("? 1");
  });

  test("refreshes cowork status when a session route gains a worktree", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/panel/workspace-cowork-panel.tsx", import.meta.url)).text();

    expect(source).toContain("if (!target.worktreeId?.trim()) return;");
    expect(source).toContain("void controller.refresh();");
    expect(source).toContain("[controller, target.value, target.worktreeId]");
  });

  test("keeps compact worktree and unit-detail panel variants compact", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/panel/workspace-cowork-panel.tsx", import.meta.url)).text();

    expect(source).toContain("variant !== \"tasks\"");
    expect(source).toContain("variant !== \"units\"");
    expect(source).toContain("compact={variant === \"units\"}");
    expect(source).toContain("compact={variant === \"tasks\"}");
    expect(source).toContain("const compactPanel = variant === \"units\" || variant === \"tasks\"");
    expect(source).toContain("!compactPanel && \"border-t border-border\"");
  });
});
