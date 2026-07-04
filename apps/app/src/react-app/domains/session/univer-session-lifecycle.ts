import type { ComposerDraft } from "@/app/types";
import type { OpenTarget } from "./artifacts/open-target";

export type UniverLifecyclePrimaryTarget = {
  path: string;
  name: string;
};

export type UniverLifecycleSessionRef = {
  primaryUniverTarget?: { path: string; name?: string | null } | null;
  univerSessionKind?: "task" | "overview" | null;
  univerLifecycleOrigin?: "generalDirectMention" | null;
};

export type UniverNewLifecycleResolution = {
  action: "promoteCurrentSession" | "createHandoffSession";
  primaryTarget: UniverLifecyclePrimaryTarget;
};

function basename(value: string): string {
  return value.split("/").filter(Boolean).pop() ?? value;
}

export function normalizeLifecycleUniverPath(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^workspaces\/[^/]+\//i, "")
    .replace(/^workspace\/(?:ws_[^/]+|\d+|[0-9a-f-]{6,})\//i, "")
    .replace(/^workspace\//, "");
}

function targetFromPath(path: string, name?: string | null): UniverLifecyclePrimaryTarget | null {
  const normalized = normalizeLifecycleUniverPath(path);
  if (!normalized.toLowerCase().endsWith(".univer")) return null;
  const cleanName = name?.trim() ?? "";
  return {
    path: normalized,
    name: cleanName && !cleanName.includes("/") && !cleanName.includes("\\") ? cleanName : basename(normalized),
  };
}

function addUniqueTarget(targets: UniverLifecyclePrimaryTarget[], next: UniverLifecyclePrimaryTarget | null) {
  if (!next) return;
  if (targets.some((target) => target.path === next.path)) return;
  targets.push(next);
}

export function isGeneralUniverLifecycleSession(session: UniverLifecycleSessionRef | null | undefined): boolean {
  return !normalizeLifecycleUniverPath(session?.primaryUniverTarget?.path);
}

export function directComposerUniverMentions(draft: Pick<ComposerDraft, "parts">): UniverLifecyclePrimaryTarget[] {
  const targets: UniverLifecyclePrimaryTarget[] = [];
  for (const part of draft.parts) {
    if (part.type !== "file") continue;
    addUniqueTarget(targets, targetFromPath(part.path, part.label));
  }
  return targets;
}

export function resolveGeneralSessionUniverNewPromotion(
  session: UniverLifecycleSessionRef | null | undefined,
  targets: OpenTarget[],
): UniverLifecyclePrimaryTarget | null {
  const resolution = resolveSessionUniverNewLifecycle(session, targets);
  return resolution?.action === "promoteCurrentSession" ? resolution.primaryTarget : null;
}

export function isGeneralOriginFirstStageSession(session: UniverLifecycleSessionRef | null | undefined): boolean {
  return normalizeLifecycleUniverPath(session?.primaryUniverTarget?.path).length > 0 &&
    session?.univerLifecycleOrigin === "generalDirectMention";
}

export function isUniverNewLifecycleTarget(target: OpenTarget): boolean {
  return target.kind === "file" && target.preview === "univer" && target.lifecycleEvent === "univerNew";
}

export function resolveSessionUniverNewLifecycle(
  session: UniverLifecycleSessionRef | null | undefined,
  targets: OpenTarget[],
): UniverNewLifecycleResolution | null {
  const candidates: UniverLifecyclePrimaryTarget[] = [];
  for (const target of targets) {
    if (!isUniverNewLifecycleTarget(target)) continue;
    addUniqueTarget(candidates, targetFromPath(target.value, target.name));
  }
  if (candidates.length !== 1) return null;
  const primaryTarget = candidates[0];
  if (!primaryTarget) return null;

  if (isGeneralUniverLifecycleSession(session)) {
    return { action: "promoteCurrentSession", primaryTarget };
  }

  if (isGeneralOriginFirstStageSession(session)) {
    return { action: "createHandoffSession", primaryTarget };
  }

  return null;
}
