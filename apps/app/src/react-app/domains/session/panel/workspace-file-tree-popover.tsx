/** @jsxImportSource react */
import * as React from "react";
import { useCoworkSnapshot } from "@univer/cowork/react";
import type { CoworkController } from "@univer/cowork";
import { FolderTree, GitPullRequest, Table2 } from "lucide-react";

import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  type UniverTarget,
  useUniverCoworkSession,
} from "../artifacts/univer-cowork-session";
import { WorkspaceCoworkPanelContent } from "./workspace-cowork-panel";
import { WorkspaceFileTree } from "./workspace-file-tree";

type WorkspaceFilesPopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  workspaceRoot: string;
  isRemoteWorkspace?: boolean;
  onArtifactOpen: () => void;
};

type UniverWorktreePopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  target: UniverTarget | null;
  isRemoteWorkspace?: boolean;
  onArtifactOpen: () => void;
  onCreateTaskFromHere?: () => void;
  worktreeIssue?: {
    kind: "multiple";
    worktreeIds: string[];
  } | {
    kind: "ownershipConflict";
    worktreeId: string;
    ownerSessionId: string;
  } | null;
  terminalState?: "merged" | "discarded" | null;
  onOpenOwningTask?: (sessionId: string) => void;
  label?: string;
  testId?: string;
  panelVariant?: "changes" | "currentTarget" | "tasks" | "units";
  toolbarKind?: "tasks" | "units";
};

function ToolbarButton({
  active,
  badge,
  children,
  className,
  disabled,
  label,
  testId,
  ...props
}: React.ComponentProps<typeof Button> & {
  active: boolean;
  badge?: number;
  children: React.ReactNode;
  label: string;
  testId: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "h-full gap-1.5 rounded-none bg-transparent px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/75 hover:text-foreground",
        active && "text-foreground hover:text-foreground",
        className,
      )}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      {...props}
    >
      {children}
      <span>{label}</span>
      {badge !== undefined && badge > 0 ? (
        <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {badge}
        </span>
      ) : null}
    </Button>
  );
}

function ChangesBadge({
  active,
  controller,
  label,
  toolbarKind,
  testId,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "children"> & {
  active: boolean;
  controller: CoworkController;
  label: string;
  toolbarKind: "tasks" | "units";
  testId: string;
}) {
  const snapshot = useCoworkSnapshot(controller);
  const reviewCount = toolbarKind === "tasks" && snapshot.loadState === "ready" ? snapshot.reviewableWorktrees.length : 0;
  return (
    <ToolbarButton
      {...props}
      active={active}
      badge={reviewCount > 0 ? reviewCount : undefined}
      label={label}
      testId={testId}
    >
      {toolbarKind === "units" ? <Table2 className="size-3.5" /> : <GitPullRequest className="size-3.5" />}
    </ToolbarButton>
  );
}

export function WorkspaceFilesPopover({
  open,
  onOpenChange,
  sessionId,
  client,
  workspaceId,
  workspaceRoot,
  isRemoteWorkspace = false,
  onArtifactOpen,
}: WorkspaceFilesPopoverProps) {
  const disabled = !sessionId || !workspaceId || !client;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={(
          <ToolbarButton
            active={open}
            disabled={disabled}
            label="Files"
            testId="composer-toolbar-files"
          >
            <FolderTree className="size-3.5" />
          </ToolbarButton>
        )}
      />
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="h-[min(78vh,680px)] w-[420px] gap-0 overflow-hidden rounded-xl p-0"
      >
        {sessionId ? (
          <WorkspaceFileTree
            sessionId={sessionId}
            client={client}
            workspaceId={workspaceId}
            workspaceRoot={workspaceRoot}
            isRemoteWorkspace={isRemoteWorkspace}
            onArtifactOpen={onArtifactOpen}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function UniverWorktreePopover({
  open,
  onOpenChange,
  sessionId,
  client,
  workspaceId,
  target,
  isRemoteWorkspace = false,
  onArtifactOpen,
  onCreateTaskFromHere,
  onOpenOwningTask,
  worktreeIssue = null,
  terminalState = null,
  label = "Changes",
  testId = "composer-toolbar-changes",
  panelVariant = "changes",
  toolbarKind = "tasks",
}: UniverWorktreePopoverProps) {
  const { controller, error, isError, isLoading } = useUniverCoworkSession({
    client,
    enabled: open,
    workspaceId,
    target,
    isRemoteWorkspace,
  });

  React.useEffect(() => {
    if (!target && open) onOpenChange(false);
  }, [onOpenChange, open, target]);

  if (!target) return null;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          controller ? (
            <ChangesBadge active={open} controller={controller} label={label} toolbarKind={toolbarKind} testId={testId} />
          ) : (
            <ToolbarButton
              active={open}
              label={label}
              testId={testId}
            >
              {toolbarKind === "units" ? <Table2 className="size-3.5" /> : <GitPullRequest className="size-3.5" />}
            </ToolbarButton>
          )
        }
      />
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="max-h-[min(60vh,520px)] w-[380px] gap-0 overflow-hidden rounded-xl p-0"
      >
        {sessionId ? (
          <WorkspaceCoworkPanelContent
            sessionId={sessionId}
            workspaceId={workspaceId}
            client={client}
            target={target}
            controller={controller}
            error={error}
            isError={isError}
            isLoading={isLoading}
            onArtifactOpen={onArtifactOpen}
            onCreateTaskFromHere={onCreateTaskFromHere}
            onOpenOwningTask={onOpenOwningTask}
            worktreeIssue={worktreeIssue}
            terminalState={terminalState}
            variant={panelVariant}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
