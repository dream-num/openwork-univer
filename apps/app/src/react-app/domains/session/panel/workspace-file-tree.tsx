/** @jsxImportSource react */
import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  FolderTree,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { openDesktopPath } from "@/app/lib/desktop";
import type { OpenworkFileSessionCatalogEntry, OpenworkServerClient } from "@/app/lib/openwork-server";
import { isElectronRuntime } from "@/app/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatFileSize } from "@/lib/utils";
import { useActivePanelTab, usePanelTabStore } from "./panel-tab-store";
import type { OpenTarget, OpenTargetPreview } from "../artifacts/open-target";

type WorkspaceFileTreeProps = {
  sessionId: string;
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  workspaceRoot: string;
  isRemoteWorkspace?: boolean;
  onArtifactOpen?: () => void;
};

type WorkspaceFileNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  size: number;
  mtimeMs: number;
  children: WorkspaceFileNode[];
};

type WorkspaceFileTreeStatus =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "ready"; total: number; truncated: boolean; entries: OpenworkFileSessionCatalogEntry[] }
  | { type: "error"; message: string };

type CachedWorkspaceFileTreeState = {
  status: WorkspaceFileTreeStatus;
  query: string;
  expandedPaths: string[];
};

const WORKSPACE_FILE_TREE_LIMIT = 5000;
const PANEL_FILE_PREVIEWS: OpenTargetPreview[] = ["markdown", "sheet", "slides", "univer", "image", "pdf", "html"];
const DEFAULT_CACHED_WORKSPACE_FILE_TREE_STATE: CachedWorkspaceFileTreeState = {
  status: { type: "idle" },
  query: "",
  expandedPaths: [],
};
const EMPTY_TRANSCRIPT_TARGETS: OpenTarget[] = [];
const workspaceFileTreeStateCache = new Map<string, CachedWorkspaceFileTreeState>();

function basename(path: string) {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function workspaceName(path: string) {
  return basename(path.replace(/[\\/]+$/, "")) || "Workspace";
}

function absoluteWorkspacePath(root: string, path: string) {
  const cleanRoot = root.trim().replace(/[/\\]+$/, "");
  const cleanPath = path.trim().replace(/^\.\//, "");
  return cleanRoot ? `${cleanRoot}/${cleanPath}` : cleanPath;
}

function previewForPath(path: string): OpenTargetPreview {
  const lower = path.toLowerCase();
  if (lower.endsWith(".univer")) return "univer";
  if ([".md", ".markdown", ".mdx"].some((ext) => lower.endsWith(ext))) return "markdown";
  if ([".csv", ".tsv", ".xlsx", ".xls", ".ods"].some((ext) => lower.endsWith(ext))) return "sheet";
  if ([".ppt", ".pptx", ".pptm", ".pot", ".potx", ".odp", ".key", ".sxi"].some((ext) => lower.endsWith(ext))) return "slides";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].some((ext) => lower.endsWith(ext))) return "image";
  if (lower.endsWith(".pdf")) return "pdf";
  if ([".html", ".htm"].some((ext) => lower.endsWith(ext))) return "html";
  if ([".txt", ".log", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".xml", ".ts", ".tsx", ".js", ".jsx", ".css", ".scss"].some((ext) => lower.endsWith(ext))) return "text";
  return "external";
}

function isPanelPreview(preview: OpenTargetPreview) {
  return PANEL_FILE_PREVIEWS.includes(preview);
}

function createNode(path: string, kind: "file" | "dir", size: number, mtimeMs: number): WorkspaceFileNode {
  return {
    name: basename(path),
    path,
    kind,
    size,
    mtimeMs,
    children: [],
  };
}

function childByName(node: WorkspaceFileNode, name: string) {
  return node.children.find((child) => child.name === name) ?? null;
}

function sortNodes(nodes: WorkspaceFileNode[]) {
  nodes.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "dir" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  for (const node of nodes) sortNodes(node.children);
  return nodes;
}

function buildTree(entries: OpenworkFileSessionCatalogEntry[]) {
  const root = createNode("", "dir", 0, 0);

  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let current = root;

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const childPath = parts.slice(0, index + 1).join("/");
      const leaf = index === parts.length - 1;
      const kind = leaf ? entry.kind : "dir";
      const size = leaf ? entry.size : 0;
      const mtimeMs = leaf ? entry.mtimeMs : 0;
      let child = childByName(current, part);

      if (!child) {
        child = createNode(childPath, kind, size, mtimeMs);
        current.children.push(child);
      } else if (leaf) {
        child.kind = kind;
        child.size = size;
        child.mtimeMs = mtimeMs;
      }

      current = child;
    }
  }

  return sortNodes(root.children);
}

