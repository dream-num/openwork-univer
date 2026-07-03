import type {
  CoworkContentAction,
  CoworkContentBadge,
  CoworkContentEditGate,
  CoworkContentScope,
  CoworkContentViewState,
  CoworkReviewUnitStatus,
  CoworkSnapshot,
} from "@univer/cowork";

import type { OpenTarget } from "./open-target";

export type UniverArtifactHeaderFileActionId = "download" | "reveal" | "close";

export interface UniverArtifactHeaderContentState {
  unitTitle: string;
  unitId?: string;
  scope?: CoworkContentScope;
  scopeLabel?: string;
  badges?: CoworkContentBadge[];
  editGate?: CoworkContentEditGate;
  actions?: CoworkContentAction[];
}

export interface UniverArtifactHeaderFileAction {
  id: UniverArtifactHeaderFileActionId;
  label: string;
  tooltip: string;
  tone: "secondary" | "panel";
}

export interface UniverArtifactHeaderBreadcrumbSegment {
  label: string;
}

export interface UniverArtifactHeaderUnitOption {
  unitId: string;
  label: string;
  kind: string;
  status?: CoworkReviewUnitStatus;
  selected: boolean;
  view: CoworkContentViewState;
}

export interface UniverArtifactHeaderWorktreeOption {
  id: string;
  label: string;
  description?: string;
  tooltip: string;
  selected: boolean;
  disabledReason?: string;
  view: CoworkContentViewState;
  unitOptions: UniverArtifactHeaderUnitOption[];
}

export interface UniverArtifactHeaderBreadcrumb {
  univerfile: UniverArtifactHeaderBreadcrumbSegment;
  unit?: UniverArtifactHeaderBreadcrumbSegment & { kind?: string };
}

export interface UniverArtifactHeaderViewModel {
  primaryTitle: string;
  secondaryTitle?: string;
  scopeLabel?: string;
  fileMetaLabel?: string;
  breadcrumb: UniverArtifactHeaderBreadcrumb;
  unitOptions: UniverArtifactHeaderUnitOption[];
  worktreeOptions: UniverArtifactHeaderWorktreeOption[];
  badges: CoworkContentBadge[];
  editGate?: CoworkContentEditGate;
  contentActions: CoworkContentAction[];
  fileActions: UniverArtifactHeaderFileAction[];
}

export interface DeriveUniverArtifactHeaderViewModelInput {
  target: OpenTarget;
  isRemoteWorkspace: boolean;
  fileSizeLabel?: string;
  contentState?: UniverArtifactHeaderContentState;
  currentView?: CoworkContentViewState | null;
  snapshot?: CoworkSnapshot | null;
  sessionWorktreeId?: string | null;
}

export function deriveUniverArtifactHeaderViewModel(
  input: DeriveUniverArtifactHeaderViewModelInput,
): UniverArtifactHeaderViewModel | null {
  if (input.target.preview !== "univer") {
    return null;
  }

  const contentTitle = input.contentState?.unitTitle.trim();
  const primaryTitle = contentTitle ? contentTitle : input.target.name;
  const secondaryTitle = contentTitle
    ? input.target.name
    : input.target.value !== input.target.name
      ? input.target.value
      : undefined;
  const fileMetaLabel = input.target.exists === false ? "missing" : input.fileSizeLabel;
  const breadcrumb = buildBreadcrumb(input);
  const unitOptions = buildUnitOptions(input);
  const worktreeOptions = buildWorktreeOptions(input);
  const contentActions = buildContentActions(input);

  return {
    primaryTitle,
    ...(secondaryTitle ? { secondaryTitle } : {}),
    ...(input.contentState?.scopeLabel ? { scopeLabel: input.contentState.scopeLabel } : {}),
    ...(fileMetaLabel ? { fileMetaLabel } : {}),
    breadcrumb,
    unitOptions,
    worktreeOptions,
    badges: input.contentState?.badges ?? [],
    ...(input.contentState?.editGate ? { editGate: input.contentState.editGate } : {}),
    contentActions,
    fileActions: fileActionsForTarget(input.target, input.isRemoteWorkspace),
  };
}

