/** @jsxImportSource react */
import * as React from "react";
import { FolderTree } from "lucide-react";

import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { WorkspaceCoworkPanel } from "./workspace-cowork-panel";
import { WorkspaceFileTree } from "./workspace-file-tree";

type WorkspaceFileTreePopoverProps = {
  sessionId: string | null;
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  workspaceRoot: string;
  isRemoteWorkspace?: boolean;
  onArtifactOpen: () => void;
};

export function WorkspaceFileTreePopover({
  sessionId,
  client,
  workspaceId,
  workspaceRoot,
  isRemoteWorkspace = false,
  onArtifactOpen,
}: WorkspaceFileTreePopoverProps) {
  const [open, setOpen] = React.useState(false);
  const disabled = !sessionId || !workspaceId || !client;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              "rounded-xl text-gray-10 transition-colors hover:bg-muted hover:text-foreground",
              open && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
            )}
            title="Workspace files"
            aria-label="Workspace files"
            aria-pressed={open}
            disabled={disabled}
          >
            <FolderTree size={17} />
          </Button>
        )}
      />
      <PopoverContent align="end" sideOffset={8} className="h-[min(78vh,680px)] w-[420px] gap-0 overflow-hidden rounded-xl p-0">
        {sessionId ? (
          <div className="flex h-full min-h-0 flex-col bg-background">
            <div className="min-h-0 flex-1">
              <WorkspaceFileTree
                sessionId={sessionId}
                client={client}
                workspaceId={workspaceId}
                workspaceRoot={workspaceRoot}
                isRemoteWorkspace={isRemoteWorkspace}
                onArtifactOpen={onArtifactOpen}
              />
            </div>
            <WorkspaceCoworkPanel
              sessionId={sessionId}
              client={client}
              workspaceId={workspaceId}
              isRemoteWorkspace={isRemoteWorkspace}
              onArtifactOpen={onArtifactOpen}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
