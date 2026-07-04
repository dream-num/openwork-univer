import type { OpenworkSessionUniverMetadata } from "@/app/lib/openwork-server";

export function buildUniverSessionSystemContext(
  session: OpenworkSessionUniverMetadata | null | undefined,
): string | null {
  const target = session?.primaryUniverTarget ?? null;
  if (!target?.path) return null;
  const worktreeId = session?.sessionUniverWorktreeId ?? null;
  const generalOriginFirstStage = session?.univerLifecycleOrigin === "generalDirectMention";

  const lines = [
    "Univer Session Context:",
    `- Primary Univerfile: ${target.path}`,
    `- Univerfile name: ${target.name}`,
    worktreeId
      ? `- Session Univer Worktree: ${worktreeId}`
      : "- Session Univer Worktree: none yet",
    generalOriginFirstStage
      ? "- This session started the current run as a General Session and is using this Primary Univerfile as first-stage context."
      : "- Do not switch or infer another Primary Univerfile in this session.",
    generalOriginFirstStage
      ? "- If the user's task explicitly requires creating a new Primary Univerfile, use `univer new`; OpenWork will route that new Univerfile into a separate session."
      : "- Do not create a different Primary Univerfile from this bound session; ask the user to start a General Session when work needs another .univer file.",
    "- For read-only or analysis work, inspect the Primary Univerfile trunk/current state.",
    "- For modifying work, create or reuse only the session-owned Session Univer Worktree for this Primary Univerfile.",
    "- Do not merge or discard a Session Univer Worktree unless the user explicitly asks for that action; finish modifying work by marking the worktree ready for user review.",
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
