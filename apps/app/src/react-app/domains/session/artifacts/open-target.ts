import type { UIMessage } from "ai";
import { collectUniverOpenHandoffUrls } from "@univer/cowork";

type OpenTargetKind = "url" | "file";
export type OpenTargetPreview = "browser" | "markdown" | "sheet" | "slides" | "univer" | "image" | "pdf" | "html" | "text" | "external";

export interface TextData {
  kind: "text";
  data: string;
}

export interface BinaryData {
  kind: "binary";
  data: ArrayBuffer;
}

export type Data = TextData | BinaryData;

export type OpenTarget = {
  id: string;
  kind: OpenTargetKind;
  value: string;
  name: string;
  preview: OpenTargetPreview;
  confidence: number;
  reason: string;
  worktreeId?: string;
  sessionWorktreeId?: string;
  unitId?: string;
  lifecycleEvent?: "univerNew";
  exists?: boolean;
  size?: number;
  updatedAt?: number;
};

const WORKSPACES_PREFIX_PATTERN = /^workspaces\/[^/]+\//i;
const WORKSPACE_ID_PREFIX_PATTERN = /^workspace\/(?:ws_[^/]+|\d+|[0-9a-f-]{6,})\//i;

const FILE_PATTERN = /(?:^|[\s"'`([{|])((?:\.{1,2}[/\\]|~[/\\]|[/\\])?[\p{L}\p{N}._~@%+=,-]+(?:[/\\][\p{L}\p{N}._~@%+=,-]+)*\.[a-z][a-z0-9]{0,9})(?=$|[\s"'`)\]}>,;:|])/giu;
const URL_PATTERN = /https?:\/\/[^\s)\]}>"'`]+/gi;
const SOCKET_PATTERN = /(?:ws|wss):\/\/[^\s)\]}>"'`]+/gi;
const SIDEBAR_ARTIFACT_FILE_PREVIEWS = new Set<OpenTargetPreview>(["markdown", "sheet", "slides", "univer", "image", "pdf", "html"]);
const MARKDOWN_LINK_PATTERN = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const ASSISTANT_ARTIFACT_MENTION_PATTERN = /(?:\b(?:artifact|created|deck|deliverable|exported|file|generated|opened|presentation|saved|slides?|updated|wrote)\b|文件|产物|生成|创建|导出|保存|写入|更新|路径|位置)/iu;
const DISCOVERY_TOOL_NAMES = new Set(["glob", "grep", "search", "find"]);
const ARTIFACT_METADATA_TOOL_NAMES = new Set(["openwork_extension_call"]);
const WRITE_TOOL_NAMES = new Set([
  "apply_patch",
  "edit",
  "edit_file",
  "multi_edit",
  "multiedit",
  "patch",
  "str_replace_editor",
  "write",
  "write_file",
]);
const FILE_METADATA_KEYS = ["path", "file", "filePath", "filepath", "univerfile", "univerfilePath", "targetPath"];
const WORKTREE_METADATA_KEYS = ["worktreeId", "worktree"];
const UNIT_METADATA_KEYS = ["unitId", "unit", "localUnitId"];
const COMMAND_METADATA_KEYS = ["command", "cmd", "script"];
const PATCH_FILE_PATTERN = /^\*\*\* (?:Add File|Update File):\s*(.+)$/gmi;
const PATCH_MOVE_TO_PATTERN = /^\*\*\* Move to:\s*(.+)$/gmi;
const URI_PATTERN = /^(?:https?|wss?|file):\/\//i;
const UNIVER_NEW_COMMAND_PATTERN = /(?:^|[\s;&|])(?:bunx\s+|pnpm\s+(?:exec\s+|dlx\s+)?|npx\s+)?univer(?:-cli)?\s+new(?:$|\s)/iu;

type DeriveOpenTargetsOptions = {
  includeFileMentions?: boolean;
};

type ScanTextOptions = {
  includeFiles: boolean;
  ignoredUrls?: ReadonlySet<string>;
};

