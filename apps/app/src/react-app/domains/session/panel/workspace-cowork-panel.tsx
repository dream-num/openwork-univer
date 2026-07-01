/** @jsxImportSource react */
import * as React from "react";
import { type CoworkController, type CoworkSelection } from "@univer/cowork";
import { useCoworkSnapshot } from "@univer/cowork/react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  GitBranch,
  GitPullRequest,
  Loader2,
  Presentation,
  RefreshCw,
  Sheet,
  Trash2,
} from "lucide-react";

import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OpenTarget } from "../artifacts/open-target";
import {
  isUniverTarget,
  sameSelection,
  sameTargetRoute,
  selectionFromTarget,
  targetFromSelection,
  type UniverTarget,
  useUniverCoworkSession,
} from "../artifacts/univer-cowork-session";
import { useActivePanelTab, usePanelTabStore } from "./panel-tab-store";

type WorkspaceCoworkPanelProps = {
  sessionId: string;
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  target?: UniverTarget | null;
  isRemoteWorkspace?: boolean;
  onArtifactOpen?: () => void;
};

type CoworkSectionKey = "mainWorktree" | "readyForReview" | "activeChanges";

const EMPTY_TRANSCRIPT_TARGETS: OpenTarget[] = [];
const DEFAULT_OPEN_SECTIONS: Record<CoworkSectionKey, boolean> = {
  mainWorktree: true,
  readyForReview: true,
  activeChanges: false,
};

function unitIcon(kind: string) {
  if (kind === "sheet") return <Sheet className="size-3.5" />;
  if (kind === "doc") return <FileText className="size-3.5" />;
  if (kind === "slide") return <Presentation className="size-3.5" />;
  return <Database className="size-3.5" />;
}

function reviewStatusLabel(status: string) {
  if (status === "created") return "New";
  if (status === "modified") return "Changed";
  if (status === "deleted") return "Deleted";
  if (status === "conflict") return "Conflict";
  return "Unchanged";
}

function CoworkEmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-2 text-xs text-muted-foreground">{children}</div>;
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function sectionStatus(count: number, activeLabel: string, emptyLabel: string) {
  return count > 0 ? activeLabel : emptyLabel;
}

function sectionForSelection(selection: CoworkSelection): CoworkSectionKey | null {
  if (selection.type === "unit") return "mainWorktree";
  if (selection.type === "reviewableWorktree" || selection.type === "reviewUnit") return "readyForReview";
  if (selection.type === "activeWorktree") return "activeChanges";
  return null;
}

function CoworkSection({
  children,
  count,
  icon,
  label,
  onToggle,
  open,
  quantity,
  status,
}: {
  children: React.ReactNode;
  count: number;
  icon: React.ReactNode;
  label: string;
  onToggle: () => void;
  open: boolean;
  quantity: string;
  status: string;
}) {
  return (
    <div>
      <button
        type="button"
        className="flex h-8 w-full items-center gap-1.5 border-y border-border/70 px-2 text-left text-[11px] font-medium uppercase tracking-normal text-muted-foreground hover:bg-muted/50"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </span>
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] normal-case text-muted-foreground">
          {status}
        </span>
        <span className="shrink-0 text-[10px] normal-case text-muted-foreground" aria-label={`${label} count ${count}`}>
          {quantity}
        </span>
      </button>
      {open ? children : null}
    </div>
  );
}

type CoworkRowsProps = {
  controller: CoworkController;
  target: UniverTarget;
  sessionId: string;
  onArtifactOpen?: () => void;
};

