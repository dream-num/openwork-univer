/** @jsxImportSource react */
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePanelRef } from "react-resizable-panels";
import { AlertTriangle, Columns2, FileSpreadsheet, FileText, Globe, Mic2, Settings2, X, Zap } from "lucide-react";
import type { CoworkController } from "@univer/cowork";
import { useCoworkSnapshot } from "@univer/cowork/react";

import { t } from "../../../../i18n";
import { OPENWORK_EXTENSION_CATALOG } from "../../../../app/constants";
import {
  type OpenworkServerClient,
  type OpenworkServerStatus,
  type OpenworkSession,
  type OpenworkSessionUniverMetadata,
  type OpenworkSessionUniverMetadataPatch,
} from "../../../../app/lib/openwork-server";
import { getDisplaySessionTitle } from "../../../../app/lib/session-title";
import type { BootPhase } from "../../../../app/lib/startup-boot";
import { openDesktopPath, revealDesktopItemInDir, type WorkspaceInfo } from "../../../../app/lib/desktop";
import type {
  PendingPermission,
  PendingQuestion,
  ProviderListItem,
  TodoItem,
  WorkspaceConnectionState,
  WorkspaceSessionGroup,
} from "../../../../app/types";
import type { ShareWorkspaceModalProps } from "../../workspace/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "../../../design-system/modals/confirm-modal";
import ProviderAuthModal, { type ProviderAuthModalProps } from "../../connections/provider-auth/provider-auth-modal";
import { RenameSessionModal } from "../modals/rename-session-modal";
import { AppSidebar } from "../sidebar/app-sidebar";
import { useSessionManagementStore } from "../sidebar/session-management-store";
import { SessionSurface, type SessionSurfaceProps } from "../surface/session-surface";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ShareWorkspaceModal } from "../../workspace/share-workspace-modal";
import { StatusBar, type StatusBarProps } from "./status-bar";
import { OwDotTicker } from "../../../shell/dot-ticker";
import { NotificationBell } from "../../../shell/notification-center";
import { useReactRenderWatchdog } from "../../../shell/react-render-watchdog";
import { useShellConfig } from "../../../shell/shell-config";
import { type SidePanelItem, useUiStateStore } from "../../../shell/ui-state-store";

import { isElectronRuntime } from "../../../../app/utils";
import { isCollectibleArtifactTarget, isLocalhostBrowserTarget, isOpenableFileTarget, type OpenTarget } from "../artifacts/open-target";
import { isUniverTarget, targetFromPrimaryUniverfile, useUniverCoworkSession, type UniverTarget } from "../artifacts/univer-cowork-session";
import { notifyUniverSessionMetadataUpdated } from "../univer-session-events";
import { resolveSessionUniverNewLifecycle } from "../univer-session-lifecycle";
import { resolveSessionUniverWorktreePersistence } from "../univer-session-worktree-adapter";
import { normalizeUniverTargetPath, useUniverWorktreeStatusStore } from "../univer-worktree-status-store";
import type { OpenTargetOptions } from "@/lib/target-provider";
import { VoicePanel } from "../voice/voice-panel";
import { SidePanel } from "../panel/side-panel";
import { TerminalDock } from "../terminal/terminal-dock";
import { useActivePanelTab, usePanelTabStore, useSessionPanelState } from "../panel/panel-tab-store";
import { UniverWorktreePopover, WorkspaceFilesPopover } from "../panel/workspace-file-tree-popover";
import { useWorkspaceShellLayout } from "../../../shell/workspace-shell-layout";
import { useControlAction, type OpenworkControlAction } from "../../../shell/control/control-provider";
import { getExtensionId, isOpenWorkExtensionEnabled, OPENWORK_EXTENSION_STATE_CHANGED } from "../../settings/extension-state";
import { cn } from "@/lib/utils";

const STARTUP_SKELETON_ROWS = [
  { id: "intro", titleWidth: "42%", bodyWidth: "88%" },
  { id: "middle", titleWidth: "56%", bodyWidth: "88%" },
  { id: "final", titleWidth: "36%", bodyWidth: "74%" },
];
const GLOBAL_VOICE_SIDE_PANEL_KEY = "__openwork_voice__";
const EMPTY_TRANSCRIPT_TARGETS: OpenTarget[] = [];
const UNIVER_ARTIFACT_PANEL_WIDTH = 760;
const UNIVER_ARTIFACT_ACTIVE_EVENT = "openwork-univer-artifact-active";
const MAX_SIDEBAR_UNIVER_STATUS_PROBES = 1;
const SIDEBAR_UNIVER_STATUS_INITIAL_REFRESH_DELAY_MS = 2_000;
const SIDEBAR_UNIVER_STATUS_REFRESH_INTERVAL_MS = 10_000;
const SIDEBAR_UNIVER_STATUS_SESSION_SWITCH_DELAY_MS = 3_000;

export type OpenSessionTab = {
  workspaceId: string;
  sessionId: string;
};

type UnavailableUniverTargetDeleteRequest =
  | {
      kind: "single";
      workspaceId: string;
      name: string;
      path: string;
      sessionIds: string[];
    }
  | {
      kind: "section";
      workspaceId: string;
      targetCount: number;
      sessionIds: string[];
    };

type StatusBarOverrides = Pick<
  StatusBarProps,
  | "loading"
  | "showSettingsButton"
  | "settingsOpen"
  | "reloadBusy"
  | "reloadError"
>;

export type SessionPageHistoryControls = {
  canUndo: boolean;
  canRedo: boolean;
  busyAction: "undo" | "redo" | null;
  onUndo: () => void | Promise<void>;
  onRedo: () => void | Promise<void>;
};

function sessionNeedsSidebarUniverStatus(
  session: WorkspaceSessionGroup["sessions"][number],
): boolean {
  if (session.sessionUniverWorktreeTerminalState) return false;
  if (!session.primaryUniverTarget?.path) return false;
  return Boolean(session.sessionUniverWorktreeId?.trim() || session.sessionUniverWorktreeIssue);
}

function addSidebarUniverStatusProbeTarget(
  targetsByPath: Map<string, UniverTarget>,
  primaryUniverTarget: { path?: string | null; value?: string | null; name?: string | null } | null | undefined,
) {
  const path = normalizeUniverTargetPath(primaryUniverTarget?.path ?? primaryUniverTarget?.value);
  if (!path || targetsByPath.has(path)) return;
  const target = targetFromPrimaryUniverfile({
    path,
    name: primaryUniverTarget?.name,
  });
  if (!target) return;
  targetsByPath.set(path, target);
}

function buildSidebarUniverStatusProbeTargets(
  group: WorkspaceSessionGroup | null,
  selectedSessionId: string | null,
  univerArtifactActive: boolean,
  selectedSessionLoading: boolean,
): UniverTarget[] {
  if (!group || group.status !== "ready") return [];
  if (selectedSessionLoading) return [];
  if (univerArtifactActive) return [];

  const discoveredTargetsByPath = new Map(
    group.univerTargets.map((target) => [
      normalizeUniverTargetPath(target.path),
      target,
    ]),
  );
  const targetsByPath = new Map<string, UniverTarget>();
  const selectedId = selectedSessionId?.trim() ?? "";
  const selectedSession = selectedId
    ? group.sessions.find((session) => session.id === selectedId)
    : undefined;
  addSidebarUniverStatusProbeTarget(targetsByPath, selectedSession?.primaryUniverTarget);
  const addSessionTarget = (session: WorkspaceSessionGroup["sessions"][number]) => {
    if (!sessionNeedsSidebarUniverStatus(session)) return;
    const path = normalizeUniverTargetPath(session.primaryUniverTarget?.path);
    const discovered = discoveredTargetsByPath.get(path);
    addSidebarUniverStatusProbeTarget(targetsByPath, {
      path,
      name: discovered?.name ?? session.primaryUniverTarget?.name,
    });
  };

  for (const session of group.sessions) {
    if (targetsByPath.size >= MAX_SIDEBAR_UNIVER_STATUS_PROBES) break;
    if (session.id === selectedId) continue;
    addSessionTarget(session);
  }

  return Array.from(targetsByPath.values());
}

