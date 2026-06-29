import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import type { OpenTarget } from "./open-target";

export type UniverOpenSurface = {
  url: string;
  viewerUrl: string;
  univerfile: string;
  worktreeId?: string;
  unitId?: string;
};

export const UNIVER_CLI_EXTENSION_ID = "univer-cli";

export function univerSurfaceQueryKey(
  workspaceId: string,
  target: OpenTarget,
): readonly [string, string, string, string, string, string] {
  return [
    "univer-collab-surface",
    workspaceId,
    target.id,
    target.value,
    target.worktreeId ?? "",
    target.unitId ?? "",
  ];
}

export async function openUniverSurface(
  client: OpenworkServerClient,
  workspaceId: string,
  target: OpenTarget,
  isRemoteWorkspace: boolean,
): Promise<UniverOpenSurface> {
  if (isRemoteWorkspace) {
    throw new Error("Embedded Univer preview is available for local workspaces only.");
  }
  if (target.kind !== "file") {
    throw new Error("Univer preview requires a workspace file.");
  }
  const response = await client.callExtensionAction({
    extensionId: UNIVER_CLI_EXTENSION_ID,
    action: "open_surface",
    args: {
      workspaceId,
      path: target.value,
      ...(target.worktreeId ? { worktreeId: target.worktreeId } : {}),
      ...(target.unitId ? { unitId: target.unitId } : {}),
    },
    context: {
      workspaceId,
    },
  });
  return readUniverOpenSurface(response.result);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || !field.trim()) {
    throw new Error(`Univer surface response is missing ${key}.`);
  }
  return field;
}

function optionalString(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}

function readUniverOpenSurface(value: unknown): UniverOpenSurface {
  if (!isRecord(value)) {
    throw new Error("Univer surface response is invalid.");
  }
  return {
    url: requiredString(value, "url"),
    viewerUrl: requiredString(value, "viewerUrl"),
    univerfile: requiredString(value, "univerfile"),
    worktreeId: optionalString(value, "worktreeId"),
    unitId: optionalString(value, "unitId"),
  };
}
