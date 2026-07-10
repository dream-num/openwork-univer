/** @jsxImportSource react */
import {
  Fragment,
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
  GitBranch,
  GitCompareArrows,
  GitMerge,
  Lock,
  Loader2,
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
} from "@univerjs-pro/cowork";
import { useCoworkSnapshot } from "@univerjs-pro/cowork/react";
import {
  CoworkContentViewer,
  type CoworkContentViewerDataSource,
  type CoworkContentViewerStatus,
  type CoworkViewerError,
} from "@univerjs-pro/cowork/viewer/react";
import "@univerjs-pro/cowork/viewer/styles.css";

import type { SidebarSessionItem } from "@/app/types";
import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import { getDisplaySessionTitle } from "@/app/lib/session-title";
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
import {
  normalizeUniverTargetPath,
  useUniverWorktreeStatusStore,
} from "../univer-worktree-status-store";
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
  type UniverArtifactHeaderBridgeAction,
  type UniverArtifactHeaderFileActionId,
  type UniverArtifactHeaderUnitOption,
  type UniverArtifactHeaderViewModel,
  type UniverArtifactHeaderWorktreeOwnership,
  type UniverArtifactHeaderWorktreeOption,
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
  onOpenSession?: (workspaceId: string, sessionId: string) => void;
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
  onOpenSession?: (workspaceId: string, sessionId: string) => void;
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

function sessionCreatedAt(session: SidebarSessionItem): number {
  return session.time?.created ?? session.time?.updated ?? 0;
}

function deriveUniverHeaderWorktreeOwnership(
  workspaceSessions: SidebarSessionItem[],
  currentSessionId: string,
  targetPath: string,
): Record<string, UniverArtifactHeaderWorktreeOwnership> {
  const targetKey = normalizeUniverTargetPath(targetPath);
  if (!targetKey) return {};

  const sessionsByWorktreeId = new Map<string, SidebarSessionItem[]>();
  for (const session of workspaceSessions) {
    if (session.univerSessionKind === "overview") continue;
    if (session.sessionUniverWorktreeTerminalState) continue;
    if (normalizeUniverTargetPath(session.primaryUniverTarget?.path) !== targetKey) {
      continue;
    }
    const worktreeId = session.sessionUniverWorktreeId?.trim();
    if (!worktreeId) continue;
    sessionsByWorktreeId.set(
      worktreeId,
      [...(sessionsByWorktreeId.get(worktreeId) ?? []), session],
    );
  }

  const ownershipById: Record<string, UniverArtifactHeaderWorktreeOwnership> = {};
  for (const [worktreeId, sessions] of sessionsByWorktreeId) {
    const owner = [...sessions].sort((left, right) => {
      const createdDelta = sessionCreatedAt(left) - sessionCreatedAt(right);
      if (createdDelta !== 0) return createdDelta;
      return left.id.localeCompare(right.id);
    })[0];
    if (!owner) continue;
    ownershipById[worktreeId] = {
      relation: owner.id === currentSessionId ? "currentTask" : "otherTask",
      ownerSessionId: owner.id,
      ownerSessionTitle: getDisplaySessionTitle(owner.title),
    };
  }

  const currentSession = workspaceSessions.find((session) => session.id === currentSessionId);
  const currentIssue = currentSession?.sessionUniverWorktreeIssue;
  if (currentIssue?.kind === "ownershipConflict" && !ownershipById[currentIssue.worktreeId]) {
    const owner = workspaceSessions.find((session) => session.id === currentIssue.ownerSessionId);
    ownershipById[currentIssue.worktreeId] = {
      relation: "otherTask",
      ownerSessionId: currentIssue.ownerSessionId,
      ...(owner ? { ownerSessionTitle: getDisplaySessionTitle(owner.title) } : {}),
    };
  }

  return ownershipById;
}

