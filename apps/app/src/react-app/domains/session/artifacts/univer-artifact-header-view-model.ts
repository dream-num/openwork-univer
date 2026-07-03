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

export type UniverArtifactHeaderWorktreeRelation = "currentVersion" | "currentTask" | "otherTask";

export type UniverArtifactHeaderWorktreeOwnership = {
  relation: Exclude<UniverArtifactHeaderWorktreeRelation, "currentVersion">;
  ownerSessionId?: string;
  ownerSessionTitle?: string;
};

export interface UniverArtifactHeaderWorktreeOption {
  id: string;
  label: string;
  groupLabel: string;
  relation: UniverArtifactHeaderWorktreeRelation;
  description?: string;
  tooltip: string;
  selected: boolean;
  disabledReason?: string;
  ownerSessionId?: string;
  ownerSessionTitle?: string;
  view: CoworkContentViewState;
  unitOptions: UniverArtifactHeaderUnitOption[];
}

export type UniverArtifactHeaderBridgeAction =
  | {
      type: "openPendingWorktree";
      label: string;
      tooltip: string;
      target: CoworkContentViewState;
      ownerSessionId?: string;
      ownerSessionTitle?: string;
    }
  | {
      type: "openOwningTask";
      label: string;
      tooltip: string;
      ownerSessionId: string;
      ownerSessionTitle?: string;
      target?: CoworkContentViewState;
    };

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
  bridgeActions: UniverArtifactHeaderBridgeAction[];
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
  worktreeOwnershipById?: Record<string, UniverArtifactHeaderWorktreeOwnership>;
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
  const bridgeActions = buildBridgeActions(input, worktreeOptions);
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
    bridgeActions,
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

    return sortWorktreeOptions(options);
  }

  const fallbackWorktreeId = pendingWorktreeIdForInput(input);
  if (fallbackWorktreeId) {
    addWorktreeOption(options, worktreeOptionFor(input, {
      scope: "worktree",
      worktreeId: fallbackWorktreeId,
      unitId,
    }));
  }

  return sortWorktreeOptions(options);
}

function buildContentActions(input: DeriveUniverArtifactHeaderViewModelInput): CoworkContentAction[] {
  const scope = input.currentView?.scope ?? input.contentState?.scope;
  const isPendingChangeView = scope === "worktree" || scope === "mergePreview";
  if (!isPendingChangeView) return [];

  return (input.contentState?.actions ?? []).filter((action) => {
    if (action.type !== "mergeWorktree" && action.type !== "discardWorktree") {
      return true;
    }
    if (input.currentView?.scope === "trunk") return false;
    if (input.currentView && input.currentView.worktreeId !== action.worktreeId) {
      return false;
    }
    return worktreeRelationForId(input, action.worktreeId) !== "otherTask";
  });
}

function buildBridgeActions(
  input: DeriveUniverArtifactHeaderViewModelInput,
  worktreeOptions: UniverArtifactHeaderWorktreeOption[],
): UniverArtifactHeaderBridgeAction[] {
  const selectedWorktree = worktreeOptions.find((option) => option.selected) ?? worktreeOptions[0];
  const actions: UniverArtifactHeaderBridgeAction[] = [];

  if (selectedWorktree?.relation === "currentVersion") {
    const pendingWorktreeCount = input.contentState?.editGate?.pendingWorktreeCount ?? 0;
    const editGateStatus = input.contentState?.editGate?.status;
    const hasPendingGate =
      pendingWorktreeCount > 0 ||
      editGateStatus === "locked" ||
      editGateStatus === "editingWithPending";
    const currentTaskWorktree = worktreeOptions.find((option) => (
      option.relation === "currentTask" && option.view.scope !== "trunk"
    ));
    const pendingWorktree = currentTaskWorktree ?? pendingWorktreeOptionForInput(input, worktreeOptions);
    if (hasPendingGate && pendingWorktree) {
      const opensOwningTask = pendingWorktree.relation === "otherTask" && pendingWorktree.ownerSessionId;
      actions.push({
        type: "openPendingWorktree",
        label: "查看待处理",
        tooltip: opensOwningTask
          ? pendingWorktree.ownerSessionTitle
            ? `打开任务「${pendingWorktree.ownerSessionTitle}」查看这批修改。`
            : "打开所属任务查看这批修改。"
          : `查看「${pendingWorktree.label}」的待处理修改。`,
        target: pendingWorktree.view,
        ...(pendingWorktree.ownerSessionId ? { ownerSessionId: pendingWorktree.ownerSessionId } : {}),
        ...(pendingWorktree.ownerSessionTitle ? { ownerSessionTitle: pendingWorktree.ownerSessionTitle } : {}),
      });
    }
  }

  if (selectedWorktree?.relation === "otherTask" && selectedWorktree.ownerSessionId) {
    actions.push({
      type: "openOwningTask",
      label: "打开所属任务",
      tooltip: selectedWorktree.ownerSessionTitle
        ? `打开任务「${selectedWorktree.ownerSessionTitle}」处理这些修改。`
        : "打开所属任务处理这些修改。",
      ownerSessionId: selectedWorktree.ownerSessionId,
      ...(selectedWorktree.ownerSessionTitle ? { ownerSessionTitle: selectedWorktree.ownerSessionTitle } : {}),
      ...(selectedWorktree.view.scope === "trunk" ? {} : { target: selectedWorktree.view }),
    });
  }

  return actions;
}

