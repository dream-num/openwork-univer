import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CoworkContentSurface, CoworkSnapshot } from "@univer/cowork";

import {
  ArtifactPanelHeader,
  UniverArtifactHeader,
} from "../src/react-app/domains/session/artifacts/artifact-panel";
import type { OpenTarget } from "../src/react-app/domains/session/artifacts/open-target";
import {
  buildUniverEmbeddedViewerUrl,
  contentViewFromTarget,
} from "../src/react-app/domains/session/artifacts/univer-cowork-session";
import { deriveUniverArtifactHeaderViewModel } from "../src/react-app/domains/session/artifacts/univer-artifact-header-view-model";
import type { UniverOpenSurface } from "../src/react-app/domains/session/artifacts/univer-surface";

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
    expect(html).toContain("原始修改");
    expect(html).toContain("工资表.univer");
    expect(html).toContain("仅查看");
    expect(html).toContain("合并预览");
    expect(html).toContain("合入到当前版本");
    expect(html).toContain("丢弃");
    expect(html).not.toContain("Open externally");
  });

  test("viewer request builds an embedded collab-client URL", () => {
    const surface: UniverOpenSurface = {
      url: "http://127.0.0.1:5180/?file=%2Ftmp%2Fpayroll.univer&mode=embedded",
      viewerUrl: "http://127.0.0.1:5180/",
      univerfile: "/tmp/payroll.univer",
    };
    const url = new URL(buildUniverEmbeddedViewerUrl(surface, {
      container: readyContainer,
      unitId: "unit_1",
      scope: "mergePreview",
      worktreeId: "wt_1",
      editable: false,
    }));

    expect(url.searchParams.get("file")).toBe("/tmp/payroll.univer");
    expect(url.searchParams.get("mode")).toBe("embedded");
    expect(url.searchParams.get("scope")).toBe("mergePreview");
    expect(url.searchParams.get("editable")).toBe("false");
    expect(url.searchParams.get("worktree")).toBe("wt_1");
    expect(url.searchParams.get("unit")).toBe("unit_1");
  });
});