function SidebarUniverWorktreeStatusProbes({
  client,
  isRemoteWorkspace,
  serverWorkspaceId,
  storeWorkspaceId,
  targets,
}: {
  client: OpenworkServerClient | null;
  isRemoteWorkspace: boolean;
  serverWorkspaceId: string | null;
  storeWorkspaceId: string;
  targets: UniverTarget[];
}) {
  const normalizedServerWorkspaceId = serverWorkspaceId?.trim() ?? "";
  const normalizedStoreWorkspaceId = storeWorkspaceId.trim();
  const targetSignature = targets.map((target) => target.id).join("\n");
  const [activeTargetSignature, setActiveTargetSignature] = useState("");

  useEffect(() => {
    setActiveTargetSignature("");
    if (!targetSignature) return;
    const timeoutId = window.setTimeout(() => {
      setActiveTargetSignature(targetSignature);
    }, SIDEBAR_UNIVER_STATUS_INITIAL_REFRESH_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [targetSignature]);

  const activeTargets = activeTargetSignature === targetSignature ? targets : [];
  if (!client || !normalizedServerWorkspaceId || !normalizedStoreWorkspaceId || activeTargets.length === 0) return null;

  return (
    <>
      {activeTargets.map((target) => (
        <SidebarUniverWorktreeStatusProbe
          key={target.id}
          client={client}
          isRemoteWorkspace={isRemoteWorkspace}
          serverWorkspaceId={normalizedServerWorkspaceId}
          storeWorkspaceId={normalizedStoreWorkspaceId}
          target={target}
        />
      ))}
    </>
  );
}

function SidebarUniverWorktreeStatusProbe({
  client,
  isRemoteWorkspace,
  serverWorkspaceId,
  storeWorkspaceId,
  target,
}: {
  client: OpenworkServerClient;
  isRemoteWorkspace: boolean;
  serverWorkspaceId: string;
  storeWorkspaceId: string;
  target: UniverTarget;
}) {
  const { controller } = useUniverCoworkSession({
    client,
    workspaceId: serverWorkspaceId,
    target,
    isRemoteWorkspace,
  });

  if (!controller) return null;

  return (
    <SidebarUniverWorktreeStatusSnapshotProbe
      controller={controller}
      storeWorkspaceId={storeWorkspaceId}
      target={target}
    />
  );
}

function SidebarUniverWorktreeStatusSnapshotProbe({
  controller,
  storeWorkspaceId,
  target,
}: {
  controller: CoworkController;
  storeWorkspaceId: string;
  target: UniverTarget;
}) {
  const snapshot = useCoworkSnapshot(controller);
  const updateTargetSnapshot = useUniverWorktreeStatusStore((state) => state.updateTargetSnapshot);
  const refresh = useCallback(() => {
    void controller.refresh();
  }, [controller]);

  useEffect(() => {
    const timeoutId = window.setTimeout(refresh, SIDEBAR_UNIVER_STATUS_INITIAL_REFRESH_DELAY_MS);
    const intervalId = window.setInterval(refresh, SIDEBAR_UNIVER_STATUS_REFRESH_INTERVAL_MS);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [refresh, target.value]);

  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  useEffect(() => {
    if (snapshot.loadState !== "ready") return;
    updateTargetSnapshot(storeWorkspaceId, target.value, snapshot);
  }, [snapshot, storeWorkspaceId, target.value, updateTargetSnapshot]);

  return null;
}

export type SessionPageSidebarProps = {
  workspaceSessionGroups: WorkspaceSessionGroup[];
  selectedWorkspaceId: string;
  selectedSessionId: string | null;
  developerMode: boolean;
  sessionStatusById: Record<string, string>;
  connectingWorkspaceId: string | null;
  workspaceConnectionStateById: Record<string, WorkspaceConnectionState>;
  newTaskDisabled: boolean;
  sidebarHydratedFromCache: boolean;
  startupPhase: BootPhase;
  onSelectWorkspace: (workspaceId: string) => Promise<boolean> | boolean | void;
  onOpenSession: (workspaceId: string, sessionId: string) => void;
  onPrefetchSession?: (workspaceId: string, sessionId: string) => void;
  onCreateTaskInWorkspace: (workspaceId: string) => void;
  onCreateTaskForUniverTarget?: (workspaceId: string, target: WorkspaceSessionGroup["univerTargets"][number]) => void;
  onCreateTaskFromUniverSession?: (workspaceId: string, sourceSessionId: string) => void;
  onOpenUniverTargetOverview?: (workspaceId: string, target: WorkspaceSessionGroup["univerTargets"][number]) => void;
  onCreateTaskWithPrompt?: (workspaceId: string, prompt: string) => void;
  onOpenRenameWorkspace: (workspaceId: string) => void;
  onShareWorkspace: (workspaceId: string) => void;
  onRevealWorkspace: (workspaceId: string) => void;
  onRecoverWorkspace: (workspaceId: string) => Promise<boolean> | boolean | void;
  onTestWorkspaceConnection: (workspaceId: string) => Promise<boolean> | boolean | void;
  onEditWorkspaceConnection: (workspaceId: string) => void;
  onForgetWorkspace: (workspaceId: string) => void;
  onOpenCreateWorkspace: () => void;
  onReorderWorkspaces?: (workspaceIds: string[]) => void;
};

export type SessionPageSurfaceProps = Omit<
  SessionSurfaceProps,
  "client" | "workspaceId" | "sessionId" | "opencodeBaseUrl" | "openworkToken"
>;

export type SessionPageProps = {
  selectedSessionId: string | null;
  selectedWorkspaceId: string;
  selectedWorkspaceDisplay: {
    id?: string;
    name?: string;
    displayName?: string;
    workspaceType?: WorkspaceInfo["workspaceType"];
  };
  selectedWorkspaceRoot: string;
  selectedWorkspaceError?: string | null;
  runtimeWorkspaceId: string | null;
  /**
   * Pre-built OpenCode SDK base URL for the selected workspace's owning
   * server. The parent route resolves this through `resolveWorkspaceEndpoint`
   * so we never compose `<baseUrl>/workspace/<id>/opencode` here.
   */
  opencodeBaseUrl?: string | null;
  workspaces: WorkspaceInfo[];
  clientConnected: boolean;
  openworkServerStatus: OpenworkServerStatus;
  openworkServerClient: OpenworkServerClient | null;
  environmentClient?: OpenworkServerClient | null;
  openworkServerToken?: string | null;
  onSessionUniverMetadataChanged?: (workspaceId: string, sessionId: string, metadata: OpenworkSessionUniverMetadata | null) => void;
  onSessionUniverLifecycleSessionCreated?: (workspaceId: string, session: OpenworkSession) => void;
  isFreshUniverLifecycleTarget?: (sessionId: string, targetId: string) => boolean;
  developerMode: boolean;
  headerStatus: string;
  busyHint: string | null;
  startupPhase: BootPhase;
  providerConnectedIds: string[];
  hasUsableModel?: boolean;
  providers?: ProviderListItem[];
  mcpConnectedCount: number;
  onSendFeedback: () => void;
  onOpenSettings: () => void;
  sidebar: SessionPageSidebarProps;
  surface?: SessionPageSurfaceProps | null;
  history?: SessionPageHistoryControls | null;
  todos: TodoItem[];
  sessionLoadingById: (sessionId: string | null) => boolean;
  shareWorkspaceModal?: ShareWorkspaceModalProps | null;
  providerAuthModal?: ProviderAuthModalProps | null;
  activePermission?: PendingPermission | null;
  permissionReplyBusy?: boolean;
  respondPermission?: (requestID: string, reply: "once" | "always" | "reject") => void;
  safeStringify?: (value: unknown) => string;
  activeQuestion?: PendingQuestion | null;
  questionReplyBusy?: boolean;
  respondQuestion?: (requestID: string, answers: string[][]) => void;
  statusBar?: Partial<StatusBarOverrides>;
  notFoundMessage?: string | null;
  onOpenProviderAuth?: () => void;
  onRenameSession?: (sessionId: string, title: string) => Promise<void> | void;
  onDeleteSession?: (sessionId: string) => Promise<void> | void;
  onDeleteSessions?: (workspaceId: string, sessionIds: string[]) => Promise<void> | void;
  onArchiveSession?: (sessionId: string, archived: boolean) => Promise<void> | void;
  onAccessibleTargetsChange?: (targets: OpenTarget[]) => void;
  /** Settings content rendered inside the right pane when the settings rail icon is active. */
  settingsSlot?: React.ReactNode;
  terminalOpen?: boolean;
  onTerminalOpenChange?: (open: boolean) => void;
  onSessionTabsChange?: (tabs: OpenSessionTab[]) => void;
};

function getSidebarInitialLoading(props: SessionPageSidebarProps) {
  if (props.workspaceSessionGroups.some((group) => group.sessions.length > 0)) {
    return false;
  }
  if (props.sidebarHydratedFromCache) return false;
  if (
    props.startupPhase !== "sessionIndexReady" &&
    props.startupPhase !== "firstSessionReady" &&
    props.startupPhase !== "ready"
  ) {
    return true;
  }
  return props.workspaceSessionGroups.some(
    (group) => group.status === "loading" || group.status === "idle",
  );
}

function sessionTitleForId(groups: WorkspaceSessionGroup[], id: string | null | undefined) {
  if (!id) return "";
  const sessionsById = new Map(groups.flatMap((group) => group.sessions.map((session) => [session.id, session] as const)));
  const match = sessionsById.get(id);
  return match ? getDisplaySessionTitle(match.title) : "";
}

function sessionExistsInWorkspace(groups: WorkspaceSessionGroup[], workspaceId: string, sessionId: string | null | undefined) {
  if (!sessionId) return false;
  return groups.some((group) => (
    group.workspace.id === workspaceId && group.sessions.some((session) => session.id === sessionId)
  ));
}

function sessionCreatedAt(session: WorkspaceSessionGroup["sessions"][number]): number {
  return session.time?.created ?? session.time?.updated ?? 0;
}

function existingWorktreeOwnerForCandidate(
  sessions: WorkspaceSessionGroup["sessions"],
  currentSessionId: string,
  targetPath: string,
  worktreeId: string,
) {
  const normalizedPath = normalizeUniverTargetPath(targetPath);
  const normalizedWorktreeId = worktreeId.trim();
  if (!normalizedPath || !normalizedWorktreeId) return null;
  const owners = sessions.filter((session) => (
    session.id !== currentSessionId &&
    !session.sessionUniverWorktreeTerminalState &&
    normalizeUniverTargetPath(session.primaryUniverTarget?.path) === normalizedPath &&
    session.sessionUniverWorktreeId?.trim() === normalizedWorktreeId
  ));
  return owners.sort((left, right) => {
    const createdDelta = sessionCreatedAt(left) - sessionCreatedAt(right);
    if (createdDelta !== 0) return createdDelta;
    return left.id.localeCompare(right.id);
  })[0] ?? null;
}

function isTrackableAccessibleTarget(target: OpenTarget) {
  return isOpenableFileTarget(target) || isLocalhostBrowserTarget(target);
}

function CurrentUniverfileChip({
  discovered,
  target,
  onOpen,
}: {
  discovered: boolean;
  target: OpenTarget;
  onOpen: () => void;
}) {
  const unavailable = !discovered;
  const label = unavailable ? `${target.name} unavailable` : target.name;

  return (
    <div className="ml-auto flex min-w-0 max-w-[45%] items-center px-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-6 min-w-0 max-w-full gap-1.5 rounded-md border border-transparent bg-muted/55 px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
          unavailable && "bg-amber-3/55 text-amber-11 hover:bg-amber-3/80 hover:text-amber-12",
        )}
        title={`${target.name} - ${target.value}`}
        aria-label={`Open current Univerfile ${label}`}
        data-testid="composer-toolbar-univerfile-context"
        onClick={onOpen}
      >
        {unavailable ? <AlertTriangle className="size-3.5 shrink-0" /> : <FileSpreadsheet className="size-3.5 shrink-0" />}
        <span className="min-w-0 truncate">{target.name}</span>
        {unavailable ? <span className="shrink-0 text-[10px]">Unavailable</span> : null}
      </Button>
    </div>
  );
}

function absoluteWorkspacePath(root: string | null | undefined, value: string) {
  const target = value.trim();
  if (!target) return "";
  if (/^file:\/\//i.test(target)) {
    try {
      const pathname = new URL(target).pathname;
      return /^\/[a-zA-Z]:/.test(pathname) ? pathname.slice(1) : pathname;
    } catch {
      return target.replace(/^file:\/\//i, "");
    }
  }
  if (target.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(target)) return target;
  const cleanRoot = root?.trim().replace(/[/\\]+$/, "") ?? "";
  const cleanTarget = target.replace(/^[.][\\/]/, "");
  return cleanRoot ? `${cleanRoot}/${cleanTarget}` : cleanTarget;
}

function hiddenAccessibleTargetsStorageKey(workspaceId: string | null | undefined, sessionId: string | null | undefined) {
  if (!workspaceId || !sessionId) return null;
  return `openwork.session.hiddenAccessibleTargets.v1:${workspaceId}:${sessionId}`;
}

function readHiddenAccessibleTargetIds(workspaceId: string | null | undefined, sessionId: string | null | undefined): Set<string> {
  const key = hiddenAccessibleTargetsStorageKey(workspaceId, sessionId);
  if (!key || typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0));
  } catch {
    return new Set();
  }
}

function writeHiddenAccessibleTargetIds(workspaceId: string | null | undefined, sessionId: string | null | undefined, ids: Set<string>) {
  const key = hiddenAccessibleTargetsStorageKey(workspaceId, sessionId);
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore storage failures
  }
}

function controlObjectArg(args: unknown) {
  return args && typeof args === "object" && !Array.isArray(args) ? args : null;
}

function controlStringArg(args: unknown, key: string) {
  const object = controlObjectArg(args);
  const value = object ? Reflect.get(object, key) : null;
  return typeof value === "string" ? value.trim() : "";
}