function pendingWorktreeOptionForInput(
  input: DeriveUniverArtifactHeaderViewModelInput,
  worktreeOptions: UniverArtifactHeaderWorktreeOption[],
): UniverArtifactHeaderWorktreeOption | null {
  const pendingWorktreeId = pendingWorktreeIdForInput(input);
  if (!pendingWorktreeId) return null;
  return worktreeOptions.find((option) => (
    option.view.scope !== "trunk" && option.view.worktreeId === pendingWorktreeId
  )) ?? null;
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

function sortWorktreeOptions(
  options: UniverArtifactHeaderWorktreeOption[],
): UniverArtifactHeaderWorktreeOption[] {
  const relationOrder: Record<UniverArtifactHeaderWorktreeRelation, number> = {
    currentVersion: 0,
    currentTask: 1,
    otherTask: 2,
  };
  return [...options].sort((left, right) => {
    const relationDelta = relationOrder[left.relation] - relationOrder[right.relation];
    if (relationDelta !== 0) return relationDelta;
    return 0;
  });
}

function worktreeOptionFor(
  input: DeriveUniverArtifactHeaderViewModelInput,
  view: CoworkContentViewState,
  actionSelected?: boolean,
  disabledReason?: string,
): UniverArtifactHeaderWorktreeOption {
  const copy = worktreeOptionCopy(input, view);
  const ownership = worktreeOwnershipForView(input, view);
  const relation = ownership?.relation ?? "currentVersion";
  const tooltip = disabledReason
    ? `${copy.tooltip} ${disabledReason}`
    : copy.tooltip;
  return {
    id: worktreeOptionId(view),
    label: copy.label,
    groupLabel: worktreeGroupLabel(relation),
    relation,
    ...(copy.description ? { description: copy.description } : {}),
    tooltip,
    selected: worktreeOptionSelected(input, view, actionSelected),
    ...(disabledReason ? { disabledReason } : {}),
    ...(ownership?.ownerSessionId ? { ownerSessionId: ownership.ownerSessionId } : {}),
    ...(ownership?.ownerSessionTitle ? { ownerSessionTitle: ownership.ownerSessionTitle } : {}),
    view,
    unitOptions: buildUnitOptionsForSource(input, view),
  };
}

function worktreeGroupLabel(relation: UniverArtifactHeaderWorktreeRelation): string {
  if (relation === "currentVersion") return "当前版本";
  if (relation === "currentTask") return "当前任务";
  return "其他任务";
}

function worktreeOwnershipForView(
  input: DeriveUniverArtifactHeaderViewModelInput,
  view: CoworkContentViewState,
): {
  relation: UniverArtifactHeaderWorktreeRelation;
  ownerSessionId?: string;
  ownerSessionTitle?: string;
} | null {
  if (view.scope === "trunk") return { relation: "currentVersion" };
  const ownership = input.worktreeOwnershipById?.[view.worktreeId];
  if (ownership) return ownership;
  if (input.sessionWorktreeId?.trim() === view.worktreeId) {
    return { relation: "currentTask" };
  }
  return { relation: "otherTask" };
}

function worktreeRelationForId(
  input: DeriveUniverArtifactHeaderViewModelInput,
  worktreeId: string,
): Exclude<UniverArtifactHeaderWorktreeRelation, "currentVersion"> {
  const ownership = input.worktreeOwnershipById?.[worktreeId];
  if (ownership) return ownership.relation;
  return input.sessionWorktreeId?.trim() === worktreeId ? "currentTask" : "otherTask";
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
