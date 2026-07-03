import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { createCoworkController, type CoworkContentViewState, type CoworkController, type CoworkReviewUnit, type CoworkSelection, type CoworkSnapshot, type ReviewableWorktree } from "@univer/cowork";
import { createGatewayCoworkDataSource } from "@univer/cowork/gateway";
import type { CoworkContentViewerDataSource } from "@univer/cowork/viewer";

import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import type { OpenTarget } from "./open-target";
import { openUniverSurface, type UniverOpenSurface, univerSurfaceQueryKey } from "./univer-surface";

export type UniverTarget = OpenTarget & {
  kind: "file";
  preview: "univer";
};

type PrimaryUniverfileRef = {
  path?: string | null;
  name?: string | null;
};

function normalizeUniverfileValue(value: string): string {
  return value.trim().replace(/[\\]+/g, "/").replace(/^\.\//, "");
}

function basename(value: string): string {
  return value.split(/[?#]/)[0]?.split("/").filter(Boolean).pop() ?? value;
}

export function isUniverTarget(target: OpenTarget | null | undefined): target is UniverTarget {
  return target?.kind === "file" && target.preview === "univer";
}

export function targetFromPrimaryUniverfile(
  primaryUniverfile: PrimaryUniverfileRef | null | undefined,
  sessionUniverWorktreeId?: string | null,
): UniverTarget | null {
  const path = primaryUniverfile?.path ? normalizeUniverfileValue(primaryUniverfile.path) : "";
  if (!path) return null;

  const name = primaryUniverfile?.name?.trim();
  const worktreeId = sessionUniverWorktreeId?.trim();

  return {
    id: `file:${path.toLowerCase()}`,
    kind: "file",
    value: path,
    name: name && name.length > 0 ? name : basename(path),
    preview: "univer",
    confidence: 100,
    reason: "Primary Univerfile",
    exists: true,
    ...(worktreeId ? { worktreeId, sessionWorktreeId: worktreeId } : {}),
  };
}

export function targetFromSelection(target: UniverTarget, selection: CoworkSelection): UniverTarget {
  const { worktreeId: _worktreeId, unitId: _unitId, ...base } = target;

  if (selection.type === "unit") {
    return { ...base, unitId: selection.unitId };
  }
  if (selection.type === "activeWorktree" || selection.type === "reviewableWorktree") {
    return { ...base, worktreeId: selection.worktreeId };
  }
  if (selection.type === "reviewUnit") {
    return { ...base, worktreeId: selection.worktreeId, unitId: selection.unitId };
  }
  return base;
}

export function targetWithSessionWorktreeOwner(
  target: UniverTarget,
  sessionWorktreeId: string | null | undefined,
): UniverTarget {
  const worktreeId = sessionWorktreeId?.trim();
  if (!worktreeId || target.sessionWorktreeId) return target;
  return { ...target, sessionWorktreeId: worktreeId };
}

export function targetForSurface(target: UniverTarget): UniverTarget {
  const { worktreeId: _worktreeId, sessionWorktreeId: _sessionWorktreeId, unitId: _unitId, ...surfaceTarget } = target;
  return surfaceTarget;
}

export function sameTargetRoute(left: UniverTarget, right: UniverTarget): boolean {
  return (
    left.id === right.id &&
    left.value === right.value &&
    left.worktreeId === right.worktreeId &&
    left.sessionWorktreeId === right.sessionWorktreeId &&
    left.unitId === right.unitId
  );
}

export function sameSelection(left: CoworkSelection, right: CoworkSelection): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "unit" && right.type === "unit") return left.unitId === right.unitId;
  if (left.type === "activeWorktree" && right.type === "activeWorktree") return left.worktreeId === right.worktreeId;
  if (left.type === "reviewableWorktree" && right.type === "reviewableWorktree") return left.worktreeId === right.worktreeId;
  if (left.type === "reviewUnit" && right.type === "reviewUnit") {
    return left.worktreeId === right.worktreeId && left.unitId === right.unitId;
  }
  return true;
}

export function selectionFromTarget(snapshot: CoworkSnapshot, target: UniverTarget): CoworkSelection {
  if (target.worktreeId) {
    const active = snapshot.activeWorktrees.some((worktree) => worktree.worktreeId === target.worktreeId);
    const reviewable = snapshot.reviewableWorktrees.some((worktree) => worktree.worktreeId === target.worktreeId);

    if (target.unitId && reviewable) {
      return { type: "reviewUnit", worktreeId: target.worktreeId, unitId: target.unitId };
    }
    if (active) {
      return { type: "activeWorktree", worktreeId: target.worktreeId };
    }
    if (reviewable) {
      return { type: "reviewableWorktree", worktreeId: target.worktreeId };
    }
  }

  if (target.unitId && snapshot.units.some((unit) => unit.unitId === target.unitId)) {
    return { type: "unit", unitId: target.unitId };
  }

  return { type: "container" };
}

export function sameContentView(
  left: CoworkContentViewState | null,
  right: CoworkContentViewState | null,
): boolean {
  if (left === null || right === null) return left === right;
  if (left.scope !== right.scope) return false;
  if (left.unitId !== right.unitId) return false;
  if (left.scope === "trunk" && right.scope === "trunk") {
    return left.trunkEditIntent === right.trunkEditIntent;
  }
  if (left.scope !== "trunk" && right.scope !== "trunk") {
    return left.worktreeId === right.worktreeId;
  }
  return false;
}

export function contentViewFromTarget(
  snapshot: CoworkSnapshot,
  target: UniverTarget,
  preferredView: CoworkContentViewState | null,
): CoworkContentViewState | null {
  if (preferredView && contentViewAvailable(snapshot, preferredView) && contentViewMatchesTarget(preferredView, target)) {
    return preferredView;
  }

  if (target.worktreeId) {
    const reviewable = snapshot.reviewableWorktrees.find((worktree) => worktree.worktreeId === target.worktreeId);
    const active = snapshot.activeWorktrees.find((worktree) => worktree.worktreeId === target.worktreeId);
    const worktree = reviewable ?? active;
    if (worktree) {
      const reviewUnit = reviewable ? firstOpenableReviewUnit(reviewable, target.unitId) : undefined;
      const unitId = target.unitId ?? reviewUnit?.unitId ?? snapshot.units[0]?.unitId;
      if (unitId) {
        return { scope: "worktree", worktreeId: worktree.worktreeId, unitId };
      }
    }
  }

  const unitId = target.unitId ?? snapshot.units[0]?.unitId;
  if (unitId && snapshot.units.some((unit) => unit.unitId === unitId)) {
    return { scope: "trunk", unitId, trunkEditIntent: "auto" };
  }

  return firstReviewableWorktreeView(snapshot, target.unitId);
}

function firstReviewableWorktreeView(
  snapshot: CoworkSnapshot,
  unitId: string | undefined,
): CoworkContentViewState | null {
  for (const worktree of snapshot.reviewableWorktrees) {
    const reviewUnit = firstOpenableReviewUnit(worktree, unitId);
    if (reviewUnit) {
      return {
        scope: "worktree",
        worktreeId: worktree.worktreeId,
        unitId: reviewUnit.unitId,
      };
    }
  }
  return null;
}

function firstOpenableReviewUnit(
  worktree: ReviewableWorktree,
  unitId: string | undefined,
): CoworkReviewUnit | undefined {
  const units = worktree.reviewSummary?.units ?? [];
  if (unitId) {
    return units.find((unit) => unit.unitId === unitId && unit.status !== "deleted");
  }
  return units.find((unit) => unit.status !== "deleted");
}

export function useUniverCoworkSession({
  client,
  workspaceId,
  target,
  isRemoteWorkspace,
}: {
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  target: UniverTarget | null;
  isRemoteWorkspace: boolean;
}): {
  controller: CoworkController | null;
  error: Error | null;
  isError: boolean;
  isLoading: boolean;
  surface: UniverOpenSurface | undefined;
  surfaceTarget: UniverTarget | null;
  viewerDataSource: CoworkContentViewerDataSource | null;
} {
  const surfaceTarget = React.useMemo(() => target ? targetForSurface(target) : null, [target]);
  const { data, error, isError, isLoading } = useQuery<UniverOpenSurface>({
    queryKey: surfaceTarget && workspaceId ? univerSurfaceQueryKey(workspaceId, surfaceTarget) : ["univer-cowork-surface", "empty"],
    queryFn: async () => {
      if (!client || !workspaceId || !surfaceTarget) {
        throw new Error("Univer workspace is not available.");
      }
      return openUniverSurface(client, workspaceId, surfaceTarget, isRemoteWorkspace);
    },
    enabled: Boolean(client && workspaceId && surfaceTarget),
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 10_000,
  });

  const origin = data?.origin ?? null;
  const viewerDataSource = React.useMemo(() => {
    if (!origin) return null;
    return createGatewayCoworkDataSource({ origin });
  }, [origin]);
  const controller = React.useMemo(() => {
    if (!viewerDataSource) return null;
    return createCoworkController({
      dataSource: viewerDataSource,
    });
  }, [viewerDataSource]);

  React.useEffect(() => {
    return () => {
      controller?.dispose();
    };
  }, [controller]);

  const surfaceUniverfile = data?.univerfile ?? null;
  const surfaceDisplayName = surfaceTarget?.name ?? null;

  React.useEffect(() => {
    if (!controller || !surfaceUniverfile || !surfaceDisplayName) return;
    controller.setContainer({
      kind: "local-univerfile",
      containerId: `local-univerfile:${surfaceUniverfile}`,
      localPath: surfaceUniverfile,
      displayName: surfaceDisplayName,
    });
  }, [controller, surfaceDisplayName, surfaceUniverfile]);

  return {
    controller,
    error: error instanceof Error ? error : null,
    isError,
    isLoading,
    surface: data,
    surfaceTarget,
    viewerDataSource,
  };
}

function contentViewAvailable(snapshot: CoworkSnapshot, view: CoworkContentViewState): boolean {
  if (view.scope === "trunk") {
    return snapshot.units.some((unit) => unit.unitId === view.unitId);
  }

  const worktree =
    snapshot.reviewableWorktrees.find((candidate) => candidate.worktreeId === view.worktreeId) ??
    snapshot.activeWorktrees.find((candidate) => candidate.worktreeId === view.worktreeId);
  if (!worktree) return false;
  if (snapshot.units.some((unit) => unit.unitId === view.unitId)) return true;
  return worktree.status === "ready" && Boolean(worktree.reviewSummary?.units.some((unit) => unit.unitId === view.unitId));
}

function contentViewMatchesTarget(view: CoworkContentViewState, target: UniverTarget): boolean {
  if (target.worktreeId) {
    if (view.scope === "trunk") return false;
    if (view.worktreeId !== target.worktreeId) return false;
    return target.unitId ? view.unitId === target.unitId : true;
  }

  if (view.scope !== "trunk") return false;
  return target.unitId ? view.unitId === target.unitId : true;
}
