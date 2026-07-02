const MAX_UNIVER_TASK_TITLE_LENGTH = 64;

export function seedUniverTaskTitleFromPrompt(prompt: string): string | undefined {
  const compact = prompt.replace(/\s+/g, " ").trim();
  if (!compact) return undefined;
  if (compact.length <= MAX_UNIVER_TASK_TITLE_LENGTH) return compact;
  return `${compact.slice(0, MAX_UNIVER_TASK_TITLE_LENGTH - 3).trimEnd()}...`;
}
