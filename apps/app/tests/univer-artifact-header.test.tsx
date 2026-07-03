import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CoworkContentSurface, CoworkSnapshot } from "@univer/cowork";

import {
  ArtifactPanelHeader,
  UniverArtifactHeader,
} from "../src/react-app/domains/session/artifacts/artifact-panel";
import type { OpenTarget } from "../src/react-app/domains/session/artifacts/open-target";
import {
  contentViewFromTarget,
} from "../src/react-app/domains/session/artifacts/univer-cowork-session";
import { deriveUniverArtifactHeaderViewModel } from "../src/react-app/domains/session/artifacts/univer-artifact-header-view-model";
import type { UniverOpenSurface } from "../src/react-app/domains/session/artifacts/univer-surface";
import { readUniverOpenSurface } from "../src/react-app/domains/session/artifacts/univer-surface";

function fileTarget(overrides: Partial<OpenTarget> = {}): OpenTarget {
  return {
    id: "file:artifacts/payroll.univer",
    kind: "file",
    value: "artifacts/payroll.univer",
    name: "payroll.univer",
    preview: "univer",
    confidence: 95,
    reason: "test",
    exists: true,
    size: 228 * 1024,
    ...overrides,
  };
}

function noop() {}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

const readyContainer = {
  kind: "local-univerfile",
  containerId: "local-univerfile:/tmp/payroll.univer",
  localPath: "/tmp/payroll.univer",
  displayName: "payroll.univer",
} satisfies NonNullable<CoworkSnapshot["container"]>;

const readySnapshot: CoworkSnapshot = {
  container: readyContainer,
  loadState: "ready",
  units: [
    {
      unitId: "unit_1",
      kind: "sheet",
      displayName: "中国大陆工资表",
      headRev: 2,
    },
  ],
  activeWorktrees: [],
  reviewableWorktrees: [
    {
      worktreeId: "wt_1",
      status: "ready",
      displayName: "Review payroll edits",
      headCommit: 3,
      reviewSummary: {
        worktreeId: "wt_1",
        mergeable: true,
        diverged: true,
        units: [
          {
            unitId: "unit_1",
            kind: "sheet",
            displayName: "中国大陆工资表",
            status: "modified",
            baseStale: false,
            trunkRev: 2,
          },
        ],
        conflicts: [],
        counts: {
          total: 1,
          created: 0,
          modified: 1,
          deleted: 0,
          unchanged: 0,
          conflict: 0,
          baseStale: 0,
        },
      },
    },
  ],
  selection: { type: "container" },
  actions: [],
};

