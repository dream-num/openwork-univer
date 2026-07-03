import { describe, expect, test } from "bun:test";

import { buildUniverTargetHubs } from "../src/react-app/domains/session/sidebar/app-sidebar";
import type { SidebarSessionItem } from "../src/app/types";
import type { OpenworkUniverTargetSummary } from "../src/app/lib/openwork-server";
import { statusFromCoworkSnapshot } from "../src/react-app/domains/session/univer-worktree-status-store";

describe("sidebar Univer target grouping", () => {
  test("groups bound sessions under targets and keeps unbound sessions general", () => {
    const sessions: SidebarSessionItem[] = [
      {
        id: "ses_bound_review",
        title: "Update budget",
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
        sessionUniverWorktreeId: "wt_1",
      },
      {
        id: "ses_general",
        title: "Discuss plan",
      },
      {
        id: "ses_bound_idle",
        title: "Read budget",
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
      },
    ];
    const targets: OpenworkUniverTargetSummary[] = [
      {
        path: "reports/budget.univer",
        name: "budget.univer",
        size: 128,
        updatedAt: 42,
        unitCount: null,
      },
    ];

    const result = buildUniverTargetHubs(sessions, targets, {
      "reports/budget.univer": statusFromCoworkSnapshot("reports/budget.univer", {
        units: [
          { unitId: "sheet-1", kind: "sheet", displayName: "Budget" },
          { unitId: "doc-1", kind: "doc", displayName: "Notes" },
        ],
        activeWorktrees: [],
        reviewableWorktrees: [
          {
            worktreeId: "wt_1",
            status: "ready",
            displayName: "Update budget",
            headCommit: 4,
          },
        ],
      }),
    });

    expect(result.hasUniverSurface).toBe(true);
    expect(result.hubs).toHaveLength(1);
    expect(result.hubs[0].target.path).toBe("reports/budget.univer");
    expect(result.hubs[0].target.unitCount).toBe(2);
    expect(result.hubs[0].sessions.map((session) => session.id)).toEqual([
      "ses_bound_review",
      "ses_bound_idle",
    ]);
    expect(result.hubs[0].actionableSessionCount).toBe(1);
    expect(result.generalSessions.map((session) => session.id)).toEqual(["ses_general"]);
  });

  test("sorts target sessions by live actionability before recent activity", () => {
    const sessions: SidebarSessionItem[] = [
      {
        id: "ses_working",
        title: "Working",
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
        sessionUniverWorktreeId: "wt_working",
        time: { updated: 400 },
      },
      {
        id: "ses_none",
        title: "Planning",
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
        time: { updated: 900 },
      },
      {
        id: "ses_missing",
        title: "Missing",
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
        sessionUniverWorktreeId: "wt_missing",
        time: { updated: 100 },
      },
      {
        id: "ses_ready",
        title: "Ready",
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
        sessionUniverWorktreeId: "wt_ready",
        time: { updated: 200 },
      },
      {
        id: "ses_conflict",
        title: "Conflict",
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
        sessionUniverWorktreeId: "wt_conflict",
        time: { updated: 300 },
      },
      {
        id: "ses_multiple",
        title: "Multiple",
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
        sessionUniverWorktreeId: "wt_multiple_a",
        sessionUniverWorktreeIssue: {
          kind: "multiple",
          worktreeIds: ["wt_multiple_a", "wt_multiple_b"],
        },
        time: { updated: 250 },
      },
    ];
    const targets: OpenworkUniverTargetSummary[] = [
      {
        path: "reports/budget.univer",
        name: "budget.univer",
        size: 128,
        updatedAt: 42,
        unitCount: null,
      },
    ];
    const result = buildUniverTargetHubs(sessions, targets, {
      "reports/budget.univer": statusFromCoworkSnapshot("reports/budget.univer", {
        units: [{ unitId: "sheet-1", kind: "sheet", displayName: "Budget" }],
        activeWorktrees: [
          {
            worktreeId: "wt_working",
            status: "draft",
            displayName: "Working",
            headCommit: 3,
          },
        ],
        reviewableWorktrees: [
          {
            worktreeId: "wt_ready",
            status: "ready",
            displayName: "Ready",
            headCommit: 4,
          },
          {
            worktreeId: "wt_conflict",
            status: "ready",
            displayName: "Conflict",
            headCommit: 5,
            reviewSummary: {
              worktreeId: "wt_conflict",
              mergeable: false,
              diverged: false,
              units: [],
              conflicts: ["sheet-1"],
              counts: {
                total: 1,
                created: 0,
                modified: 0,
                deleted: 0,
                unchanged: 0,
                conflict: 1,
                baseStale: 0,
              },
            },
          },
        ],
      }),
    });

    expect(result.hubs[0].sessions.map((session) => session.id)).toEqual([
      "ses_conflict",
      "ses_multiple",
      "ses_missing",
      "ses_ready",
      "ses_working",
      "ses_none",
    ]);
    expect(result.hubs[0].actionableSessionCount).toBe(4);
    expect(result.hubs[0].reviewStateBySessionId.ses_multiple?.label).toBe("Split");
  });

  test("keeps one owner for duplicate live worktree bindings", () => {
    const sessions: SidebarSessionItem[] = [
      {
        id: "ses_owner",
        title: "Quarterly summary",
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
        sessionUniverWorktreeId: "wt_ready",
        time: { created: 100 },
      },
      {
        id: "ses_duplicate",
        title: "May payroll",
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
        sessionUniverWorktreeId: "wt_ready",
        time: { created: 200 },
      },
    ];
    const targets: OpenworkUniverTargetSummary[] = [
      {
        path: "reports/budget.univer",
        name: "budget.univer",
        size: 128,
        updatedAt: 42,
        unitCount: null,
      },
    ];

    const result = buildUniverTargetHubs(sessions, targets, {
      "reports/budget.univer": statusFromCoworkSnapshot("reports/budget.univer", {
        units: [{ unitId: "sheet-1", kind: "sheet", displayName: "Budget" }],
        activeWorktrees: [],
        reviewableWorktrees: [
          {
            worktreeId: "wt_ready",
            status: "ready",
            displayName: "Quarterly summary",
            headCommit: 4,
          },
        ],
      }),
    });

    expect(result.hubs[0].reviewStateBySessionId.ses_owner).toMatchObject({
      kind: "ready",
      label: "Review",
    });
    expect(result.hubs[0].reviewStateBySessionId.ses_duplicate).toMatchObject({
      kind: "ownershipConflict",
      label: "Attention",
      ownerSessionId: "ses_owner",
      ownerSessionTitle: "Quarterly summary",
    });
    expect(result.hubs[0].actionableSessionCount).toBe(2);
    expect(result.hubs[0].reviewSessionCount).toBe(1);
    expect(result.hubs[0].issueSessionCount).toBe(1);
  });

  test("keeps terminal worktree sessions collapsed under Done", () => {
    const sessions: SidebarSessionItem[] = [
      {
        id: "ses_ready",
        title: "Ready",
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
        sessionUniverWorktreeId: "wt_ready",
      },
      {
        id: "ses_merged",
        title: "Merged",
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
        sessionUniverWorktreeId: "wt_merged",
        sessionUniverWorktreeTerminalState: "merged",
      },
      {
        id: "ses_discarded",
        title: "Discarded",
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
        sessionUniverWorktreeId: "wt_discarded",
        sessionUniverWorktreeTerminalState: "discarded",
      },
    ];
    const targets: OpenworkUniverTargetSummary[] = [
      {
        path: "reports/budget.univer",
        name: "budget.univer",
        size: 128,
        updatedAt: 42,
        unitCount: null,
      },
    ];

    const result = buildUniverTargetHubs(sessions, targets, {
      "reports/budget.univer": statusFromCoworkSnapshot("reports/budget.univer", {
        units: [{ unitId: "sheet-1", kind: "sheet", displayName: "Budget" }],
        activeWorktrees: [],
        reviewableWorktrees: [
          {
            worktreeId: "wt_ready",
            status: "ready",
            displayName: "Ready",
            headCommit: 4,
          },
        ],
      }),
    });

    expect(result.hubs[0].sessions.map((session) => session.id)).toEqual(["ses_ready"]);
    expect(result.hubs[0].doneSessions.map((session) => session.id)).toEqual([
      "ses_merged",
      "ses_discarded",
    ]);
    expect(result.hubs[0].actionableSessionCount).toBe(1);
    expect(result.hubs[0].reviewStateBySessionId.ses_merged?.label).toBe("Merged");
    expect(result.hubs[0].reviewStateBySessionId.ses_discarded?.label).toBe("Discarded");
  });

  test("keeps overview sessions on the univerfile row instead of General Sessions", () => {
    const sessions: SidebarSessionItem[] = [
      {
        id: "ses_overview",
        title: "budget.univer",
        primaryUniverTarget: { path: "./reports/budget.univer", name: "budget.univer" },
        univerSessionKind: "overview",
      },
      {
        id: "ses_general",
        title: "Discuss plan",
      },
    ];
    const targets: OpenworkUniverTargetSummary[] = [
      {
        path: "reports/budget.univer",
        name: "budget.univer",
        size: 128,
        updatedAt: 42,
        unitCount: null,
      },
    ];

    const result = buildUniverTargetHubs(sessions, targets);

    expect(result.hubs).toHaveLength(1);
    expect(result.hubs[0].overviewSession?.id).toBe("ses_overview");
    expect(result.hubs[0].sessions).toHaveLength(0);
    expect(result.generalSessions.map((session) => session.id)).toEqual(["ses_general"]);
  });

  test("keeps sessions for deleted Univerfiles in undiscovered hubs", () => {
    const sessions: SidebarSessionItem[] = [
      {
        id: "ses_deleted_file",
        title: "Historical payroll task",
        primaryUniverTarget: { path: "artifacts/deleted-payroll.univer", name: "deleted-payroll.univer" },
      },
      {
        id: "ses_general",
        title: "Discuss plan",
      },
    ];

    const result = buildUniverTargetHubs(sessions, []);

    expect(result.hubs).toHaveLength(1);
    expect(result.hubs[0].target.discovered).toBe(false);
    expect(result.hubs[0].target.path).toBe("artifacts/deleted-payroll.univer");
    expect(result.hubs[0].sessions.map((session) => session.id)).toEqual(["ses_deleted_file"]);
    expect(result.generalSessions.map((session) => session.id)).toEqual(["ses_general"]);
  });

  test("renders General Sessions before current and unavailable Univerfiles", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/sidebar/app-sidebar.tsx", import.meta.url)).text();
    const branchStart = source.indexOf("univerNavigation.hasUniverSurface ? (");
    const branchEnd = source.indexOf(") : wsGroups.length > 0", branchStart);
    const branch = source.slice(branchStart, branchEnd);

    expect(branchStart).toBeGreaterThan(0);
    expect(branchEnd).toBeGreaterThan(branchStart);
    expect(branch.indexOf("GeneralSessionsSection")).toBeLessThan(branch.indexOf("label=\"Univerfiles\""));
    expect(branch.indexOf("label=\"Univerfiles\"")).toBeLessThan(branch.indexOf("label=\"Unavailable\""));
    expect(branch).toContain("defaultExpanded={false}");
    expect(branch).toContain("hubDefaultExpanded={false}");
  });

  test("does not render show-more or create-group row in Univer navigation", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/sidebar/app-sidebar.tsx", import.meta.url)).text();

    expect(source).toContain("!univerNavigation.hasUniverSurface && wsGroups.length === 0 && activeRootCount > previewCount");
  });

  test("keeps Univerfile child session indentation compact", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/sidebar/app-sidebar.tsx", import.meta.url)).text();

    expect(source).toContain('const SESSION_DEPTH_1_CLASS = "ps-8"');
    expect(source).toContain('const SESSION_DEPTH_DEEP_CLASS = "ps-11"');
    expect(source).toContain('nested ? "h-7 px-2 ps-8 text-xs"');
  });

  test("keeps Univerfile row aggregate status explicit", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/sidebar/app-sidebar.tsx", import.meta.url)).text();

    expect(source).not.toContain("unitCountLabel");
    expect(source).not.toContain("unitCountTitle");
    expect(source).toContain('const UNIVER_FILE_PENDING_CLASS = "inline-flex h-5 min-w-0 shrink-0 items-center justify-center gap-1 rounded px-1.5 text-[10px] font-medium leading-none"');
    expect(source).toContain('countPhrase(hub.reviewSessionCount, "review", "reviews")');
    expect(source).toContain('countPhrase(hub.issueSessionCount, "issue", "issues")');
    expect(source).toContain("buildUniverFileTaskSummary(hub)");
  });

  test("keeps Univer review chips in the right-side session row slot", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/sidebar/app-sidebar.tsx", import.meta.url)).text();

    expect(source).toContain('data-sidebar="session-univer-review-chip"');
    expect(source).toContain('"shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-3"');
    expect(source).toContain('"pe-20 group-hover/menu-sub-item:pe-28 group-has-data-popup-open/menu-sub-item:pe-28"');
    expect(source).toContain('"pointer-events-none absolute top-1/2 -translate-y-1/2 transition-transform duration-75 group-hover/menu-sub-item:-translate-x-8 group-has-data-popup-open/menu-sub-item:-translate-x-8"');
    expect(source).toContain('hasActivityIndicator ? "right-8" : "right-3"');
  });

  test("offers file-level cleanup for unavailable Univerfiles only", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/sidebar/app-sidebar.tsx", import.meta.url)).text();

    expect(source).toContain("const canDeleteUnavailableTarget = !hub.target.discovered");
    expect(source).toContain("Remove unavailable Univerfile");
    expect(source).toContain("ctx.onOpenDeleteUnavailableUniverTarget?.(workspaceId, hub.target.name, hub.target.path, hubSessionIds)");
  });
});