function normalizePath(path: string) {
  return path
    .trim()
    .replace(/[\\]+/g, "/")
    .replace(/^\.\//, "")
    .replace(WORKSPACES_PREFIX_PATTERN, "")
    .replace(WORKSPACE_ID_PREFIX_PATTERN, "");
}

function basename(value: string) {
  const clean = value.split(/[?#]/)[0] ?? value;
  return clean.split("/").filter(Boolean).pop() ?? value;
}

function extname(value: string) {
  const name = basename(value).toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
}

function firstStringField(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const field = value[key];
    if (typeof field === "string" && field.trim()) return field.trim();
  }
  return "";
}

function routeMetadata(value: unknown): Pick<OpenTarget, "worktreeId" | "unitId"> {
  if (!isObject(value)) return {};
  const worktreeId = firstStringField(value, WORKTREE_METADATA_KEYS);
  const unitId = firstStringField(value, UNIT_METADATA_KEYS);
  return {
    ...(worktreeId ? { worktreeId } : {}),
    ...(unitId ? { unitId } : {}),
  };
}

function classifyOpenTarget(value: string, kind: OpenTargetKind): OpenTargetPreview {
  if (kind === "url") return "browser";
  const ext = extname(value);
  if ([".md", ".markdown", ".mdx"].includes(ext)) return "markdown";
  if (ext === ".univer") return "univer";
  if ([".csv", ".tsv", ".xlsx", ".xls", ".ods"].includes(ext)) return "sheet";
  if ([".ppt", ".pptx", ".pptm", ".pot", ".potx", ".odp", ".key", ".sxi"].includes(ext)) return "slides";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) return "image";
  if (ext === ".pdf") return "pdf";
  if ([".html", ".htm"].includes(ext)) return "html";
  if ([".txt", ".log", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".xml", ".ts", ".tsx", ".js", ".jsx", ".css", ".scss"].includes(ext)) return "text";
  return "external";
}

function shouldScanAssistantFileMentions(text: string) {
  return ASSISTANT_ARTIFACT_MENTION_PATTERN.test(text);
}

function textWithoutRedundantMarkdownLinkLabels(text: string) {
  return text.replace(MARKDOWN_LINK_PATTERN, (match, label: string, href: string) => {
    const cleanLabel = label.trim();
    const cleanHref = href.trim();
    return cleanLabel === basename(cleanHref) ? `[](${cleanHref})` : match;
  });
}

function targetFromFile(path: string, confidence: number, reason: string, metadata: Pick<OpenTarget, "worktreeId" | "unitId" | "lifecycleEvent"> = {}): OpenTarget | null {
  const normalized = normalizePath(path).replace(/[.,;:]+$/, "");
  if (!normalized || normalized.length > 500 || !normalized.includes(".")) return null;
  return {
    id: `file:${normalized.toLowerCase()}`,
    kind: "file",
    value: normalized,
    name: basename(normalized),
    preview: classifyOpenTarget(normalized, "file"),
    confidence,
    reason,
    ...(metadata.worktreeId ? { worktreeId: metadata.worktreeId } : {}),
    ...(metadata.unitId ? { unitId: metadata.unitId } : {}),
    ...(metadata.lifecycleEvent ? { lifecycleEvent: metadata.lifecycleEvent } : {}),
  };
}

function targetFromUrl(url: string, confidence: number, reason: string): OpenTarget | null {
  const stripped = url.trim().replace(/[.,;:`\\]+$/, "");
  let clean = stripped;
  try {
    const parsed = new URL(stripped);
    if (/^\/+$/i.test(parsed.pathname) && !parsed.search && !parsed.hash) {
      clean = parsed.origin;
    }
  } catch {
    // Keep the stripped value; regex extraction already validated the shape.
  }
  if (!clean) return null;
  return {
    id: `url:${clean}`,
    kind: "url",
    value: clean,
    name: basename(clean) || clean,
    preview: "browser",
    confidence,
    reason,
  };
}

function addTarget(map: Map<string, OpenTarget>, target: OpenTarget | null) {
  if (!target) return;
  const existing = map.get(target.id);
  if (!existing) {
    map.set(target.id, target);
    return;
  }

  if (target.confidence >= existing.confidence) {
    map.set(target.id, {
      ...target,
      worktreeId: target.worktreeId ?? existing.worktreeId,
      unitId: target.unitId ?? existing.unitId,
      lifecycleEvent: target.lifecycleEvent ?? existing.lifecycleEvent,
    });
    return;
  }

  if (
    (target.worktreeId && !existing.worktreeId) ||
    (target.unitId && !existing.unitId) ||
    (target.lifecycleEvent && !existing.lifecycleEvent)
  ) {
    map.set(target.id, {
      ...existing,
      worktreeId: existing.worktreeId ?? target.worktreeId,
      unitId: existing.unitId ?? target.unitId,
      lifecycleEvent: existing.lifecycleEvent ?? target.lifecycleEvent,
    });
  }
}

function addUrlTarget(
  map: Map<string, OpenTarget>,
  url: string,
  confidence: number,
  reason: string,
  ignoredUrls?: ReadonlySet<string>,
) {
  const target = targetFromUrl(url, confidence, reason);
  if (!target || ignoredUrls?.has(target.value)) return;
  addTarget(map, target);
}

function isArtifactTarget(target: OpenTarget) {
  return target.kind === "url" || target.kind === "file";
}

export function isCollectibleArtifactTarget(target: OpenTarget) {
  return target.kind === "file" && target.exists === true && SIDEBAR_ARTIFACT_FILE_PREVIEWS.has(target.preview);
}

export function isOpenableFileTarget(target: OpenTarget) {
  return target.kind === "file" && target.exists === true;
}

export function isLocalhostBrowserTarget(target: OpenTarget) {
  return target.kind === "url" && /(?:https?|wss?):\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(target.value);
}

export function selectAutoOpenTarget(_targets: OpenTarget[]): OpenTarget | null {
  return null;
}

function scanText(
  map: Map<string, OpenTarget>,
  text: string,
  confidence: number,
  reason: string,
  options: ScanTextOptions,
) {
  if (!text) {
    return;
  }

  let scanValue = text;

  MARKDOWN_LINK_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(MARKDOWN_LINK_PATTERN)) {
    const href = match[2];
    if (!href) continue;
    if (/^(?:https?|wss?):\/\//i.test(href)) {
      addUrlTarget(map, href, confidence, reason, options.ignoredUrls);
    } else if (options.includeFiles) {
      addTarget(map, targetFromFile(href, confidence, reason));
    }
  }

  if (options.includeFiles) {
    scanValue = textWithoutRedundantMarkdownLinkLabels(text);
  }

  URL_PATTERN.lastIndex = 0;

  for (const match of scanValue.matchAll(URL_PATTERN)) {
    if (match[0]) addUrlTarget(map, match[0], confidence, reason, options.ignoredUrls);
  }

  SOCKET_PATTERN.lastIndex = 0;

  for (const match of scanValue.matchAll(SOCKET_PATTERN)) {
    if (match[0]) addUrlTarget(map, match[0], confidence, reason, options.ignoredUrls);
  }

  if (!options.includeFiles) return;

  FILE_PATTERN.lastIndex = 0;
  for (const match of scanValue.matchAll(FILE_PATTERN)) {
    if (match[1]) addTarget(map, targetFromFile(match[1], confidence, reason));
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizedToolName(toolName: string) {
  return toolName.trim().toLowerCase().replace(/^functions[._-]/, "");
}

function isDiscoveryTool(toolName: string) {
  return DISCOVERY_TOOL_NAMES.has(normalizedToolName(toolName));
}

function isWriteTool(toolName: string) {
  return WRITE_TOOL_NAMES.has(normalizedToolName(toolName));
}

function isArtifactMetadataTool(toolName: string) {
  return ARTIFACT_METADATA_TOOL_NAMES.has(normalizedToolName(toolName));
}

function collectFileMetadataValues(value: unknown) {
  if (!isObject(value)) return [];
  const values: string[] = [];
  for (const key of FILE_METADATA_KEYS) {
    const file = value[key];
    if (typeof file === "string") values.push(file);
  }
  const files = value.files;
  if (Array.isArray(files)) {
    for (const file of files) {
      if (typeof file === "string") values.push(file);
    }
  }
  return values;
}

function collectFileMetadataTargets(value: unknown, confidence: number, reason: string) {
  const metadata = routeMetadata(value);
  return collectFileMetadataValues(value)
    .map((file) => targetFromFile(file, confidence, reason, metadata))
    .filter((target): target is OpenTarget => target !== null);
}

function collectNestedFileMetadataTargets(value: unknown, confidence: number, reason: string) {
  if (!isObject(value)) return [];
  return [value, value.args, value.result].flatMap((entry) => collectFileMetadataTargets(entry, confidence, reason));
}

function parseJsonCandidates(value: string): unknown[] {
  const candidates: unknown[] = [];
  const seen = new Set<string>();
  const parseCandidate = (candidate: string) => {
    const trimmed = candidate.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      candidates.push(parsed);
    } catch {
      // Tool output often contains logs around the JSON envelope; line parsing below
      // still catches the common CLI shape without treating arbitrary text as metadata.
    }
  };

  parseCandidate(value);
  for (const line of value.split(/\r?\n/)) {
    parseCandidate(line);
  }
  return candidates;
}

function addIgnoredUrl(urls: Set<string>, value: unknown) {
  if (typeof value !== "string") return;
  const target = targetFromUrl(value, 0, "ignored univer viewer url");
  if (target) urls.add(target.value);
}

function collectUniverOpenSurfaceUrls(value: unknown) {
  const urls = new Set<string>();
  for (const url of collectUniverOpenHandoffUrls(value)) {
    addIgnoredUrl(urls, url);
  }
  return urls;
}

function collectUniverWorktreeMetadataTargets(value: unknown, confidence: number, reason: string) {
  const targets = new Map<string, OpenTarget>();
  const visit = (entry: unknown, depth: number) => {
    if (depth > 4) return;

    if (typeof entry === "string") {
      for (const parsed of parseJsonCandidates(entry)) {
        visit(parsed, depth + 1);
      }
      return;
    }

    if (Array.isArray(entry)) {
      for (const item of entry) {
        visit(item, depth + 1);
      }
      return;
    }

    if (!isObject(entry)) return;

    const metadata = routeMetadata(entry);
    if (metadata.worktreeId) {
      for (const file of collectFileMetadataValues(entry)) {
        const target = targetFromFile(file, confidence, reason, metadata);
        if (target?.preview === "univer") {
          addTarget(targets, target);
        }
      }
    }

    visit(entry.args, depth + 1);
    visit(entry.result, depth + 1);
    visit(entry.output, depth + 1);
  };

  visit(value, 0);
  return Array.from(targets.values());
}

function commandTexts(value: unknown, depth = 0): string[] {
  if (depth > 3) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => commandTexts(entry, depth + 1));
  if (!isObject(value)) return [];

  const values: string[] = [];
  for (const key of COMMAND_METADATA_KEYS) {
    const field = value[key];
    if (typeof field === "string") values.push(field);
    if (Array.isArray(field)) values.push(...field.flatMap((entry) => commandTexts(entry, depth + 1)));
  }
  const args = value.args;
  if (Array.isArray(args)) values.push(...args.flatMap((entry) => commandTexts(entry, depth + 1)));
  return values;
}

function hasUniverNewCommand(value: unknown) {
  return commandTexts(value).some((text) => UNIVER_NEW_COMMAND_PATTERN.test(text));
}

function addUniverNewCommandTargets(map: Map<string, OpenTarget>, value: unknown) {
  for (const command of commandTexts(value)) {
    if (!UNIVER_NEW_COMMAND_PATTERN.test(command)) continue;
    FILE_PATTERN.lastIndex = 0;
    for (const match of command.matchAll(FILE_PATTERN)) {
      if (!match[1]) continue;
      const target = targetFromFile(match[1], 96, "univer new", { lifecycleEvent: "univerNew" });
      if (target?.preview === "univer") addTarget(map, target);
    }
  }
}

function collectUniverNewMetadataTargets(value: unknown) {
  const targets = new Map<string, OpenTarget>();
  const visit = (entry: unknown, depth: number) => {
    if (depth > 4) return;
    if (typeof entry === "string") {
      for (const parsed of parseJsonCandidates(entry)) {
        visit(parsed, depth + 1);
      }
      return;
    }
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item, depth + 1);
      return;
    }
    if (!isObject(entry)) return;

    for (const file of collectFileMetadataValues(entry)) {
      const target = targetFromFile(file, 96, "univer new", { lifecycleEvent: "univerNew" });
      if (target?.preview === "univer") addTarget(targets, target);
    }
    visit(entry.args, depth + 1);
    visit(entry.result, depth + 1);
    visit(entry.output, depth + 1);
  };
  visit(value, 0);
  return Array.from(targets.values());
}

function collectUniverNewTargets(input: unknown, output: unknown) {
  if (!hasUniverNewCommand(input)) return [];
  const targets = new Map<string, OpenTarget>();
  addUniverNewCommandTargets(targets, input);
  addFileTargets(targets, collectUniverNewMetadataTargets(input));
  addFileTargets(targets, collectUniverNewMetadataTargets(output));
  return Array.from(targets.values());
}

function collectPatchFileValues(value: unknown) {
  if (!isObject(value)) return [];
  const patchText = value.patchText ?? value.patch ?? value.diff;
  if (typeof patchText !== "string") return [];
  const values: string[] = [];
  PATCH_FILE_PATTERN.lastIndex = 0;
  for (const match of patchText.matchAll(PATCH_FILE_PATTERN)) {
    if (match[1]) values.push(match[1]);
  }
  PATCH_MOVE_TO_PATTERN.lastIndex = 0;
  for (const match of patchText.matchAll(PATCH_MOVE_TO_PATTERN)) {
    if (match[1]) values.push(match[1]);
  }
  return values;
}

function addFileValues(map: Map<string, OpenTarget>, values: string[], confidence: number, reason: string) {
  for (const value of values) {
    addTarget(map, targetFromFile(value, confidence, reason));
  }
}

function addFileTargets(map: Map<string, OpenTarget>, targets: OpenTarget[]) {
  for (const target of targets) addTarget(map, target);
}

export function deriveOpenTargets(messages: UIMessage[], options: DeriveOpenTargetsOptions = {}): OpenTarget[] {
  const targets = new Map<string, OpenTarget>();

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "text" && typeof part.text === "string") {
        scanText(targets, part.text, message.role === "assistant" ? 65 : 40, "message", {
          includeFiles: options.includeFileMentions === true || (message.role === "assistant" && shouldScanAssistantFileMentions(part.text)),
        });
        continue;
      }

      if (part.type === "source-document") {
        addTarget(
          targets,
          part.filename
            ? targetFromFile(part.filename, 95, "attachment source")
            : URI_PATTERN.test(part.title)
              ? targetFromUrl(part.title, 95, "attachment source")
              : targetFromFile(part.title, 95, "attachment source"),
        );
        continue;
      }

      if (part.type !== "dynamic-tool") {
        continue;
      }

      const discoveryTool = isDiscoveryTool(part.toolName);
      const writeTool = isWriteTool(part.toolName);
      const artifactMetadataTool = isArtifactMetadataTool(part.toolName);
      const toolOutputScanValue = part.output ?? part.input ?? "";
      const ignoredToolUrls = collectUniverOpenSurfaceUrls(toolOutputScanValue);

      addFileTargets(targets, collectUniverNewTargets(part.input, part.output));

      addFileTargets(
        targets,
        [part.input, part.output].flatMap((entry) => collectUniverWorktreeMetadataTargets(entry, 95, "univer worktree metadata")),
      );

      if (writeTool) {
        addFileValues(
          targets,
          [part.input, part.output].flatMap(collectFileMetadataValues),
          95,
          "write tool metadata",
        );
        addFileValues(targets, collectPatchFileValues(part.input), 95, "patch metadata");
        if (typeof part.output === "string") {
          scanText(targets, part.output, 90, "write tool output", { includeFiles: true, ignoredUrls: ignoredToolUrls });
        }
      }

      if (artifactMetadataTool) {
        addFileTargets(
          targets,
          [part.input, part.output].flatMap((entry) => collectNestedFileMetadataTargets(entry, 95, "artifact tool metadata")),
        );
      }

      if (!discoveryTool) {
        scanText(targets, JSON.stringify(toolOutputScanValue), 75, "tool output", {
          includeFiles: false,
          ignoredUrls: ignoredToolUrls,
        });
      }
    }
  }

  return Array.from(targets.values())
    .filter(isArtifactTarget)
    .sort((left, right) => right.confidence - left.confidence);
}
