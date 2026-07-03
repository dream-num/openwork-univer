import type {
  CoworkContentAction,
  CoworkContentBadge,
  CoworkContentEditGate,
  CoworkContentScope,
  CoworkContentViewState,
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
  selected: boolean;
  view: CoworkContentViewState;
}

export interface UniverArtifactHeaderContentViewOption {
  id: string;
  label: string;
  tooltip: string;
  selected: boolean;
  disabledReason?: string;
  view: CoworkContentViewState;
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
  contentViewOptions: UniverArtifactHeaderContentViewOption[];
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
  const contentViewOptions = buildContentViewOptions(input);
  const contentActions = buildContentActions(input);

  return {
    primaryTitle,
    ...(secondaryTitle ? { secondaryTitle } : {}),
    ...(input.contentState?.scopeLabel ? { scopeLabel: input.contentState.scopeLabel } : {}),
    ...(fileMetaLabel ? { fileMetaLabel } : {}),
    breadcrumb,
    unitOptions,
    contentViewOptions,
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
  if (input.snapshot?.loadState !== "ready") return [];
  const currentUnitId = currentUnitIdForInput(input) ?? "";

  return input.snapshot.units.map((unit) => {
    const view = input.currentView && input.currentView.scope !== "trunk"
      ? {
        scope: input.currentView.scope,
        worktreeId: input.currentView.worktreeId,
        unitId: unit.unitId,
      } satisfies CoworkContentViewState
      : {
        scope: "trunk",
        unitId: unit.unitId,
        trunkEditIntent: "auto",
      } satisfies CoworkContentViewState;
    return {
      unitId: unit.unitId,
      label: unit.displayName,
      kind: unit.kind,
      selected: unit.unitId === currentUnitId,
      view,
    };
  });
}

function buildContentViewOptions(
  input: DeriveUniverArtifactHeaderViewModelInput,
): UniverArtifactHeaderContentViewOption[] {
  const unitId = currentUnitIdForInput(input);
  if (!unitId) return [];

  const options: UniverArtifactHeaderContentViewOption[] = [];
  addContentViewOption(options, contentViewOptionFor(input, {
    scope: "trunk",
    unitId,
    trunkEditIntent: input.currentView?.scope === "trunk"
      ? input.currentView.trunkEditIntent
      : "auto",
  }));

  for (const action of input.contentState?.actions ?? []) {
    if (action.type !== "setContentScope") continue;
    addContentViewOption(
      options,
      contentViewOptionFor(input, action.target, action.selected, action.disabledReason),
    );
  }

  const fallbackWorktreeId = pendingWorktreeIdForInput(input);
  if (!fallbackWorktreeId) return options;

  const reviewableWorktree = input.snapshot?.loadState === "ready"
    ? input.snapshot.reviewableWorktrees.find((worktree) => worktree.worktreeId === fallbackWorktreeId)
    : undefined;
  const activeWorktree = input.snapshot?.loadState === "ready"
    ? input.snapshot.activeWorktrees.find((worktree) => worktree.worktreeId === fallbackWorktreeId)
    : undefined;
  const canShowOriginal = Boolean(
    reviewableWorktree?.status === "ready" ||
      activeWorktree ||
      (input.currentView?.scope === "worktree" && input.currentView.worktreeId === fallbackWorktreeId),
  );

  if (canShowOriginal) {
    addContentViewOption(options, contentViewOptionFor(input, {
      scope: "worktree",
      worktreeId: fallbackWorktreeId,
      unitId,
    }));
  }

  const canShowMergePreview = Boolean(
    input.currentView?.scope === "mergePreview" ||
      reviewableWorktree?.reviewSummary?.diverged === true,
  );

  if (canShowMergePreview) {
    addContentViewOption(options, contentViewOptionFor(input, {
      scope: "mergePreview",
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

  return (input.contentState?.actions ?? []).filter((action) => (
    action.type === "mergeWorktree" || action.type === "discardWorktree"
  ));
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
  return sessionWorktreeId || input.target.worktreeId;
}

function addContentViewOption(
  options: UniverArtifactHeaderContentViewOption[],
  option: UniverArtifactHeaderContentViewOption,
) {
  if (options.some((candidate) => candidate.id === option.id)) return;
  options.push(option);
}

function contentViewOptionFor(
  input: DeriveUniverArtifactHeaderViewModelInput,
  view: CoworkContentViewState,
  actionSelected?: boolean,
  disabledReason?: string,
): UniverArtifactHeaderContentViewOption {
  const copy = contentViewCopy(view);
  return {
    id: contentViewOptionId(view),
    label: copy.label,
    tooltip: copy.tooltip,
    selected: contentViewSelected(input, view, actionSelected),
    ...(disabledReason ? { disabledReason } : {}),
    view,
  };
}

function contentViewOptionId(view: CoworkContentViewState): string {
  if (view.scope === "trunk") {
    return `trunk:${view.unitId}`;
  }
  return `${view.scope}:${view.worktreeId}:${view.unitId}`;
}

function contentViewCopy(view: CoworkContentViewState): { label: string; tooltip: string } {
  if (view.scope === "trunk") {
    return {
      label: "当前版本",
      tooltip: "查看 Univerfile 的当前版本。",
    };
  }
  if (view.scope === "mergePreview") {
    return {
      label: "合并后",
      tooltip: "预览这些修改合入当前版本后的结果。",
    };
  }
  return {
    label: "原始修改",
    tooltip: "查看任务原本产生的修改。",
  };
}

function contentViewSelected(
  input: DeriveUniverArtifactHeaderViewModelInput,
  view: CoworkContentViewState,
  actionSelected?: boolean,
): boolean {
  if (input.currentView) {
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