function buildBreadcrumb(input: DeriveUniverArtifactHeaderViewModelInput): UniverArtifactHeaderBreadcrumb {
  const snapshot = input.snapshot?.loadState === "ready" ? input.snapshot : null;
  const unitId = currentUnitIdForInput(input);
  const unit = unitId
    ? snapshot?.units.find((candidate) => candidate.unitId === unitId)
    : undefined;

  return {
    univerfile: { label: input.target.name },
    ...(unit ? { unit: { label: unit.displayName, kind: unit.kind } } : input.contentState?.unitTitle ? { unit: { label: input.contentState.unitTitle } } : {}),
  };
}

function buildUnitOptions(input: DeriveUniverArtifactHeaderViewModelInput): UniverArtifactHeaderUnitOption[] {
  const unitId = currentUnitIdForInput(input);
  if (!unitId) return [];

  const sourceView = input.currentView
    ? input.currentView
    : {
      scope: "trunk",
      unitId,
      trunkEditIntent: "auto",
    } satisfies CoworkContentViewState;
  return buildUnitOptionsForSource(input, sourceView);
}

function buildWorktreeOptions(
  input: DeriveUniverArtifactHeaderViewModelInput,
): UniverArtifactHeaderWorktreeOption[] {
  const unitId = currentUnitIdForInput(input);
  if (!unitId) return [];

  const options: UniverArtifactHeaderWorktreeOption[] = [];
  addWorktreeOption(options, worktreeOptionFor(input, {
    scope: "trunk",
    unitId,
    trunkEditIntent: input.currentView?.scope === "trunk"
      ? input.currentView.trunkEditIntent
      : "auto",
  }));

  if (input.snapshot?.loadState === "ready") {
    for (const worktree of input.snapshot.reviewableWorktrees) {
      addWorktreeOption(options, worktreeOptionFor(input, {
        scope: "worktree",
        worktreeId: worktree.worktreeId,
        unitId,
      }));
    }
    for (const worktree of input.snapshot.activeWorktrees) {
      addWorktreeOption(options, worktreeOptionFor(input, {
        scope: "worktree",
        worktreeId: worktree.worktreeId,
        unitId,
      }));
    }

    return options;
  }

  const fallbackWorktreeId = pendingWorktreeIdForInput(input);
  if (fallbackWorktreeId) {
    addWorktreeOption(options, worktreeOptionFor(input, {
      scope: "worktree",
      worktreeId: fallbackWorktreeId,
      unitId,
    }));
  }

  return options;
}

function buildContentActions(input: DeriveUniverArtifactHeaderViewModelInput): CoworkContentAction[] {
  const scope = input.currentView?.scope ?? input.contentState?.scope;
  const isPendingChangeView = scope === "worktree" || scope === "mergePreview";
  if (!isPendingChangeView) return [];

  return input.contentState?.actions ?? [];
}

function currentUnitIdForInput(
  input: DeriveUniverArtifactHeaderViewModelInput,
): string | undefined {
  const contentAction = input.contentState?.actions?.find((action) => action.type === "setContentScope");
  const fallbackUnit = input.snapshot?.loadState === "ready"
    ? input.snapshot.units[0]?.unitId
    : undefined;
  return input.currentView?.unitId ?? input.target.unitId ?? input.contentState?.unitId ?? contentAction?.target.unitId ?? fallbackUnit;
}

function pendingWorktreeIdForInput(
  input: DeriveUniverArtifactHeaderViewModelInput,
): string | undefined {
  if (input.currentView?.scope === "worktree" || input.currentView?.scope === "mergePreview") {
    return input.currentView.worktreeId;
  }
  const sessionWorktreeId = input.sessionWorktreeId?.trim();
  if (sessionWorktreeId) return sessionWorktreeId;
  if (input.target.worktreeId) return input.target.worktreeId;
  return firstVisibleWorktreeIdForInput(input);
}

