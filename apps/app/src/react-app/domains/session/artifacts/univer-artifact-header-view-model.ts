import type {
  CoworkContentAction,
  CoworkContentBadge,
  CoworkContentEditGate,
  CoworkContentViewState,
  CoworkSnapshot,
} from "@univer/cowork";

import type { OpenTarget } from "./open-target";

export type UniverArtifactHeaderFileActionId = "download" | "reveal" | "close";

export interface UniverArtifactHeaderContentState {
  unitTitle: string;
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

export interface UniverArtifactHeaderWorktreeOption {
  id: string;
  label: string;
  stateLabel?: string;
  selected: boolean;
  tooltip?: string;
  view: CoworkContentViewState;
}

export interface UniverArtifactHeaderWorktreeGroup {
  label: "Current version" | "This session" | "Other sessions";
  options: UniverArtifactHeaderWorktreeOption[];
}

export interface UniverArtifactHeaderBreadcrumb {
  univerfile: UniverArtifactHeaderBreadcrumbSegment;
  unit?: UniverArtifactHeaderBreadcrumbSegment & { kind?: string };
  worktree?: UniverArtifactHeaderBreadcrumbSegment & { stateLabel?: string };
}

export interface UniverArtifactHeaderViewModel {
  primaryTitle: string;
  secondaryTitle?: string;
  scopeLabel?: string;
  fileMetaLabel?: string;
  breadcrumb: UniverArtifactHeaderBreadcrumb;
  unitOptions: UniverArtifactHeaderUnitOption[];
  worktreeGroups: UniverArtifactHeaderWorktreeGroup[];
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
  worktreeOwnerTitles?: Record<string, string>;
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
  const worktreeGroups = buildWorktreeGroups(input);

