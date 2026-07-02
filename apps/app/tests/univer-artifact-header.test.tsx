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

  test("derives breadcrumb route selectors from units and session-owned worktrees", () => {
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
      worktreeOwnerTitles: {
        wt_current: "5月工资表制作",
        wt_other: "季度总结更新",
      },
    });

    if (!model) throw new Error("expected Univer header model");

    expect(model.breadcrumb).toEqual({
      univerfile: { label: "工资表.univer" },
      unit: { label: "中国大陆工资表", kind: "sheet" },
      worktree: { label: "5月工资表制作", stateLabel: "Working" },
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
    expect(model.worktreeGroups.map((group) => group.label)).toEqual([
      "Current version",
      "This session",
      "Other sessions",
    ]);
    expect(model.worktreeGroups.flatMap((group) => group.options.map((option) => ({
      id: option.id,
      label: option.label,
      stateLabel: option.stateLabel,
      selected: option.selected,
      tooltip: option.tooltip,
      view: option.view,
    })))).toEqual([
      {
        id: "current-version",
        label: "Current version",
        stateLabel: undefined,
        selected: false,
        tooltip: undefined,
        view: { scope: "trunk", unitId: "unit_1", trunkEditIntent: "auto" },
      },
      {
        id: "worktree:wt_current",
        label: "5月工资表制作",
        stateLabel: "Working",
        selected: true,
        tooltip: "wt_current",
        view: { scope: "worktree", worktreeId: "wt_current", unitId: "unit_1" },
      },
      {
        id: "worktree:wt_other",
        label: "季度总结更新",
        stateLabel: "Ready",
        selected: false,
        tooltip: "wt_other",
        view: { scope: "worktree", worktreeId: "wt_other", unitId: "unit_1" },
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
    expect(html).toContain("data-testid=\"univer-artifact-header-content-actions\"");
    expect(html).toContain("payroll.univer");
    expect(html).toContain("Download artifact");
    expect(html).toContain("Show in folder");
    expect(html).toContain("Close artifact");
    expect(html).not.toContain("Open externally");

    const headerClass = html.match(/class="([^"]*)" data-testid="univer-artifact-header"/)?.[1];
    expect(headerClass).not.toContain("border-b");
    expect(html).toContain("h-10 items-center gap-3 border-b border-border");
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
          label: "合并预览",
          selected: false,
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
        contentSurface={contentSurface}
        onDownload={noop}
        onReveal={noop}
        onClose={noop}
      />,
    );

    expect(html).toContain("中国大陆工资表");
    expect(html).toContain("工资表.univer");
    expect(html).toContain("仅查看");
    expect(html).toContain("合并预览");
    expect(html).toContain("合入到当前版本");
    expect(html).toContain("丢弃");
    expect(html).not.toContain("原始修改");
    expect(html).not.toContain("artifacts/工资表.univer");
    expect(html).not.toContain("Open externally");
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
    expect(viewerSource).not.toMatch(/if \(isLoading\) \{\s*return \(/);
    expect(viewerSource).not.toMatch(/if \(isError \|\| !surface\) \{\s*return \(/);
    expect(viewerSource).not.toMatch(/if \(!viewerRequest \|\| !viewerDataSource\) \{\s*return \(/);
  });
});