function firstVisibleWorktreeIdForInput(
  input: DeriveUniverArtifactHeaderViewModelInput,
): string | undefined {
  if (input.snapshot?.loadState !== "ready") return undefined;

  const unitId = currentUnitIdForInput(input);
  const matchingReviewable = input.snapshot.reviewableWorktrees.find((worktree) => (
    worktree.status === "ready" &&
    (unitId === undefined || worktree.reviewSummary?.units.some((unit) => unit.unitId === unitId) === true)
  ));
  if (matchingReviewable) return matchingReviewable.worktreeId;

  const firstReviewable = input.snapshot.reviewableWorktrees.find((worktree) => worktree.status === "ready");
  if (firstReviewable) return firstReviewable.worktreeId;

  return input.snapshot.activeWorktrees[0]?.worktreeId;
}

function addWorktreeOption(
  options: UniverArtifactHeaderWorktreeOption[],
  option: UniverArtifactHeaderWorktreeOption,
) {
  if (options.some((candidate) => candidate.id === option.id)) return;
  options.push(option);
}

function worktreeOptionFor(
  input: DeriveUniverArtifactHeaderViewModelInput,
  view: CoworkContentViewState,
  actionSelected?: boolean,
  disabledReason?: string,
): UniverArtifactHeaderWorktreeOption {
  const copy = worktreeOptionCopy(input, view);
  const tooltip = disabledReason
    ? `${copy.tooltip} ${disabledReason}`
    : copy.tooltip;
  return {
    id: worktreeOptionId(view),
    label: copy.label,
    ...(copy.description ? { description: copy.description } : {}),
    tooltip,
    selected: worktreeOptionSelected(input, view, actionSelected),
    ...(disabledReason ? { disabledReason } : {}),
    view,
    unitOptions: buildUnitOptionsForSource(input, view),
  };
}

function buildUnitOptionsForSource(
  input: DeriveUniverArtifactHeaderViewModelInput,
  sourceView: CoworkContentViewState,
): UniverArtifactHeaderUnitOption[] {
  const currentUnitId = currentUnitIdForInput(input) ?? "";
  const rows = new Map<string, {
    unitId: string;
    label: string;
    kind: string;
    status?: CoworkReviewUnitStatus;
  }>();

  if (input.snapshot?.loadState === "ready") {
    for (const unit of input.snapshot.units) {
      rows.set(unit.unitId, {
        unitId: unit.unitId,
        label: unit.displayName,
        kind: unit.kind,
      });
    }

    if (sourceView.scope !== "trunk") {
      const worktree = worktreeForView(input, sourceView);
      if (worktree && "reviewSummary" in worktree && worktree.reviewSummary) {
        for (const unit of worktree.reviewSummary.units) {
          rows.set(unit.unitId, {
            unitId: unit.unitId,
            label: unit.displayName,
            kind: unit.kind,
            status: unit.status,
          });
        }
      }
    }
  }

  if (rows.size === 0 && input.contentState?.unitTitle) {
    rows.set(currentUnitId, {
      unitId: currentUnitId,
      label: input.contentState.unitTitle,
      kind: "sheet",
    });
  }

  return [...rows.values()].map((unit) => {
    const view = contentViewForUnit(sourceView, unit.unitId);
    return {
      ...unit,
      selected: unit.unitId === currentUnitId,
      view,
    };
  });
}

function contentViewForUnit(
  sourceView: CoworkContentViewState,
  unitId: string,
): CoworkContentViewState {
  if (sourceView.scope === "trunk") {
    return {
      scope: "trunk",
      unitId,
      trunkEditIntent: sourceView.trunkEditIntent,
    };
  }

  return {
    scope: sourceView.scope,
    worktreeId: sourceView.worktreeId,
    unitId,
  };
}

function worktreeOptionId(view: CoworkContentViewState): string {
  if (view.scope === "trunk") {
    return `trunk:${view.unitId}`;
  }
  return `${view.scope}:${view.worktreeId}:${view.unitId}`;
}