function filterTree(nodes: WorkspaceFileNode[], query: string): WorkspaceFileNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;

  const result: WorkspaceFileNode[] = [];
  for (const node of nodes) {
    const children = filterTree(node.children, normalized);
    const matched = node.path.toLowerCase().includes(normalized) || node.name.toLowerCase().includes(normalized);
    if (matched || children.length) {
      result.push({
        ...node,
        children,
      });
    }
  }
  return result;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to load files.";
}

function cacheKey(sessionId: string, workspaceId: string | null, workspaceRoot: string) {
  return `${sessionId}:${workspaceId ?? ""}:${workspaceRoot}`;
}

function readCachedState(key: string): CachedWorkspaceFileTreeState {
  return workspaceFileTreeStateCache.get(key) ?? DEFAULT_CACHED_WORKSPACE_FILE_TREE_STATE;
}

function parentPaths(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
}

type FileTreeRowProps = {
  node: WorkspaceFileNode;
  depth: number;
  expandedPaths: Set<string>;
  searchActive: boolean;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onOpenFile: (node: WorkspaceFileNode) => void;
};

function FileTreeRow({ node, depth, expandedPaths, searchActive, selectedPath, onToggle, onOpenFile }: FileTreeRowProps) {
  const hasChildren = node.children.length > 0;
  const expanded = searchActive || expandedPaths.has(node.path);
  const selected = node.kind === "file" && node.path === selectedPath;
  const paddingLeft = 8 + depth * 16;

  return (
    <div>
      <button
        type="button"
        className={cn(
          "flex h-7 w-full items-center gap-1.5 px-2 text-left text-xs text-foreground hover:bg-muted",
          selected && "bg-primary/10 text-primary hover:bg-primary/15",
        )}
        style={{ paddingLeft }}
        onClick={() => {
          if (node.kind === "dir") {
            onToggle(node.path);
          } else {
            onOpenFile(node);
          }
        }}
        title={node.path}
        aria-label={node.kind === "dir" ? `Toggle ${node.path}` : `Open ${node.path}`}
        aria-current={selected ? "true" : undefined}
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {node.kind === "dir" ? (
            hasChildren ? (
              expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />
            ) : (
              <span className="size-3.5" />
            )
          ) : (
            <span className="size-3.5" />
          )}
        </span>
        <span className={cn("flex size-4 shrink-0 items-center justify-center text-muted-foreground", selected && "text-primary")}>
          {node.kind === "dir" ? (
            expanded ? <FolderOpen className="size-4" /> : <Folder className="size-4" />
          ) : (
            <File className="size-4" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {node.kind === "file" ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">{formatFileSize(node.size)}</span>
        ) : null}
      </button>
      {node.kind === "dir" && expanded ? (
        <div>
          {node.children.map((child) => (
            <FileTreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              searchActive={searchActive}
              selectedPath={selectedPath}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceFileTree({
  sessionId,
  client,
  workspaceId,
  workspaceRoot,
  isRemoteWorkspace = false,
  onArtifactOpen,
}: WorkspaceFileTreeProps) {
  const fileSessionIdRef = React.useRef<string | null>(null);
  const loadGenerationRef = React.useRef(0);
  const stateKey = React.useMemo(() => cacheKey(sessionId, workspaceId, workspaceRoot), [sessionId, workspaceId, workspaceRoot]);
  const cachedState = React.useMemo(() => readCachedState(stateKey), [stateKey]);
  const [loadedStateKey, setLoadedStateKey] = React.useState(stateKey);
  const [status, setStatus] = React.useState<WorkspaceFileTreeStatus>(cachedState.status);
  const [query, setQuery] = React.useState(cachedState.query);
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(() => new Set(cachedState.expandedPaths));
  const store = usePanelTabStore;
  const activeTab = useActivePanelTab(sessionId);
  const transcriptTargets = usePanelTabStore((state) => state.transcriptArtifactTargets[sessionId] ?? EMPTY_TRANSCRIPT_TARGETS);
  const selectedFilePath = React.useMemo(() => {
    if (activeTab?.type !== "artifact") return null;
    const target = transcriptTargets.find((item) => item.id === activeTab.id);
    return target?.kind === "file" ? target.value : null;
  }, [activeTab, transcriptTargets]);

  const closeFileSession = React.useCallback(async () => {
    loadGenerationRef.current += 1;
    const fileSessionId = fileSessionIdRef.current;
    fileSessionIdRef.current = null;
    if (fileSessionId && client) {
      await client.closeFileSession(fileSessionId).catch(() => undefined);
    }
  }, [client]);

  const loadFiles = React.useCallback(async () => {
    if (!client || !workspaceId) {
      setStatus({ type: "error", message: "Workspace is not available." });
      return;
    }

    const generation = loadGenerationRef.current;
    setStatus((current) => current.type === "ready" ? current : { type: "loading" });

    try {
      let fileSessionId = fileSessionIdRef.current;
      if (!fileSessionId) {
        const created = await client.createWorkspaceFileSession(workspaceId, { write: false, ttlSeconds: 300 });
        if (loadGenerationRef.current !== generation) {
          await client.closeFileSession(created.session.id).catch(() => undefined);
          return;
        }
        fileSessionId = created.session.id;
        fileSessionIdRef.current = fileSessionId;
      }
      const snapshot = await client.listFileSessionCatalog(fileSessionId, {
        includeDirs: true,
        limit: WORKSPACE_FILE_TREE_LIMIT,
      });
      if (loadGenerationRef.current !== generation) {
        return;
      }
      setStatus({
        type: "ready",
        total: snapshot.total,
        truncated: snapshot.truncated,
        entries: snapshot.items,
      });
    } catch (error) {
      if (loadGenerationRef.current === generation) {
        setStatus({ type: "error", message: errorMessage(error) });
      }
    }
  }, [client, workspaceId]);

  React.useEffect(() => {
    if (loadedStateKey === stateKey) return;
    const next = readCachedState(stateKey);
    setStatus(next.status);
    setQuery(next.query);
    setExpandedPaths(new Set(next.expandedPaths));
    setLoadedStateKey(stateKey);
  }, [loadedStateKey, stateKey]);

  React.useEffect(() => {
    if (loadedStateKey !== stateKey) return;
    workspaceFileTreeStateCache.set(stateKey, {
      status,
      query,
      expandedPaths: Array.from(expandedPaths),
    });
  }, [expandedPaths, loadedStateKey, query, stateKey, status]);

  React.useEffect(() => {
    if (loadedStateKey !== stateKey) return;
    void loadFiles();
  }, [loadFiles, loadedStateKey, stateKey]);

  React.useEffect(() => {
    if (loadedStateKey !== stateKey || !selectedFilePath) return;
    const selectedParents = parentPaths(selectedFilePath);
    if (!selectedParents.length) return;

    setExpandedPaths((current) => {
      const next = new Set(current);
      let changed = false;
      for (const path of selectedParents) {
        if (!next.has(path)) {
          next.add(path);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [loadedStateKey, selectedFilePath, stateKey]);

  React.useEffect(() => {
    return () => {
      void closeFileSession();
    };
  }, [closeFileSession, stateKey]);

  const tree = React.useMemo(() => (
    status.type === "ready" ? buildTree(status.entries) : []
  ), [status]);
  const visibleTree = React.useMemo(() => filterTree(tree, query), [query, tree]);
  const searchActive = query.trim().length > 0;

  const togglePath = React.useCallback((path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const openFile = React.useCallback((node: WorkspaceFileNode) => {
    const preview = previewForPath(node.path);

    if (isPanelPreview(preview)) {
      const target: OpenTarget = {
        id: `file:${node.path.toLowerCase()}`,
        kind: "file",
        value: node.path,
        name: node.name,
        preview,
        confidence: 100,
        reason: "workspace files",
        exists: true,
        size: node.size,
        updatedAt: node.mtimeMs,
      };
      const panelStore = store.getState();
      panelStore.upsertTranscriptArtifactTarget(sessionId, target);
      panelStore.openTab(sessionId, {
        id: target.id,
        type: "artifact",
        label: target.name,
        preview: target.preview,
      });
      panelStore.selectTab(sessionId, target.id);
      onArtifactOpen?.();
      return;
    }

    if (!isRemoteWorkspace && isElectronRuntime()) {
      void openDesktopPath(absoluteWorkspacePath(workspaceRoot, node.path)).catch(() => undefined);
    }
  }, [isRemoteWorkspace, onArtifactOpen, sessionId, store, workspaceRoot]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2 mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
        <FolderTree className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">Files</div>
          <div className="truncate text-[10px] text-muted-foreground" title={workspaceRoot}>{workspaceName(workspaceRoot)}</div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void loadFiles()}
          aria-label="Refresh files"
          title="Refresh files"
          disabled={status.type === "loading"}
        >
          {status.type === "loading" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
      </div>
      <div className="shrink-0 border-b border-border px-2 py-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search files"
          className="h-8"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {status.type === "loading" || status.type === "idle" ? (
          <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading files...
          </div>
        ) : status.type === "error" ? (
          <div className="p-4 text-sm text-destructive">{status.message}</div>
        ) : visibleTree.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No files found.</div>
        ) : (
          <div>
            {visibleTree.map((node) => (
              <FileTreeRow
                key={node.path}
                node={node}
                depth={0}
                expandedPaths={expandedPaths}
                searchActive={searchActive}
                selectedPath={selectedFilePath}
                onToggle={togglePath}
                onOpenFile={openFile}
              />
            ))}
          </div>
        )}
      </div>
      {status.type === "ready" && status.truncated ? (
        <div className="shrink-0 border-t border-border px-2 py-1.5 text-[10px] text-muted-foreground">
          Showing {status.entries.length.toLocaleString()} of {status.total.toLocaleString()} entries.
        </div>
      ) : null}
    </div>
  );
}
