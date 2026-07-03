/** @jsxImportSource react */
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Database,
  Download,
  Eye,
  ExternalLink,
  FileText,
  FolderOpen,
  GitCompareArrows,
  GitMerge,
  Lock,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Presentation,
  Sheet,
  Trash2,
  X,
} from "lucide-react";
import {
  buildCoworkContentSurface,
  type CoworkContentAction,
  type CoworkContentEditAction,
  type CoworkContentSurface,
  type CoworkContentViewState,
  type CoworkController,
  type CoworkSnapshot,
} from "@univer/cowork";
import { useCoworkSnapshot } from "@univer/cowork/react";
import {
  CoworkContentViewer,
  type CoworkContentViewerDataSource,
  type CoworkContentViewerStatus,
  type CoworkViewerError,
} from "@univer/cowork/viewer/react";
import "@univer/cowork/viewer/styles.css";

import type { SidebarSessionItem } from "@/app/types";
import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import {
  getDesktopFileIcon,
  openDesktopPath,
  revealDesktopItemInDir,
} from "@/app/lib/desktop";
import { isElectronRuntime } from "@/app/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatFileSize } from "@/lib/utils";
import {
  type ArtifactPanelTab,
  usePanelTabStore,
} from "../panel/panel-tab-store";
import { notifyUniverSessionMetadataUpdated } from "../univer-session-events";
import { normalizeUniverTargetPath } from "../univer-worktree-status-store";
import {
  isCollectibleArtifactTarget,
  type BinaryData,
  type Data,
  type OpenTarget,
  type TextData,
} from "./open-target";
import {
  HTMLPreview,
  ImagePreview,
  MarkdownPreview,
  PdfPreview,
  PlainText,
  PreviewError,
  PreviewLoading,
  PreviewUnavailable,
} from "./preview";
import {
  contentViewFromTarget,
  isUniverTarget,
  sameContentView,
  targetFromSelection,
  targetWithSessionWorktreeOwner,
  type UniverTarget,
  useUniverCoworkSession,
} from "./univer-cowork-session";
import {
  deriveUniverArtifactHeaderViewModel,
  type UniverArtifactHeaderContentViewOption,
  type UniverArtifactHeaderFileActionId,
  type UniverArtifactHeaderUnitOption,
  type UniverArtifactHeaderViewModel,
} from "./univer-artifact-header-view-model";
import type { UniverOpenSurface } from "./univer-surface";

const ArtifactTextEditor = lazy(() =>
  import("./artifact-text-editor").then((module) => ({
    default: module.ArtifactTextEditor,
  })),
);
const ArtifactSpreadsheetEditor = lazy(() =>
  import("./artifact-spreadsheet-editor").then((module) => ({
    default: module.ArtifactSpreadsheetEditor,
  })),
);

const EMPTY_TRANSCRIPT_TARGETS: OpenTarget[] = [];
const UNIVER_ARTIFACT_ACTIVE_EVENT = "openwork-univer-artifact-active";

type ArtifactPanelProps = {
  sessionId: string;
  tab: ArtifactPanelTab;
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  workspaceRoot: string;
  workspaceSessions?: SidebarSessionItem[];
  isRemoteWorkspace?: boolean;
  onClose: () => void;
};

type ArtifactPanelViewProps = {
  sessionId: string;
  client: OpenworkServerClient;
  workspaceId: string;
  workspaceRoot: string;
  workspaceSessions: SidebarSessionItem[];
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
  return (
    ["markdown", "text", "sheet", "html"].includes(target.preview) &&
    !/\.(xlsx|xls|ods)$/i.test(target.value)
  );
}

function resolveSessionUniverWorktreeId(
  workspaceSessions: SidebarSessionItem[],
  currentSessionId: string,
  targetPath: string,
): string | null {
  const targetKey = normalizeUniverTargetPath(targetPath);
  const session = workspaceSessions.find((candidate) => candidate.id === currentSessionId);
  if (!session) return null;
  const worktreeId = session.sessionUniverWorktreeId?.trim();
  if (!worktreeId) return null;
  const sessionTargetKey = normalizeUniverTargetPath(session.primaryUniverTarget?.path);
  return sessionTargetKey === targetKey ? worktreeId : null;
}

export function ArtifactPanel({
  sessionId,
  tab,
  client,
  workspaceId,
  workspaceRoot,
  workspaceSessions = [],
  isRemoteWorkspace = false,
  onClose,
}: ArtifactPanelProps) {
  const transcriptTargets = usePanelTabStore(
    (state) =>
      state.transcriptArtifactTargets[sessionId] ?? EMPTY_TRANSCRIPT_TARGETS,
  );
  const artifactTargets = useMemo(
    () => transcriptTargets.filter(isCollectibleArtifactTarget),
    [transcriptTargets],
  );
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
      workspaceSessions={workspaceSessions}
      isRemoteWorkspace={isRemoteWorkspace}
      target={target}
      onClose={onClose}
    />
  );
}