function CoworkRows({ controller, target, sessionId, onArtifactOpen }: CoworkRowsProps) {
  const snapshot = useCoworkSnapshot(controller);
  const panelStore = usePanelTabStore;
  const [openSections, setOpenSections] = React.useState(DEFAULT_OPEN_SECTIONS);
  const pendingReviewSummaryLoadsRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    setOpenSections(DEFAULT_OPEN_SECTIONS);
  }, [target.id, target.unitId, target.worktreeId]);

  const toggleSection = React.useCallback((key: CoworkSectionKey) => {
    setOpenSections((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  React.useEffect(() => {
    if (snapshot.loadState !== "ready") return;
    const nextSelection = selectionFromTarget(snapshot, target);
    if (!sameSelection(snapshot.selection, nextSelection)) {
      controller.setSelection(nextSelection);
    }
    const section = sectionForSelection(nextSelection);
    if (section) {
      setOpenSections((current) => {
        if (current[section]) return current;
        return {
          ...current,
          [section]: true,
        };
      });
    }
  }, [controller, snapshot, target]);

  React.useEffect(() => {
    if (snapshot.loadState !== "ready") return;
    if (snapshot.selection.type !== "reviewableWorktree" && snapshot.selection.type !== "reviewUnit") return;

    const worktreeId = snapshot.selection.worktreeId;
    const reviewable = snapshot.reviewableWorktrees.find((worktree) => worktree.worktreeId === worktreeId);
    if (!reviewable || reviewable.reviewSummary || pendingReviewSummaryLoadsRef.current.has(worktreeId)) {
      return;
    }

    pendingReviewSummaryLoadsRef.current.add(worktreeId);
    void Promise.resolve(controller.loadReviewSummary(worktreeId)).finally(() => {
      pendingReviewSummaryLoadsRef.current.delete(worktreeId);
    });
  }, [controller, snapshot.loadState, snapshot.reviewableWorktrees, snapshot.selection]);

  const openSelection = React.useCallback((selection: CoworkSelection) => {
    controller.setSelection(selection);
    const nextTarget = targetFromSelection(target, selection);
    if (sameTargetRoute(target, nextTarget)) {
      onArtifactOpen?.();
      return;
    }

    const store = panelStore.getState();

    store.upsertTranscriptArtifactTarget(sessionId, nextTarget);
    store.openTab(sessionId, {
      id: nextTarget.id,
      type: "artifact",
      label: nextTarget.name,
      preview: nextTarget.preview,
    });
    store.selectTab(sessionId, nextTarget.id);
    onArtifactOpen?.();
  }, [controller, onArtifactOpen, panelStore, sessionId, target]);

  const mergeWorktree = React.useCallback(async (worktreeId: string) => {
    const result = await controller.mergeWorktree(worktreeId);
    if (result.status === "merged") {
      openSelection({ type: "container" });
    }
  }, [controller, openSelection]);

  const discardWorktree = React.useCallback(async (worktreeId: string) => {
    await controller.discardWorktree(worktreeId);
    openSelection({ type: "container" });
  }, [controller, openSelection]);

  if (snapshot.loadState === "loading" || snapshot.loadState === "idle") {
    return (
      <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="mr-2 size-3.5 animate-spin" />
        Loading Univer workspace...
      </div>
    );
  }

  if (snapshot.loadState === "error") {
    return (
      <div className="flex items-start gap-2 px-3 py-3 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span>{snapshot.error?.message ?? "Failed to load Univer workspace."}</span>
      </div>
    );
  }

  return (
    <div className="max-h-[280px] overflow-auto">
      <CoworkSection
        count={snapshot.units.length}
        icon={<Sheet className="size-3.5" />}
        label="Main worktree"
        onToggle={() => toggleSection("mainWorktree")}
        open={openSections.mainWorktree}
        quantity={countLabel(snapshot.units.length, "unit", "units")}
        status={sectionStatus(snapshot.units.length, "Current", "Empty")}
      >
        {snapshot.units.length === 0 ? (
          <CoworkEmptyRow>None</CoworkEmptyRow>
        ) : (
          snapshot.units.map((unit) => {
            const selected = snapshot.selection.type === "unit" && snapshot.selection.unitId === unit.unitId;
            return (
              <button
                key={unit.unitId}
                type="button"
                aria-label={`Open unit ${unit.displayName}`}
                aria-pressed={selected}
                data-cowork-row="unit"
                data-unit-id={unit.unitId}
                className={cn(
                  "flex h-7 w-full items-center gap-2 px-3 text-left text-xs text-foreground hover:bg-muted",
                  selected && "bg-primary/10 text-primary hover:bg-primary/15",
                )}
                onClick={() => openSelection({ type: "unit", unitId: unit.unitId })}
                title={unit.displayName}
              >
                <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">{unitIcon(unit.kind)}</span>
                <span className="min-w-0 flex-1 truncate">{unit.displayName}</span>
                {unit.headRev !== undefined ? <span className="shrink-0 text-[10px] text-muted-foreground">r{unit.headRev}</span> : null}
              </button>
            );
          })
        )}
      </CoworkSection>

      <CoworkSection
        count={snapshot.reviewableWorktrees.length}
        icon={<GitPullRequest className="size-3.5" />}
        label="Ready for review"
        onToggle={() => toggleSection("readyForReview")}
        open={openSections.readyForReview}
        quantity={countLabel(snapshot.reviewableWorktrees.length, "review", "reviews")}
        status={sectionStatus(snapshot.reviewableWorktrees.length, "Needs review", "Clear")}
      >
        {snapshot.reviewableWorktrees.length === 0 ? (
          <CoworkEmptyRow>None</CoworkEmptyRow>
        ) : (
          snapshot.reviewableWorktrees.map((worktree) => {
            const selected =
              (snapshot.selection.type === "reviewableWorktree" || snapshot.selection.type === "reviewUnit") &&
              snapshot.selection.worktreeId === worktree.worktreeId;
            const mergeAction = snapshot.actions.find((action) => action.action === "merge" && action.worktreeId === worktree.worktreeId);
            const discardAction = snapshot.actions.find((action) => action.action === "discard" && action.worktreeId === worktree.worktreeId);
            const mergeDisabled = mergeAction?.status === "running" || mergeAction?.disabledReason !== undefined;
            const discardDisabled = discardAction?.status === "running" || discardAction?.disabledReason === "busy";

            return (
              <div key={worktree.worktreeId}>
                <div
                  className={cn(
                    "flex h-8 w-full items-center gap-1 px-3 text-xs text-foreground hover:bg-muted",
                    selected && "bg-primary/10 text-primary hover:bg-primary/15",
                  )}
                >
                  <button
                    type="button"
                    aria-label={`Open reviewable worktree ${worktree.displayName}`}
                    aria-pressed={selected}
                    data-cowork-row="reviewable-worktree"
                    data-worktree-id={worktree.worktreeId}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => openSelection({ type: "reviewableWorktree", worktreeId: worktree.worktreeId })}
                    title={worktree.displayName}
                  >
                    <GitPullRequest className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{worktree.displayName}</span>
                    {worktree.reviewSummary?.counts.conflict ? (
                      <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
                    ) : null}
                    <span className="shrink-0 text-[10px] text-muted-foreground">#{worktree.headCommit}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 shrink-0"
                    disabled={mergeDisabled}
                    title={mergeAction?.disabledReason === "conflict" ? "Resolve conflicts before merge" : "Merge changes"}
                    aria-label="Merge changes"
                    onClick={() => void mergeWorktree(worktree.worktreeId)}
                  >
                    {mergeAction?.status === "running" ? <Loader2 className="animate-spin" /> : <Check />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 shrink-0"
                    disabled={discardDisabled}
                    title="Discard changes"
                    aria-label="Discard changes"
                    onClick={() => void discardWorktree(worktree.worktreeId)}
                  >
                    {discardAction?.status === "running" ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 shrink-0"
                    title="Refresh review"
                    aria-label="Refresh review"
                    onClick={() => void controller.loadReviewSummary(worktree.worktreeId)}
                  >
                    <RefreshCw />
                  </Button>
                </div>
                {selected ? (
                  <div className="border-y border-border/60 bg-muted/25">
                    {worktree.reviewSummary ? (
                      <div className="py-1">
                        {worktree.reviewSummary.units.map((unit) => {
                          const unitSelected =
                            snapshot.selection.type === "reviewUnit" &&
                            snapshot.selection.worktreeId === worktree.worktreeId &&
                            snapshot.selection.unitId === unit.unitId;
                          return (
                            <button
                              key={unit.unitId}
                              type="button"
                              aria-label={`Open review unit ${unit.displayName}`}
                              aria-pressed={unitSelected}
                              data-cowork-row="review-unit"
                              data-unit-id={unit.unitId}
                              data-worktree-id={worktree.worktreeId}
                              className={cn(
                                "flex h-7 w-full items-center gap-2 px-6 text-left text-xs text-foreground hover:bg-muted",
                                unitSelected && "bg-primary/10 text-primary hover:bg-primary/15",
                              )}
                              onClick={() => openSelection({ type: "reviewUnit", worktreeId: worktree.worktreeId, unitId: unit.unitId })}
                              title={unit.displayName}
                            >
                              <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">{unitIcon(unit.kind)}</span>
                              <span className="min-w-0 flex-1 truncate">{unit.displayName}</span>
                              <span className={cn("shrink-0 text-[10px] text-muted-foreground", unit.status === "conflict" && "text-destructive")}>
                                {reviewStatusLabel(unit.status)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center px-6 py-2 text-xs text-muted-foreground">
                        <Loader2 className="mr-2 size-3.5 animate-spin" />
                        Loading review details...
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </CoworkSection>

      <CoworkSection
        count={snapshot.activeWorktrees.length}
        icon={<GitBranch className="size-3.5" />}
        label="Active changes"
        onToggle={() => toggleSection("activeChanges")}
        open={openSections.activeChanges}
        quantity={countLabel(snapshot.activeWorktrees.length, "active", "active")}
        status={sectionStatus(snapshot.activeWorktrees.length, "In progress", "Idle")}
      >
        {snapshot.activeWorktrees.length === 0 ? (
          <CoworkEmptyRow>None</CoworkEmptyRow>
        ) : (
          snapshot.activeWorktrees.map((worktree) => {
            const selected = snapshot.selection.type === "activeWorktree" && snapshot.selection.worktreeId === worktree.worktreeId;
            return (
              <button
                key={worktree.worktreeId}
                type="button"
                aria-label={`Open active worktree ${worktree.displayName}`}
                aria-pressed={selected}
                data-cowork-row="active-worktree"
                data-worktree-id={worktree.worktreeId}
                className={cn(
                  "flex h-7 w-full items-center gap-2 px-3 text-left text-xs text-foreground hover:bg-muted",
                  selected && "bg-primary/10 text-primary hover:bg-primary/15",
                )}
                onClick={() => openSelection({ type: "activeWorktree", worktreeId: worktree.worktreeId })}
                title={worktree.displayName}
              >
                <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{worktree.displayName}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">#{worktree.headCommit}</span>
              </button>
            );
          })
        )}
      </CoworkSection>
    </div>
  );
}

type WorkspaceCoworkPanelContentProps = {
  sessionId: string;
  target: UniverTarget;
  controller: CoworkController | null;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  onArtifactOpen?: () => void;
};

export function WorkspaceCoworkPanelContent({
  sessionId,
  target,
  controller,
  error,
  isError,
  isLoading,
  onArtifactOpen,
}: WorkspaceCoworkPanelContentProps) {
  return (
    <div className="shrink-0 border-t border-border bg-background" data-testid="workspace-cowork-panel">
      <div className="flex h-10 shrink-0 items-center gap-2 px-2 mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
        <Database className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{target.name}</div>
          <div className="truncate text-[10px] text-muted-foreground">{target.value}</div>
        </div>
      </div>
      {isLoading ? (
        <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
          <Loader2 className="mr-2 size-3.5 animate-spin" />
          Opening Univer surface...
        </div>
      ) : isError ? (
        <div className="flex items-start gap-2 px-3 pb-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{error instanceof Error ? error.message : "Failed to open Univer surface."}</span>
        </div>
      ) : controller ? (
        <CoworkRows
          controller={controller}
          target={target}
          sessionId={sessionId}
          onArtifactOpen={onArtifactOpen}
        />
      ) : null}
    </div>
  );
}

export function WorkspaceCoworkPanel({
  sessionId,
  client,
  workspaceId,
  target: explicitTarget,
  isRemoteWorkspace = false,
  onArtifactOpen,
}: WorkspaceCoworkPanelProps) {
  const activeTab = useActivePanelTab(sessionId);
  const transcriptTargets = usePanelTabStore((state) => state.transcriptArtifactTargets[sessionId] ?? EMPTY_TRANSCRIPT_TARGETS);
  const activeTarget = React.useMemo<UniverTarget | null>(() => {
    if (activeTab?.type !== "artifact") return null;
    for (const item of transcriptTargets) {
      if (item.id === activeTab.id && isUniverTarget(item)) {
        return item;
      }
    }
    return null;
  }, [activeTab, transcriptTargets]);
  const target = explicitTarget === undefined ? activeTarget : explicitTarget;
  const { controller, error, isError, isLoading } = useUniverCoworkSession({
    client,
    workspaceId,
    target,
    isRemoteWorkspace,
  });

  if (!target) {
    return null;
  }

  return (
    <WorkspaceCoworkPanelContent
      sessionId={sessionId}
      target={target}
      controller={controller}
      error={error}
      isError={isError}
      isLoading={isLoading}
      onArtifactOpen={onArtifactOpen}
    />
  );
}
