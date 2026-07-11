export type UniverOpenHandoffErrorCode =
  | "invalidJson"
  | "invalidShape"
  | "missingOrigin"
  | "missingUniverfile"
  | "unexpectedUniverfile"
  | "untrustedOrigin";

export class UniverOpenHandoffError extends Error {
  readonly code: UniverOpenHandoffErrorCode;

  constructor(code: UniverOpenHandoffErrorCode, message: string) {
    super(message);
    this.name = "UniverOpenHandoffError";
    this.code = code;
  }
}

export interface UniverOpenHandoff {
  origin: string;
  univerfile: string;
  worktreeId?: string;
  unitId?: string;
}

export interface ParseUniverOpenHandoffOptions {
  expectedUniverfile?: string;
  requireLoopbackOrigin?: boolean;
}

export function parseUniverOpenHandoff(
  value: string | unknown,
  options: ParseUniverOpenHandoffOptions = {},
): UniverOpenHandoff {
  const parsed = typeof value === "string" ? parseHandoffJson(value) : value;
  if (!isRecord(parsed)) {
    throw new UniverOpenHandoffError("invalidShape", "Univer open handoff must be a JSON object.");
  }

  const openUrl = readOpenUrl(parsed);
  const explicitOrigin = nonEmptyStringField(parsed, "origin");
  const origin = explicitOrigin ?? openUrl?.origin;
  if (!origin) {
    throw new UniverOpenHandoffError("missingOrigin", "Univer open handoff is missing origin.");
  }
  if (openUrl && explicitOrigin && urlOrigin(explicitOrigin) !== openUrl.origin) {
    throw new UniverOpenHandoffError(
      "untrustedOrigin",
      "Univer open handoff origin does not match openUrl.",
    );
  }

  const target = isRecord(parsed.target) ? parsed.target : undefined;
  const targetType = target ? nonEmptyStringField(target, "type") : undefined;
  if (targetType !== undefined && targetType !== "local-univerfile") {
    throw new UniverOpenHandoffError(
      "invalidShape",
      "Univer open handoff target must be a local-univerfile.",
    );
  }
  const explicitUniverfile = nonEmptyStringField(parsed, "univerfile");
  const targetUniverfile = target ? nonEmptyStringField(target, "path") : undefined;
  const urlUniverfile = openUrl ? nonEmpty(openUrl.searchParams.get("file") ?? "") : undefined;
  const univerfile = consistentHandoffPath([explicitUniverfile, targetUniverfile, urlUniverfile]);
  if (!univerfile) {
    throw new UniverOpenHandoffError("missingUniverfile", "Univer open handoff is missing univerfile.");
  }
  if (
    options.expectedUniverfile !== undefined
    && normalizeHandoffPath(univerfile) !== normalizeHandoffPath(options.expectedUniverfile)
  ) {
    throw new UniverOpenHandoffError(
      "unexpectedUniverfile",
      "Univer open handoff returned a different .univer path.",
    );
  }
  if (options.requireLoopbackOrigin !== false && !isLoopbackHttpUrl(origin)) {
    throw new UniverOpenHandoffError(
      "untrustedOrigin",
      "Univer open handoff origin must be a local loopback HTTP URL.",
    );
  }
  if (options.requireLoopbackOrigin !== false && openUrl && !isLoopbackHttpUrl(openUrl.toString())) {
    throw new UniverOpenHandoffError(
      "untrustedOrigin",
      "Univer open handoff openUrl must be a local loopback HTTP URL.",
    );
  }

  const worktreeId = consistentHandoffId([
    nonEmptyStringField(parsed, "worktreeId"),
    openUrl ? firstSearchParam(openUrl, ["worktreeId", "worktree"]) : undefined,
  ], "worktreeId");
  const unitId = consistentHandoffId([
    nonEmptyStringField(parsed, "unitId"),
    openUrl ? firstSearchParam(openUrl, ["unitId", "unit"]) : undefined,
  ], "unitId");
  return {
    origin,
    univerfile,
    ...(worktreeId !== undefined ? { worktreeId } : {}),
    ...(unitId !== undefined ? { unitId } : {}),
  };
}

function parseHandoffJson(value: string): unknown {
  try {
    return JSON.parse(value.trim());
  } catch (error) {
    throw new UniverOpenHandoffError(
      "invalidJson",
      `Univer open handoff did not contain valid JSON: ${errorMessage(error)}`,
    );
  }
}

function readOpenUrl(value: Record<string, unknown>): URL | undefined {
  const raw = nonEmptyStringField(value, "openUrl");
  if (!raw) return undefined;
  try {
    return new URL(raw);
  } catch {
    throw new UniverOpenHandoffError("invalidShape", "Univer open handoff openUrl is invalid.");
  }
}

function nonEmptyStringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" ? nonEmpty(field) : undefined;
}

function isLoopbackHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function urlOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function consistentHandoffPath(values: Array<string | undefined>): string | undefined {
  const candidates = values.filter((value): value is string => value !== undefined);
  const first = candidates[0];
  if (first === undefined) return undefined;
  if (candidates.some((candidate) => normalizeHandoffPath(candidate) !== normalizeHandoffPath(first))) {
    throw new UniverOpenHandoffError(
      "unexpectedUniverfile",
      "Univer open handoff returned conflicting .univer paths.",
    );
  }
  return first;
}

function consistentHandoffId(values: Array<string | undefined>, label: string): string | undefined {
  const candidates = values.filter((value): value is string => value !== undefined);
  const first = candidates[0];
  if (first === undefined) return undefined;
  if (candidates.some((candidate) => candidate !== first)) {
    throw new UniverOpenHandoffError("invalidShape", `Univer open handoff returned conflicting ${label} values.`);
  }
  return first;
}

function firstSearchParam(url: URL, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = nonEmpty(url.searchParams.get(key) ?? "");
    if (value !== undefined) return value;
  }
  return undefined;
}

function normalizeHandoffPath(path: string): string {
  let normalized = path.trim().replace(/\\/g, "/").replace(/\/+/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nonEmpty(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