  return {
    primaryTitle,
    ...(secondaryTitle ? { secondaryTitle } : {}),
    ...(input.contentState?.scopeLabel ? { scopeLabel: input.contentState.scopeLabel } : {}),
    ...(fileMetaLabel ? { fileMetaLabel } : {}),
    breadcrumb,
    unitOptions,
    worktreeGroups,
    badges: input.contentState?.badges ?? [],
    ...(input.contentState?.editGate ? { editGate: input.contentState.editGate } : {}),
    contentActions: input.contentState?.actions ?? [],
    fileActions: fileActionsForTarget(input.target, input.isRemoteWorkspace),
  };
}

function buildBreadcrumb(input: DeriveUniverArtifactHeaderViewModelInput): UniverArtifactHeaderBreadcrumb {
  const snapshot = input.snapshot?.loadState === "ready" ? input.snapshot : null;
  const unitId = input.currentView?.unitId ?? input.target.unitId;
  const unit = unitId
    ? snapshot?.units.find((candidate) => candidate.unitId === unitId)
    : undefined;
  const worktree = input.currentView && input.currentView.scope !== "trunk"
    ? findWorktree(snapshot, input.currentView.worktreeId)
    : null;
  const worktreeStateLabel = input.currentView?.scope === "trunk"
    ? undefined
    : worktree
      ? stateLabelForWorktree(worktree.kind, worktree.hasConflict)
      : undefined;
  const worktreeLabel = input.currentView?.scope === "trunk"
    ? "Current version"
    : input.currentView?.scope === "worktree"
      ? worktreeLabelFor(input, input.currentView.worktreeId, worktree?.displayName ?? input.contentState?.scopeLabel ?? "Worktree")
      : worktree?.displayName ?? input.contentState?.scopeLabel ?? "Worktree";

  return {
    univerfile: { label: input.target.name },
    ...(unit ? { unit: { label: unit.displayName, kind: unit.kind } } : input.contentState?.unitTitle ? { unit: { label: input.contentState.unitTitle } } : {}),
    ...(input.currentView ? { worktree: { label: worktreeLabel, ...(worktreeStateLabel ? { stateLabel: worktreeStateLabel } : {}) } } : {}),
  };
}

function buildUnitOptions(input: DeriveUniverArtifactHeaderViewModelInput): UniverArtifactHeaderUnitOption[] {
  if (input.snapshot?.loadState !== "ready") return [];
  const currentUnitId = input.currentView?.unitId ?? input.target.unitId ?? input.snapshot.units[0]?.unitId ?? "";

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

function buildWorktreeGroups(input: DeriveUniverArtifactHeaderViewModelInput): UniverArtifactHeaderWorktreeGroup[] {
  if (input.snapshot?.loadState !== "ready") return [];
  const unitId = input.currentView?.unitId ?? input.target.unitId ?? input.snapshot.units[0]?.unitId;
  if (!unitId) return [];

  const currentWorktreeId = input.currentView?.scope !== "trunk" ? input.currentView?.worktreeId : undefined;
  const currentOption: UniverArtifactHeaderWorktreeOption = {
    id: "current-version",
    label: "Current version",
    selected: input.currentView?.scope === "trunk",
    view: {
      scope: "trunk",
      unitId,
      trunkEditIntent: "auto",
    },
  };

  const sessionWorktreeId = input.sessionWorktreeId?.trim();
  const worktrees = [
    ...input.snapshot.reviewableWorktrees.map((worktree) => ({
      id: worktree.worktreeId,
      displayName: worktree.displayName,
      kind: "reviewable",
      hasConflict: Boolean(worktree.reviewSummary?.counts.conflict),
    })),
    ...input.snapshot.activeWorktrees.map((worktree) => ({
      id: worktree.worktreeId,
      displayName: worktree.displayName,
      kind: "active",
      hasConflict: false,
    })),
  ];
  const uniqueWorktrees = worktrees.filter((worktree, index, list) => (
    list.findIndex((candidate) => candidate.id === worktree.id) === index
  ));
  const optionForWorktree = (worktree: typeof uniqueWorktrees[number]): UniverArtifactHeaderWorktreeOption => ({
    id: `worktree:${worktree.id}`,
    label: worktreeLabelFor(input, worktree.id, worktree.displayName),
    stateLabel: stateLabelForWorktree(worktree.kind, worktree.hasConflict),
    selected: currentWorktreeId === worktree.id,
    tooltip: worktree.id,
    view: {
      scope: "worktree",
      worktreeId: worktree.id,
      unitId,
    },
  });
  const thisSessionOptions = sessionWorktreeId
    ? uniqueWorktrees.filter((worktree) => worktree.id === sessionWorktreeId).map(optionForWorktree)
    : [];
  const otherSessionOptions = uniqueWorktrees
    .filter((worktree) => !sessionWorktreeId || worktree.id !== sessionWorktreeId)
    .map(optionForWorktree);

  return [
    { label: "Current version", options: [currentOption] },
    ...(thisSessionOptions.length ? [{ label: "This session", options: thisSessionOptions } satisfies UniverArtifactHeaderWorktreeGroup] : []),
    ...(otherSessionOptions.length ? [{ label: "Other sessions", options: otherSessionOptions } satisfies UniverArtifactHeaderWorktreeGroup] : []),
  ];
}

function worktreeLabelFor(
  input: DeriveUniverArtifactHeaderViewModelInput,
  worktreeId: string,
  fallback: string,
): string {
  const ownerTitle = input.worktreeOwnerTitles?.[worktreeId]?.trim();
  return ownerTitle || fallback;
}

function findWorktree(
  snapshot: CoworkSnapshot | null,
  worktreeId: string,
): { displayName: string; kind: "active" | "reviewable"; hasConflict: boolean } | null {
  const reviewable = snapshot?.reviewableWorktrees.find((worktree) => worktree.worktreeId === worktreeId);
  if (reviewable) {
    return {
      displayName: reviewable.displayName,
      kind: "reviewable",
      hasConflict: Boolean(reviewable.reviewSummary?.counts.conflict),
    };
  }
  const active = snapshot?.activeWorktrees.find((worktree) => worktree.worktreeId === worktreeId);
  return active ? { displayName: active.displayName, kind: "active", hasConflict: false } : null;
}

function stateLabelForWorktree(kind: "active" | "reviewable" | string, hasConflict: boolean): string {
  if (hasConflict) return "Conflict";
  return kind === "active" ? "Working" : "Ready";
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