describe("deriveUniverArtifactHeaderViewModel", () => {
  test("does not apply to non-Univer artifacts", () => {
    expect(deriveUniverArtifactHeaderViewModel({
      target: fileTarget({ preview: "pdf", name: "report.pdf", value: "artifacts/report.pdf" }),
      isRemoteWorkspace: false,
    })).toBeNull();
  });

  test("falls back to the Univer file title and omits openExternal", () => {
    const model = deriveUniverArtifactHeaderViewModel({
      target: fileTarget(),
      isRemoteWorkspace: false,
      fileSizeLabel: "228 KB",
    });

    if (!model) throw new Error("expected Univer header model");

    expect(model.primaryTitle).toBe("payroll.univer");
    expect(model.secondaryTitle).toBe("artifacts/payroll.univer");
    expect(model.fileMetaLabel).toBe("228 KB");
    expect(model.contentActions).toEqual([]);
    expect(model.fileActions.map((action) => action.id)).toEqual(["download", "reveal", "close"]);
    expect(model.fileActions.map((action) => action.id)).not.toContain("openExternal");
  });

  test("uses current unit as the primary title when content state exists", () => {
    const model = deriveUniverArtifactHeaderViewModel({
      target: fileTarget({ name: "工资表.univer", value: "artifacts/工资表.univer" }),
      isRemoteWorkspace: false,
      contentState: {
        unitTitle: "中国大陆工资表",
        scopeLabel: "当前版本",
      },
    });

    if (!model) throw new Error("expected Univer header model");

    expect(model.primaryTitle).toBe("中国大陆工资表");
    expect(model.scopeLabel).toBe("当前版本");
    expect(model.secondaryTitle).toBe("工资表.univer");
  });

  test("omits reveal for remote workspaces", () => {
    const model = deriveUniverArtifactHeaderViewModel({
      target: fileTarget(),
      isRemoteWorkspace: true,
    });

    if (!model) throw new Error("expected Univer header model");

    expect(model.fileActions.map((action) => action.id)).toEqual(["download", "close"]);
  });

  test("derives a worktree content view from target route and review summary", () => {
    const view = contentViewFromTarget(
      readySnapshot,
      fileTarget({ worktreeId: "wt_1" }),
      null,
    );

    expect(view).toEqual({ scope: "worktree", worktreeId: "wt_1", unitId: "unit_1" });
  });

  test("opens a ready worktree unit when the Univerfile trunk has no units", () => {
    const reviewable = readySnapshot.reviewableWorktrees[0];
    if (!reviewable?.reviewSummary) throw new Error("expected review summary");

    const snapshot: CoworkSnapshot = {
      ...readySnapshot,
      units: [],
      reviewableWorktrees: [
        {
          ...reviewable,
          worktreeId: "wt_created",
          reviewSummary: {
            ...reviewable.reviewSummary,
            worktreeId: "wt_created",
            units: [
              {
                unitId: "unit_created",
                kind: "sheet",
                displayName: "日本工资计算器",
                status: "created",
                baseStale: false,
              },
            ],
            counts: {
              total: 1,
              created: 1,
              modified: 0,
              deleted: 0,
              unchanged: 0,
              conflict: 0,
              baseStale: 0,
            },
          },
        },
      ],
    };

    const view = contentViewFromTarget(
      snapshot,
      fileTarget({ name: "japan-salary-calculator.univer", value: "artifacts/japan-salary-calculator.univer" }),
      null,
    );

    expect(view).toEqual({ scope: "worktree", worktreeId: "wt_created", unitId: "unit_created" });
  });

  test("does not keep a preferred content view after target route changes", () => {
    const snapshot: CoworkSnapshot = {
      ...readySnapshot,
      units: [
        ...readySnapshot.units,
        {
          unitId: "unit_2",
          kind: "sheet",
          displayName: "上海工资表",
        },
      ],
    };
    const view = contentViewFromTarget(
      snapshot,
      fileTarget({ unitId: "unit_2" }),
      { scope: "trunk", unitId: "unit_1", trunkEditIntent: "auto" },
    );

    expect(view).toEqual({ scope: "trunk", unitId: "unit_2", trunkEditIntent: "auto" });
  });

  test("derives surface selector identity, worktrees, and unit statuses", () => {
    const baseReviewable = readySnapshot.reviewableWorktrees[0];
    if (!baseReviewable?.reviewSummary) throw new Error("expected base review summary");

    const snapshot: CoworkSnapshot = {
      ...readySnapshot,
      units: [
        {
          unitId: "unit_1",
          kind: "sheet",
          displayName: "中国大陆工资表",
          headRev: 2,
        },
        {
          unitId: "unit_2",
          kind: "doc",
          displayName: "2026年第二季度员工工资汇总报告",
          headRev: 1,
        },
      ],
      activeWorktrees: [
        {
          worktreeId: "wt_current",
          status: "draft",
          displayName: "raw-current-worktree",
          headCommit: 4,
        },
      ],
      reviewableWorktrees: [
        {
          ...baseReviewable,
          worktreeId: "wt_other",
          displayName: "raw-other-worktree",
          reviewSummary: {
            ...baseReviewable.reviewSummary,
            worktreeId: "wt_other",
          },
        },
      ],
    };
    const model = deriveUniverArtifactHeaderViewModel({
      target: fileTarget({ name: "工资表.univer", value: "artifacts/工资表.univer", worktreeId: "wt_current" }),
      isRemoteWorkspace: false,
      snapshot,
      currentView: { scope: "worktree", worktreeId: "wt_current", unitId: "unit_1" },
      sessionWorktreeId: "wt_current",
      worktreeOwnershipById: {
        wt_current: { relation: "currentTask", ownerSessionId: "ses_current", ownerSessionTitle: "Current task" },
        wt_other: { relation: "otherTask", ownerSessionId: "ses_other", ownerSessionTitle: "Other task" },
      },
    });

    if (!model) throw new Error("expected Univer header model");

    expect(model.breadcrumb).toEqual({
      univerfile: { label: "工资表.univer" },
      unit: { label: "中国大陆工资表", kind: "sheet" },
    });
    expect(model.unitOptions.map((option) => ({
      label: option.label,
      kind: option.kind,
      selected: option.selected,
      view: option.view,
    }))).toEqual([
      {
        label: "中国大陆工资表",
        kind: "sheet",
        selected: true,
        view: { scope: "worktree", worktreeId: "wt_current", unitId: "unit_1" },
      },
      {
        label: "2026年第二季度员工工资汇总报告",
        kind: "doc",
        selected: false,
        view: { scope: "worktree", worktreeId: "wt_current", unitId: "unit_2" },
      },
    ]);
    expect(model.worktreeOptions.map((option) => ({
      id: option.id,
      label: option.label,
      groupLabel: option.groupLabel,
      relation: option.relation,
      description: option.description,
      selected: option.selected,
      unitOptions: option.unitOptions.map((unit) => ({
        label: unit.label,
        status: unit.status,
        selected: unit.selected,
      })),
      view: option.view,
    }))).toEqual([
      {
        id: "trunk:unit_1",
        label: "当前版本",
        groupLabel: "当前版本",
        relation: "currentVersion",
        description: "主线文件",
        selected: false,
        unitOptions: [
          {
            label: "中国大陆工资表",
            status: undefined,
            selected: true,
          },
          {
            label: "2026年第二季度员工工资汇总报告",
            status: undefined,
            selected: false,
          },
        ],
        view: { scope: "trunk", unitId: "unit_1", trunkEditIntent: "auto" },
      },
      {
        id: "worktree:wt_current:unit_1",
        label: "raw-current-worktree",
        groupLabel: "当前任务",
        relation: "currentTask",
        description: "修改中 · wt_current",
        selected: true,
        unitOptions: [
          {
            label: "中国大陆工资表",
            status: undefined,
            selected: true,
          },
          {
            label: "2026年第二季度员工工资汇总报告",
            status: undefined,
            selected: false,
          },
        ],
        view: { scope: "worktree", worktreeId: "wt_current", unitId: "unit_1" },
      },
      {
        id: "worktree:wt_other:unit_1",
        label: "raw-other-worktree",
        groupLabel: "其他任务",
        relation: "otherTask",
        description: "可合入 · wt_other",
        selected: false,
        unitOptions: [
          {
            label: "中国大陆工资表",
            status: "modified",
            selected: true,
          },
          {
            label: "2026年第二季度员工工资汇总报告",
            status: undefined,
            selected: false,
          },
        ],
        view: { scope: "worktree", worktreeId: "wt_other", unitId: "unit_1" },
      },
    ]);
  });

  test("keeps session worktree options available while viewing the current version", () => {
    const reviewable = readySnapshot.reviewableWorktrees[0];
    if (!reviewable) throw new Error("expected reviewable worktree fixture");

    const snapshot: CoworkSnapshot = {
      ...readySnapshot,
      reviewableWorktrees: [
        {
          ...reviewable,
          worktreeId: "wt_current",
          displayName: "raw-current-worktree",
          reviewSummary: {
            ...reviewable.reviewSummary,
            worktreeId: "wt_current",
          },
        },
      ],
    };
    const model = deriveUniverArtifactHeaderViewModel({
      target: fileTarget({ name: "工资表.univer", value: "artifacts/工资表.univer" }),
      isRemoteWorkspace: false,
      snapshot,
      currentView: { scope: "trunk", unitId: "unit_1", trunkEditIntent: "auto" },
      sessionWorktreeId: "wt_current",
    });

    if (!model) throw new Error("expected Univer header model");

    expect(model.breadcrumb).toEqual({
      univerfile: { label: "工资表.univer" },
      unit: { label: "中国大陆工资表", kind: "sheet" },
    });
    expect(model.worktreeOptions.map((option) => ({
      id: option.id,
      label: option.label,
      description: option.description,
      selected: option.selected,
      view: option.view,
    }))).toEqual([
      {
        id: "trunk:unit_1",
        label: "当前版本",
        description: "主线文件",
        selected: true,
        view: { scope: "trunk", unitId: "unit_1", trunkEditIntent: "auto" },
      },
      {
        id: "worktree:wt_current:unit_1",
        label: "raw-current-worktree",
        description: "可合入 · wt_current",
        selected: false,
        view: { scope: "worktree", worktreeId: "wt_current", unitId: "unit_1" },
      },
    ]);
  });

  test("offers pending worktree options when no session worktree is bound", () => {
    const model = deriveUniverArtifactHeaderViewModel({
      target: fileTarget({ name: "工资表.univer", value: "artifacts/工资表.univer" }),
      isRemoteWorkspace: false,
      snapshot: readySnapshot,
      currentView: { scope: "trunk", unitId: "unit_1", trunkEditIntent: "auto" },
    });

    if (!model) throw new Error("expected Univer header model");

    expect(model.worktreeOptions.map((option) => ({
      id: option.id,
      label: option.label,
      description: option.description,
      selected: option.selected,
      view: option.view,
    }))).toEqual([
      {
        id: "trunk:unit_1",
        label: "当前版本",
        description: "主线文件",
        selected: true,
        view: { scope: "trunk", unitId: "unit_1", trunkEditIntent: "auto" },
      },
      {
        id: "worktree:wt_1:unit_1",
        label: "Review payroll edits",
        description: "可合入 · wt_1",
        selected: false,
        view: { scope: "worktree", worktreeId: "wt_1", unitId: "unit_1" },
      },
    ]);
  });

  test("offers a bridge action from current version to pending task changes", () => {
    const model = deriveUniverArtifactHeaderViewModel({
      target: fileTarget({ name: "工资表.univer", value: "artifacts/工资表.univer" }),
      isRemoteWorkspace: false,
      snapshot: readySnapshot,
      currentView: { scope: "trunk", unitId: "unit_1", trunkEditIntent: "auto" },
      sessionWorktreeId: "wt_1",
      contentState: {
        unitTitle: "中国大陆工资表",
        unitId: "unit_1",
        scope: "trunk",
        editGate: {
          status: "locked",
          editable: false,
          label: "已锁定",
          pendingWorktreeCount: 1,
          action: { type: "requestTrunkEdit", label: "仍要编辑" },
        },
      },
    });

    if (!model) throw new Error("expected Univer header model");

    expect(model.bridgeActions).toEqual([
      {
        type: "openPendingWorktree",
        label: "查看待处理",
        tooltip: "查看「Review payroll edits」的待处理修改。",
        target: { scope: "worktree", worktreeId: "wt_1", unitId: "unit_1" },
      },
    ]);
  });

  test("bridges pending current-version state even before ownership is classified", () => {
    const model = deriveUniverArtifactHeaderViewModel({
      target: fileTarget({ name: "工资表.univer", value: "artifacts/工资表.univer" }),
      isRemoteWorkspace: false,
      snapshot: readySnapshot,
      currentView: { scope: "trunk", unitId: "unit_1", trunkEditIntent: "auto" },
      contentState: {
        unitTitle: "中国大陆工资表",
        unitId: "unit_1",
        scope: "trunk",
        editGate: {
          status: "locked",
          editable: false,
          label: "已锁定",
          pendingWorktreeCount: 1,
          action: { type: "requestTrunkEdit", label: "继续编辑" },
        },
      },
    });

    if (!model) throw new Error("expected Univer header model");

    expect(model.bridgeActions).toEqual([
      {
        type: "openPendingWorktree",
        label: "查看待处理",
        tooltip: "查看「Review payroll edits」的待处理修改。",
        target: { scope: "worktree", worktreeId: "wt_1", unitId: "unit_1" },
      },
    ]);
  });

  test("bridges locked current-version state when pending count has not refreshed", () => {
    const model = deriveUniverArtifactHeaderViewModel({
      target: fileTarget({ name: "工资表.univer", value: "artifacts/工资表.univer" }),
      isRemoteWorkspace: false,
      snapshot: readySnapshot,
      currentView: { scope: "trunk", unitId: "unit_1", trunkEditIntent: "auto" },
      contentState: {
        unitTitle: "中国大陆工资表",
        unitId: "unit_1",
        scope: "trunk",
        editGate: {
          status: "locked",
          editable: false,
          label: "已锁定",
          pendingWorktreeCount: 0,
          action: { type: "requestTrunkEdit", label: "继续编辑" },
        },
      },
    });

    if (!model) throw new Error("expected Univer header model");

    expect(model.bridgeActions).toEqual([
      {
        type: "openPendingWorktree",
        label: "查看待处理",
        tooltip: "查看「Review payroll edits」的待处理修改。",
        target: { scope: "worktree", worktreeId: "wt_1", unitId: "unit_1" },
      },
    ]);
  });

  test("routes pending changes directly to the owning task when ownership is known", () => {
    const model = deriveUniverArtifactHeaderViewModel({
      target: fileTarget({ name: "工资表.univer", value: "artifacts/工资表.univer" }),
      isRemoteWorkspace: false,
      snapshot: readySnapshot,
      currentView: { scope: "trunk", unitId: "unit_1", trunkEditIntent: "auto" },
      contentState: {
        unitTitle: "中国大陆工资表",
        unitId: "unit_1",
        scope: "trunk",
        editGate: {
          status: "locked",
          editable: false,
          label: "已锁定",
          pendingWorktreeCount: 1,
          action: { type: "requestTrunkEdit", label: "继续编辑" },
        },
      },
      worktreeOwnershipById: {
        wt_1: {
          relation: "otherTask",
          ownerSessionId: "ses_owner",
          ownerSessionTitle: "五月工资表制作",
        },
      },
    });

    if (!model) throw new Error("expected Univer header model");

    expect(model.bridgeActions).toEqual([
      {
        type: "openPendingWorktree",
        label: "查看待处理",
        tooltip: "打开任务「五月工资表制作」查看这批修改。",
        target: { scope: "worktree", worktreeId: "wt_1", unitId: "unit_1" },
        ownerSessionId: "ses_owner",
        ownerSessionTitle: "五月工资表制作",
      },
    ]);
  });

  test("keeps the worktree row selected while viewing merge preview", () => {
    const reviewable = readySnapshot.reviewableWorktrees[0];
    if (!reviewable?.reviewSummary) throw new Error("expected reviewable worktree fixture");

    const snapshot: CoworkSnapshot = {
      ...readySnapshot,
      reviewableWorktrees: [
        {
          ...reviewable,
          reviewSummary: {
            ...reviewable.reviewSummary,
            diverged: false,
          },
        },
      ],
    };
    const model = deriveUniverArtifactHeaderViewModel({
      target: fileTarget({ name: "工资表.univer", value: "artifacts/工资表.univer" }),
      isRemoteWorkspace: false,
      snapshot,
      currentView: { scope: "mergePreview", worktreeId: "wt_1", unitId: "unit_1" },
    });

    if (!model) throw new Error("expected Univer header model");

    expect(model.worktreeOptions.map((option) => ({
      id: option.id,
      label: option.label,
      description: option.description,
      selected: option.selected,
      view: option.view,
    }))).toEqual([
      {
        id: "trunk:unit_1",
        label: "当前版本",
        description: "主线文件",
        selected: false,
        view: { scope: "trunk", unitId: "unit_1", trunkEditIntent: "auto" },
      },
      {
        id: "worktree:wt_1:unit_1",
        label: "Review payroll edits",
        description: "可合入 · wt_1",
        selected: true,
        view: { scope: "worktree", worktreeId: "wt_1", unitId: "unit_1" },
      },
    ]);
  });
});