function worktreeOptionCopy(
  input: DeriveUniverArtifactHeaderViewModelInput,
  view: CoworkContentViewState,
): { label: string; description?: string; tooltip: string } {
  if (view.scope === "trunk") {
    return {
      label: "当前版本",
      description: "主线文件",
      tooltip: "查看主线当前版本。",
    };
  }

  const worktree = worktreeForView(input, view);
  const worktreeLabel = worktreeLabelForView(view.worktreeId, worktree);

  if (view.scope === "mergePreview") {
    return {
      label: `${worktreeLabel.label} 预览合入后`,
      description: worktreeLabel.description,
      tooltip: `预览 ${worktreeLabel.fullLabel} 合入当前版本后的结果。`,
    };
  }
  return {
    label: worktreeLabel.label,
    description: worktreeLabel.description,
    tooltip: `查看 ${worktreeLabel.fullLabel} 的修改内容。`,
  };
}

function worktreeForView(
  input: DeriveUniverArtifactHeaderViewModelInput,
  view: CoworkContentViewState,
) {
  if (view.scope === "trunk" || input.snapshot?.loadState !== "ready") return undefined;
  return (
    input.snapshot.reviewableWorktrees.find((worktree) => worktree.worktreeId === view.worktreeId) ??
    input.snapshot.activeWorktrees.find((worktree) => worktree.worktreeId === view.worktreeId)
  );
}

function worktreeLabelForView(
  worktreeId: string,
  worktree: { displayName: string; status: "ready" | "draft" } | undefined,
): { label: string; description: string; fullLabel: string } {
  const cleanName = worktree?.displayName.trim();
  const statusLabel = worktree?.status === "draft"
    ? "修改中"
    : worktree?.status === "ready"
      ? "可合入"
      : "Worktree";
  if (cleanName && cleanName !== worktreeId) {
    return {
      label: cleanName,
      description: `${statusLabel} · ${worktreeId}`,
      fullLabel: `${cleanName} (${worktreeId})`,
    };
  }
  return {
    label: worktreeId,
    description: `${statusLabel} · ${worktreeId}`,
    fullLabel: worktreeId,
  };
}

function worktreeOptionSelected(
  input: DeriveUniverArtifactHeaderViewModelInput,
  view: CoworkContentViewState,
  actionSelected?: boolean,
): boolean {
  if (input.currentView) {
    if (input.currentView.scope !== "trunk" && view.scope !== "trunk") {
      return input.currentView.worktreeId === view.worktreeId &&
        input.currentView.unitId === view.unitId;
    }
    return sameContentView(input.currentView, view);
  }
  if (actionSelected !== undefined) {
    return actionSelected;
  }
  return input.contentState?.scope === view.scope;
}

function sameContentView(
  left: CoworkContentViewState,
  right: CoworkContentViewState,
): boolean {
  if (left.scope !== right.scope) return false;
  if (left.unitId !== right.unitId) return false;
  if (left.scope === "trunk" && right.scope === "trunk") {
    return left.trunkEditIntent === right.trunkEditIntent;
  }
  if (left.scope !== "trunk" && right.scope !== "trunk") {
    return left.worktreeId === right.worktreeId;
  }
  return false;
}

function fileActionsForTarget(
  target: OpenTarget,
  isRemoteWorkspace: boolean,
): UniverArtifactHeaderFileAction[] {
  const actions: UniverArtifactHeaderFileAction[] = [];
  if (target.kind === "file") {
    actions.push({
      id: "download",
      label: "Download artifact",
      tooltip: "Download artifact",
      tone: "secondary",
    });
    if (!isRemoteWorkspace) {
      actions.push({
        id: "reveal",
        label: "Show in folder",
        tooltip: "Show in folder",
        tone: "secondary",
      });
    }
  }
  actions.push({
    id: "close",
    label: "Close artifact",
    tooltip: "Close artifact",
    tone: "panel",
  });
  return actions;
}
