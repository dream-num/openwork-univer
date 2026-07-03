import { describe, expect, test } from "bun:test";

import type { OpenworkUniverTargetSummary } from "../src/app/lib/openwork-server";
import {
  mergeUniverTargetsRefresh,
  normalizeUniverTargets,
} from "../src/react-app/shell/route-workspaces";

function univerTarget(
  path: string,
  overrides: Partial<Omit<OpenworkUniverTargetSummary, "path">> = {},
): OpenworkUniverTargetSummary {
  return {
    path,
    name: overrides.name ?? path.split("/").at(-1) ?? path,
    size: overrides.size ?? 100,
    updatedAt: overrides.updatedAt ?? 10,
    unitCount: overrides.unitCount ?? null,
  };
}

describe("route workspace Univer target refresh", () => {
  test("normalizes, sorts, and deduplicates discovered Univer targets", () => {
    const result = normalizeUniverTargets([
      univerTarget("reports/b.univer"),
      univerTarget("./reports/a.univer", { name: "" }),
      univerTarget("reports/b.univer", { size: 200 }),
    ]);

    expect(result.map((item) => item.path)).toEqual([
      "reports/a.univer",
      "reports/b.univer",
    ]);
    expect(result[0].name).toBe("a.univer");
    expect(result[1].size).toBe(100);
  });

  test("keeps stable state when a refresh returns the same targets in a different order", () => {
    const initial = mergeUniverTargetsRefresh({}, [
      {
        workspaceId: "ws_1",
        items: [
          univerTarget("reports/b.univer"),
          univerTarget("./reports/a.univer"),
        ],
      },
    ]);

    const next = mergeUniverTargetsRefresh(initial, [
      {
        workspaceId: " ws_1 ",
        items: [
          univerTarget("reports/a.univer"),
          univerTarget("reports/b.univer"),
        ],
      },
    ]);

    expect(next).toBe(initial);
  });

  test("updates modified targets and drops deleted targets on successful refresh", () => {
    const initial = mergeUniverTargetsRefresh({}, [
      {
        workspaceId: "ws_1",
        items: [
          univerTarget("reports/a.univer"),
          univerTarget("reports/b.univer"),
        ],
      },
    ]);

    const next = mergeUniverTargetsRefresh(initial, [
      {
        workspaceId: "ws_1",
        items: [
          univerTarget("reports/a.univer", { size: 180, updatedAt: 20 }),
        ],
      },
    ]);

    expect(next).not.toBe(initial);
    expect(next.ws_1.map((item) => item.path)).toEqual(["reports/a.univer"]);
    expect(next.ws_1[0].size).toBe(180);
    expect(next.ws_1[0].updatedAt).toBe(20);
  });

  test("preserves the previous targets for a workspace when refresh fails", () => {
    const initial = mergeUniverTargetsRefresh({}, [
      {
        workspaceId: "ws_1",
        items: [univerTarget("reports/a.univer")],
      },
    ]);

    const next = mergeUniverTargetsRefresh(initial, [
      {
        workspaceId: "ws_1",
        items: null,
      },
    ]);

    expect(next).toBe(initial);
  });
});
