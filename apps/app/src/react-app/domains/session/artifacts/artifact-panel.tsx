/** @jsxImportSource react */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, ExternalLink, FolderOpen, Loader2, Trash2, X } from "lucide-react";
import { buildCoworkContentSurface, type CoworkContentAction, type CoworkContentEditAction, type CoworkContentSurface, type CoworkContentViewState, type CoworkController } from "@univer/cowork";
import { useCoworkSnapshot } from "@univer/cowork/react";

import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import { getDesktopFileIcon, openDesktopPath, revealDesktopItemInDir } from "@/app/lib/desktop";
import { isElectronRuntime } from "@/app/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatFileSize } from "@/lib/utils";
import { type ArtifactPanelTab, usePanelTabStore } from "../panel/panel-tab-store";
import { isCollectibleArtifactTarget, type BinaryData, type Data, type OpenTarget, type TextData } from "./open-target";
import { HTMLPreview, ImagePreview, MarkdownPreview, PdfPreview, PlainText, PreviewError, PreviewLoading, PreviewUnavailable } from "./preview";
import {
  buildUniverEmbeddedViewerUrl,
  contentViewFromTarget,
  isUniverTarget,
  sameContentView,
  targetFromSelection,
  type UniverTarget,
  useUniverCoworkSession,
} from "./univer-cowork-session";
import {
  deriveUniverArtifactHeaderViewModel,
  type UniverArtifactHeaderFileActionId,
  type UniverArtifactHeaderViewModel,
} from "./univer-artifact-header-view-model";
import type { UniverOpenSurface } from "./univer-surface";

const ArtifactTextEditor = lazy(() =>
  import("./artifact-text-editor").then((module) => ({ default: module.ArtifactTextEditor })),
);
const ArtifactSpreadsheetEditor = lazy(() =>
  import("./artifact-spreadsheet-editor").then((module) => ({ default: module.ArtifactSpreadsheetEditor })),
);

const EMPTY_TRANSCRIPT_TARGETS: OpenTarget[] = [];
const UNIVER_ARTIFACT_ACTIVE_EVENT = "openwork-univer-artifact-active";

type ArtifactPanelProps = {
  sessionId: string;
  tab: ArtifactPanelTab;
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  workspaceRoot: string;
  isRemoteWorkspace?: boolean;
  onClose: () => void;
};

type ArtifactPanelViewProps = {
  sessionId: string;
  client: OpenworkServerClient;
  workspaceId: string;
  workspaceRoot: string;
  isRemoteWorkspace?: boolean;
  target: OpenTarget;
  onClose: () => void;
};

type ArtifactQueryState =
  | (TextData & { updatedAt: number | null })
  | (BinaryData & { contentType: string | null; updatedAt: number | null });

type SaveArtifactInput = Data & { baseUpdatedAt: number | null };

