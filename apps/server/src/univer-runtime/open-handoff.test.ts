import { describe, expect, test } from "bun:test";

import { parseUniverOpenHandoff, UniverOpenHandoffError } from "./open-handoff.js";

describe("parseUniverOpenHandoff", () => {
  test("accepts the explicit host handoff shape", () => {
    expect(parseUniverOpenHandoff({
      origin: "http://127.0.0.1:9126",
      univerfile: "/workspace/report.univer",
      worktreeId: "wt_1",
      unitId: "unit_1",
    }, { expectedUniverfile: "/workspace/report.univer" })).toEqual({
      origin: "http://127.0.0.1:9126",
      univerfile: "/workspace/report.univer",
      worktreeId: "wt_1",
      unitId: "unit_1",
    });
  });

  test("accepts the published univer-cli 0.3.1 open response", () => {
    expect(parseUniverOpenHandoff({
      ok: true,
      openUrl: "http://127.0.0.1:9126/?file=%2Fworkspace%2Freport.univer&worktree=wt_1&unit=unit_1",
      target: {
        type: "local-univerfile",
        path: "/workspace/report.univer",
      },
    }, { expectedUniverfile: "/workspace/report.univer" })).toEqual({
      origin: "http://127.0.0.1:9126",
      univerfile: "/workspace/report.univer",
      worktreeId: "wt_1",
      unitId: "unit_1",
    });
  });

  test("rejects a non-loopback published openUrl", () => {
    expect(() => parseUniverOpenHandoff({
      openUrl: "https://example.com/?file=%2Fworkspace%2Freport.univer",
      target: { type: "local-univerfile", path: "/workspace/report.univer" },
    })).toThrow(UniverOpenHandoffError);
    try {
      parseUniverOpenHandoff({
        openUrl: "https://example.com/?file=%2Fworkspace%2Freport.univer",
        target: { type: "local-univerfile", path: "/workspace/report.univer" },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(UniverOpenHandoffError);
      if (error instanceof UniverOpenHandoffError) expect(error.code).toBe("untrustedOrigin");
    }
  });

  test("rejects conflicting target and URL paths", () => {
    expect(() => parseUniverOpenHandoff({
      openUrl: "http://localhost:9126/?file=%2Fworkspace%2Fother.univer",
      target: { type: "local-univerfile", path: "/workspace/report.univer" },
    })).toThrow("conflicting .univer paths");
  });
});