export function ArtifactPanel({
  sessionId,
  tab,
  client,
  workspaceId,
  workspaceRoot,
  workspaceSessions = [],
  isRemoteWorkspace = false,
  onOpenSession,
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
      onOpenSession={onOpenSession}
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
  onOpenSession,
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
          workspaceSessions={workspaceSessions}
          sessionWorktreeId={sessionWorktreeId}
          fileIcon={fileIcon}
          isRemoteWorkspace={isRemoteWorkspace}
          onOpenSession={onOpenSession}
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
  workspaceSessions: SidebarSessionItem[];
  sessionWorktreeId: string | null;
  fileIcon: string | null | undefined;
  isRemoteWorkspace: boolean;
  onOpenSession?: (workspaceId: string, sessionId: string) => void;
  onDownload: () => void | Promise<void>;
  onReveal: () => void | Promise<void>;
  onClose: () => void;
}

function UniverArtifactWorkspace({
  sessionId,
  client,
  workspaceId,
  target,
  workspaceSessions,
  sessionWorktreeId,
  fileIcon,
  isRemoteWorkspace,
  onOpenSession,
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
  const worktreeOwnershipById = useMemo(
    () => deriveUniverHeaderWorktreeOwnership(workspaceSessions, sessionId, target.value),
    [sessionId, target.value, workspaceSessions],
  );

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
        worktreeOwnershipById={worktreeOwnershipById}
        fileIcon={fileIcon}
        isRemoteWorkspace={isRemoteWorkspace}
        onOpenSession={onOpenSession}
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
        worktreeOwnershipById={worktreeOwnershipById}
        fileIcon={fileIcon}
        isRemoteWorkspace={isRemoteWorkspace}
        onOpenOwnerSession={(ownerSessionId) => onOpenSession?.(workspaceId, ownerSessionId)}
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
  worktreeOwnershipById: Record<string, UniverArtifactHeaderWorktreeOwnership>;
  fileIcon: string | null | undefined;
  isRemoteWorkspace: boolean;
  onOpenSession?: (workspaceId: string, sessionId: string) => void;
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
  worktreeOwnershipById,
  fileIcon,
  isRemoteWorkspace,
  onOpenSession,
  onDownload,
  onReveal,
  onClose,
}: UniverArtifactWorkspaceContentProps) {
  const snapshot = useCoworkSnapshot(controller);
  const updateTargetSnapshot = useUniverWorktreeStatusStore((state) => state.updateTargetSnapshot);
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
    updateTargetSnapshot(workspaceId, target.value, snapshot);
  }, [snapshot, target.value, updateTargetSnapshot, workspaceId]);

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
    void controller.refresh();
  }, [controller, target.value, target.worktreeId]);

  const syncTargetRouteForSession = (
    targetSessionId: string,
    nextTarget: UniverTarget,
    sessionWorktreeOwnerId: string | null,
  ) => {
    const store = usePanelTabStore.getState();
    const nextTargetWithOwner = targetWithSessionWorktreeOwner(
      nextTarget,
      sessionWorktreeOwnerId,
    );

    store.upsertTranscriptArtifactTarget(targetSessionId, nextTargetWithOwner);
    store.openTab(targetSessionId, {
      id: nextTargetWithOwner.id,
      type: "artifact",
      label: nextTargetWithOwner.name,
      preview: nextTargetWithOwner.preview,
    });
    store.selectTab(targetSessionId, nextTargetWithOwner.id);
  };

  const targetForContentView = (view: CoworkContentViewState) => {
    if (view.scope === "trunk") {
      return targetFromSelection(target, { type: "unit", unitId: view.unitId });
    }
    return targetFromSelection(target, {
      type: "reviewUnit",
      worktreeId: view.worktreeId,
      unitId: view.unitId,
    });
  };

  const syncTargetRoute = (nextTarget: UniverTarget) => {
    syncTargetRouteForSession(sessionId, nextTarget, routeOwnerWorktreeId);
  };

  const setContentViewAndRoute = (view: CoworkContentViewState) => {
    setContentView(view);
    syncTargetRoute(targetForContentView(view));
  };

  const openOwnerSession = (
    ownerSessionId: string,
    view?: CoworkContentViewState,
  ) => {
    if (view) {
      const ownerWorktreeId = view.scope === "trunk" ? null : view.worktreeId;
      syncTargetRouteForSession(
        ownerSessionId,
        targetForContentView(view),
        ownerWorktreeId,
      );
    }
    onOpenSession?.(workspaceId, ownerSessionId);
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
        worktreeOwnershipById={worktreeOwnershipById}
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
        onOpenOwnerSession={openOwnerSession}
        onDownload={onDownload}
        onReveal={onReveal}
        onClose={onClose}
      />
      <UniverContentViewerSurface
        target={target}
        surface={surface}
        viewerDataSource={viewerDataSource}
        contentSurface={contentSurface}
        snapshot={snapshot}
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
  worktreeOwnershipById?: Record<string, UniverArtifactHeaderWorktreeOwnership>;
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
  onOpenOwnerSession?: (ownerSessionId: string, view?: CoworkContentViewState) => void;
  onDownload: () => void | Promise<void>;
  onReveal: () => void | Promise<void>;
  onClose: () => void;
}