export function SessionPage(props: SessionPageProps) {
  const { config: shellConfig } = useShellConfig();
  const sidebarOpen = useUiStateStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStateStore((state) => state.setSidebarOpen);
  const sessionSidePanel = useUiStateStore((state) => (
    props.selectedSessionId ? state.sidePanelState[props.selectedSessionId] ?? null : null
  ));
  const voiceSidePanelOpen = useUiStateStore((state) => state.sidePanelState[GLOBAL_VOICE_SIDE_PANEL_KEY] === "voice");
  const setSidePanelState = useUiStateStore((state) => state.setSidePanelState);
  const toggleSidePanelState = useUiStateStore((state) => state.toggleSidePanelState);
  const openTab = usePanelTabStore((state) => state.openTab);
  const closeTab = usePanelTabStore((state) => state.closeTab);
  const selectTab = usePanelTabStore((state) => state.selectTab);
  const upsertTranscriptArtifactTarget = usePanelTabStore((state) => state.upsertTranscriptArtifactTarget);
  const transcriptTargets = usePanelTabStore((state) => (
    props.selectedSessionId ? state.transcriptArtifactTargets[props.selectedSessionId] ?? EMPTY_TRANSCRIPT_TARGETS : EMPTY_TRANSCRIPT_TARGETS
  ));
  const pendingUniverWorktreePersistenceRef = useRef(new Set<string>());
  const pendingUniverLifecyclePromotionRef = useRef(new Set<string>());
  const previousSelectedSessionIdRef = useRef(props.selectedSessionId);
  const sessionPanelState = useSessionPanelState(props.selectedSessionId ?? "");
  const activePanelTab = useActivePanelTab(props.selectedSessionId ?? "");
  const [hiddenTargetRevision, setHiddenTargetRevision] = useState(0);
  const [, setExtensionStateVersion] = useState(0);
  const hiddenAccessibleTargetIds = useMemo(
    () => readHiddenAccessibleTargetIds(props.selectedWorkspaceId, props.selectedSessionId),
    [props.selectedSessionId, props.selectedWorkspaceId, hiddenTargetRevision],
  );
  const accessibleTargets = useMemo(
    () => transcriptTargets.filter((target) => isTrackableAccessibleTarget(target) && !hiddenAccessibleTargetIds.has(target.id)),
    [hiddenAccessibleTargetIds, transcriptTargets],
  );
  const artifactFileTargets = useMemo(() => accessibleTargets.filter(isCollectibleArtifactTarget), [accessibleTargets]);
  const artifactTargetCount = artifactFileTargets.length;
  const hasArtifactTargets = artifactTargetCount > 0;
  const activeSidePanel = voiceSidePanelOpen ? "voice" : sessionSidePanel;
  const sidePanelOpen = activeSidePanel !== null;
  const panelRailActive = activeSidePanel === "panel";
  const extensionsRailActive = activeSidePanel === "extensions";
  const voiceRailActive = activeSidePanel === "voice";
  const browserRailActive = panelRailActive && activePanelTab?.type === "browser";
  const activeArtifactTab = activePanelTab?.type === "artifact" ? activePanelTab : null;
  const artifactRailActive = panelRailActive && Boolean(activeArtifactTab);
  const activeArtifactTarget = activeArtifactTab
    ? artifactFileTargets.find((target) => target.id === activeArtifactTab.id)
    : null;
  const activeArtifactLooksUniver = activeArtifactTarget?.preview === "univer" ||
    activeArtifactTab?.preview === "univer" ||
    activeArtifactTab?.label.toLowerCase().endsWith(".univer") === true;
  const activeArtifactPreview = activeArtifactLooksUniver ? "univer" : activeArtifactTarget?.preview ?? activeArtifactTab?.preview;
  const univerArtifactRailActive = artifactRailActive && activeArtifactPreview === "univer";
  const activeUniverArtifactTabId = univerArtifactRailActive ? activeArtifactTab?.id ?? null : null;
  const activeUniverArtifactTarget = univerArtifactRailActive && activeArtifactTarget && isUniverTarget(activeArtifactTarget)
    ? activeArtifactTarget
    : null;
  const [sessionSwitchProbePausedFor, setSessionSwitchProbePausedFor] = useState<string | null>(null);
  const selectedSessionChanged = previousSelectedSessionIdRef.current !== props.selectedSessionId;
  useEffect(() => {
    previousSelectedSessionIdRef.current = props.selectedSessionId;
  }, [props.selectedSessionId]);
  useEffect(() => {
    const sessionId = props.selectedSessionId;
    if (!sessionId) {
      setSessionSwitchProbePausedFor(null);
      return;
    }
    setSessionSwitchProbePausedFor(sessionId);
    const timeoutId = window.setTimeout(() => {
      setSessionSwitchProbePausedFor((current) => current === sessionId ? null : current);
    }, SIDEBAR_UNIVER_STATUS_SESSION_SWITCH_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [props.selectedSessionId]);
  const selectedWorkspaceSessionGroup = useMemo(
    () => props.sidebar.workspaceSessionGroups.find((group) => group.workspace.id === props.selectedWorkspaceId) ?? null,
    [props.selectedWorkspaceId, props.sidebar.workspaceSessionGroups],
  );
  const selectedSessionLoading = Boolean(props.selectedSessionId) && props.sessionLoadingById(props.selectedSessionId);
  const selectedSessionSwitchSettling = selectedSessionChanged || sessionSwitchProbePausedFor === props.selectedSessionId;
  const sidebarUniverStatusProbeTargets = useMemo(
    () => buildSidebarUniverStatusProbeTargets(
      selectedWorkspaceSessionGroup,
      props.selectedSessionId,
      univerArtifactRailActive,
      selectedSessionLoading || selectedSessionSwitchSettling,
    ),
    [props.selectedSessionId, selectedSessionLoading, selectedSessionSwitchSettling, selectedWorkspaceSessionGroup, univerArtifactRailActive],
  );
  const selectedSidebarSession = useMemo(() => {
    if (!props.selectedSessionId) return null;
    return selectedWorkspaceSessionGroup?.sessions.find((session) => session.id === props.selectedSessionId) ?? null;
  }, [props.selectedSessionId, selectedWorkspaceSessionGroup]);
  const primaryUniverTarget = selectedSidebarSession?.primaryUniverTarget ?? null;
  const boundUniverTarget = useMemo(
    () => targetFromPrimaryUniverfile(primaryUniverTarget, selectedSidebarSession?.sessionUniverWorktreeId),
    [primaryUniverTarget, selectedSidebarSession?.sessionUniverWorktreeId],
  );
  const boundUniverTargetDiscovered = useMemo(() => {
    if (!boundUniverTarget || !selectedWorkspaceSessionGroup || selectedWorkspaceSessionGroup.status !== "ready") return true;
    const currentPath = normalizeUniverTargetPath(boundUniverTarget.value);
    return selectedWorkspaceSessionGroup.univerTargets.some((target) => normalizeUniverTargetPath(target.path) === currentPath);
  }, [boundUniverTarget, selectedWorkspaceSessionGroup]);
  const toolbarUniverTarget = boundUniverTarget ?? activeUniverArtifactTarget;
  useEffect(() => {
    if (!props.openworkServerClient || !props.runtimeWorkspaceId || !props.selectedSessionId) return;
    const openworkServerClient = props.openworkServerClient;
    const runtimeWorkspaceId = props.runtimeWorkspaceId;
    const selectedSessionId = props.selectedSessionId;
    const selectedWorkspaceId = props.selectedWorkspaceId;
    const freshTargets = transcriptTargets.filter((target) =>
      props.isFreshUniverLifecycleTarget?.(selectedSessionId, target.id) ?? true
    );
    const resolution = resolveSessionUniverNewLifecycle(selectedSidebarSession, freshTargets);
    if (!resolution) return;
    const primaryTarget = resolution.primaryTarget;
    const key = `${selectedSessionId}:${resolution.action}:${primaryTarget.path}`;
    if (pendingUniverLifecyclePromotionRef.current.has(key)) return;
    pendingUniverLifecyclePromotionRef.current.add(key);

    void openworkServerClient.applySessionUniverLifecycle(runtimeWorkspaceId, selectedSessionId, {
      event: "univerNew",
      primaryUniverTarget: primaryTarget,
    })
      .then((result) => {
        if (result.sourceMetadata) {
          props.onSessionUniverMetadataChanged?.(selectedWorkspaceId, selectedSessionId, result.sourceMetadata);
        } else {
          props.onSessionUniverMetadataChanged?.(selectedWorkspaceId, selectedSessionId, result.metadata);
        }
        if (result.action === "createdSession" && result.createdSession) {
          props.onSessionUniverLifecycleSessionCreated?.(selectedWorkspaceId, result.createdSession);
        }
        if (result.action === "promoted" || result.action === "createdSession") notifyUniverSessionMetadataUpdated();
      })
      .catch((error: unknown) => {
        console.warn("Failed to apply Univer session lifecycle from univer new", error);
      })
      .finally(() => {
        pendingUniverLifecyclePromotionRef.current.delete(key);
      });
  }, [
    props.openworkServerClient,
    props.isFreshUniverLifecycleTarget,
    props.onSessionUniverLifecycleSessionCreated,
    props.onSessionUniverMetadataChanged,
    props.runtimeWorkspaceId,
    props.selectedSessionId,
    props.selectedWorkspaceId,
    selectedSidebarSession,
    transcriptTargets,
  ]);
  useEffect(() => {
    if (!props.openworkServerClient || !props.runtimeWorkspaceId || !props.selectedSessionId) return;
    const openworkServerClient = props.openworkServerClient;
    const runtimeWorkspaceId = props.runtimeWorkspaceId;
    const selectedSessionId = props.selectedSessionId;
    const selectedWorkspaceId = props.selectedWorkspaceId;
    const candidate = resolveSessionUniverWorktreePersistence(selectedSidebarSession, transcriptTargets);
    if (!candidate) return;

    let nextPatch: OpenworkSessionUniverMetadataPatch = candidate;
    if ("sessionUniverWorktreeId" in candidate) {
      const existingOwner = existingWorktreeOwnerForCandidate(
        selectedWorkspaceSessionGroup?.sessions ?? [],
        selectedSessionId,
        candidate.primaryUniverTarget.path,
        candidate.sessionUniverWorktreeId,
      );
      if (existingOwner) {
        nextPatch = {
          primaryUniverTarget: candidate.primaryUniverTarget,
          sessionUniverWorktreeId: null,
          sessionUniverWorktreeIssue: {
            kind: "ownershipConflict",
            worktreeId: candidate.sessionUniverWorktreeId,
            ownerSessionId: existingOwner.id,
          },
          univerSessionKind: "task",
        };
      }
    }

    const issueKey = nextPatch.sessionUniverWorktreeIssue?.kind === "multiple"
      ? nextPatch.sessionUniverWorktreeIssue.worktreeIds.join(",")
      : nextPatch.sessionUniverWorktreeIssue?.kind === "ownershipConflict"
        ? `${nextPatch.sessionUniverWorktreeIssue.worktreeId}:${nextPatch.sessionUniverWorktreeIssue.ownerSessionId}`
        : "";
    const worktreeId = nextPatch.sessionUniverWorktreeId ?? issueKey;
    const key = `${selectedSessionId}:${worktreeId}`;
    if (pendingUniverWorktreePersistenceRef.current.has(key)) return;
    pendingUniverWorktreePersistenceRef.current.add(key);

    void openworkServerClient.updateSessionUniverMetadata(runtimeWorkspaceId, selectedSessionId, nextPatch)
      .then((result) => {
        props.onSessionUniverMetadataChanged?.(selectedWorkspaceId, selectedSessionId, result.metadata);
        notifyUniverSessionMetadataUpdated();
      })
      .catch((error: unknown) => {
        console.warn("Failed to persist Univer worktree ownership", error);
      })
      .finally(() => {
        pendingUniverWorktreePersistenceRef.current.delete(key);
      });
  }, [
    props.openworkServerClient,
    props.onSessionUniverMetadataChanged,
    props.runtimeWorkspaceId,
    props.selectedSessionId,
    props.selectedWorkspaceId,
    selectedSidebarSession,
    selectedWorkspaceSessionGroup?.sessions,
    transcriptTargets,
  ]);
  const voiceExtension = useMemo(
    () => OPENWORK_EXTENSION_CATALOG.find((entry) => getExtensionId(entry) === "openwork-voice") ?? null,
    [],
  );
  const voiceExtensionEnabled = voiceExtension ? isOpenWorkExtensionEnabled(voiceExtension) : false;

  useReactRenderWatchdog("SessionPage", {
    selectedSessionId: props.selectedSessionId,
    selectedWorkspaceId: props.selectedWorkspaceId,
    clientConnected: props.clientConnected,
    startupPhase: props.startupPhase,
    hasSurface: Boolean(props.surface),
    workspaceCount: props.workspaces.length,
  });

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [sessionActionId, setSessionActionId] = useState<string | null>(null);
  const [unavailableUniverTargetDelete, setUnavailableUniverTargetDelete] = useState<UnavailableUniverTargetDeleteRequest | null>(null);
  const [sessionTabs, setSessionTabs] = useState<OpenSessionTab[]>([]);
  const [splitSessionId, setSplitSessionId] = useState<string | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createGroupLabel, setCreateGroupLabel] = useState("");
  const [createGroupWorkspaceId, setCreateGroupWorkspaceId] = useState<string | null>(null);
  const [univerArtifactPaneActive, setUniverArtifactPaneActive] = useState(false);
  const [composerToolbarPopover, setComposerToolbarPopover] = useState<"files" | "changes" | "tasks" | null>(null);
  const browserPanelRef = usePanelRef();
  const preserveSidePanelOnPanelOpenRef = useRef(false);
  const autoSizedUniverArtifactTabIdRef = useRef<string | null>(null);
  const autoSizedUniverLayoutRef = useRef(false);
  const scheduledUniverResizeFrameRef = useRef<number | null>(null);
  const univerArtifactLayoutActive = univerArtifactRailActive || univerArtifactPaneActive;

  const setCurrentSidePanel = useCallback((panel: SidePanelItem | null) => {
    setSidePanelState(GLOBAL_VOICE_SIDE_PANEL_KEY, panel === "voice" ? "voice" : null);
    if (panel === "voice") return;
    setSidePanelState(props.selectedSessionId, panel);
  }, [props.selectedSessionId, setSidePanelState]);

  const toggleCurrentSidePanel = useCallback((panel: SidePanelItem) => {
    if (panel === "voice") {
      toggleSidePanelState(GLOBAL_VOICE_SIDE_PANEL_KEY, "voice");
      return;
    }
    setSidePanelState(GLOBAL_VOICE_SIDE_PANEL_KEY, null);
    toggleSidePanelState(props.selectedSessionId, panel);
  }, [props.selectedSessionId, setSidePanelState, toggleSidePanelState]);

  // When the agent calls a built-in browser tool, the main process opens
  // the WebContentsView and sends panel-opened; when hide_browser is called
  // it sends panel-closed. Without this listener the React UI never knows
  // the panel opened and doesn't render the unified panel chrome.
  useEffect(() => {
    if (!isElectronRuntime()) return;
    const browser = (window as Window).__OPENWORK_ELECTRON__?.browser;
    if (!browser) return;
    const unsubOpen = browser.onPanelOpened?.(() => {
      if (preserveSidePanelOnPanelOpenRef.current) {
        preserveSidePanelOnPanelOpenRef.current = false;
        return;
      }
      setCurrentSidePanel("panel");
    });
    const unsubClose = browser.onPanelClosed?.(() => setCurrentSidePanel(null));
    return () => { unsubOpen?.(); unsubClose?.(); };
  }, [setCurrentSidePanel]);
  const {
    leftSidebarResizing,
    leftSidebarWidth,
    rightSidebarExpandedWidth: browserPanelWidth,
    setRightSidebarExpandedWidth: setBrowserPanelWidth,
    startLeftSidebarResize,
  } = useWorkspaceShellLayout({
    expandedRightWidth: 520,
    minRightWidth: 320,
  });
  const [browserPanelDefaultWidth, setBrowserPanelDefaultWidth] = useState(browserPanelWidth);
  const sidebarProviderStyle: CSSProperties & Record<"--sidebar-width", string> = {
    "--sidebar-width": `${leftSidebarWidth}px`,
  };
  useEffect(() => {
    if (sidePanelOpen) return;
    setBrowserPanelDefaultWidth(browserPanelWidth);
  }, [sidePanelOpen, browserPanelWidth]);
  useEffect(() => {
    props.onAccessibleTargetsChange?.(accessibleTargets);
  }, [accessibleTargets, props.onAccessibleTargetsChange]);
  useEffect(() => {
    setComposerToolbarPopover(null);
  }, [props.selectedSessionId]);
  useEffect(() => {
    if ((composerToolbarPopover === "changes" || composerToolbarPopover === "tasks") && !toolbarUniverTarget) {
      setComposerToolbarPopover(null);
    }
  }, [composerToolbarPopover, toolbarUniverTarget]);
  const commitBrowserPanelWidth = useCallback(() => {
    let size: ReturnType<NonNullable<typeof browserPanelRef.current>["getSize"]> | undefined;
    try {
      size = browserPanelRef.current?.getSize();
    } catch {
      size = undefined;
    }
    if (size?.inPixels) setBrowserPanelWidth(Math.round(size.inPixels));
  }, [browserPanelRef, setBrowserPanelWidth]);
  const ensureUniverArtifactPanelWidth = useCallback((preview: OpenTarget["preview"] | undefined) => {
    if (preview !== "univer") return;
    let currentWidth = browserPanelWidth;
    try {
      currentWidth = browserPanelRef.current?.getSize().inPixels ?? browserPanelWidth;
    } catch {
      currentWidth = browserPanelWidth;
    }
    const nextWidth = Math.max(Math.round(currentWidth), browserPanelWidth, UNIVER_ARTIFACT_PANEL_WIDTH);
    setBrowserPanelDefaultWidth(nextWidth);
    if (nextWidth !== browserPanelWidth) {
      setBrowserPanelWidth(nextWidth);
    }
    try {
      browserPanelRef.current?.resize(`${nextWidth}px`);
    } catch {
      // The right rail can switch between panels while a Univer resize frame is pending.
    }
  }, [browserPanelRef, browserPanelWidth, setBrowserPanelWidth]);
  const cancelScheduledUniverArtifactPanelWidth = useCallback(() => {
    if (scheduledUniverResizeFrameRef.current !== null) {
      window.cancelAnimationFrame(scheduledUniverResizeFrameRef.current);
      scheduledUniverResizeFrameRef.current = null;
    }
  }, []);
  const scheduleUniverArtifactPanelWidth = useCallback(() => {
    cancelScheduledUniverArtifactPanelWidth();
    scheduledUniverResizeFrameRef.current = window.requestAnimationFrame(() => {
      scheduledUniverResizeFrameRef.current = null;
      ensureUniverArtifactPanelWidth("univer");
    });
  }, [cancelScheduledUniverArtifactPanelWidth, ensureUniverArtifactPanelWidth]);
  useEffect(() => {
    if (!activeUniverArtifactTabId || autoSizedUniverArtifactTabIdRef.current === activeUniverArtifactTabId) return;
    autoSizedUniverArtifactTabIdRef.current = activeUniverArtifactTabId;
    ensureUniverArtifactPanelWidth(activeArtifactPreview);
  }, [activeArtifactPreview, activeUniverArtifactTabId, ensureUniverArtifactPanelWidth]);
  useEffect(() => {
    const handleUniverArtifactActive = () => {
      autoSizedUniverLayoutRef.current = false;
      setUniverArtifactPaneActive(true);
      scheduleUniverArtifactPanelWidth();
    };
    window.addEventListener(UNIVER_ARTIFACT_ACTIVE_EVENT, handleUniverArtifactActive);
    return () => window.removeEventListener(UNIVER_ARTIFACT_ACTIVE_EVENT, handleUniverArtifactActive);
  }, [scheduleUniverArtifactPanelWidth]);
  useEffect(() => {
    if (activeSidePanel !== "panel" || activePanelTab?.type === "browser") {
      autoSizedUniverLayoutRef.current = false;
      setUniverArtifactPaneActive(false);
    }
  }, [activePanelTab?.type, activeSidePanel]);
  useEffect(() => {
    if (!univerArtifactLayoutActive) {
      autoSizedUniverLayoutRef.current = false;
      cancelScheduledUniverArtifactPanelWidth();
      return;
    }
    if (autoSizedUniverLayoutRef.current) return;
    autoSizedUniverLayoutRef.current = true;
    scheduleUniverArtifactPanelWidth();
  }, [cancelScheduledUniverArtifactPanelWidth, scheduleUniverArtifactPanelWidth, univerArtifactLayoutActive]);
  useEffect(() => {
    return cancelScheduledUniverArtifactPanelWidth;
  }, [cancelScheduledUniverArtifactPanelWidth]);
  const browserUrlForTarget = useCallback((target: OpenTarget) => {
    if (/^wss?:\/\//i.test(target.value)) return target.value.replace(/^ws:/i, "http:").replace(/^wss:/i, "https:");
    return target.value;
  }, []);
  const downloadOpenTarget = useCallback(async (target: OpenTarget) => {
    if (target.kind !== "file" || !props.openworkServerClient || !props.runtimeWorkspaceId) {
      return;
    }

    const result = await props.openworkServerClient.downloadWorkspaceFile(props.runtimeWorkspaceId, target.value);
    const url = URL.createObjectURL(new Blob([result.data], { type: result.contentType ?? "application/octet-stream" }));
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = target.name;
    anchor.click();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [props.openworkServerClient, props.runtimeWorkspaceId]);
  const openTarget = useCallback((target: OpenTarget, options?: OpenTargetOptions, sourceSessionId?: string) => {
    if (target.kind === "url" || target.preview === "browser") {
      const url = browserUrlForTarget(target);
      if (isElectronRuntime()) {
        setCurrentSidePanel("panel");
        void window.__OPENWORK_ELECTRON__?.browser?.createTab?.(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      return;
    }
    if (options?.external && target.kind === "file" && props.selectedWorkspaceDisplay.workspaceType !== "remote") {
      const path = absoluteWorkspacePath(props.selectedWorkspaceRoot, target.value);
      if (path && isElectronRuntime()) {
        void (async () => {
          try {
            if (options.reveal) {
              await revealDesktopItemInDir(path);
            } else {
              await openDesktopPath(path);
            }
          } catch {
            await revealDesktopItemInDir(path).catch(() => undefined);
          }
        })();
      }
      return;
    }

    if (!isCollectibleArtifactTarget(target)) {
      if (isOpenableFileTarget(target)) {
        if (props.selectedWorkspaceDisplay.workspaceType === "remote") {
          void downloadOpenTarget(target).catch(() => undefined);
        } else if (isElectronRuntime()) {
          void openDesktopPath(absoluteWorkspacePath(props.selectedWorkspaceRoot, target.value)).catch(() => undefined);
        }
      }
      return;
    }

    const sessionId = sourceSessionId ?? props.selectedSessionId;
    if (!sessionId) return;
    if (options?.auto && activePanelTab?.id === target.id && activeSidePanel === "panel") return;
    if (isCollectibleArtifactTarget(target)) {
      upsertTranscriptArtifactTarget(sessionId, target);
    }
    ensureUniverArtifactPanelWidth(target.preview);
    openTab(sessionId, {
      id: target.id,
      type: "artifact",
      label: target.name,
      preview: target.preview,
    });
    preserveSidePanelOnPanelOpenRef.current = true;
    setCurrentSidePanel("panel");
  }, [activePanelTab?.id, activeSidePanel, browserUrlForTarget, downloadOpenTarget, ensureUniverArtifactPanelWidth, openTab, props.selectedSessionId, props.selectedWorkspaceDisplay.workspaceType, props.selectedWorkspaceRoot, setCurrentSidePanel, upsertTranscriptArtifactTarget]);
  useEffect(() => {
    if (!props.selectedSessionId || !boundUniverTarget) return;
    if (activePanelTab?.id === boundUniverTarget.id && activeSidePanel === "panel") return;
    openTarget(boundUniverTarget, { auto: true });
  }, [activePanelTab?.id, activeSidePanel, boundUniverTarget, openTarget, props.selectedSessionId]);
  const closeRightPane = useCallback(() => {
    setCurrentSidePanel(null);
  }, [setCurrentSidePanel]);
  const showArtifactPanelFromFileTree = useCallback(() => {
    if (!props.selectedSessionId) return;
    preserveSidePanelOnPanelOpenRef.current = true;
    setCurrentSidePanel("panel");
  }, [props.selectedSessionId, setCurrentSidePanel]);
  const composerToolbar = props.selectedSessionId ? (
    <div
      className="flex h-8 items-stretch gap-0 px-0 text-muted-foreground"
      data-testid="composer-toolbar"
    >
      {boundUniverTarget ? (
        <>
          <UniverWorktreePopover
            open={composerToolbarPopover === "tasks"}
            onOpenChange={(nextOpen) => setComposerToolbarPopover(nextOpen ? "tasks" : null)}
            sessionId={props.selectedSessionId}
            client={props.openworkServerClient}
            workspaceId={props.runtimeWorkspaceId}
            target={boundUniverTarget}
            isRemoteWorkspace={props.surface?.isRemoteWorkspace ?? false}
            onArtifactOpen={showArtifactPanelFromFileTree}
            onCreateTaskFromHere={() => {
              if (!props.selectedSessionId) return;
              props.sidebar.onCreateTaskFromUniverSession?.(props.selectedWorkspaceId, props.selectedSessionId);
            }}
            onOpenOwningTask={(sessionId) => props.sidebar.onOpenSession(props.selectedWorkspaceId, sessionId)}
            worktreeIssue={selectedSidebarSession?.sessionUniverWorktreeIssue ?? null}
            terminalState={selectedSidebarSession?.sessionUniverWorktreeTerminalState ?? null}
            label="Worktree"
            testId="composer-toolbar-tasks"
            panelVariant="tasks"
            toolbarKind="tasks"
          />
          <CurrentUniverfileChip
            discovered={boundUniverTargetDiscovered}
            target={boundUniverTarget}
            onOpen={() => {
              setComposerToolbarPopover(null);
              openTarget(boundUniverTarget);
            }}
          />
        </>
      ) : (
        <WorkspaceFilesPopover
          open={composerToolbarPopover === "files"}
          onOpenChange={(nextOpen) => setComposerToolbarPopover(nextOpen ? "files" : null)}
          sessionId={props.selectedSessionId}
          client={props.openworkServerClient}
          workspaceId={props.runtimeWorkspaceId}
          workspaceRoot={props.selectedWorkspaceRoot}
          isRemoteWorkspace={props.surface?.isRemoteWorkspace ?? false}
          onArtifactOpen={showArtifactPanelFromFileTree}
        />
      )}
      {!boundUniverTarget && activeUniverArtifactTarget ? (
        <UniverWorktreePopover
          open={composerToolbarPopover === "changes"}
          onOpenChange={(nextOpen) => setComposerToolbarPopover(nextOpen ? "changes" : null)}
          sessionId={props.selectedSessionId}
          client={props.openworkServerClient}
          workspaceId={props.runtimeWorkspaceId}
          target={activeUniverArtifactTarget}
          isRemoteWorkspace={props.surface?.isRemoteWorkspace ?? false}
          onArtifactOpen={showArtifactPanelFromFileTree}
        />
      ) : null}
    </div>
  ) : null;
  const openBrowserRailPane = useCallback(() => {
    // Opening the browser pane should land on a usable page, not an empty
    // panel that forces the user to click "+". If no browser tab exists yet,
    // create one (defaults to the new-tab URL in the main process).
    const opening = !panelRailActive;
    if (opening && isElectronRuntime()) {
      const hasBrowserTab = sessionPanelState.tabs.some((tab) => tab.type === "browser");
      if (!hasBrowserTab) {
        void window.__OPENWORK_ELECTRON__?.browser?.createTab?.();
      }
    }
    toggleCurrentSidePanel("panel");
  }, [panelRailActive, sessionPanelState.tabs, toggleCurrentSidePanel]);
  const openBrowserUrlControlAction = useMemo<OpenworkControlAction>(() => ({
    id: "browser.open_url",
    label: "Open URL in built-in browser",
    description: "Create or select an OpenWork built-in browser tab, navigate it to a URL, and return the CDP handle for browser automation.",
    sideEffect: "navigation",
    requiresArgs: true,
    args: [
      { name: "url", type: "string", required: true, description: "The website URL to open." },
      { name: "provider", type: "string", description: "Browser provider. Use builtin or auto. External is reserved for future support." },
    ],
    previewArgs: { url: "https://example.com", provider: "builtin" },
    disabled: !isElectronRuntime(),
    execute: async (args) => {
      const url = controlStringArg(args, "url");
      if (!url) return { ok: false, error: "Missing URL." };
      const provider = controlStringArg(args, "provider") || "builtin";
      if (provider !== "auto" && provider !== "builtin") {
        return { ok: false, error: `Browser provider is not available yet: ${provider}` };
      }
      setCurrentSidePanel("panel");
      return window.__OPENWORK_ELECTRON__?.browser?.openUrl?.(url, provider);
    },
  }), [setCurrentSidePanel]);
  useControlAction(openBrowserUrlControlAction);
  const workspaceInfoControlAction = useMemo<OpenworkControlAction | null>(() => {
    if (!import.meta.env.DEV) return null;

    return {
      id: "eval.workspace.info",
      label: "Read current workspace info",
      description: "Return the mounted session workspace identity for eval setup.",
      sideEffect: "none",
      disabled: !props.runtimeWorkspaceId,
      execute: () => ({
        ok: true,
        workspaceId: props.runtimeWorkspaceId,
        workspaceRoot: props.selectedWorkspaceRoot,
        isRemoteWorkspace: props.surface?.isRemoteWorkspace ?? false,
      }),
    };
  }, [props.runtimeWorkspaceId, props.selectedWorkspaceRoot, props.surface?.isRemoteWorkspace]);
  useControlAction(workspaceInfoControlAction);
  const setBrowserProxyControlAction = useMemo<OpenworkControlAction>(() => ({
    id: "browser.set_proxy",
    label: "Set built-in browser proxy",
    description: "Route all built-in browser traffic through an HTTP/SOCKS proxy (e.g. to browse from another location). Applies to every built-in browser tab until cleared. Pass an empty proxy to restore system network settings.",
    sideEffect: "mutation",
    args: [
      { name: "proxy", type: "string", description: "Proxy URL like http://user:pass@host:8080 or socks5://host:1080, env:NAME to use the OPENWORK_BROWSER_PROXY_NAME environment variable, or empty to clear." },
    ],
    previewArgs: { proxy: "env:DE" },
    disabled: !isElectronRuntime(),
    execute: async (args) => {
      const proxy = controlStringArg(args, "proxy") || "";
      const setProxy = window.__OPENWORK_ELECTRON__?.browser?.setProxy;
      if (!setProxy) return { ok: false, error: "Built-in browser is not available." };
      return setProxy(proxy);
    },
  }), []);
  useControlAction(setBrowserProxyControlAction);
  const openArtifactRailPane = useCallback(() => {
    if (!hasArtifactTargets || !props.selectedSessionId) return;
    const activeTab = sessionPanelState.tabs.find((tab) => tab.id === sessionPanelState.activeTabId);
    const artifactTargetIds = new Set(artifactFileTargets.map((target) => target.id));
    const artifactTab = sessionPanelState.tabs.find((tab) => (
      tab.type === "artifact" && artifactTargetIds.has(tab.id)
    ));
    const artifactTabTarget = artifactTab ? artifactFileTargets.find((target) => target.id === artifactTab.id) : null;
    const firstArtifact = artifactFileTargets[0];
    if (panelRailActive && activeTab?.type === "artifact") {
      toggleCurrentSidePanel("panel");
      return;
    }
    if (!panelRailActive) {
      preserveSidePanelOnPanelOpenRef.current = true;
    }
    if (artifactTab) {
      if (artifactTabTarget) {
        ensureUniverArtifactPanelWidth(artifactTabTarget.preview);
      }
      selectTab(props.selectedSessionId, artifactTab.id);
    } else if (firstArtifact) {
      ensureUniverArtifactPanelWidth(firstArtifact.preview);
      openTab(props.selectedSessionId, {
        id: firstArtifact.id,
        type: "artifact",
        label: firstArtifact.name,
        preview: firstArtifact.preview,
      });
    }
    if (!panelRailActive) {
      toggleCurrentSidePanel("panel");
    }
  }, [artifactFileTargets, ensureUniverArtifactPanelWidth, hasArtifactTargets, openTab, panelRailActive, props.selectedSessionId, selectTab, sessionPanelState, toggleCurrentSidePanel]);
  const openExtensionsRailPane = useCallback(() => {
    toggleCurrentSidePanel("extensions");
  }, [toggleCurrentSidePanel]);
  const openVoiceRailPane = useCallback(() => {
    toggleCurrentSidePanel("voice");
  }, [toggleCurrentSidePanel]);
  const removeAccessibleTarget = useCallback((target: OpenTarget) => {
    const nextHiddenIds = new Set(hiddenAccessibleTargetIds);
    nextHiddenIds.add(target.id);
    writeHiddenAccessibleTargetIds(props.selectedWorkspaceId, props.selectedSessionId, nextHiddenIds);
    setHiddenTargetRevision((value) => value + 1);
    if (props.selectedSessionId) {
      closeTab(props.selectedSessionId, target.id);
    }
  }, [closeTab, hiddenAccessibleTargetIds, props.selectedSessionId, props.selectedWorkspaceId]);
  useEffect(() => {
    const open = (event: Event) => {
      const requested = (event as CustomEvent<OpenTarget>).detail;
      const target = accessibleTargets.find((item) => item.id === requested?.id || item.value === requested?.value) ?? (
        requested?.kind && requested?.value ? requested : null
      );
      if (target) openTarget(target);
    };
    const hide = (event: Event) => {
      const requested = (event as CustomEvent<OpenTarget>).detail;
      const target = accessibleTargets.find((item) => item.id === requested?.id || item.value === requested?.value);
      if (target) removeAccessibleTarget(target);
    };
    window.addEventListener("openwork-open-accessible-target", open);
    window.addEventListener("openwork-hide-accessible-target", hide);
    return () => {
      window.removeEventListener("openwork-open-accessible-target", open);
      window.removeEventListener("openwork-hide-accessible-target", hide);
    };
  }, [accessibleTargets, openTarget, removeAccessibleTarget]);
  useEffect(() => {
    const handler = () => setCurrentSidePanel(null);
    window.addEventListener("openwork-close-right-pane", handler);
    return () => window.removeEventListener("openwork-close-right-pane", handler);
  }, [setCurrentSidePanel]);
  useEffect(() => {
    const refresh = () => setExtensionStateVersion((value) => value + 1);
    window.addEventListener(OPENWORK_EXTENSION_STATE_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(OPENWORK_EXTENSION_STATE_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  useEffect(() => {
    if (activeSidePanel === "voice" && !voiceExtensionEnabled) {
      setCurrentSidePanel(null);
    }
  }, [activeSidePanel, setCurrentSidePanel, voiceExtensionEnabled]);

  const openVoicePanelControlAction = useMemo<OpenworkControlAction | null>(() => (
    voiceExtensionEnabled ? {
      id: "voice.panel.open",
      label: "Open Voice Mode",
      description: "Open the sticky Voice Mode right-side panel.",
      sideEffect: "none",
      execute: () => {
        setCurrentSidePanel("voice");
        return { open: true };
      },
    } : null
  ), [setCurrentSidePanel, voiceExtensionEnabled]);
  useControlAction(openVoicePanelControlAction);

  const closeVoicePanelControlAction = useMemo<OpenworkControlAction | null>(() => (
    voiceExtensionEnabled && activeSidePanel === "voice" ? {
      id: "voice.panel.close",
      label: "Close Voice Mode",
      description: "Close the Voice Mode right-side panel.",
      sideEffect: "none",
      execute: () => {
        setCurrentSidePanel(null);
        return { open: false };
      },
    } : null
  ), [activeSidePanel, setCurrentSidePanel, voiceExtensionEnabled]);
  useControlAction(closeVoicePanelControlAction);
  const [showDelayedSessionLoadingState, setShowDelayedSessionLoadingState] = useState(false);

  const selectedSessionTitle = useMemo(
    () => sessionTitleForId(props.sidebar.workspaceSessionGroups, props.selectedSessionId),
    [props.selectedSessionId, props.sidebar.workspaceSessionGroups],
  );
  useEffect(() => {
    setSessionTabs((current) => {
      const currentWorkspaceTabs = current.filter((tab) => tab.workspaceId === props.selectedWorkspaceId);
      const next = props.selectedSessionId && !currentWorkspaceTabs.some((tab) => tab.sessionId === props.selectedSessionId)
        ? [...currentWorkspaceTabs, { workspaceId: props.selectedWorkspaceId, sessionId: props.selectedSessionId }]
        : currentWorkspaceTabs;
      return next.filter((tab) => (
        tab.sessionId === props.selectedSessionId ||
        sessionExistsInWorkspace(props.sidebar.workspaceSessionGroups, tab.workspaceId, tab.sessionId)
      ));
    });
  }, [props.selectedSessionId, props.selectedWorkspaceId, props.sidebar.workspaceSessionGroups]);
  useEffect(() => {
    props.onSessionTabsChange?.(sessionTabs);
  }, [sessionTabs, props.onSessionTabsChange]);
  useEffect(() => {
    if (!splitSessionId) return;
    if (splitSessionId === props.selectedSessionId) {
      setSplitSessionId(null);
      return;
    }
    if (!sessionExistsInWorkspace(props.sidebar.workspaceSessionGroups, props.selectedWorkspaceId, splitSessionId)) {
      setSplitSessionId(null);
    }
  }, [props.selectedSessionId, props.selectedWorkspaceId, props.sidebar.workspaceSessionGroups, splitSessionId]);
  const sessionActionTitle = useMemo(
    () => sessionTitleForId(props.sidebar.workspaceSessionGroups, sessionActionId),
    [props.sidebar.workspaceSessionGroups, sessionActionId],
  );
  const workspaceName =
    props.selectedWorkspaceDisplay.displayName?.trim() ||
    props.selectedWorkspaceDisplay.name?.trim() ||
    t("session.workspace_fallback");
  const providerCount = props.hasUsableModel ? 1 : props.providerConnectedIds.length;
  const messageCountVisible = props.selectedSessionId ? 1 : 0;
  const showWorkspaceSetupEmptyState = props.workspaces.length === 0 && !props.selectedSessionId;
  const showStartupSkeleton =
    !props.selectedSessionId &&
    !props.clientConnected &&
    props.startupPhase !== "sessionIndexReady" &&
    props.startupPhase !== "firstSessionReady" &&
    props.startupPhase !== "ready";
  const showSessionLoadingState =
    selectedSessionLoading && !showWorkspaceSetupEmptyState;
  const sidebarInitialLoading = useMemo(() => getSidebarInitialLoading(props.sidebar), [props.sidebar]);
  // Derive the main-pane error from the same data the sidebar uses so the two
  // panes can never disagree. We check (in priority order):
  // 1. selectedWorkspaceError (errorsByWorkspaceId[selectedWorkspaceId])
  // 2. workspaceConnectionStateById[selectedWorkspaceId].message (covers test/recover paths)
  // 3. group.error from workspaceSessionGroups (the same source the sidebar reads)
  const selectedWorkspaceConnectionMessage = (() => {
    const state = props.sidebar.workspaceConnectionStateById[props.selectedWorkspaceId];
    if (state?.status === "error") return state.message?.trim() ?? "";
    return "";
  })();
  const selectedWorkspaceGroupError = (() => {
    const group = props.sidebar.workspaceSessionGroups.find(
      (item) => item.workspace.id === props.selectedWorkspaceId,
    );
    return group?.error?.trim() ?? "";
  })();
  const selectedWorkspaceErrorMessage =
    props.selectedWorkspaceError?.trim() ||
    selectedWorkspaceConnectionMessage ||
    selectedWorkspaceGroupError ||
    "";
  const showSelectedWorkspaceError = Boolean(selectedWorkspaceErrorMessage);
  const selectedWorkspaceErrorTitle =
    props.selectedWorkspaceDisplay.workspaceType === "remote"
      ? "Remote workspace unavailable"
      : "OpenCode unavailable";

  const reactSessionBaseUrl = props.opencodeBaseUrl?.trim() ?? "";
  const reactSessionToken =
    props.openworkServerToken?.trim() ||
    props.openworkServerClient?.token?.trim() ||
    "";
  const canRenderReactSurface = Boolean(
    props.selectedSessionId &&
      props.runtimeWorkspaceId &&
      props.openworkServerClient &&
      reactSessionBaseUrl &&
      reactSessionToken &&
      props.surface,
  );
  const canRenderSplitSurface = Boolean(canRenderReactSurface && splitSessionId && splitSessionId !== props.selectedSessionId);

  const openSessionTab = useCallback((workspaceId: string, sessionId: string) => {
    setSessionTabs((current) => {
      const next = current.filter((tab) => tab.workspaceId === workspaceId);
      if (next.some((tab) => tab.sessionId === sessionId)) return next;
      return [...next, { workspaceId, sessionId }];
    });
    props.sidebar.onOpenSession(workspaceId, sessionId);
  }, [props.sidebar]);

  const closeSessionTab = useCallback((sessionId: string) => {
    setSessionTabs((current) => current.filter((tab) => tab.sessionId !== sessionId));
    setSplitSessionId((current) => current === sessionId ? null : current);
    if (sessionId !== props.selectedSessionId) return;

    const nextTab = sessionTabs.find((tab) => tab.sessionId !== sessionId && tab.workspaceId === props.selectedWorkspaceId);
    if (nextTab) {
      props.sidebar.onOpenSession(nextTab.workspaceId, nextTab.sessionId);
      return;
    }
    props.sidebar.onSelectWorkspace(props.selectedWorkspaceId);
  }, [props.selectedSessionId, props.selectedWorkspaceId, props.sidebar, sessionTabs]);

  useEffect(() => {
    if (!showSessionLoadingState) {
      setShowDelayedSessionLoadingState(false);
      return;
    }
    const id = window.setTimeout(() => {
      setShowDelayedSessionLoadingState(true);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [showSessionLoadingState]);

  useEffect(() => {
    setRenameOpen(false);
    setDeleteOpen(false);
    setRenameBusy(false);
    setDeleteBusy(false);
    setSessionActionId(null);
    setUnavailableUniverTargetDelete(null);
  }, [props.selectedSessionId]);

  const openRenameModal = (sessionId: string) => {
    if (!props.onRenameSession) return;
    setSessionActionId(sessionId);
    setRenameTitle(sessionTitleForId(props.sidebar.workspaceSessionGroups, sessionId));
    setRenameOpen(true);
  };

  const submitRename = async () => {
    const sessionId = sessionActionId;
    const nextTitle = renameTitle.trim();
    if (!sessionId || !props.onRenameSession || !nextTitle || nextTitle === sessionActionTitle.trim()) return;
    setRenameBusy(true);
    try {
      await props.onRenameSession(sessionId, nextTitle);
      setRenameOpen(false);
    } finally {
      setRenameBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (unavailableUniverTargetDelete) {
      if (!props.onDeleteSessions) return;
      setDeleteBusy(true);
      try {
        await props.onDeleteSessions(unavailableUniverTargetDelete.workspaceId, unavailableUniverTargetDelete.sessionIds);
        setDeleteOpen(false);
        setUnavailableUniverTargetDelete(null);
      } finally {
        setDeleteBusy(false);
      }
      return;
    }

    const sessionId = sessionActionId;
    if (!sessionId || !props.onDeleteSession) return;
    setDeleteBusy(true);
    try {
      await props.onDeleteSession(sessionId);
      setDeleteOpen(false);
    } finally {
      setDeleteBusy(false);
    }
  };
  const deleteModalTitle = unavailableUniverTargetDelete
    ? unavailableUniverTargetDelete.kind === "section"
      ? "Clear unavailable Univerfiles?"
      : "Remove unavailable Univerfile?"
    : t("session.delete_session_title");
  const deleteModalMessage = unavailableUniverTargetDelete ? (
    <span>
      {unavailableUniverTargetDelete.kind === "section"
        ? `This clears ${unavailableUniverTargetDelete.targetCount} unavailable sidebar ${unavailableUniverTargetDelete.targetCount === 1 ? "entry" : "entries"} and permanently deletes ${unavailableUniverTargetDelete.sessionIds.length} bound ${unavailableUniverTargetDelete.sessionIds.length === 1 ? "session" : "sessions"}. The .univer files are already unavailable and will not be touched.`
        : `This removes the unavailable sidebar entry for ${unavailableUniverTargetDelete.name} and permanently deletes ${unavailableUniverTargetDelete.sessionIds.length} bound ${unavailableUniverTargetDelete.sessionIds.length === 1 ? "session" : "sessions"}. The .univer file is already unavailable and will not be touched.`}
    </span>
  ) : (
    sessionActionTitle.trim()
      ? t("session.delete_named_session_message", { title: sessionActionTitle.trim() })
      : t("session.delete_session_generic")
  );
  const deleteConfirmLabel = deleteBusy
    ? t("session.deleting")
    : unavailableUniverTargetDelete
      ? "Remove"
      : t("session.delete");

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(74,111,255,0.12),transparent_42%),var(--app-bg,#0b1020)] text-dls-text mac:bg-transparent">
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        className={cn(
          "relative min-h-0 flex-1 mac:bg-transparent",
          leftSidebarResizing &&
            "**:data-[slot=sidebar-container]:transition-none **:data-[slot=sidebar-gap]:transition-none",
          !shellConfig.sidebar && "**:data-[slot=sidebar-container]:hidden **:data-[slot=sidebar-gap]:hidden",
        )}
        style={sidebarProviderStyle}
      >
        <AppSidebar
          workspaceSessionGroups={props.sidebar.workspaceSessionGroups}
          selectedWorkspaceId={props.sidebar.selectedWorkspaceId}
          developerMode={props.sidebar.developerMode}
          selectedSessionId={props.sidebar.selectedSessionId}
          showInitialLoading={sidebarInitialLoading}
          showSessionActions={Boolean(props.onRenameSession || props.onDeleteSession || props.onArchiveSession)}
          sessionStatusById={props.sidebar.sessionStatusById}
          connectingWorkspaceId={props.sidebar.connectingWorkspaceId}
          workspaceConnectionStateById={props.sidebar.workspaceConnectionStateById}
          newTaskDisabled={props.sidebar.newTaskDisabled}
          onSelectWorkspace={props.sidebar.onSelectWorkspace}
          onOpenSession={openSessionTab}
          onPrefetchSession={props.sidebar.onPrefetchSession}
          onCreateTaskInWorkspace={props.sidebar.onCreateTaskInWorkspace}
          onCreateTaskForUniverTarget={props.sidebar.onCreateTaskForUniverTarget}
          onOpenUniverTargetOverview={props.sidebar.onOpenUniverTargetOverview}
          onOpenDeleteUnavailableUniverTarget={props.onDeleteSessions ? (workspaceId, name, path, sessionIds) => {
            setSessionActionId(null);
            setUnavailableUniverTargetDelete({ kind: "single", workspaceId, name, path, sessionIds });
            setDeleteOpen(true);
          } : undefined}
          onOpenClearUnavailableUniverTargets={props.onDeleteSessions ? (workspaceId, sessionIds, targetCount) => {
            setSessionActionId(null);
            setUnavailableUniverTargetDelete({ kind: "section", workspaceId, targetCount, sessionIds });
            setDeleteOpen(true);
          } : undefined}
          onOpenRenameSession={props.onRenameSession ? openRenameModal : undefined}
          onOpenDeleteSession={props.onDeleteSession ? (sessionId) => {
            setUnavailableUniverTargetDelete(null);
            setSessionActionId(sessionId);
            setDeleteOpen(true);
          } : undefined}
          onArchiveSession={props.onArchiveSession ? (sessionId, archived) => {
            void props.onArchiveSession?.(sessionId, archived);
          } : undefined}
          onOpenCreateGroupModal={(workspaceId) => {
            setCreateGroupWorkspaceId(workspaceId);
            setCreateGroupLabel("");
            setCreateGroupOpen(true);
          }}
          onOpenRenameWorkspace={props.sidebar.onOpenRenameWorkspace}
          onShareWorkspace={props.sidebar.onShareWorkspace}
          onRevealWorkspace={props.sidebar.onRevealWorkspace}
          onRecoverWorkspace={props.sidebar.onRecoverWorkspace}
          onTestWorkspaceConnection={props.sidebar.onTestWorkspaceConnection}
          onEditWorkspaceConnection={props.sidebar.onEditWorkspaceConnection}
          onForgetWorkspace={props.sidebar.onForgetWorkspace}
          onOpenCreateWorkspace={props.sidebar.onOpenCreateWorkspace}
          onReorderWorkspaces={props.sidebar.onReorderWorkspaces}
          onStartResize={startLeftSidebarResize}
        />
        <SidebarUniverWorktreeStatusProbes
          client={props.openworkServerClient}
          isRemoteWorkspace={props.surface?.isRemoteWorkspace ?? false}
          serverWorkspaceId={props.runtimeWorkspaceId}
          storeWorkspaceId={props.sidebar.selectedWorkspaceId}
          targets={sidebarUniverStatusProbeTargets}
        />
        <SidebarInset className="min-h-0 overflow-hidden bg-background mac:bg-background/80 mac:[&_header]:transition-[padding-left] mac:[&_header]:duration-200 mac:[&_header]:ease-linear mac:peer-data-[state=collapsed]:[&_header]:pl-28 mac:max-md:[&_header]:pl-28">
          <div className="flex min-h-0 flex-1">
          <ResizablePanelGroup
            orientation="horizontal"
            onLayoutChanged={sidePanelOpen ? commitBrowserPanelWidth : undefined}
            className="min-h-0 flex-1"
          >
            <ResizablePanel minSize={univerArtifactLayoutActive ? "280px" : "360px"} className="min-w-0">
              <main className="flex h-full min-w-0 flex-col overflow-hidden border-r border-border">
          <header className="z-10 flex h-10 shrink-0 items-center justify-between border-b border-border px-2.5 mac:titlebar-drag  mac:backdrop-blur-2xl mac:backdrop-saturate-150 @container/titlebar">
            <div className="flex min-w-0 items-center gap-3">
              {shellConfig.sidebar ? <SidebarTrigger className="mac:hidden" /> : null}
              <h1 className="truncate text-[15px] font-semibold text-dls-text">
                {showWorkspaceSetupEmptyState
                  ? t("session.create_or_connect_workspace")
                  : selectedSessionTitle || t("session.default_title")}
              </h1>
              <span className="hidden truncate text-[13px] text-dls-secondary lg:inline">
                {workspaceName}
              </span>
              {props.developerMode ? (
                <span className="hidden text-[12px] text-dls-secondary lg:inline">
                  {props.headerStatus}
                </span>
              ) : null}
              {props.busyHint ? (
                <span className="hidden text-[12px] text-dls-secondary lg:inline">
                  {props.busyHint}
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5 text-gray-10 mac:titlebar-no-drag">
              {/* Revert/redo moved to per-message actions */}
              <NotificationBell />
              {props.developerMode ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    try {
                      window.localStorage.removeItem("openwork.acknowledgedProviders");
                      window.localStorage.removeItem("openwork.orgOnboardingSeen");
                    } catch {}
                  }}
                  title="Clears acknowledged providers + org onboarding so they trigger again"
                >
                  Reset notifications
                </Button>
              ) : null}
            </div>
          </header>

          <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1 overflow-hidden">
            <ResizablePanel minSize="180px" className="min-h-0">
            <div className="relative h-full min-w-0 overflow-hidden bg-dls-surface mac:bg-dls-surface/85 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
              {showStartupSkeleton ? (
                <div className="px-6 py-14" role="status" aria-live="polite">
                  <div className="mx-auto max-w-2xl space-y-6">
                    <div className="space-y-2">
                      <div className="h-4 w-32 animate-pulse rounded-full bg-dls-hover/80" />
                      <div className="h-3 w-64 animate-pulse rounded-full bg-dls-hover/60" />
                    </div>
                    <div className="space-y-3">
                      {STARTUP_SKELETON_ROWS.map((row) => (
                        <div key={row.id} className="rounded-2xl border border-dls-border bg-dls-hover/40 p-4">
                          <div
                            className="mb-3 h-3 animate-pulse rounded-full bg-dls-hover/80"
                            style={{ width: row.titleWidth }}
                          />
                          <div className="space-y-2">
                            <div className="h-2.5 animate-pulse rounded-full bg-dls-hover/70" />
                            <div
                              className="h-2.5 animate-pulse rounded-full bg-dls-hover/60"
                              style={{ width: row.bodyWidth }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {showDelayedSessionLoadingState ? (
                <div className="px-6 py-16">
                  <div
                    className="mx-auto flex max-w-[320px] flex-col items-center gap-3 text-center"
                    role="status"
                    aria-live="polite"
                  >
                    <OwDotTicker size="md" />
                    <div className="text-[12px] leading-5 text-dls-secondary">
                      {t("session.loading_detail")}
                    </div>
                  </div>
                </div>
              ) : null}

              {!showDelayedSessionLoadingState && canRenderReactSurface ? (
                <div className="flex h-full min-h-0 flex-col">
                  {sessionTabs.length > 0 ? (
                    <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-background/80 px-2 mac:backdrop-blur-xl">
                      {sessionTabs.map((tab) => {
                        const title = sessionTitleForId(props.sidebar.workspaceSessionGroups, tab.sessionId) || t("session.default_title");
                        const active = tab.sessionId === props.selectedSessionId;
                        const split = tab.sessionId === splitSessionId;
                        return (
                          <div
                            key={tab.sessionId}
                            className={cn(
                              "group flex max-w-56 shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors",
                              active
                                ? "border-border bg-dls-surface text-dls-text shadow-sm"
                                : "border-transparent text-dls-secondary hover:bg-dls-hover hover:text-dls-text",
                              split && "border-primary/30 bg-primary/10 text-primary",
                            )}
                          >
                            <button
                              type="button"
                              className="min-w-0 flex-1 truncate text-left"
                              onClick={() => props.sidebar.onOpenSession(tab.workspaceId, tab.sessionId)}
                              title={title}
                            >
                              {title}
                            </button>
                            <button
                              type="button"
                              className="rounded p-0.5 text-dls-secondary hover:bg-dls-hover hover:text-dls-text disabled:pointer-events-none disabled:opacity-40"
                              onClick={() => setSplitSessionId(split ? null : tab.sessionId)}
                              disabled={active}
                              title={split ? "Close split" : "Open in split view"}
                              aria-label={split ? "Close split" : "Open in split view"}
                            >
                              <Columns2 size={13} />
                            </button>
                            <button
                              type="button"
                              className="rounded p-0.5 text-dls-secondary opacity-80 hover:bg-dls-hover hover:text-dls-text group-hover:opacity-100"
                              onClick={() => closeSessionTab(tab.sessionId)}
                              title="Close tab"
                              aria-label="Close tab"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                    <div className={cn("min-h-0 min-w-0 flex-1", canRenderSplitSurface && "lg:border-r lg:border-border")}>
                      <SessionSurface
                        // Spread `surface` first so the explicit per-workspace
                        // routing props below CAN'T be silently overridden by
                        // anything that leaks into `surface`. SessionSurface's
                        // server target (client/workspaceId/sessionId/opencodeBaseUrl/openworkToken)
                        // must come from the resolved workspace endpoint passed by
                        // SessionRoute, not from anything in `surface`.
                        {...props.surface!}
                        client={props.openworkServerClient!}
                        environmentClient={props.environmentClient}
                        workspaceId={props.runtimeWorkspaceId!}
                        sessionId={props.selectedSessionId!}
                        opencodeBaseUrl={reactSessionBaseUrl}
                        openworkToken={reactSessionToken}
                        todos={props.todos}
                        activePermission={props.activePermission}
                        permissionReplyBusy={props.permissionReplyBusy}
                        respondPermission={props.respondPermission}
                        activeQuestion={props.activeQuestion}
                        questionReplyBusy={props.questionReplyBusy}
                        respondQuestion={props.respondQuestion}
                        safeStringify={props.safeStringify}
                        onOpenTarget={openTarget}
                        composerToolbar={composerToolbar}
                      />
                    </div>
                    {canRenderSplitSurface ? (
                      <div className="min-h-0 min-w-0 flex-1 border-t border-border lg:border-t-0">
                        <SessionSurface
                          {...props.surface!}
                          client={props.openworkServerClient!}
                          environmentClient={props.environmentClient}
                          workspaceId={props.runtimeWorkspaceId!}
                          sessionId={splitSessionId!}
                          opencodeBaseUrl={reactSessionBaseUrl}
                          openworkToken={reactSessionToken}
                          todos={[]}
                          onOpenTarget={openTarget}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {!showDelayedSessionLoadingState && !canRenderReactSurface && !showStartupSkeleton ? (
                <div className={`mx-auto max-w-[800px] px-6 ${showWorkspaceSetupEmptyState ? "pt-20" : "pt-10"}`}>
                  {props.notFoundMessage ? (
                    <div className="px-6 py-16 text-center">
                      <div className="mx-auto max-w-md rounded-2xl border border-dls-border bg-dls-card px-5 py-6 shadow-[var(--dls-card-shadow)]">
                        <h3 className="text-base font-medium text-dls-text">Workspace or session not found</h3>
                        <p className="mt-2 text-sm leading-6 text-dls-secondary">{props.notFoundMessage}</p>
                      </div>
                    </div>
                  ) : showWorkspaceSetupEmptyState ? (
                    <div className="space-y-6 px-6 text-center">
                      <div className="mx-auto flex size-16 items-center justify-center rounded-3xl border border-dls-border bg-dls-hover">
                        <Zap className="text-dls-secondary" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-medium">{t("session.create_or_connect_workspace")}</h3>
                        <p className="mx-auto max-w-sm text-sm text-dls-secondary">
                          {t("workspace.empty_state_body")}
                        </p>
                      </div>
                      <div className="flex justify-center">
                        <Button onClick={props.sidebar.onOpenCreateWorkspace}>{t("workspace.create_workspace")}</Button>
                      </div>
                    </div>
                  ) : showSelectedWorkspaceError ? (
                    <div className="px-6 py-16">
                      <div className="mx-auto max-w-lg rounded-2xl border border-red-7/35 bg-red-1/40 p-5 text-left shadow-[var(--dls-card-shadow)]">
                        <div className="text-sm font-medium text-red-11">{selectedWorkspaceErrorTitle}</div>
                        <p className="mt-2 whitespace-pre-wrap wrap-anywhere text-sm leading-6 text-red-11/90">
                          {selectedWorkspaceErrorMessage}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => props.sidebar.onCreateTaskInWorkspace(props.selectedWorkspaceId)}
                          >
                            Retry
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void Promise.resolve(props.sidebar.onTestWorkspaceConnection(props.selectedWorkspaceId))}
                          >
                            {t("workspace_list.test_connection")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => props.sidebar.onEditWorkspaceConnection(props.selectedWorkspaceId)}
                          >
                            {t("workspace_list.edit_connection")}
                          </Button>
                          {props.sidebar.workspaceConnectionStateById[props.selectedWorkspaceId]?.status === "error" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void Promise.resolve(props.sidebar.onRecoverWorkspace(props.selectedWorkspaceId))}
                            >
                              {t("workspace_list.recover")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : props.selectedSessionId ? (
                    <div className="px-6 py-16 text-center text-sm text-dls-secondary">
                      {t("session.loading_detail")}
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center justify-center px-6 py-16">
                      <div className="w-full max-w-md space-y-6">
                        <div className="space-y-1 text-center">
                          <h2 className="text-lg font-semibold text-dls-text">
                            {providerCount === 0
                              ? t("session.connect_model_to_start")
                              : t("session.select_or_create_session")}
                          </h2>
                          <p className="text-xs text-dls-secondary">
                            {providerCount === 0
                              ? "Add an AI model provider so your tasks can run."
                              : "Try one of these to get started:"}
                          </p>
                        </div>
                        <div className="space-y-2">
                          {providerCount === 0 ? (
                            <button
                              type="button"
                              className="flex w-full items-start gap-3 rounded-xl border border-blue-7/50 bg-blue-2/40 p-3.5 text-left transition-colors hover:bg-blue-3/50"
                              onClick={() => props.onOpenProviderAuth?.()}
                            >
                              <Zap className="mt-0.5 size-5 shrink-0 text-blue-10" />
                              <div>
                                <div className="text-[13px] font-medium text-dls-text">Connect a model provider</div>
                                <div className="mt-0.5 text-[11px] text-dls-secondary">
                                  Add an API key for Anthropic, OpenAI, Google, or other providers
                                </div>
                              </div>
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="flex w-full items-start gap-3 rounded-xl border border-dls-border bg-dls-surface p-3.5 text-left transition-colors hover:bg-dls-hover"
                            onClick={() => {
                              props.sidebar.onCreateTaskWithPrompt?.(
                                props.selectedWorkspaceId,
                                "Create a sample CSV file with 20 rows of fake customer data (name, email, company, revenue). Then show me a summary of the data.",
                              );
                            }}
                          >
                            <img src="https://cdn.simpleicons.org/googlesheets" alt="" width={20} height={20} className="mt-0.5 shrink-0" />
                            <div>
                              <div className="text-[13px] font-medium text-dls-text">Edit a CSV</div>
                              <div className="mt-0.5 text-[11px] text-dls-secondary">Create a sample spreadsheet with customer data</div>
                            </div>
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-start gap-3 rounded-xl border border-dls-border bg-dls-surface p-3.5 text-left transition-colors hover:bg-dls-hover"
                            onClick={() => {
                              props.sidebar.onCreateTaskWithPrompt?.(
                                props.selectedWorkspaceId,
                                "Open craigslist.org in the browser and search for couches for sale. Show me the top 5 results with prices.",
                              );
                            }}
                          >
                            <img src="/openwork-mark.svg" alt="" width={20} height={20} className="mt-0.5 shrink-0" />
                            <div>
                              <div className="text-[13px] font-medium text-dls-text">Browse the web</div>
                              <div className="mt-0.5 text-[11px] text-dls-secondary">Search Craigslist for couches and list the results</div>
                            </div>
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-start gap-3 rounded-xl border border-dls-border bg-dls-surface p-3.5 text-left transition-colors hover:bg-dls-hover"
                            onClick={() => {
                              props.onOpenSettings?.();
                            }}
                          >
                            <img src="https://cdn.simpleicons.org/hackthebox" alt="" width={20} height={20} className="mt-0.5 shrink-0" />
                            <div>
                              <div className="text-[13px] font-medium text-dls-text">Connect an extension</div>
                              <div className="mt-0.5 text-[11px] text-dls-secondary">Add MCP servers, plugins, and integrations</div>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            </ResizablePanel>
            {props.terminalOpen ? (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize="280px" minSize="160px" maxSize="55%" className="min-h-0">
                  <TerminalDock
                    workspaceRoot={props.selectedWorkspaceRoot}
                    isRemoteWorkspace={props.selectedWorkspaceDisplay.workspaceType === "remote"}
                    onClose={() => props.onTerminalOpenChange?.(false)}
                  />
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>

          {shellConfig.statusBar ? (
            <StatusBar
              clientConnected={props.clientConnected}
              openworkServerStatus={props.openworkServerStatus}
              developerMode={props.developerMode}
              settingsOpen={props.statusBar?.settingsOpen ?? false}
              onSendFeedback={props.onSendFeedback}
              onOpenSettings={props.onOpenSettings}
              providerConnectedIds={props.providerConnectedIds}
              mcpConnectedCount={props.mcpConnectedCount}
              loading={props.statusBar?.loading ?? false}
              showSettingsButton={props.statusBar?.showSettingsButton}
              reloadBusy={props.statusBar?.reloadBusy}
              reloadError={props.statusBar?.reloadError}
            />
          ) : null}
              </main>
            </ResizablePanel>
              {sidePanelOpen ? (
              <>
                <ResizableHandle withHandle className="hidden lg:flex" />
                <ResizablePanel
                  panelRef={browserPanelRef}
                  defaultSize={`${activeSidePanel === "extensions" ? Math.max(browserPanelDefaultWidth, 480) : browserPanelDefaultWidth}px`}
                  minSize={activeSidePanel === "extensions" ? "420px" : "320px"}
                  maxSize={univerArtifactLayoutActive ? "80%" : "70%"}
                  className="min-h-0 overflow-hidden lg:flex lg:flex-col"
                >
                  {activeSidePanel === "extensions" && props.settingsSlot ? (
                    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
                      {props.settingsSlot}
                    </div>
                  ) : activeSidePanel === "voice" ? (
                    <VoicePanel
                      client={props.openworkServerClient}
                      workspaceId={props.runtimeWorkspaceId}
                      sessionId={props.selectedSessionId}
                      onClose={closeRightPane}
                    />
                  ) : activeSidePanel === "panel" && props.selectedSessionId ? (
                    <SidePanel
                      sessionId={props.selectedSessionId}
                      client={props.openworkServerClient}
                      workspaceId={props.runtimeWorkspaceId}
                      workspaceRoot={props.selectedWorkspaceRoot}
                      workspaceSessions={selectedWorkspaceSessionGroup?.sessions ?? []}
                      isRemoteWorkspace={props.surface?.isRemoteWorkspace ?? false}
                      onOpenSession={props.sidebar.onOpenSession}
                      onClose={closeRightPane}
                    />
                  ) : null}
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
          <aside className="flex w-11 shrink-0 flex-col items-center gap-1 border-l border-border bg-background/95 px-1 py-2 text-muted-foreground mac:titlebar-no-drag">
            {isElectronRuntime() ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "rounded-xl transition-colors hover:bg-muted hover:text-foreground",
                  browserRailActive && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                )}
                onClick={openBrowserRailPane}
                title="Browser"
                aria-label="Browser"
                aria-pressed={browserRailActive}
              >
                <Globe size={17} />
              </Button>
            ) : null}
            {voiceExtensionEnabled ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "rounded-xl transition-colors hover:bg-muted hover:text-foreground",
                  voiceRailActive && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                )}
                onClick={openVoiceRailPane}
                title="Voice Mode"
                aria-label="Voice Mode"
                aria-pressed={voiceRailActive}
              >
                <Mic2 size={17} />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "rounded-xl transition-colors hover:bg-muted hover:text-foreground",
                artifactRailActive && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
              )}
              onClick={openArtifactRailPane}
              title={hasArtifactTargets ? `Artifacts (${artifactTargetCount})` : "No artifacts yet"}
              aria-label={hasArtifactTargets ? `Artifacts (${artifactTargetCount})` : "No artifacts yet"}
              aria-pressed={artifactRailActive}
              disabled={!hasArtifactTargets}
            >
              <FileText size={17} />
              {artifactTargetCount > 0 ? (
                <span className="absolute right-0 top-0 flex min-w-3.5 translate-x-1 -translate-y-1 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-3 text-primary-foreground">
                  {artifactTargetCount > 9 ? "9+" : artifactTargetCount}
                </span>
              ) : null}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "rounded-xl transition-colors hover:bg-muted hover:text-foreground",
                extensionsRailActive && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
              )}
              onClick={props.settingsSlot ? openExtensionsRailPane : props.onOpenSettings}
              title="Extensions"
              aria-label="Extensions"
              aria-pressed={extensionsRailActive}
            >
              <Settings2 size={17} />
            </Button>
          </aside>
          </div>
        </SidebarInset>
        {shellConfig.sidebar ? <SidebarTrigger className="hidden mac:absolute mac:left-[64px] top-[3px] z-50 mac:flex titlebar-no-drag" /> : null}
      </SidebarProvider>

      {props.providerAuthModal ? <ProviderAuthModal {...props.providerAuthModal} /> : null}

      {props.onRenameSession ? (
        <RenameSessionModal
          open={renameOpen}
          title={renameTitle}
          busy={renameBusy}
          canSave={renameTitle.trim().length > 0 && renameTitle.trim() !== sessionActionTitle.trim()}
          onClose={() => {
            if (!renameBusy) setRenameOpen(false);
          }}
          onSave={() => void submitRename()}
          onTitleChange={setRenameTitle}
        />
      ) : null}

      {props.onDeleteSession || props.onDeleteSessions ? (
        <ConfirmModal
          open={deleteOpen}
          title={deleteModalTitle}
          message={deleteModalMessage}
          confirmLabel={deleteConfirmLabel}
          cancelLabel={t("common.cancel")}
          variant="danger"
          onConfirm={() => void confirmDelete()}
          onCancel={() => {
            if (deleteBusy) return;
            setDeleteOpen(false);
            setUnavailableUniverTargetDelete(null);
          }}
        />
      ) : null}

      <Dialog open={createGroupOpen} onOpenChange={(open) => { if (!open) setCreateGroupOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("session_management.new_group")}</DialogTitle>
          </DialogHeader>
          <Input
            type="text"
            value={createGroupLabel}
            onChange={(e) => setCreateGroupLabel(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && createGroupLabel.trim()) {
                if (createGroupWorkspaceId) useSessionManagementStore.getState().createGroup(createGroupWorkspaceId, createGroupLabel.trim());
                setCreateGroupOpen(false);
              }
            }}
            placeholder={t("session_management.new_group_prompt")}
          />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>{t("common.cancel")}</DialogClose>
            <Button
              type="button"
              disabled={!createGroupLabel.trim()}
              onClick={() => {
                if (createGroupWorkspaceId) useSessionManagementStore.getState().createGroup(createGroupWorkspaceId, createGroupLabel.trim());
                setCreateGroupOpen(false);
              }}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {props.shareWorkspaceModal ? <ShareWorkspaceModal {...props.shareWorkspaceModal} /> : null}

      {/* Cloud provider notifications are now handled globally by CloudProvidersToast in app-root.tsx */}
    </div>
  );
}