function absoluteWorkspacePath(root: string, path: string) {
  const cleanRoot = root.trim().replace(/[/\\]+$/, "");
  const cleanPath = path.trim().replace(/^\.\//, "");
  
  return cleanRoot ? `${cleanRoot}/${cleanPath}` : cleanPath;
}

function isTextContent(target: OpenTarget): boolean {
  return ["markdown", "text", "sheet", "html"].includes(target.preview) && !/\.(xlsx|xls|ods)$/i.test(target.value);
}

export function ArtifactPanel({ sessionId, tab, client, workspaceId, workspaceRoot, isRemoteWorkspace = false, onClose }: ArtifactPanelProps) {
  const transcriptTargets = usePanelTabStore((state) => state.transcriptArtifactTargets[sessionId] ?? EMPTY_TRANSCRIPT_TARGETS);
  const artifactTargets = useMemo(() => transcriptTargets.filter(isCollectibleArtifactTarget), [transcriptTargets]);
  const target = artifactTargets.find((item) => item.id === tab.id) ?? null;

  if (!target || !client || !workspaceId) {
    return null;
  }

  return (
    <ArtifactPanelView
      sessionId={sessionId}
      client={client}
      workspaceId={workspaceId}
      workspaceRoot={workspaceRoot}
      isRemoteWorkspace={isRemoteWorkspace}
      target={target}
      onClose={onClose}
    />
  );
}

function ArtifactPanelView({ sessionId, client, workspaceId, workspaceRoot, isRemoteWorkspace = false, target, onClose }: ArtifactPanelViewProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const isDirectTextEdit = isTextContent(target) && target.preview === "markdown";
  const externalPath = useMemo(() => target.kind === "file" ? absoluteWorkspacePath(workspaceRoot, target.value) : target.value, [target.kind, target.value, workspaceRoot]);

  useEffect(() => {
    if (target.preview !== "univer") return;
    window.dispatchEvent(new CustomEvent(UNIVER_ARTIFACT_ACTIVE_EVENT, {
      detail: { targetId: target.id },
    }));
  }, [target.id, target.preview]);

  const { data: fileIcon } = useQuery<string | null>({
    queryKey: ["desktop-file-icon", externalPath] as const,
    queryFn: async () => getDesktopFileIcon(externalPath, "small"),
    enabled: target.kind === "file" && !isRemoteWorkspace && isElectronRuntime(),
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });

  const { data, error, isError, isLoading } = useQuery<ArtifactQueryState>({
    queryKey: ["artifact-panel", workspaceId, target.id] as const,
    queryFn: async () => {
      if (target.preview === "univer") {
        throw new Error("Univer artifacts open through the embedded Univer surface.");
      }
      if (target.kind === "url") {
        throw new Error("URLs open in browser tabs.");
      }
      else if (target.exists === false) {
        throw new Error("File not found in this workspace.");
      }

      if (isTextContent(target)) {
        const result = await client.readWorkspaceFile(workspaceId, target.value);
        
        return { kind: "text", data: result.content, updatedAt: result.updatedAt ?? null };
      }

      const result = await client.downloadWorkspaceFile(workspaceId, target.value);

      return { kind: "binary", data: result.data, contentType: result.contentType, updatedAt: target.updatedAt ?? null };
    },
    enabled: target.preview !== "univer",
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const [binaryObjectUrl, setBinaryObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!data || data.kind !== "binary") {
      setBinaryObjectUrl(null);

      return;
    }

    const fallbackType = target.preview === "pdf" ? "application/pdf" : "application/octet-stream";
    const url = URL.createObjectURL(new Blob([data.data], { type: data.contentType ?? fallbackType }));

    setBinaryObjectUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [data, target.preview]);

  useEffect(() => {
    setEditing(false);
    setDraft("");
  }, [target.id, workspaceId]);

  useEffect(() => {
    if (data?.kind === "text") {
      setDraft(data.data);
    }
  }, [data]);

  const { mutate, mutateAsync, isPending: isSaving } = useMutation({
    mutationFn: async (input: SaveArtifactInput) => {
      if (target.kind !== "file") {
        throw new Error("Cannot save non-file artifact.");
      }

      if (input.kind === "text") {
        return client.writeWorkspaceFile(workspaceId, { path: target.value, content: input.data, baseUpdatedAt: input.baseUpdatedAt });
      }

      return client.writeWorkspaceBinaryFile(workspaceId, { path: target.value, data: input.data, baseUpdatedAt: input.baseUpdatedAt });
    },
    onSuccess: (result, input) => {
      queryClient.setQueryData<ArtifactQueryState>(
        ["artifact-panel", workspaceId, target.id] as const,
        input.kind === "text"
          ? { kind: "text", data: input.data, updatedAt: result.updatedAt ?? null }
          : { kind: "binary", data: input.data, contentType: data?.kind === "binary" ? data.contentType : null, updatedAt: result.updatedAt ?? null },
      );

      if (input.kind === "text") {
        setDraft(input.data);
      }
    },
  });

  const download = async () => {
    if (target.kind === "url") {
      return;
    }
    
    const result = await client.downloadWorkspaceFile(workspaceId, target.value);
    const url = URL.createObjectURL(new Blob([result.data], { type: result.contentType ?? "application/octet-stream" }));
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = target.name;
    anchor.click();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openExternal = async () => {
    if (target.kind === "url") {
      window.open(target.value, "_blank", "noopener,noreferrer");

      return;
    }
    else if (!isRemoteWorkspace) {
      try {
        await openDesktopPath(externalPath);
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Could not open this file.");
      }

      return;
    }

    await download();
  };

  const revealExternal = async () => {
    if (target.kind !== "file" || isRemoteWorkspace) return;
    try {
      await revealDesktopItemInDir(externalPath);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not show this file in your file manager.");
    }
  };

  const save = () => {
    if (target.kind !== "file" || !isTextContent(target) || data?.kind !== "text") {
      return;
    }

    mutate(
      {
        kind: "text",
        data: draft,
        baseUpdatedAt: data.updatedAt,
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  const saveSpreadsheetContent = async (payload: Data) => {
    if (target.kind !== "file") {
      return;
    }

    await mutateAsync({
      ...payload,
      baseUpdatedAt: data?.kind === payload.kind ? data.updatedAt : target.updatedAt ?? null,
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {isUniverTarget(target) ? (
        <UniverArtifactWorkspace
          sessionId={sessionId}
          client={client}
          workspaceId={workspaceId}
          target={target}
          fileIcon={fileIcon}
          isRemoteWorkspace={isRemoteWorkspace}
          onDownload={download}
          onReveal={revealExternal}
          onClose={onClose}
        />
      ) : (
        <>
          <ArtifactPanelHeader
            target={target}
            data={data}
            fileIcon={fileIcon}
            editing={editing}
            draft={draft}
            isSaving={isSaving}
            isDirectTextEdit={isDirectTextEdit}
            isRemoteWorkspace={isRemoteWorkspace}
            onEdit={() => setEditing(true)}
            onDiscard={() => {
              if (data?.kind === "text") {
                setDraft(data.data);
              }
              setEditing(false);
            }}
            onSave={save}
            onDownload={download}
            onReveal={revealExternal}
            onOpenExternal={openExternal}
            onClose={onClose}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            {isLoading || (data?.kind === "binary" && !binaryObjectUrl) ? (
              <PreviewLoading />
            ) : isError ? (
              <PreviewError message={error instanceof Error ? error.message : "Failed to load artifact" } />
            ) : data?.kind === "text" && (editing || isDirectTextEdit) ? (
              <TextEditor value={draft} language={target.preview === "markdown" ? "markdown" : "text"} onChange={setDraft} />
            ) : target.preview === "markdown" && data?.kind === "text" ? (
              <MarkdownPreview content={data.data} />
            ) : target.preview === "sheet" ? (
              <SheetEditor
                name={target.name}
                content={data ?? { kind: "binary", data: new ArrayBuffer(0) }}
                saving={isSaving}
                onSave={saveSpreadsheetContent}
              />
            ) : target.preview === "html" && data?.kind === "text" ? (
              <HTMLPreview type="text" title={target.name} content={data.data} />
            ) : target.preview === "image" && data?.kind === "binary" && binaryObjectUrl ? (
              <ImagePreview src={binaryObjectUrl} alt={target.name} />
            ) : target.preview === "pdf" && data?.kind === "binary" && binaryObjectUrl ? (
              <PdfPreview url={binaryObjectUrl} title={target.name} />
            ) : data?.kind === "binary" && binaryObjectUrl && target.preview === "html" ? (
              <HTMLPreview type="binary" title={target.name} url={binaryObjectUrl} />
            ) : data?.kind === "text" ? (
              <PlainText content={data.data} />
            ) : (
              <PreviewUnavailable />
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface ArtifactPanelHeaderProps {
  target: OpenTarget;
  data: ArtifactQueryState | undefined;
  fileIcon: string | null | undefined;
  editing: boolean;
  draft: string;
  isSaving: boolean;
  isDirectTextEdit: boolean;
  isRemoteWorkspace: boolean;
  onEdit: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onDownload: () => void | Promise<void>;
  onReveal: () => void | Promise<void>;
  onOpenExternal: () => void | Promise<void>;
  onClose: () => void;
}

export function ArtifactPanelHeader({
  target,
  data,
  fileIcon,
  editing,
  draft,
  isSaving,
  isDirectTextEdit,
  isRemoteWorkspace,
  onEdit,
  onDiscard,
  onSave,
  onDownload,
  onReveal,
  onOpenExternal,
  onClose,
}: ArtifactPanelHeaderProps) {
  return (
    <div className="shrink-0 border-b border-border bg-background mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
      <div className="flex h-10 items-center gap-2 pe-2 ps-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {fileIcon ? (
            <img src={fileIcon} alt="" className="h-4 w-4 shrink-0 object-contain" />
          ) : null}
          <h3 className="min-w-0 truncate text-sm font-medium text-foreground">
            {target.name}
          </h3>
          <span className="shrink-0 text-xs text-muted-foreground">
            {target.exists === false ? "missing" : target.size !== undefined ? `${formatFileSize(target.size)}` : ""}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isTextContent(target) && data?.kind === "text" ? (
            editing || isDirectTextEdit ? (
              <>
                <Tooltip>
                  <TooltipTrigger
                    render={(
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onDiscard}
                        disabled={isSaving}
                      >
                        Discard
                      </Button>
                    )}
                  />
                  <TooltipContent>Discard changes</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={(
                      <Button variant="default" size="sm" onClick={() => void onSave()} disabled={isSaving || draft === data.data}>{isSaving ? "Saving" : "Save"}</Button>
                    )}
                  />
                  <TooltipContent>Save changes</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
                  )}
                />
                <TooltipContent>Edit artifact</TooltipContent>
              </Tooltip>
            )
          ) : null}
          {target.kind === "file" ? (
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Button variant="ghost" size="icon-sm" onClick={() => void onDownload()} aria-label="Download artifact">
                    <Download />
                  </Button>
                )}
              />
              <TooltipContent>Download artifact</TooltipContent>
            </Tooltip>
          ) : null}
          {target.kind === "file" && !isRemoteWorkspace ? (
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Button variant="ghost" size="icon-sm" onClick={() => void onReveal()} aria-label="Show in folder">
                    <FolderOpen />
                  </Button>
                )}
              />
              <TooltipContent>Show in folder</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={(
                <Button variant="ghost" size="icon-sm" onClick={() => void onOpenExternal()} aria-label={isRemoteWorkspace ? "Download artifact" : "Open externally"}>
                  <ExternalLink />
                </Button>
              )}
            />
            <TooltipContent>{isRemoteWorkspace ? "Download artifact" : "Open externally"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={(
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close artifact">
                  <X />
                </Button>
              )}
            />
            <TooltipContent>Close artifact</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

interface UniverArtifactWorkspaceProps {
  sessionId: string;
  client: OpenworkServerClient;
  workspaceId: string;
  target: UniverTarget;
  fileIcon: string | null | undefined;
  isRemoteWorkspace: boolean;
  onDownload: () => void | Promise<void>;
  onReveal: () => void | Promise<void>;
  onClose: () => void;
}

function UniverArtifactWorkspace({
  sessionId,
  client,
  workspaceId,
  target,
  fileIcon,
  isRemoteWorkspace,
  onDownload,
  onReveal,
  onClose,
}: UniverArtifactWorkspaceProps) {
  const { controller, error, isError, isLoading, surface } = useUniverCoworkSession({
    client,
    workspaceId,
    target,
    isRemoteWorkspace,
  });

  if (controller && surface) {
    return (
      <UniverArtifactWorkspaceContent
        sessionId={sessionId}
        controller={controller}
        surface={surface}
        target={target}
        fileIcon={fileIcon}
        isRemoteWorkspace={isRemoteWorkspace}
        onDownload={onDownload}
        onReveal={onReveal}
        onClose={onClose}
      />
    );
  }

  return (
    <>
      <UniverArtifactHeader
        target={target}
        fileIcon={fileIcon}
        isRemoteWorkspace={isRemoteWorkspace}
        onDownload={onDownload}
        onReveal={onReveal}
        onClose={onClose}
      />
      <UniverCollabSurface
        target={target}
        surface={surface}
        error={error}
        isError={isError}
        isLoading={isLoading}
      />
    </>
  );
}

interface UniverArtifactWorkspaceContentProps {
  sessionId: string;
  controller: CoworkController;
  surface: UniverOpenSurface;
  target: UniverTarget;
  fileIcon: string | null | undefined;
  isRemoteWorkspace: boolean;
  onDownload: () => void | Promise<void>;
  onReveal: () => void | Promise<void>;
  onClose: () => void;
}

function UniverArtifactWorkspaceContent({
  sessionId,
  controller,
  surface,
  target,
  fileIcon,
  isRemoteWorkspace,
  onDownload,
  onReveal,
  onClose,
}: UniverArtifactWorkspaceContentProps) {
  const snapshot = useCoworkSnapshot(controller);
  const [contentView, setContentView] = useState<CoworkContentViewState | null>(null);

  useEffect(() => {
    if (snapshot.loadState !== "ready" || !target.worktreeId) return;
    const reviewable = snapshot.reviewableWorktrees.find((worktree) => worktree.worktreeId === target.worktreeId);
    if (!reviewable || reviewable.reviewSummary) return;
    void controller.loadReviewSummary(target.worktreeId);
  }, [controller, snapshot.loadState, snapshot.reviewableWorktrees, target.worktreeId]);

  useEffect(() => {
    if (snapshot.loadState !== "ready") return;
    const nextView = contentViewFromTarget(snapshot, target, contentView);
    if (!sameContentView(contentView, nextView)) {
      setContentView(nextView);
    }
  }, [contentView, snapshot, target]);

  const contentSurface = contentView ? buildCoworkContentSurface(snapshot, contentView) : null;
  const viewerUrl = contentSurface?.viewerRequest
    ? buildUniverEmbeddedViewerUrl(surface, contentSurface.viewerRequest)
    : surface.url;

  const syncTargetRoute = (nextTarget: UniverTarget) => {
    const store = usePanelTabStore.getState();
    const currentTargets = store.transcriptArtifactTargets[sessionId] ?? [];

    store.syncTranscriptArtifacts(sessionId, [
      ...currentTargets.filter((item) => item.id !== nextTarget.id),
      nextTarget,
    ]);
    store.openTab(sessionId, {
      id: nextTarget.id,
      type: "artifact",
      label: nextTarget.name,
      preview: nextTarget.preview,
    });
    store.selectTab(sessionId, nextTarget.id);
  };

  const setContentViewAndRoute = (view: CoworkContentViewState) => {
    setContentView(view);
    if (view.scope === "trunk") {
      syncTargetRoute(targetFromSelection(target, { type: "unit", unitId: view.unitId }));
      return;
    }
    syncTargetRoute(targetFromSelection(target, { type: "reviewUnit", worktreeId: view.worktreeId, unitId: view.unitId }));
  };

  const setTrunkEditIntent = (intent: CoworkContentViewState & { scope: "trunk" }) => {
    setContentView(intent);
  };

  const mergeWorktree = async (worktreeId: string) => {
    try {
      const result = await controller.mergeWorktree(worktreeId);
      if (result.status === "merged" && contentView) {
        setContentViewAndRoute({
          scope: "trunk",
          unitId: contentView.unitId,
          trunkEditIntent: "auto",
        });
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not merge these changes.");
    }
  };

  const discardWorktree = async (worktreeId: string) => {
    try {
      await controller.discardWorktree(worktreeId);
      if (contentView) {
        setContentViewAndRoute({
          scope: "trunk",
          unitId: contentView.unitId,
          trunkEditIntent: "auto",
        });
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not discard these changes.");
    }
  };

  return (
    <>
      <UniverArtifactHeader
        target={target}
        fileIcon={fileIcon}
        isRemoteWorkspace={isRemoteWorkspace}
        contentSurface={contentSurface}
        onContentViewChange={setContentViewAndRoute}
        onRequestTrunkEdit={() => {
          if (contentView?.scope === "trunk") {
            setTrunkEditIntent({ ...contentView, trunkEditIntent: "forceEditing" });
          }
        }}
        onStopTrunkEdit={() => {
          if (contentView?.scope === "trunk") {
            setTrunkEditIntent({ ...contentView, trunkEditIntent: "auto" });
          }
        }}
        onMergeWorktree={mergeWorktree}
        onDiscardWorktree={discardWorktree}
        onDownload={onDownload}
        onReveal={onReveal}
        onClose={onClose}
      />
      <UniverCollabSurface
        target={target}
        surface={surface}
        error={null}
        isError={false}
        isLoading={false}
        viewerUrl={viewerUrl}
      />
    </>
  );
}

interface UniverArtifactHeaderProps {
  target: OpenTarget;
  fileIcon: string | null | undefined;
  isRemoteWorkspace: boolean;
  contentSurface?: CoworkContentSurface | null;
  onContentViewChange?: (view: CoworkContentViewState) => void;
  onRequestTrunkEdit?: () => void;
  onStopTrunkEdit?: () => void;
  onMergeWorktree?: (worktreeId: string) => void | Promise<void>;
  onDiscardWorktree?: (worktreeId: string) => void | Promise<void>;
  onDownload: () => void | Promise<void>;
  onReveal: () => void | Promise<void>;
  onClose: () => void;
}

export function UniverArtifactHeader({
  target,
  fileIcon,
  isRemoteWorkspace,
  contentSurface,
  onContentViewChange,
  onRequestTrunkEdit,
  onStopTrunkEdit,
  onMergeWorktree,
  onDiscardWorktree,
  onDownload,
  onReveal,
  onClose,
}: UniverArtifactHeaderProps) {
  const viewModel = deriveUniverArtifactHeaderViewModel({
    target,
    isRemoteWorkspace,
    ...(target.size !== undefined ? { fileSizeLabel: formatFileSize(target.size) } : {}),
    ...(contentSurface?.status === "ready" ? {
      contentState: {
        unitTitle: contentSurface.title,
        scopeLabel: contentSurface.scopeLabel,
        badges: contentSurface.badges,
        editGate: contentSurface.editGate,
        actions: contentSurface.actions,
      },
    } : {}),
  });

  if (!viewModel) {
    return null;
  }

  return (
    <div
      className="shrink-0 border-b border-border bg-background mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150"
      data-testid="univer-artifact-header"
    >
      <div className="flex min-h-12 items-center gap-3 pe-2 ps-4 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {fileIcon ? (
            <img src={fileIcon} alt="" className="h-4 w-4 shrink-0 object-contain" />
          ) : null}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="min-w-0 truncate text-sm font-medium text-foreground">
                {viewModel.primaryTitle}
              </h3>
              {viewModel.scopeLabel ? (
                <span className="shrink-0 text-xs text-muted-foreground">· {viewModel.scopeLabel}</span>
              ) : null}
              {viewModel.fileMetaLabel ? (
                <span className="shrink-0 text-xs text-muted-foreground">{viewModel.fileMetaLabel}</span>
              ) : null}
            </div>
            {viewModel.secondaryTitle ? (
              <div className="truncate text-xs text-muted-foreground">
                {viewModel.secondaryTitle}
              </div>
            ) : null}
          </div>
        </div>
        <div
          className="hidden min-w-0 flex-1 items-center justify-end gap-1 md:flex"
          data-testid="univer-artifact-header-content-actions"
        >
          <UniverArtifactHeaderContentControls
            viewModel={viewModel}
            onContentViewChange={onContentViewChange}
            onRequestTrunkEdit={onRequestTrunkEdit}
            onStopTrunkEdit={onStopTrunkEdit}
            onMergeWorktree={onMergeWorktree}
            onDiscardWorktree={onDiscardWorktree}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {viewModel.fileActions.map((action) => (
            <Tooltip key={action.id}>
              <TooltipTrigger
                render={(
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => runUniverArtifactHeaderAction(action.id, { onDownload, onReveal, onClose })}
                    aria-label={action.label}
                  >
                    <UniverArtifactHeaderActionIcon actionId={action.id} />
                  </Button>
                )}
              />
              <TooltipContent>{action.tooltip}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}

function runUniverArtifactHeaderAction(
  actionId: UniverArtifactHeaderFileActionId,
  handlers: {
    onDownload: () => void | Promise<void>;
    onReveal: () => void | Promise<void>;
    onClose: () => void;
  },
) {
  if (actionId === "download") {
    void handlers.onDownload();
    return;
  }
  if (actionId === "reveal") {
    void handlers.onReveal();
    return;
  }
  handlers.onClose();
}

function UniverArtifactHeaderContentControls({
  viewModel,
  onContentViewChange,
  onRequestTrunkEdit,
  onStopTrunkEdit,
  onMergeWorktree,
  onDiscardWorktree,
}: {
  viewModel: UniverArtifactHeaderViewModel;
  onContentViewChange?: (view: CoworkContentViewState) => void;
  onRequestTrunkEdit?: () => void;
  onStopTrunkEdit?: () => void;
  onMergeWorktree?: (worktreeId: string) => void | Promise<void>;
  onDiscardWorktree?: (worktreeId: string) => void | Promise<void>;
}) {
  const editAction = viewModel.editGate && "action" in viewModel.editGate ? viewModel.editGate.action : undefined;

  return (
    <>
      {viewModel.badges.map((badge) => (
        <span
          key={`${badge.type}:${badge.label}`}
          className={cn(
            "shrink-0 rounded-sm px-1.5 py-0.5 text-[10px]",
            badge.tone === "warn" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
          )}
        >
          {badge.label}
        </span>
      ))}
      {viewModel.editGate ? (
        <span
          className={cn(
            "shrink-0 rounded-sm px-1.5 py-0.5 text-[10px]",
            viewModel.editGate.editable ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground",
          )}
          data-testid="univer-artifact-header-edit-gate"
        >
          {viewModel.editGate.label}
        </span>
      ) : null}
      {editAction ? (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => runCoworkEditAction(editAction, { onRequestTrunkEdit, onStopTrunkEdit })}
        >
          {editAction.label}
        </Button>
      ) : null}
      {viewModel.contentActions.map((action) => (
        <UniverArtifactHeaderContentAction
          key={contentActionKey(action)}
          action={action}
          onContentViewChange={onContentViewChange}
          onMergeWorktree={onMergeWorktree}
          onDiscardWorktree={onDiscardWorktree}
        />
      ))}
    </>
  );
}

function UniverArtifactHeaderContentAction({
  action,
  onContentViewChange,
  onMergeWorktree,
  onDiscardWorktree,
}: {
  action: CoworkContentAction;
  onContentViewChange?: (view: CoworkContentViewState) => void;
  onMergeWorktree?: (worktreeId: string) => void | Promise<void>;
  onDiscardWorktree?: (worktreeId: string) => void | Promise<void>;
}) {
  if (action.type === "setContentScope") {
    return (
      <Button
        variant={action.selected ? "secondary" : "ghost"}
        size="xs"
        disabled={action.disabledReason !== undefined}
        aria-pressed={action.selected}
        onClick={() => onContentViewChange?.(action.target)}
      >
        {action.label}
      </Button>
    );
  }

  if (action.type === "mergeWorktree") {
    return (
      <Button
        variant="ghost"
        size="xs"
        disabled={action.status === "running" || action.disabledReason !== undefined}
        onClick={() => void onMergeWorktree?.(action.worktreeId)}
      >
        {action.status === "running" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Check data-icon="inline-start" />}
        {action.label}
      </Button>
    );
  }

  if (action.type === "discardWorktree") {
    return (
      <Button
        variant="ghost"
        size="xs"
        className="text-destructive hover:text-destructive"
        disabled={action.status === "running" || action.disabledReason === "busy"}
        onClick={() => void onDiscardWorktree?.(action.worktreeId)}
      >
        {action.status === "running" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Trash2 data-icon="inline-start" />}
        {action.label}
      </Button>
    );
  }

  return null;
}

function runCoworkEditAction(
  action: CoworkContentEditAction,
  handlers: {
    onRequestTrunkEdit?: () => void;
    onStopTrunkEdit?: () => void;
  },
) {
  if (action.type === "requestTrunkEdit") {
    handlers.onRequestTrunkEdit?.();
    return;
  }
  handlers.onStopTrunkEdit?.();
}

function contentActionKey(action: CoworkContentAction): string {
  if (action.type === "setContentScope") {
    return `${action.type}:${action.target.scope}:${action.target.unitId}`;
  }
  if (action.type === "mergeWorktree" || action.type === "discardWorktree") {
    return `${action.type}:${action.worktreeId}`;
  }
  return action.type;
}

function UniverArtifactHeaderActionIcon({ actionId }: { actionId: UniverArtifactHeaderFileActionId }) {
  if (actionId === "download") {
    return <Download />;
  }
  if (actionId === "reveal") {
    return <FolderOpen />;
  }
  return <X />;
}

interface UniverCollabSurfaceProps {
  target: OpenTarget;
  surface: UniverOpenSurface | undefined;
  error: Error | null;
  isError: boolean;
  isLoading: boolean;
  viewerUrl?: string;
}

function UniverCollabSurface({ target, surface, error, isError, isLoading, viewerUrl }: UniverCollabSurfaceProps) {
  if (isLoading) {
    return (
      <div className="min-h-0 flex-1 overflow-hidden">
        <PreviewLoading />
      </div>
    );
  }

  if (isError || !surface) {
    return (
      <div className="min-h-0 flex-1 overflow-hidden">
        <PreviewError message={error instanceof Error ? error.message : "Failed to open Univer surface."} />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <iframe
        data-testid="univer-collab-surface"
        src={viewerUrl ?? surface.url}
        title={target.name}
        className="h-full w-full border-0 bg-background"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        allow="clipboard-read; clipboard-write"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

interface TextEditorProps extends React.ComponentProps<typeof ArtifactTextEditor> {
  value: string;
  language: "markdown" | "text";
  onChange: (value: string) => void;
}

function TextEditor({ value, language, onChange, ...props }: TextEditorProps) {
  return (
    <Suspense fallback={<PreviewLoading />}>
      <ArtifactTextEditor value={value} language={language} onChange={onChange} {...props} />
    </Suspense>
  );
}

interface SheetEditorProps extends React.ComponentProps<typeof ArtifactSpreadsheetEditor> {
  
}

function SheetEditor({ className, ...props }: SheetEditorProps) {
  return (
    <Suspense fallback={<PreviewLoading />}>
      <ArtifactSpreadsheetEditor
        className={className}
        {...props}
      />
    </Suspense>
  );
}
