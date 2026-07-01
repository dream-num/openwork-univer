import { beforeEach, describe, expect, test } from "bun:test";

import type { OpenTarget } from "../src/react-app/domains/session/artifacts/open-target";
import { usePanelTabStore } from "../src/react-app/domains/session/panel/panel-tab-store";

const routedUniverTarget = {
  id: "file:artifacts/payroll.univer",
  kind: "file",
  value: "artifacts/payroll.univer",
  name: "payroll.univer",
  preview: "univer",
  confidence: 100,
  reason: "test",
  exists: true,
  worktreeId: "wt_1",
  unitId: "unit_1",
} satisfies OpenTarget;

const plainUniverTarget = {
  id: "file:artifacts/payroll.univer",
  kind: "file",
  value: "artifacts/payroll.univer",
  name: "payroll.univer",
  preview: "univer",
  confidence: 100,
  reason: "verified",
  exists: true,
  size: 1024,
} satisfies OpenTarget;

describe("panel tab transcript artifact sync", () => {
  beforeEach(() => {
    usePanelTabStore.setState({
      sessions: {},
      transcriptArtifactTargets: {},
    });
  });

  test("preserves local Univer route metadata when transcript sync only confirms the same artifact", () => {
    const store = usePanelTabStore.getState();

    store.syncTranscriptArtifacts("session-1", [routedUniverTarget]);
    store.syncTranscriptArtifacts("session-1", [plainUniverTarget]);

    const target = usePanelTabStore.getState().transcriptArtifactTargets["session-1"]?.[0];

    expect(target?.worktreeId).toBe("wt_1");
    expect(target?.unitId).toBe("unit_1");
    expect(target?.size).toBe(1024);
  });

  test("respects an explicit unit-only route when clearing a worktree selection", () => {
    const store = usePanelTabStore.getState();

    store.syncTranscriptArtifacts("session-1", [routedUniverTarget]);
    store.upsertTranscriptArtifactTarget("session-1", { ...plainUniverTarget, unitId: "unit_1" });

    const target = usePanelTabStore.getState().transcriptArtifactTargets["session-1"]?.[0];

    expect(target?.worktreeId).toBeUndefined();
    expect(target?.unitId).toBe("unit_1");
  });

  test("preserves the worktree route when transcript sync returns the same unit without worktree metadata", () => {
    const store = usePanelTabStore.getState();

    store.syncTranscriptArtifacts("session-1", [routedUniverTarget]);
    store.syncTranscriptArtifacts("session-1", [{ ...plainUniverTarget, unitId: "unit_1" }]);

    const target = usePanelTabStore.getState().transcriptArtifactTargets["session-1"]?.[0];

    expect(target?.worktreeId).toBe("wt_1");
    expect(target?.unitId).toBe("unit_1");
  });
});