type UniverArtifactHeaderReviewAction = Extract<
  CoworkContentAction,
  { type: "mergeWorktree" | "discardWorktree" }
>;

function isReviewDecisionAction(
  action: CoworkContentAction,
): action is UniverArtifactHeaderReviewAction {
  return action.type === "mergeWorktree" || action.type === "discardWorktree";
}

export function UniverArtifactHeader({
  target,
  sessionWorktreeId,
  worktreeOwnershipById,
  isRemoteWorkspace,
  contentSurface,
  currentView,
  snapshot,
  onContentViewChange,
  onRequestTrunkEdit,
  onStopTrunkEdit,
  onMergeWorktree,
  onDiscardWorktree,
  onOpenOwnerSession,
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
    ...(worktreeOwnershipById ? { worktreeOwnershipById } : {}),
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
  const reviewActions = viewModel.contentActions.filter(isReviewDecisionAction);
  const worktreeViewActions = viewModel.contentActions.filter(
    (action) => !isReviewDecisionAction(action),
  );
  const bridgeActions = viewModel.bridgeActions;
  const primaryStatus = primaryStatusFor(viewModel);
  const hasWorktreeViewActions = worktreeViewActions.length > 0;

  return (
    <div
      className="@container/univer-artifact-header shrink-0 bg-background mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150"
      data-testid="univer-artifact-header"
    >
      <div className="flex h-10 min-w-0 items-center gap-2 overflow-hidden border-b border-border pe-2 ps-3 @md/univer-artifact-header:ps-4">
        <div className="flex min-w-0 flex-[1_1_auto] basis-0 items-center gap-2 overflow-hidden">
          <UniverSurfaceSelector
            viewModel={viewModel}
            onContentViewChange={onContentViewChange}
          />
          {primaryStatus || bridgeActions.length > 0 || editAction ? (
            <div
              className="flex min-w-0 shrink-0 items-center gap-1 overflow-hidden"
              data-testid="univer-artifact-header-status-actions"
            >
              {primaryStatus ? (
                <UniverArtifactHeaderPrimaryStatus status={primaryStatus} />
              ) : null}
              {bridgeActions.map((action) => (
                <UniverArtifactHeaderBridgeActionButton
                  key={bridgeActionKey(action)}
                  action={action}
                  onContentViewChange={onContentViewChange}
                  onOpenOwnerSession={onOpenOwnerSession}
                />
              ))}
              {editAction ? (
                <UniverArtifactHeaderEditAction
                  action={editAction}
                  onRequestTrunkEdit={onRequestTrunkEdit}
                  onStopTrunkEdit={onStopTrunkEdit}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {hasWorktreeViewActions ? (
            <div
              className="flex min-w-0 shrink-0 items-center justify-end overflow-hidden"
              data-testid="univer-artifact-header-view-switch"
            >
              <UniverArtifactHeaderWorktreeViewSwitch
                actions={worktreeViewActions}
                onContentViewChange={onContentViewChange}
              />
            </div>
          ) : null}
          {reviewActions.length > 0 ? (
            <div
              className={cn(
                "flex min-w-0 shrink-0 items-center justify-end gap-0.5 overflow-hidden",
                hasWorktreeViewActions && "ml-1 border-l border-border pl-1.5",
              )}
              data-testid="univer-artifact-header-review-actions"
            >
              {reviewActions.map((action) => (
                <UniverArtifactHeaderContentAction
                  key={contentActionKey(action)}
                  action={action}
                  onContentViewChange={onContentViewChange}
                  onMergeWorktree={onMergeWorktree}
                  onDiscardWorktree={onDiscardWorktree}
                />
              ))}
            </div>
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

function UniverSurfaceSelector({
  viewModel,
  onContentViewChange,
}: {
  viewModel: UniverArtifactHeaderViewModel;
  onContentViewChange?: (view: CoworkContentViewState) => void;
}) {
  const unit = viewModel.breadcrumb.unit;
  const selectedWorktree = viewModel.worktreeOptions.find((option) => option.selected) ?? viewModel.worktreeOptions[0];
  const selectedUnit = selectedWorktree?.unitOptions.find((option) => option.selected) ??
    viewModel.unitOptions.find((option) => option.selected);
  const canSwitch = Boolean(
    onContentViewChange &&
      viewModel.worktreeOptions.some((option) => option.unitOptions.length > 0),
  );
  const hasSurfaceRoute = Boolean(selectedWorktree || selectedUnit || unit);
  const content = (
    <>
      {!hasSurfaceRoute ? (
        <span
          className="min-w-0 max-w-[24ch] shrink truncate"
          title={viewModel.breadcrumb.univerfile.label}
        >
          {viewModel.breadcrumb.univerfile.label}
        </span>
      ) : null}
      {selectedWorktree ? (
        <span className="flex min-w-[5rem] max-w-[22ch] shrink-[3] items-center gap-1.5 truncate">
          <UniverContentViewIcon option={selectedWorktree} />
          <span className="min-w-0 truncate">{selectedWorktree.label}</span>
        </span>
      ) : null}
      {selectedUnit ?? unit ? (
        <>
          {selectedWorktree ? <BreadcrumbDivider /> : null}
          <span className="flex min-w-[4rem] max-w-[28ch] shrink-[2] items-center gap-1.5 truncate">
            {unitIcon(selectedUnit?.kind ?? unit?.kind ?? "")}
            <span className="min-w-0 truncate">{selectedUnit?.label ?? unit?.label}</span>
          </span>
        </>
      ) : null}
    </>
  );

  if (!canSwitch) {
    return (
      <div
        className="flex min-w-0 shrink items-center gap-1 text-[13px] font-medium leading-5 text-foreground"
        data-testid="univer-surface-selector"
      >
        {content}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-8 min-w-0 max-w-full shrink items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[13px] font-medium leading-5 text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="univer-surface-selector"
        aria-label="切换 Worktree 或 Unit"
      >
        {content}
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        {viewModel.worktreeOptions.map((worktree, index) => (
          <Fragment key={worktree.id}>
            {index > 0 && viewModel.worktreeOptions[index - 1]?.groupLabel !== worktree.groupLabel ? <DropdownMenuSeparator /> : null}
            {index === 0 || viewModel.worktreeOptions[index - 1]?.groupLabel !== worktree.groupLabel ? (
              <div
                className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-normal text-muted-foreground"
                data-testid="univer-surface-selector-group-label"
              >
                {worktree.groupLabel}
              </div>
            ) : null}
            <DropdownMenuGroup>
              {worktree.unitOptions.map((option) => (
                <UniverSurfaceSelectorItem
                  key={`${worktree.id}:${option.unitId}`}
                  worktree={worktree}
                  option={option}
                  selected={worktree.selected && option.selected}
                  onSelect={() => onContentViewChange?.(option.view)}
                />
              ))}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UniverSurfaceSelectorItem({
  worktree,
  option,
  selected,
  onSelect,
}: {
  worktree: UniverArtifactHeaderWorktreeOption;
  option: UniverArtifactHeaderUnitOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const subtitle = surfaceSelectorItemSubtitle(worktree);
  const title = subtitle ? `${option.label} · ${subtitle}` : option.label;
  const worktreeId = worktree.view.scope === "trunk" ? undefined : worktree.view.worktreeId;
  return (
    <DropdownMenuItem
      className="min-h-10 gap-2 px-2.5 py-1.5"
      data-testid="univer-surface-selector-item"
      data-surface-option-id={worktree.id}
      data-surface-relation={worktree.relation}
      data-surface-worktree-id={worktreeId}
      onClick={onSelect}
      aria-pressed={selected}
      title={title}
    >
      {unitIcon(option.kind)}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] leading-4">{option.label}</span>
        {subtitle ? (
          <span className="truncate text-[11px] font-normal leading-4 text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
      {option.status ? <UniverUnitStatusBadge status={option.status} /> : null}
      {selected ? <Check className="size-3.5 shrink-0" /> : null}
    </DropdownMenuItem>
  );
}

function surfaceSelectorItemSubtitle(
  worktree: UniverArtifactHeaderWorktreeOption,
): string | undefined {
  const parts: string[] = [];
  if (worktree.relation !== "currentVersion") {
    parts.push(worktree.label);
  }
  if (worktree.description) {
    parts.push(worktree.description);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function BreadcrumbDivider() {
  return <span className="shrink-0 text-muted-foreground/70">/</span>;
}

function UniverUnitStatusBadge({
  status,
}: {
  status: UniverArtifactHeaderUnitOption["status"];
}) {
  if (!status) return null;
  const copy = unitStatusCopy(status);
  return (
    <span
      className={cn(
        "shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
        status === "conflict"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground",
      )}
      title={copy.tooltip}
    >
      {copy.label}
    </span>
  );
}

function unitStatusCopy(
  status: NonNullable<UniverArtifactHeaderUnitOption["status"]>,
): { label: string; tooltip: string } {
  if (status === "created") {
    return {
      label: "新增",
      tooltip: "这个 unit 是当前 worktree 新增的内容。",
    };
  }
  if (status === "modified") {
    return {
      label: "已修改",
      tooltip: "这个 unit 在当前 worktree 中有修改。",
    };
  }
  if (status === "deleted") {
    return {
      label: "删除",
      tooltip: "这个 unit 会被当前 worktree 删除。",
    };
  }
  if (status === "conflict") {
    return {
      label: "冲突",
      tooltip: "这个 unit 与当前版本存在冲突。",
    };
  }
  return {
    label: "未改动",
    tooltip: "这个 unit 在当前 worktree 中没有改动。",
  };
}

function UniverContentViewIcon({
  option,
}: {
  option: UniverArtifactHeaderWorktreeOption;
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

type UniverArtifactHeaderPrimaryStatusTone = "danger" | "warning" | "positive" | "muted";
type UniverArtifactHeaderPrimaryStatusIcon = "conflict" | "baseline" | "pending" | "edit" | "view";

interface UniverArtifactHeaderPrimaryStatus {
  id: string;
  label: string;
  tooltip: string;
  tone: UniverArtifactHeaderPrimaryStatusTone;
  icon: UniverArtifactHeaderPrimaryStatusIcon;
}

function primaryStatusFor(
  viewModel: UniverArtifactHeaderViewModel,
): UniverArtifactHeaderPrimaryStatus | null {
  const selectedWorktree = viewModel.worktreeOptions.find((option) => option.selected);
  if (selectedWorktree?.relation === "otherTask") {
    return {
      id: "readonly-other-task",
      label: "只读",
      tooltip: selectedWorktree.ownerSessionTitle
        ? `这个来源属于任务「${selectedWorktree.ownerSessionTitle}」，请打开该任务合入或丢弃。`
        : "这个来源属于另一个任务，只能在当前任务中查看。",
      tone: "muted",
      icon: "view",
    };
  }

  const conflict = viewModel.badges.find((badge) => badge.type === "conflict");
  if (conflict) {
    const copy = badgeCopy(conflict);
    return {
      id: "conflict",
      label: "冲突",
      tooltip: copy.tooltip,
      tone: "danger",
      icon: "conflict",
    };
  }

  const diverged = viewModel.badges.find((badge) => badge.type === "diverged");
  if (diverged) {
    const copy = badgeCopy(diverged);
    return {
      id: "diverged",
      label: "基线有变",
      tooltip: copy.tooltip,
      tone: "warning",
      icon: "baseline",
    };
  }

  const editGate = viewModel.editGate;
  if (!editGate) return null;
  const copy = editGateCopy(editGate);

  if (editGate.status === "locked") {
    return {
      id: "pending",
      label: "待处理",
      tooltip: copy.tooltip,
      tone: "warning",
      icon: "pending",
    };
  }
  if (editGate.status === "editingWithPending") {
    return {
      id: "editing",
      label: "编辑中",
      tooltip: copy.tooltip,
      tone: "positive",
      icon: "edit",
    };
  }
  if (editGate.status === "viewOnly") {
    return {
      id: "readonly",
      label: "只读",
      tooltip: copy.tooltip,
      tone: "muted",
      icon: "view",
    };
  }
  return {
    id: "editable",
    label: "可编辑",
    tooltip: copy.tooltip,
    tone: "positive",
    icon: "edit",
  };
}

function UniverArtifactHeaderPrimaryStatus({
  status,
}: {
  status: UniverArtifactHeaderPrimaryStatus;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
              <span
                className={cn(
                  "inline-flex max-w-[5.5rem] shrink-0 items-center gap-1.5 truncate rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
              status.tone === "danger"
                ? "bg-destructive/10 text-destructive"
                : status.tone === "warning"
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : status.tone === "positive"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground",
                )}
                data-testid="univer-artifact-header-primary-status"
                title={status.tooltip}
              >
            <UniverArtifactHeaderPrimaryStatusIcon icon={status.icon} />
            <span className="min-w-0 truncate">{status.label}</span>
          </span>
        }
      />
      <TooltipContent>{status.tooltip}</TooltipContent>
    </Tooltip>
  );
}

function bridgeActionKey(action: UniverArtifactHeaderBridgeAction): string {
  if (action.type === "openPendingWorktree") {
    const targetId = action.target.scope === "trunk" ? "trunk" : action.target.worktreeId;
    return `${action.type}:${action.ownerSessionId ?? "current"}:${targetId}:${action.target.unitId}`;
  }
  return `${action.type}:${action.ownerSessionId}`;
}

function UniverArtifactHeaderBridgeActionButton({
  action,
  onContentViewChange,
  onOpenOwnerSession,
}: {
  action: UniverArtifactHeaderBridgeAction;
  onContentViewChange?: (view: CoworkContentViewState) => void;
  onOpenOwnerSession?: (ownerSessionId: string, view?: CoworkContentViewState) => void;
}) {
  if (action.type === "openPendingWorktree") {
    return (
      <Button
        variant="secondary"
        size="xs"
        className="h-6 max-w-[8.5rem] shrink-0 overflow-hidden px-2 text-[11px]"
        title={action.tooltip}
        aria-label={action.label}
        onClick={() => {
          if (action.ownerSessionId) {
            onOpenOwnerSession?.(action.ownerSessionId, action.target);
            return;
          }
          onContentViewChange?.(action.target);
        }}
      >
        <GitCompareArrows data-icon="inline-start" />
        <span className="min-w-0 truncate">{action.label}</span>
      </Button>
    );
  }

  return (
    <Button
      variant="secondary"
      size="xs"
      className="h-6 max-w-[8rem] shrink-0 overflow-hidden px-2 text-[11px]"
      title={action.tooltip}
      aria-label={action.label}
      onClick={() => onOpenOwnerSession?.(action.ownerSessionId, action.target)}
    >
      <GitBranch data-icon="inline-start" />
      <span className="min-w-0 truncate">{action.label}</span>
    </Button>
  );
}

type CoworkSetContentScopeAction = Extract<CoworkContentAction, { type: "setContentScope" }>;

function isContentScopeAction(action: CoworkContentAction): action is CoworkSetContentScopeAction {
  return action.type === "setContentScope";
}

function worktreeViewActionOrder(action: CoworkSetContentScopeAction): number {
  if (action.target.scope === "worktree") return 0;
  if (action.target.scope === "mergePreview") return 1;
  return 2;
}

function orderedWorktreeViewActions(
  actions: CoworkContentAction[],
): CoworkSetContentScopeAction[] {
  return [...actions.filter(isContentScopeAction)]
    .sort((left, right) => worktreeViewActionOrder(left) - worktreeViewActionOrder(right));
}

function UniverArtifactHeaderWorktreeViewSwitch({
  actions,
  onContentViewChange,
}: {
  actions: CoworkContentAction[];
  onContentViewChange?: (view: CoworkContentViewState) => void;
}) {
  const viewActions = orderedWorktreeViewActions(actions);
  if (viewActions.length === 0) return null;

  return (
    <div
      className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
      role="group"
      aria-label="切换 Worktree 查看方式"
    >
      {viewActions.map((action) => (
        <UniverArtifactHeaderContentAction
          key={contentActionKey(action)}
          action={action}
          onContentViewChange={onContentViewChange}
        />
      ))}
    </div>
  );
}

function UniverArtifactHeaderPrimaryStatusIcon({
  icon,
}: {
  icon: UniverArtifactHeaderPrimaryStatusIcon;
}) {
  if (icon === "edit") {
    return <PencilLine className="size-3 shrink-0" />;
  }
  if (icon === "pending") {
    return <Lock className="size-3 shrink-0" />;
  }
  if (icon === "baseline") {
    return <GitMerge className="size-3 shrink-0" />;
  }
  if (icon === "conflict") {
    return <X className="size-3 shrink-0" />;
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
      label: "待处理",
      tooltip: "已有任务修改待处理。继续编辑当前版本可能影响后续合入。",
    };
  }
  if (editGate.status === "editingWithPending") {
    return {
      label: "编辑中",
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
      tooltip: "正在查看待合入内容或预览合入后效果，不能直接编辑。",
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
  if (badge.type === "unitStatus") {
    if (badge.status === "created") {
      return {
        label: "新增",
        tooltip: "当前单元是这个 worktree 新增的内容。",
      };
    }
    if (badge.status === "modified") {
      return {
        label: "已修改",
        tooltip: "当前单元在这个 worktree 中有修改。",
      };
    }
    if (badge.status === "deleted") {
      return {
        label: "删除",
        tooltip: "当前单元会被这个 worktree 删除。",
      };
    }
    if (badge.status === "conflict") {
      return {
        label: "冲突",
        tooltip: "当前单元与当前版本存在冲突。",
      };
    }
    return {
      label: "未改动",
      tooltip: "当前单元在这个 worktree 中没有改动。",
    };
  }

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
  if (label === "最新版本有改动 · 正在看原始修改") {
    return {
      label: "基线有变",
      tooltip: "当前版本在 worktree 创建后有更新，可以切到预览合入后查看结果。",
    };
  }
  if (label === "最新版本有改动 · 已显示合并后效果") {
    return {
      label: "基线有变",
      tooltip: "当前版本在 worktree 创建后有更新，正在预览合入后的结果。",
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
            variant="secondary"
            size="xs"
            className="h-6 max-w-[7rem] shrink-0 overflow-hidden px-2 text-[11px]"
            title={copy.tooltip}
            onClick={() =>
              runCoworkEditAction(action, {
                onRequestTrunkEdit,
                onStopTrunkEdit,
              })
            }
          >
            <PencilLine data-icon="inline-start" />
            <span className="min-w-0 truncate">{copy.label}</span>
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
        variant="ghost"
        size="xs"
        className={cn(
          "h-6 max-w-[5.75rem] overflow-hidden rounded-[5px] px-2 text-[11px]",
          action.selected
            ? "bg-background text-foreground shadow-sm hover:bg-background"
            : "text-muted-foreground hover:text-foreground",
        )}
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
        label: "合入后",
        tooltip: "预览这些修改合入当前版本后的结果。",
        ariaLabel: "预览合入后",
      };
    }
    return {
      label: "修改",
      tooltip: "查看这个 worktree 的修改内容。",
      ariaLabel: "查看修改",
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
  snapshot?: CoworkSnapshot | null;
  error: Error | null;
  isError: boolean;
  isLoading: boolean;
}

function UniverContentViewerSurface({
  target,
  surface,
  viewerDataSource,
  contentSurface,
  snapshot,
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
  } else if (snapshot?.loadState === "error") {
    content = (
      <PreviewError
        message={snapshot.error?.message ?? "Failed to load Univer content."}
      />
    );
  } else {
    if (!viewerRequest || !viewerDataSource) {
      content = <PreviewLoading />;
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