describe("artifact headers", () => {
  test("Univer header removes normal external opening and keeps fallback actions", () => {
    const html = renderToStaticMarkup(
      <UniverArtifactHeader
        target={fileTarget()}
        fileIcon={null}
        isRemoteWorkspace={false}
        onDownload={noop}
        onReveal={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain("data-testid=\"univer-artifact-header\"");
    expect(html).toContain("payroll.univer");
    expect(html).toContain("Download artifact");
    expect(html).toContain("Show in folder");
    expect(html).toContain("Close artifact");
    expect(html).not.toContain("Open externally");

    const headerClass = html.match(/class="([^"]*)" data-testid="univer-artifact-header"/)?.[1];
    expect(headerClass).toContain("@container/univer-artifact-header");
    expect(headerClass).not.toContain("border-b");
    expect(html).toContain("h-10 min-w-0 items-center gap-2 overflow-hidden border-b border-border");
  });

  test("generic artifact header keeps the external open action", () => {
    const html = renderToStaticMarkup(
      <ArtifactPanelHeader
        target={fileTarget({ preview: "pdf", name: "report.pdf", value: "artifacts/report.pdf" })}
        data={undefined}
        fileIcon={null}
        editing={false}
        draft=""
        isSaving={false}
        isDirectTextEdit={false}
        isRemoteWorkspace={false}
        onEdit={noop}
        onDiscard={noop}
        onSave={noop}
        onDownload={noop}
        onReveal={noop}
        onOpenExternal={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain("report.pdf");
    expect(html).toContain("Open externally");
  });

  test("Univer header uses cowork content state for title and workflow controls", () => {
    const contentSurface: CoworkContentSurface = {
      status: "ready",
      container: readySnapshot.container,
      unit: readySnapshot.units[0],
      scope: "worktree",
      title: "中国大陆工资表",
      scopeLabel: "原始修改",
      badges: [{ type: "unitStatus", tone: "info", label: "改", status: "modified" }],
      editGate: {
        status: "viewOnly",
        editable: false,
        label: "仅查看",
        pendingWorktreeCount: 1,
        reason: "nonTrunkScope",
      },
      actions: [
        {
          type: "setContentScope",
          target: { scope: "mergePreview", worktreeId: "wt_1", unitId: "unit_1" },
          label: "raw merge preview",
          selected: false,
        },
        {
          type: "setContentScope",
          target: { scope: "worktree", worktreeId: "wt_1", unitId: "unit_1" },
          label: "原始修改",
          selected: true,
        },
        {
          type: "mergeWorktree",
          worktreeId: "wt_1",
          label: "合入到当前版本",
          status: "idle",
        },
        {
          type: "discardWorktree",
          worktreeId: "wt_1",
          label: "丢弃",
          status: "idle",
        },
      ],
      viewerRequest: {
        container: readyContainer,
        unitId: "unit_1",
        unitKind: "sheet",
        scope: "worktree",
        worktreeId: "wt_1",
        editable: false,
      },
    };
    const html = renderToStaticMarkup(
      <UniverArtifactHeader
        target={fileTarget({ name: "工资表.univer", value: "artifacts/工资表.univer" })}
        fileIcon={null}
        isRemoteWorkspace={false}
        snapshot={readySnapshot}
        contentSurface={contentSurface}
        currentView={{ scope: "worktree", worktreeId: "wt_1", unitId: "unit_1" }}
        sessionWorktreeId="wt_1"
        onDownload={noop}
        onReveal={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain("中国大陆工资表");
    expect(html).toContain("只读");
    expect(html).toContain("Review payroll edits");
    expect(html).not.toContain("已修改");
    expect(html).not.toContain(">改<");
    expect(html).toContain("合入后");
    expect(html).toContain("修改");
    expect(html).toContain("data-testid=\"univer-artifact-header-view-switch\"");
    expect(html.indexOf("data-testid=\"univer-artifact-header-view-switch\"")).toBeLessThan(
      html.indexOf("data-testid=\"univer-artifact-header-review-actions\""),
    );
    expect(html).not.toContain("打开工作流控件");
    expect(html).not.toContain(">查看修改</span>");
    expect(html).not.toContain(">预览合入后</span>");
    expect(html).not.toContain("原始修改");
    expect(html).toContain("aria-label=\"合入当前版本\"");
    expect(html).toContain("aria-label=\"丢弃修改\"");
    expect(html).not.toContain("<span>合入</span>");
    expect(html).not.toContain("<span>丢弃</span>");
    expect(html).toContain("data-testid=\"univer-artifact-header-review-actions\"");
    expect(html).not.toContain("Worktree 操作");
    expect(html).toContain("data-testid=\"univer-surface-selector\"");
    expect(html).not.toContain("data-testid=\"univer-worktree-selector\"");
    expect(html).not.toContain("可合入 · wt_1");
    expect(html).not.toContain("max-w-[18ch] shrink-[4] truncate");
    expect(html).toContain("max-w-[28ch] shrink-[2]");
    expect(html).not.toContain("grow truncate");
    expect(html).not.toContain("状态");
    expect(html).not.toContain("artifacts/工资表.univer");
    expect(html).not.toContain("Open externally");
  });

  test("Univer header treats other task worktrees as view-only", () => {
    const contentSurface: CoworkContentSurface = {
      status: "ready",
      container: readySnapshot.container,
      unit: readySnapshot.units[0],
      scope: "worktree",
      title: "中国大陆工资表",
      scopeLabel: "原始修改",
      badges: [],
      editGate: {
        status: "viewOnly",
        editable: false,
        label: "仅查看",
        pendingWorktreeCount: 1,
        reason: "nonTrunkScope",
      },
      actions: [
        {
          type: "mergeWorktree",
          worktreeId: "wt_1",
          label: "合入到当前版本",
          status: "idle",
        },
        {
          type: "discardWorktree",
          worktreeId: "wt_1",
          label: "丢弃",
          status: "idle",
        },
      ],
      viewerRequest: {
        container: readyContainer,
        unitId: "unit_1",
        unitKind: "sheet",
        scope: "worktree",
        worktreeId: "wt_1",
        editable: false,
      },
    };

    const html = renderToStaticMarkup(
      <UniverArtifactHeader
        target={fileTarget({ name: "工资表.univer", value: "artifacts/工资表.univer" })}
        fileIcon={null}
        isRemoteWorkspace={false}
        snapshot={readySnapshot}
        contentSurface={contentSurface}
        currentView={{ scope: "worktree", worktreeId: "wt_1", unitId: "unit_1" }}
        worktreeOwnershipById={{
          wt_1: { relation: "otherTask", ownerSessionId: "ses_other", ownerSessionTitle: "Other task" },
        }}
        onOpenOwnerSession={noop}
        onDownload={noop}
        onReveal={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain("只读");
    expect(html).toContain("任务「Other task」");
    expect(html).toContain("打开所属任务");
    expect(html).not.toContain("aria-label=\"合入当前版本\"");
    expect(html).not.toContain("aria-label=\"丢弃修改\"");
    expect(html).not.toContain("data-testid=\"univer-artifact-header-review-actions\"");
  });

  test("Univer header bridges pending current-version state to task changes", () => {
    const contentSurface: CoworkContentSurface = {
      status: "ready",
      container: readySnapshot.container,
      unit: readySnapshot.units[0],
      scope: "trunk",
      title: "中国大陆工资表",
      scopeLabel: "当前版本",
      badges: [],
      editGate: {
        status: "locked",
        editable: false,
        label: "已锁定",
        pendingWorktreeCount: 1,
        action: { type: "requestTrunkEdit", label: "仍要编辑" },
      },
      actions: [
        {
          type: "mergeWorktree",
          worktreeId: "wt_1",
          label: "合入到当前版本",
          status: "idle",
        },
        {
          type: "discardWorktree",
          worktreeId: "wt_1",
          label: "丢弃",
          status: "idle",
        },
      ],
      viewerRequest: {
        container: readyContainer,
        unitId: "unit_1",
        unitKind: "sheet",
        scope: "trunk",
        editable: false,
      },
    };

    const html = renderToStaticMarkup(
      <UniverArtifactHeader
        target={fileTarget({ name: "工资表.univer", value: "artifacts/工资表.univer" })}
        fileIcon={null}
        isRemoteWorkspace={false}
        snapshot={readySnapshot}
        contentSurface={contentSurface}
        currentView={{ scope: "trunk", unitId: "unit_1", trunkEditIntent: "auto" }}
        sessionWorktreeId="wt_1"
        onContentViewChange={noop}
        onDownload={noop}
        onReveal={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain("待处理");
    expect(html).toContain("查看待处理");
    expect(html).toContain("univer-artifact-header-status-actions");
    expect(html).not.toContain("aria-label=\"合入当前版本\"");
    expect(html).not.toContain("aria-label=\"丢弃修改\"");
    expect(html).not.toContain("univer-artifact-header-bridge-actions");
  });

  test("Univer header does not show workflow overflow", () => {
    const contentSurface: CoworkContentSurface = {
      status: "ready",
      container: readySnapshot.container,
      unit: readySnapshot.units[0],
      scope: "trunk",
      title: "中国大陆工资表",
      scopeLabel: "当前版本",
      badges: [],
      editGate: {
        status: "editable",
        editable: true,
        label: "可编辑",
        pendingWorktreeCount: 0,
      },
      actions: [],
      viewerRequest: {
        container: readyContainer,
        unitId: "unit_1",
        unitKind: "sheet",
        scope: "trunk",
        editable: true,
      },
    };
    const html = renderToStaticMarkup(
      <UniverArtifactHeader
        target={fileTarget({ name: "工资表.univer", value: "artifacts/工资表.univer" })}
        fileIcon={null}
        isRemoteWorkspace={false}
        contentSurface={contentSurface}
        onDownload={noop}
        onReveal={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain("当前版本");
    expect(html).toContain("可编辑");
    expect(html).not.toContain("打开工作流控件");
    expect(html).not.toContain("状态");
  });

  test("Univer header avoids Base UI group-label primitives in dropdowns", () => {
    const source = readFileSync(
      new URL("../src/react-app/domains/session/artifacts/artifact-panel.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("DropdownMenuLabel");
    expect(source).toContain("data-testid=\"univer-surface-selector-group-label\"");
  });

  test("Univer header renders one concise primary status by priority", () => {
    const renderStatusSurface = (contentSurface: CoworkContentSurface) => renderToStaticMarkup(
      <UniverArtifactHeader
        target={fileTarget({ name: "工资表.univer", value: "artifacts/工资表.univer" })}
        fileIcon={null}
        isRemoteWorkspace={false}
        contentSurface={contentSurface}
        onDownload={noop}
        onReveal={noop}
        onClose={noop}
      />,
    );
    const baseSurface: CoworkContentSurface = {
      status: "ready",
      container: readySnapshot.container,
      unit: readySnapshot.units[0],
      scope: "worktree",
      title: "中国大陆工资表",
      scopeLabel: "原始修改",
      badges: [],
      editGate: {
        status: "viewOnly",
        editable: false,
        label: "仅查看",
        pendingWorktreeCount: 1,
        reason: "nonTrunkScope",
      },
      actions: [],
      viewerRequest: {
        container: readyContainer,
        unitId: "unit_1",
        unitKind: "sheet",
        scope: "worktree",
        worktreeId: "wt_1",
        editable: false,
      },
    };

    const baselineHtml = renderStatusSurface({
      ...baseSurface,
      badges: [{ type: "diverged", tone: "info", label: "最新版本有改动 · 正在看原始修改" }],
      editGate: {
        status: "locked",
        editable: false,
        label: "已锁定",
        pendingWorktreeCount: 1,
        action: { type: "requestTrunkEdit", label: "仍要编辑" },
      },
    });

    expect(countOccurrences(baselineHtml, "data-testid=\"univer-artifact-header-primary-status\"")).toBe(1);
    expect(baselineHtml).toContain("基线有变");
    expect(baselineHtml).not.toContain("最新版本有改动 · 正在看原始修改");
    expect(baselineHtml).not.toContain("待处理");
    expect(baselineHtml).not.toContain("有待处理修改");

    const conflictHtml = renderStatusSurface({
      ...baseSurface,
      badges: [
        { type: "diverged", tone: "info", label: "最新版本有改动 · 正在看原始修改" },
        { type: "conflict", tone: "warn", label: "2 处冲突" },
      ],
    });

    expect(countOccurrences(conflictHtml, "data-testid=\"univer-artifact-header-primary-status\"")).toBe(1);
    expect(conflictHtml).toContain("冲突");
    expect(conflictHtml).not.toContain("基线有变");

    const pendingHtml = renderStatusSurface({
      ...baseSurface,
      editGate: {
        status: "locked",
        editable: false,
        label: "已锁定",
        pendingWorktreeCount: 1,
        action: { type: "requestTrunkEdit", label: "仍要编辑" },
      },
    });

    expect(pendingHtml).toContain("待处理");
    expect(pendingHtml).not.toContain("有待处理修改");

    const editingHtml = renderStatusSurface({
      ...baseSurface,
      editGate: {
        status: "editingWithPending",
        editable: true,
        label: "编辑中",
        pendingWorktreeCount: 1,
        action: { type: "stopTrunkEdit", label: "停止编辑" },
      },
    });

    expect(editingHtml).toContain("编辑中");
    expect(editingHtml).not.toContain("正在编辑当前版本");
  });

  test("Univer open surface is structured around gateway origin", () => {
    const surface = readUniverOpenSurface({
      origin: "http://127.0.0.1:5180",
      univerfile: "/tmp/payroll.univer",
      worktreeId: "wt_1",
      unitId: "unit_1",
    }) satisfies UniverOpenSurface;

    expect(surface.origin).toBe("http://127.0.0.1:5180");
    expect(surface.univerfile).toBe("/tmp/payroll.univer");
    expect(surface.worktreeId).toBe("wt_1");
    expect(surface.unitId).toBe("unit_1");
  });

  test("Univer open surface rejects the old URL-only response", () => {
    expect(() => readUniverOpenSurface({
      url: "http://127.0.0.1:5180/?file=/tmp/payroll.univer",
      viewerUrl: "http://127.0.0.1:5180",
      univerfile: "/tmp/payroll.univer",
    })).toThrow("Univer surface response is missing origin.");
  });

  test("Univer content viewer surface does not keep the old iframe fallback", () => {
    const source = readFileSync(
      new URL("../src/react-app/domains/session/artifacts/artifact-panel.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("univer-artifact-native-viewer");
    expect(source).toContain("CoworkContentViewer");
    expect(source).toContain("UniverViewerError");
    expect(source).toContain("setReloadKey");
    expect(source).not.toContain("univer-collab-surface");
    expect(source).not.toContain("<iframe");
  });

  test("Univer content viewer keeps a stable shell through bootstrap states", () => {
    const source = readFileSync(
      new URL("../src/react-app/domains/session/artifacts/artifact-panel.tsx", import.meta.url),
      "utf8",
    );
    const start = source.indexOf("function UniverContentViewerSurface");
    const end = source.indexOf("function UniverViewerError");

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const viewerSource = source.slice(start, end);

    expect(viewerSource).toContain("univer-artifact-native-viewer");
    expect(viewerSource).toContain("content = <PreviewLoading />");
    expect(viewerSource).toContain('snapshot?.loadState === "error"');
    expect(viewerSource).not.toContain("content = <PreviewUnavailable />");
    expect(viewerSource).not.toMatch(/if \(isLoading\) \{\s*return \(/);
    expect(viewerSource).not.toMatch(/if \(isError \|\| !surface\) \{\s*return \(/);
    expect(viewerSource).not.toMatch(/if \(!viewerRequest \|\| !viewerDataSource\) \{\s*return \(/);
  });

  test("Univer artifact workspace refreshes when the native surface opens", () => {
    const source = readFileSync(
      new URL("../src/react-app/domains/session/artifacts/artifact-panel.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("void controller.refresh();");
    expect(source).toContain("[controller, target.value, target.worktreeId]");
    expect(source).not.toContain("if (!target.worktreeId?.trim()) return;");
  });

  test("Univer artifact workspace updates the sidebar worktree status store", () => {
    const source = readFileSync(
      new URL("../src/react-app/domains/session/artifacts/artifact-panel.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("useUniverWorktreeStatusStore");
    expect(source).toContain("updateTargetSnapshot(workspaceId, target.value, snapshot)");
  });

});
