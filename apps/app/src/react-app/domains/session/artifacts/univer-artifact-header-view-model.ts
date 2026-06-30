import type { CoworkContentAction, CoworkContentBadge, CoworkContentEditGate } from "@univer/cowork";

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

export interface UniverArtifactHeaderViewModel {
  primaryTitle: string;
  secondaryTitle?: string;
  scopeLabel?: string;
  fileMetaLabel?: string;
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

  return {
    primaryTitle,
    ...(secondaryTitle ? { secondaryTitle } : {}),
    ...(input.contentState?.scopeLabel ? { scopeLabel: input.contentState.scopeLabel } : {}),
    ...(fileMetaLabel ? { fileMetaLabel } : {}),
    badges: input.contentState?.badges ?? [],
    ...(input.contentState?.editGate ? { editGate: input.contentState.editGate } : {}),
    contentActions: input.contentState?.actions ?? [],
    fileActions: fileActionsForTarget(input.target, input.isRemoteWorkspace),
  };
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
