import type { OpenworkSessionUniverMetadata } from "@/app/lib/openwork-server";

export function buildUniverSessionSystemContext(
  session: OpenworkSessionUniverMetadata | null | undefined,
): string | null {
  const target = session?.primaryUniverTarget ?? null;
  if (!target?.path) return null;
  const worktreeId = session?.sessionUniverWorktreeId ?? null;

  const lines = [
    "Univer Session Context:",
    `- Primary Univerfile: ${target.path}`,
    `- Univerfile name: ${target.name}`,
    worktreeId
      ? `- Session Univer Worktree: ${worktreeId}`
      : "- Session Univer Worktree: none yet",
    "- Do not switch or infer another Primary Univerfile in this session.",
    "- For read-only or analysis work, inspect the Primary Univerfile trunk/current state.",
    "- For modifying work, create or reuse only the session-owned Session Univer Worktree for this Primary Univerfile.",
    "- When reporting a modified .univer artifact, include the Session Univer Worktree id in artifact route metadata when the tool surface supports it.",
  ];

  return lines.join("\n");
}

export function combineSystemContexts(
  contexts: Array<string | null | undefined>,
): string | undefined {
  const parts = contexts
    .map((context) => context?.trim() ?? "")
    .filter((context) => context.length > 0);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