function ArtifactPanelView({
  sessionId,
  client,
  workspaceId,
  workspaceRoot,
  workspaceSessions,
  isRemoteWorkspace = false,
  target,
  onClose,
}: ArtifactPanelViewProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const isDirectTextEdit =
    isTextContent(target) && target.preview === "markdown";
  const externalPath = useMemo(
    () =>
      target.kind === "file"
        ? absoluteWorkspacePath(workspaceRoot, target.value)
        : target.value,
    [target.kind, target.value, workspaceRoot],
  );
  const sessionWorktreeId = useMemo(
    () =>
      resolveSessionUniverWorktreeId(
        workspaceSessions,
        sessionId,
        target.value,
      ),
    [sessionId, target.value, workspaceSessions],
  );

  useEffect(() => {
    if (target.preview !== "univer") return;
    window.dispatchEvent(
      new CustomEvent(UNIVER_ARTIFACT_ACTIVE_EVENT, {
        detail: { targetId: target.id },
      }),
    );
  }, [target.id, target.preview]);

  const { data: fileIcon } = useQuery<string | null>({
    queryKey: ["desktop-file-icon", externalPath] as const,
    queryFn: async () => getDesktopFileIcon(externalPath, "small"),
    enabled:
      target.kind === "file" && !isRemoteWorkspace && isElectronRuntime(),
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });

  const { data, error, isError, isLoading } = useQuery<ArtifactQueryState>({
    queryKey: ["artifact-panel", workspaceId, target.id] as const,
    queryFn: async () => {
      if (target.preview === "univer") {
        throw new Error(
          "Univer artifacts open through the embedded Univer surface.",
        );
      }
      if (target.kind === "url") {
        throw new Error("URLs open in browser tabs.");
      } else if (target.exists === false) {
        throw new Error("File not found in this workspace.");
      }

      if (isTextContent(target)) {
        const result = await client.readWorkspaceFile(
          workspaceId,
          target.value,
        );

        return {
          kind: "text",
          data: result.content,
          updatedAt: result.updatedAt ?? null,
        };
      }

      const result = await client.downloadWorkspaceFile(
        workspaceId,
        target.value,
      );

      return {
        kind: "binary",
        data: result.data,
        contentType: result.contentType,
        updatedAt: target.updatedAt ?? null,
      };
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

    const fallbackType =
      target.preview === "pdf" ? "application/pdf" : "application/octet-stream";
    const url = URL.createObjectURL(
      new Blob([data.data], { type: data.contentType ?? fallbackType }),
    );

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

  const {
    mutate,
    mutateAsync,
    isPending: isSaving,
  } = useMutation({
    mutationFn: async (input: SaveArtifactInput) => {
      if (target.kind !== "file") {
        throw new Error("Cannot save non-file artifact.");
      }

      if (input.kind === "text") {
        return client.writeWorkspaceFile(workspaceId, {
          path: target.value,
          content: input.data,
          baseUpdatedAt: input.baseUpdatedAt,
        });
      }

      return client.writeWorkspaceBinaryFile(workspaceId, {
        path: target.value,
        data: input.data,
        baseUpdatedAt: input.baseUpdatedAt,
      });
    },
    onSuccess: (result, input) => {
      queryClient.setQueryData<ArtifactQueryState>(
        ["artifact-panel", workspaceId, target.id] as const,
        input.kind === "text"
          ? {
              kind: "text",
              data: input.data,
              updatedAt: result.updatedAt ?? null,
            }
          : {
              kind: "binary",
              data: input.data,
              contentType: data?.kind === "binary" ? data.contentType : null,
              updatedAt: result.updatedAt ?? null,
            },
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

    const result = await client.downloadWorkspaceFile(
      workspaceId,
      target.value,
    );
    const url = URL.createObjectURL(
      new Blob([result.data], {
        type: result.contentType ?? "application/octet-stream",
      }),
    );
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
    } else if (!isRemoteWorkspace) {
      try {
        await openDesktopPath(externalPath);
      } catch (cause) {
        toast.error(
          cause instanceof Error ? cause.message : "Could not open this file.",
        );
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
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not show this file in your file manager.",
      );
    }
  };

  const save = () => {
    if (
      target.kind !== "file" ||
      !isTextContent(target) ||
      data?.kind !== "text"
    ) {
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
      baseUpdatedAt:
        data?.kind === payload.kind
          ? data.updatedAt
          : (target.updatedAt ?? null),
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
          sessionWorktreeId={sessionWorktreeId}
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
              <PreviewError
                message={
                  error instanceof Error
                    ? error.message
                    : "Failed to load artifact"
                }
              />
            ) : data?.kind === "text" && (editing || isDirectTextEdit) ? (
              <TextEditor
                value={draft}
                language={target.preview === "markdown" ? "markdown" : "text"}
                onChange={setDraft}
              />
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
              <HTMLPreview
                type="text"
                title={target.name}
                content={data.data}
              />
            ) : target.preview === "image" &&
              data?.kind === "binary" &&
              binaryObjectUrl ? (
              <ImagePreview src={binaryObjectUrl} alt={target.name} />
            ) : target.preview === "pdf" &&
              data?.kind === "binary" &&
              binaryObjectUrl ? (
              <PdfPreview url={binaryObjectUrl} title={target.name} />
            ) : data?.kind === "binary" &&
              binaryObjectUrl &&
              target.preview === "html" ? (
              <HTMLPreview
                type="binary"
                title={target.name}
                url={binaryObjectUrl}
              />
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
    <div className="shrink-0 bg-background mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
      <div className="flex h-10 items-center gap-2 border-b border-border pe-2 ps-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {fileIcon ? (
            <img
              src={fileIcon}
              alt=""
              className="h-4 w-4 shrink-0 object-contain"
            />
          ) : null}
          <h3 className="min-w-0 truncate text-sm font-medium text-foreground">
            {target.name}
          </h3>
          <span className="shrink-0 text-xs text-muted-foreground">
            {target.exists === false
              ? "missing"
              : target.size !== undefined
                ? `${formatFileSize(target.size)}`
                : ""}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isTextContent(target) && data?.kind === "text" ? (
            editing || isDirectTextEdit ? (
              <>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onDiscard}
                        disabled={isSaving}
                      >
                        Discard
                      </Button>
                    }
                  />
                  <TooltipContent>Discard changes</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => void onSave()}
                        disabled={isSaving || draft === data.data}
                      >
                        {isSaving ? "Saving" : "Save"}
                      </Button>
                    }
                  />
                  <TooltipContent>Save changes</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button variant="ghost" size="sm" onClick={onEdit}>
                      Edit
                    </Button>
                  }
                />
                <TooltipContent>Edit artifact</TooltipContent>
              </Tooltip>
            )
          ) : null}
          {target.kind === "file" ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void onDownload()}
                    aria-label="Download artifact"
                  >
                    <Download />
                  </Button>
                }
              />
              <TooltipContent>Download artifact</TooltipContent>
            </Tooltip>
          ) : null}
          {target.kind === "file" && !isRemoteWorkspace ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void onReveal()}
                    aria-label="Show in folder"
                  >
                    <FolderOpen />
                  </Button>
                }
              />
              <TooltipContent>Show in folder</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void onOpenExternal()}
                  aria-label={
                    isRemoteWorkspace ? "Download artifact" : "Open externally"
                  }
                >
                  <ExternalLink />
                </Button>
              }
            />
            <TooltipContent>
              {isRemoteWorkspace ? "Download artifact" : "Open externally"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onClose}
                  aria-label="Close artifact"
                >
                  <X />
                </Button>
              }
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
  sessionWorktreeId: string | null;
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
  sessionWorktreeId,
  fileIcon,
  isRemoteWorkspace,
  onDownload,
  onReveal,
  onClose,
}: UniverArtifactWorkspaceProps) {
  const { controller, error, isError, isLoading, surface, viewerDataSource } =
    useUniverCoworkSession({
      client,
      workspaceId,
      target,
      isRemoteWorkspace,
    });

  if (controller && surface) {
    return (
      <UniverArtifactWorkspaceContent
        sessionId={sessionId}
        client={client}
        workspaceId={workspaceId}
        controller={controller}
        surface={surface}
        viewerDataSource={viewerDataSource}
        target={target}
        sessionWorktreeId={sessionWorktreeId}
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
        sessionWorktreeId={sessionWorktreeId}
        fileIcon={fileIcon}
        isRemoteWorkspace={isRemoteWorkspace}
        onDownload={onDownload}
        onReveal={onReveal}
        onClose={onClose}
      />
      <UniverContentViewerSurface
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
  client: OpenworkServerClient;
  workspaceId: string;
  controller: CoworkController;
  surface: UniverOpenSurface;
  viewerDataSource: CoworkContentViewerDataSource | null;
  target: UniverTarget;
  sessionWorktreeId: string | null;
  fileIcon: string | null | undefined;
  isRemoteWorkspace: boolean;
  onDownload: () => void | Promise<void>;
  onReveal: () => void | Promise<void>;
  onClose: () => void;
}

function UniverArtifactWorkspaceContent({
  sessionId,
  client,
  workspaceId,
  controller,
  surface,
  viewerDataSource,
  target,
  sessionWorktreeId,
  fileIcon,
  isRemoteWorkspace,
  onDownload,
  onReveal,
  onClose,
}: UniverArtifactWorkspaceContentProps) {
  const snapshot = useCoworkSnapshot(controller);
  const [contentView, setContentView] = useState<CoworkContentViewState | null>(
    null,
  );

  useEffect(() => {
    if (snapshot.loadState !== "ready") return;
    const routeWorktreeId = target.worktreeId?.trim();
    const reviewable = routeWorktreeId
      ? snapshot.reviewableWorktrees.find(
          (worktree) => worktree.worktreeId === routeWorktreeId,
        )
      : snapshot.units.length === 0
        ? snapshot.reviewableWorktrees.find(
            (worktree) => !worktree.reviewSummary,
          )
        : undefined;
    if (!reviewable || reviewable.reviewSummary) return;
    void controller.loadReviewSummary(reviewable.worktreeId);
  }, [
    controller,
    snapshot.loadState,
    snapshot.reviewableWorktrees,
    snapshot.units.length,
    target.worktreeId,
  ]);

  useEffect(() => {
    if (snapshot.loadState !== "ready") return;
    const nextView = contentViewFromTarget(snapshot, target, contentView);
    if (!sameContentView(contentView, nextView)) {
      setContentView(nextView);
    }
  }, [contentView, snapshot, target]);

  const contentSurface = contentView
    ? buildCoworkContentSurface(snapshot, contentView)
    : null;
  const routeOwnerWorktreeId =
    sessionWorktreeId ?? target.sessionWorktreeId ?? target.worktreeId ?? null;

  useEffect(() => {
    if (!target.worktreeId?.trim()) return;
    void controller.refresh();
  }, [controller, target.value, target.worktreeId]);

  const syncTargetRoute = (nextTarget: UniverTarget) => {
    const store = usePanelTabStore.getState();
    const nextTargetWithOwner = targetWithSessionWorktreeOwner(
      nextTarget,
      routeOwnerWorktreeId,
    );

    store.upsertTranscriptArtifactTarget(sessionId, nextTargetWithOwner);
    store.openTab(sessionId, {
      id: nextTargetWithOwner.id,
      type: "artifact",
      label: nextTargetWithOwner.name,
      preview: nextTargetWithOwner.preview,
    });
    store.selectTab(sessionId, nextTargetWithOwner.id);
  };

  const setContentViewAndRoute = (view: CoworkContentViewState) => {
    setContentView(view);
    if (view.scope === "trunk") {
      syncTargetRoute(
        targetFromSelection(target, { type: "unit", unitId: view.unitId }),
      );
      return;
    }
    syncTargetRoute(
      targetFromSelection(target, {
        type: "reviewUnit",
        worktreeId: view.worktreeId,
        unitId: view.unitId,
      }),
    );
  };

  const setTrunkEditIntent = (
    intent: CoworkContentViewState & { scope: "trunk" },
  ) => {
    setContentView(intent);
  };

  const markWorktreeTerminal = async (
    nextTerminalState: "merged" | "discarded",
  ) => {
    await client.updateSessionUniverMetadata(workspaceId, sessionId, {
      sessionUniverWorktreeTerminalState: nextTerminalState,
    });
    notifyUniverSessionMetadataUpdated();
  };

  const mergeWorktree = async (worktreeId: string) => {
    try {
      const result = await controller.mergeWorktree(worktreeId);
      if (result.status === "merged") {
        await markWorktreeTerminal("merged");
        if (contentView) {
          setContentViewAndRoute({
            scope: "trunk",
            unitId: contentView.unitId,
            trunkEditIntent: "auto",
          });
        }
      }
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not merge these changes.",
      );
    }
  };

  const discardWorktree = async (worktreeId: string) => {
    try {
      await controller.discardWorktree(worktreeId);
      await markWorktreeTerminal("discarded");
      if (contentView) {
        setContentViewAndRoute({
          scope: "trunk",
          unitId: contentView.unitId,
          trunkEditIntent: "auto",
        });
      }
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not discard these changes.",
      );
    }
  };

  return (
    <>
      <UniverArtifactHeader
        target={target}
        sessionWorktreeId={sessionWorktreeId}
        fileIcon={fileIcon}
        isRemoteWorkspace={isRemoteWorkspace}
        currentView={contentView}
        snapshot={snapshot}
        contentSurface={contentSurface}
        onContentViewChange={setContentViewAndRoute}
        onRequestTrunkEdit={() => {
          if (contentView?.scope === "trunk") {
            setTrunkEditIntent({
              ...contentView,
              trunkEditIntent: "forceEditing",
            });
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
      <UniverContentViewerSurface
        target={target}
        surface={surface}
        viewerDataSource={viewerDataSource}
        contentSurface={contentSurface}
        error={null}
        isError={false}
        isLoading={false}
      />
    </>
  );
}

interface UniverArtifactHeaderProps {
  target: OpenTarget;
  sessionWorktreeId?: string | null;
  fileIcon: string | null | undefined;
  isRemoteWorkspace: boolean;
  contentSurface?: CoworkContentSurface | null;
  currentView?: CoworkContentViewState | null;
  snapshot?: CoworkSnapshot | null;
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
  sessionWorktreeId,
  isRemoteWorkspace,
  contentSurface,
  currentView,
  snapshot,
  onContentViewChange,
  onRequestTrunkEdit,
  onStopTrunkEdit,
  onMergeWorktree,
  onDiscardWorktree,
  onDownload,
  onReveal,
  onClose,
}: UniverArtifactHeaderProps) {
  const ownerWorktreeId = sessionWorktreeId ?? target.sessionWorktreeId ?? target.worktreeId;
  const viewModel = deriveUniverArtifactHeaderViewModel({
    target,
    isRemoteWorkspace,
    ...(target.size !== undefined
      ? { fileSizeLabel: formatFileSize(target.size) }
      : {}),
    ...(currentView ? { currentView } : {}),
    ...(snapshot ? { snapshot } : {}),
    ...(ownerWorktreeId ? { sessionWorktreeId: ownerWorktreeId } : {}),
    ...(contentSurface?.status === "ready"
      ? {
          contentState: {
            unitTitle: contentSurface.title,
            ...(contentSurface.unit?.unitId ? { unitId: contentSurface.unit.unitId } : {}),
            scope: contentSurface.scope,
            scopeLabel: contentSurface.scopeLabel,
            badges: contentSurface.badges,
            editGate: contentSurface.editGate,
            actions: contentSurface.actions,
          },
        }
      : {}),
  });

  if (!viewModel) {
    return null;
  }

  const editAction =
    viewModel.editGate && "action" in viewModel.editGate
      ? viewModel.editGate.action
      : undefined;
  const hasStatusControls = Boolean(
    viewModel.contentViewOptions.length > 0 ||
      viewModel.editGate ||
      viewModel.badges.length > 0,
  );
  const hasWorkflowActions = Boolean(
    editAction || viewModel.contentActions.length > 0,
  );

  return (
    <div
      className="@container/univer-artifact-header shrink-0 bg-background mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150"
      data-testid="univer-artifact-header"
    >
      <div className="flex h-10 min-w-0 items-center gap-2 overflow-hidden border-b border-border pe-2 ps-3 @md/univer-artifact-header:ps-4">
        <div className="flex min-w-0 flex-[1_1_auto] basis-0 items-center gap-2 overflow-hidden">
          <div className="min-w-0 shrink">
            <UniverSurfaceBreadcrumb
              viewModel={viewModel}
              onContentViewChange={onContentViewChange}
            />
          </div>
          {hasStatusControls ? (
            <div className="flex min-w-0 shrink-0 items-center gap-1 overflow-hidden">
              <UniverContentViewSelector
                options={viewModel.contentViewOptions}
                onContentViewChange={onContentViewChange}
              />
              <UniverArtifactHeaderStatusControls viewModel={viewModel} />
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {hasWorkflowActions ? (
            <>
              <div
                className="hidden min-w-0 shrink-0 items-center justify-end gap-0.5 overflow-hidden @3xl/univer-artifact-header:flex"
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
              <div className="flex min-w-0 shrink-0 items-center gap-1 @3xl/univer-artifact-header:hidden">
                <UniverArtifactHeaderWorkflowMenu
                  viewModel={viewModel}
                  onContentViewChange={onContentViewChange}
                  onRequestTrunkEdit={onRequestTrunkEdit}
                  onStopTrunkEdit={onStopTrunkEdit}
                  onMergeWorktree={onMergeWorktree}
                  onDiscardWorktree={onDiscardWorktree}
                />
              </div>
            </>
          ) : null}
          {viewModel.fileActions.map((action) => (
            <Tooltip key={action.id}>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      runUniverArtifactHeaderAction(action.id, {
                        onDownload,
                        onReveal,
                        onClose,
                      })
                    }
                    aria-label={action.label}
                  >
                    <UniverArtifactHeaderActionIcon actionId={action.id} />
                  </Button>
                }
              />
              <TooltipContent>{action.tooltip}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}

function UniverSurfaceBreadcrumb({
  viewModel,
  onContentViewChange,
}: {
  viewModel: UniverArtifactHeaderViewModel;
  onContentViewChange?: (view: CoworkContentViewState) => void;
}) {
  const unit = viewModel.breadcrumb.unit;

  return (
    <div
      className="flex min-w-0 items-center gap-1 text-[13px] font-medium leading-5 text-foreground"
      data-testid="univer-surface-breadcrumb"
    >
      <span
        className="min-w-0 max-w-[28ch] shrink-[5] truncate"
        title={viewModel.breadcrumb.univerfile.label}
      >
        {viewModel.breadcrumb.univerfile.label}
      </span>
      {unit ? (
        <>
          <BreadcrumbDivider />
          <UniverUnitBreadcrumbSegment
            current={unit}
            options={viewModel.unitOptions}
            onContentViewChange={onContentViewChange}
          />
        </>
      ) : null}
    </div>
  );
}

function BreadcrumbDivider() {
  return <span className="shrink-0 text-muted-foreground/70">/</span>;
}

function UniverUnitBreadcrumbSegment({
  current,
  options,
  onContentViewChange,
}: {
  current: { label: string; kind?: string };
  options: UniverArtifactHeaderUnitOption[];
  onContentViewChange?: (view: CoworkContentViewState) => void;
}) {
  const content = (
    <>
      {unitIcon(current.kind ?? "")}
      <span className="min-w-0 truncate">{current.label}</span>
    </>
  );

  if (!options.length || !onContentViewChange) {
    return (
      <span className="flex min-w-[4rem] max-w-[34ch] shrink-[3] items-center gap-1.5 truncate">
        {content}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex min-w-[4rem] max-w-[34ch] shrink-[3] items-center gap-1.5 rounded-md px-1 py-0.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Select unit. Current unit: ${current.label}`}
      >
        {content}
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Units</DropdownMenuLabel>
          {options.map((option) => (
            <DropdownMenuItem
              key={option.unitId}
              onClick={() => onContentViewChange(option.view)}
              aria-pressed={option.selected}
            >
              {unitIcon(option.kind)}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.selected ? <Check className="size-3.5 shrink-0" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UniverContentViewSelector({
  options,
  onContentViewChange,
}: {
  options: UniverArtifactHeaderContentViewOption[];
  onContentViewChange?: (view: CoworkContentViewState) => void;
}) {
  const selected = options.find((option) => option.selected) ?? options[0];
  if (!selected) return null;

  const content = (
    <>
      <UniverContentViewIcon option={selected} />
      <span className="min-w-0 truncate">{selected.label}</span>
    </>
  );

  if (options.length < 2 || !onContentViewChange) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className="flex max-w-[7.5rem] shrink items-center gap-1.5 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              data-testid="univer-content-view-selector"
            >
              {content}
            </span>
          }
        />
        <TooltipContent>{selected.tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              className="flex max-w-[8.5rem] shrink items-center gap-1.5 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground outline-none hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="univer-content-view-selector"
              aria-label={`切换内容视图。当前视图：${selected.label}`}
            >
              {content}
              <ChevronDown className="size-3 shrink-0" />
            </DropdownMenuTrigger>
          }
        />
        <TooltipContent>{selected.tooltip}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>视图</DropdownMenuLabel>
          {options.map((option) => (
            <DropdownMenuItem
              key={option.id}
              disabled={option.disabledReason !== undefined}
              onClick={() => onContentViewChange(option.view)}
              aria-pressed={option.selected}
              title={option.tooltip}
            >
              <UniverContentViewIcon option={option} />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.selected ? <Check className="size-3.5 shrink-0" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UniverContentViewIcon({
  option,
}: {
  option: UniverArtifactHeaderContentViewOption;
}) {
  if (option.view.scope === "mergePreview") {
    return <GitMerge className="size-3 shrink-0" />;
  }
  if (option.view.scope === "worktree") {
    return <GitCompareArrows className="size-3 shrink-0" />;
  }
  return <Eye className="size-3 shrink-0" />;
}

function unitIcon(kind: string) {
  if (kind === "sheet")
    return <Sheet className="size-3.5 shrink-0 text-muted-foreground" />;
  if (kind === "doc")
    return <FileText className="size-3.5 shrink-0 text-muted-foreground" />;
  if (kind === "slide")
    return <Presentation className="size-3.5 shrink-0 text-muted-foreground" />;
  return <Database className="size-3.5 shrink-0 text-muted-foreground" />;
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

function UniverArtifactHeaderStatusControls({
  viewModel,
}: {
  viewModel: UniverArtifactHeaderViewModel;
}) {
  return (
    <>
      {viewModel.badges.map((badge) => {
        const copy = badgeCopy(badge);
        return (
          <span
            key={`${badge.type}:${badge.label}`}
            className={cn(
              "max-w-[7rem] shrink truncate rounded-sm px-1.5 py-0.5 text-[10px]",
              badge.tone === "warn"
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground",
            )}
            title={copy.tooltip}
          >
            {copy.label}
          </span>
        );
      })}
      {viewModel.editGate ? (
        <UniverArtifactHeaderEditGate
          editGate={viewModel.editGate}
          className="max-w-[6rem]"
        />
      ) : null}
    </>
  );
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
  const editAction =
    viewModel.editGate && "action" in viewModel.editGate
      ? viewModel.editGate.action
      : undefined;

  return (
    <>
      {editAction ? (
        <UniverArtifactHeaderEditAction
          action={editAction}
          onRequestTrunkEdit={onRequestTrunkEdit}
          onStopTrunkEdit={onStopTrunkEdit}
        />
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

function UniverArtifactHeaderWorkflowMenu({
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
  const editAction =
    viewModel.editGate && "action" in viewModel.editGate
      ? viewModel.editGate.action
      : undefined;

  if (!editAction && viewModel.contentActions.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="打开工作流控件"
            title="工作流"
          >
            <MoreHorizontal />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        {editAction ? (
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() =>
                runCoworkEditAction(editAction, {
                  onRequestTrunkEdit,
                  onStopTrunkEdit,
                })
              }
            >
              <PencilLine className="size-4" />
              <span>{editActionCopy(editAction).label}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : null}
        {viewModel.contentActions.length > 0 ? (
          <>
            {editAction ? <DropdownMenuSeparator /> : null}
            <DropdownMenuGroup>
              <DropdownMenuLabel>任务修改</DropdownMenuLabel>
              {viewModel.contentActions.map((action) => (
                <UniverArtifactHeaderContentMenuItem
                  key={contentActionKey(action)}
                  action={action}
                  onContentViewChange={onContentViewChange}
                  onMergeWorktree={onMergeWorktree}
                  onDiscardWorktree={onDiscardWorktree}
                />
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UniverArtifactHeaderEditGate({
  editGate,
  className,
}: {
  editGate: NonNullable<UniverArtifactHeaderViewModel["editGate"]>;
  className?: string;
}) {
  const copy = editGateCopy(editGate);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
              "max-w-[10rem]",
              editGate.editable
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : editGate.status === "locked"
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "bg-muted text-muted-foreground",
              className,
            )}
            data-testid="univer-artifact-header-edit-gate"
          >
            <UniverArtifactHeaderEditGateIcon editGate={editGate} />
            <span className="min-w-0 truncate">{copy.label}</span>
          </span>
        }
      />
      <TooltipContent>{copy.tooltip}</TooltipContent>
    </Tooltip>
  );
}

function UniverArtifactHeaderEditGateIcon({
  editGate,
}: {
  editGate: NonNullable<UniverArtifactHeaderViewModel["editGate"]>;
}) {
  if (editGate.status === "editable" || editGate.status === "editingWithPending") {
    return <PencilLine className="size-3 shrink-0" />;
  }
  if (editGate.status === "locked") {
    return <Lock className="size-3 shrink-0" />;
  }
  return <Eye className="size-3 shrink-0" />;
}

function editGateCopy(
  editGate: NonNullable<UniverArtifactHeaderViewModel["editGate"]>,
): { label: string; tooltip: string } {
  if (editGate.status === "editable") {
    return {
      label: "可编辑",
      tooltip: "当前版本可以直接编辑。",
    };
  }
  if (editGate.status === "locked") {
    return {
      label: "有待处理修改",
      tooltip: "已有任务修改待处理。继续编辑当前版本可能影响后续合入。",
    };
  }
  if (editGate.status === "editingWithPending") {
    return {
      label: "正在编辑当前版本",
      tooltip: "当前版本已解锁编辑；待处理修改仍保留在任务中。",
    };
  }
  if (editGate.reason === "unsupportedUnitKind") {
    return {
      label: "只读",
      tooltip: "此类型暂不支持在当前版本中直接编辑。",
    };
  }
  if (editGate.reason === "nonTrunkScope") {
    return {
      label: "只读",
      tooltip: "正在查看任务修改或合并预览，不能直接编辑。",
    };
  }
  return {
    label: "只读",
    tooltip: "内容暂不可编辑。",
  };
}

function badgeCopy(badge: UniverArtifactHeaderViewModel["badges"][number]): {
  label: string;
  tooltip: string;
} {
  const label = badge.label.trim();
  if (label === "Ready") {
    return {
      label: "可合入",
      tooltip: "这些修改已经准备好合入当前版本。",
    };
  }
  if (label === "Working") {
    return {
      label: "修改中",
      tooltip: "这个任务仍在修改中。",
    };
  }
  if (label === "Conflict") {
    return {
      label: "冲突",
      tooltip: "这些修改与当前版本存在冲突。",
    };
  }
  return {
    label,
    tooltip: label,
  };
}

function UniverArtifactHeaderEditAction({
  action,
  onRequestTrunkEdit,
  onStopTrunkEdit,
}: {
  action: CoworkContentEditAction;
  onRequestTrunkEdit?: () => void;
  onStopTrunkEdit?: () => void;
}) {
  const copy = editActionCopy(action);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            title={copy.tooltip}
            onClick={() =>
              runCoworkEditAction(action, {
                onRequestTrunkEdit,
                onStopTrunkEdit,
              })
            }
          >
            <PencilLine data-icon="inline-start" />
            <span>{copy.label}</span>
          </Button>
        }
      />
      <TooltipContent>{copy.tooltip}</TooltipContent>
    </Tooltip>
  );
}

function editActionCopy(action: CoworkContentEditAction): { label: string; tooltip: string } {
  if (action.type === "requestTrunkEdit") {
    return {
      label: "继续编辑",
      tooltip: "解锁当前版本并继续编辑。",
    };
  }
  return {
    label: "退出编辑",
    tooltip: "停止直接编辑当前版本，回到自动保护状态。",
  };
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
  const copy = contentActionCopy(action);

  if (action.type === "setContentScope") {
    return (
      <Button
        variant={action.selected ? "secondary" : "ghost"}
        size="xs"
        className="max-w-[8.5rem] overflow-hidden px-2"
        disabled={action.disabledReason !== undefined}
        aria-pressed={action.selected}
        aria-label={copy.ariaLabel}
        title={copy.tooltip}
        onClick={() => onContentViewChange?.(action.target)}
      >
        <UniverArtifactHeaderContentActionIcon action={action} />
        <span className="min-w-0 truncate">{copy.label}</span>
      </Button>
    );
  }

  if (action.type === "mergeWorktree") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              title={copy.tooltip}
              disabled={
                action.status === "running" || action.disabledReason !== undefined
              }
              aria-label={copy.ariaLabel}
              onClick={() => void onMergeWorktree?.(action.worktreeId)}
            >
              <UniverArtifactHeaderContentActionIcon action={action} />
            </Button>
          }
        />
        <TooltipContent>{copy.tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  if (action.type === "discardWorktree") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              title={copy.tooltip}
              disabled={
                action.status === "running" || action.disabledReason === "busy"
              }
              aria-label={copy.ariaLabel}
              onClick={() => void onDiscardWorktree?.(action.worktreeId)}
            >
              <UniverArtifactHeaderContentActionIcon action={action} />
            </Button>
          }
        />
        <TooltipContent>{copy.tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return null;
}

function UniverArtifactHeaderContentMenuItem({
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
  const copy = contentActionCopy(action);
  if (action.type === "setContentScope") {
    return (
      <DropdownMenuItem
        disabled={action.disabledReason !== undefined}
        onClick={() => onContentViewChange?.(action.target)}
        aria-label={copy.ariaLabel}
        title={copy.tooltip}
      >
        <UniverArtifactHeaderContentActionIcon action={action} />
        <span className="min-w-0 flex-1 truncate">{copy.label}</span>
        {action.selected ? <Check className="size-3.5 shrink-0" /> : null}
      </DropdownMenuItem>
    );
  }
  if (action.type === "mergeWorktree") {
    return (
      <DropdownMenuItem
        disabled={action.status === "running" || action.disabledReason !== undefined}
        onClick={() => void onMergeWorktree?.(action.worktreeId)}
        aria-label={copy.ariaLabel}
        title={copy.tooltip}
      >
        <UniverArtifactHeaderContentActionIcon action={action} />
        <span className="min-w-0 flex-1 truncate">{copy.label}</span>
      </DropdownMenuItem>
    );
  }
  if (action.type === "discardWorktree") {
    return (
      <DropdownMenuItem
        variant="destructive"
        disabled={action.status === "running" || action.disabledReason === "busy"}
        onClick={() => void onDiscardWorktree?.(action.worktreeId)}
        aria-label={copy.ariaLabel}
        title={copy.tooltip}
      >
        <UniverArtifactHeaderContentActionIcon action={action} />
        <span className="min-w-0 flex-1 truncate">{copy.label}</span>
      </DropdownMenuItem>
    );
  }
  return null;
}

function UniverArtifactHeaderContentActionIcon({
  action,
}: {
  action: CoworkContentAction;
}) {
  if (
    (action.type === "mergeWorktree" || action.type === "discardWorktree") &&
    action.status === "running"
  ) {
    return <Loader2 data-icon="inline-start" className="animate-spin" />;
  }
  if (action.type === "setContentScope") {
    return action.target.scope === "mergePreview"
      ? <GitMerge data-icon="inline-start" />
      : <GitCompareArrows data-icon="inline-start" />;
  }
  if (action.type === "mergeWorktree") {
    return <GitMerge data-icon="inline-start" />;
  }
  if (action.type === "discardWorktree") {
    return <Trash2 data-icon="inline-start" />;
  }
  return <PencilLine data-icon="inline-start" />;
}

function contentActionCopy(action: CoworkContentAction): {
  label: string;
  tooltip: string;
  ariaLabel: string;
} {
  if (action.type === "requestTrunkEdit" || action.type === "stopTrunkEdit") {
    const copy = editActionCopy(action);
    return {
      ...copy,
      ariaLabel: copy.label,
    };
  }
  if (action.type === "setContentScope") {
    if (action.target.scope === "mergePreview") {
      return {
        label: "合并后",
        tooltip: "预览这些修改合入当前版本后的结果。",
        ariaLabel: "合并后",
      };
    }
    return {
      label: "原始修改",
      tooltip: "查看任务原本产生的修改。",
      ariaLabel: "原始修改",
    };
  }
  if (action.type === "mergeWorktree") {
    if (action.disabledReason === "conflict") {
      return {
        label: "合入",
        tooltip: "存在冲突，解决后才能合入当前版本。",
        ariaLabel: "合入当前版本",
      };
    }
    if (action.status === "running") {
      return {
        label: "正在合入",
        tooltip: "正在把这些修改合入当前版本。",
        ariaLabel: "正在合入当前版本",
      };
    }
    return {
      label: "合入",
      tooltip: "接受这些修改，并更新当前版本。",
      ariaLabel: "合入当前版本",
    };
  }
  if (action.status === "running") {
    return {
      label: "正在丢弃",
      tooltip: "正在丢弃这些修改。",
      ariaLabel: "正在丢弃修改",
    };
  }
  return {
    label: "丢弃",
    tooltip: "放弃这个任务产生的修改。",
    ariaLabel: "丢弃修改",
  };
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

function UniverArtifactHeaderActionIcon({
  actionId,
}: {
  actionId: UniverArtifactHeaderFileActionId;
}) {
  if (actionId === "download") {
    return <Download />;
  }
  if (actionId === "reveal") {
    return <FolderOpen />;
  }
  return <X />;
}

interface UniverContentViewerSurfaceProps {
  target: OpenTarget;
  surface: UniverOpenSurface | undefined;
  viewerDataSource?: CoworkContentViewerDataSource | null;
  contentSurface?: CoworkContentSurface | null;
  error: Error | null;
  isError: boolean;
  isLoading: boolean;
}

function UniverContentViewerSurface({
  target,
  surface,
  viewerDataSource,
  contentSurface,
  error,
  isError,
  isLoading,
}: UniverContentViewerSurfaceProps) {
  const [viewerStatus, setViewerStatus] =
    useState<CoworkContentViewerStatus>("loading");
  const [viewerError, setViewerError] = useState<CoworkViewerError | null>(
    null,
  );
  const [reloadKey, setReloadKey] = useState(0);
  const viewerRequest = contentSurface?.viewerRequest ?? null;
  const viewerRequestKey = viewerRequest
    ? `${viewerRequest.container.containerId}:${viewerRequest.unitId}:${viewerRequest.unitKind}:${viewerRequest.scope}:${viewerRequest.worktreeId ?? ""}:${viewerRequest.editable ? "editable" : "readonly"}`
    : null;

  useEffect(() => {
    setViewerStatus("loading");
    setViewerError(null);
    setReloadKey(0);
  }, [surface?.origin, target.id, viewerRequestKey]);

  let content: ReactNode;
  if (isLoading) {
    content = <PreviewLoading />;
  } else if (isError || !surface) {
    content = (
      <PreviewError
        message={
          error instanceof Error
            ? error.message
            : "Failed to open Univer surface."
        }
      />
    );
  } else {
    if (!viewerRequest || !viewerDataSource) {
      content = <PreviewUnavailable />;
    } else {
      content = (
        <>
          <CoworkContentViewer
            origin={surface.origin}
            request={viewerRequest}
            dataSource={viewerDataSource}
            reloadKey={reloadKey}
            className="h-full w-full"
            onStatusChange={(status) => {
              setViewerStatus(status);
              if (status !== "error") {
                setViewerError(null);
              }
            }}
            onError={setViewerError}
          />
          {viewerStatus === "loading" ? (
            <div className="absolute inset-0 bg-background">
              <PreviewLoading />
            </div>
          ) : null}
          {viewerStatus === "error" ? (
            <UniverViewerError
              message={viewerError?.message ?? `Failed to open ${target.name}.`}
              onRetry={() => {
                setViewerStatus("loading");
                setViewerError(null);
                setReloadKey((value) => value + 1);
              }}
            />
          ) : null}
        </>
      );
    }
  }

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden bg-background"
      data-testid="univer-artifact-native-viewer"
    >
      {content}
    </div>
  );
}

function UniverViewerError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="absolute inset-0 bg-background p-4">
      <div className="flex max-w-md flex-col gap-3">
        <PreviewError message={message} className="p-0" />
        <Button variant="outline" size="sm" className="w-fit" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

interface TextEditorProps extends React.ComponentProps<
  typeof ArtifactTextEditor
> {
  value: string;
  language: "markdown" | "text";
  onChange: (value: string) => void;
}

function TextEditor({ value, language, onChange, ...props }: TextEditorProps) {
  return (
    <Suspense fallback={<PreviewLoading />}>
      <ArtifactTextEditor
        value={value}
        language={language}
        onChange={onChange}
        {...props}
      />
    </Suspense>
  );
}

interface SheetEditorProps extends React.ComponentProps<
  typeof ArtifactSpreadsheetEditor
> {}

function SheetEditor({ className, ...props }: SheetEditorProps) {
  return (
    <Suspense fallback={<PreviewLoading />}>
      <ArtifactSpreadsheetEditor className={className} {...props} />
    </Suspense>
  );
}
