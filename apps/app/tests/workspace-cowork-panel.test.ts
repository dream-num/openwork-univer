import { describe, expect, test } from "bun:test";

describe("workspace cowork panel", () => {
  test("loads selected review details automatically instead of asking users to refresh", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/panel/workspace-cowork-panel.tsx", import.meta.url)).text();

    expect(source).toContain("pendingReviewSummaryLoadsRef");
    expect(source).toContain("controller.loadReviewSummary(worktreeId)");
    expect(source).toContain("Loading review details...");
    expect(source).not.toContain("Click refresh to load review details.");
  });
});
