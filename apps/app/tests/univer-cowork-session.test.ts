import { describe, expect, test } from "bun:test";

import { isCollectibleArtifactTarget } from "../src/react-app/domains/session/artifacts/open-target";
import {
  targetFromPrimaryUniverfile,
  targetFromSelection,
} from "../src/react-app/domains/session/artifacts/univer-cowork-session";

describe("Univer cowork session targets", () => {
  test("opens bound Primary Univerfile and routed units through the artifact panel", () => {
    const target = targetFromPrimaryUniverfile({
      path: "reports/budget.univer",
      name: "budget.univer",
    });

    expect(target).not.toBeNull();
    expect(target?.exists).toBe(true);
    expect(target && isCollectibleArtifactTarget(target)).toBe(true);

    const unitTarget = target ? targetFromSelection(target, { type: "unit", unitId: "unit_1" }) : null;

    expect(unitTarget?.unitId).toBe("unit_1");
    expect(unitTarget?.exists).toBe(true);
    expect(unitTarget && isCollectibleArtifactTarget(unitTarget)).toBe(true);
  });
});
