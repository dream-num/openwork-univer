import { describe, expect, test } from "bun:test";

import {
  directComposerUniverMentions,
  isGeneralOriginFirstStageSession,
  isGeneralUniverLifecycleSession,
  isUniverNewLifecycleTarget,
  resolveGeneralSessionUniverNewPromotion,
  resolveSessionUniverNewLifecycle,
} from "../src/react-app/domains/session/univer-session-lifecycle";
import type { ComposerDraft } from "../src/app/types";
import type { OpenTarget } from "../src/react-app/domains/session/artifacts/open-target";

function draftWithFiles(paths: string[]): ComposerDraft {
  return {
    mode: "prompt",
    parts: paths.map((path): ComposerDraft["parts"][number] => ({ type: "file", path, label: path })),
    attachments: [],
    text: paths.map((path) => `@${path}`).join(" "),
  };
}

function univerNewTarget(value: string): OpenTarget {
  return {
    id: `file:${value}`,
    kind: "file",
    value,
    name: value.split("/").filter(Boolean).pop() ?? value,
    preview: "univer",
    confidence: 96,
    reason: "univer new",
    lifecycleEvent: "univerNew",
  };
}

describe("Univer session lifecycle helpers", () => {
  test("extracts direct composer Univerfile mentions", () => {
    expect(directComposerUniverMentions(draftWithFiles([
      "./reports/a.univer",
      "reports/a.univer",
      "reports/b.univer",
      "notes.md",
    ]))).toEqual([
      { path: "reports/a.univer", name: "a.univer" },
      { path: "reports/b.univer", name: "b.univer" },
    ]);
  });

  test("treats only unbound sessions as General lifecycle sessions", () => {
    expect(isGeneralUniverLifecycleSession(null)).toBe(true);
    expect(isGeneralUniverLifecycleSession({})).toBe(true);
    expect(isGeneralUniverLifecycleSession({
      primaryUniverTarget: { path: "reports/a.univer", name: "a.univer" },
    })).toBe(false);
  });

  test("promotes a General Session from one univer new target", () => {
    expect(resolveGeneralSessionUniverNewPromotion({}, [
      univerNewTarget("./reports/new.univer"),
    ])).toEqual({
      path: "reports/new.univer",
      name: "new.univer",
    });
  });

  test("does not promote bound sessions or ambiguous univer new targets", () => {
    expect(resolveGeneralSessionUniverNewPromotion({
      primaryUniverTarget: { path: "reports/a.univer", name: "a.univer" },
    }, [
      univerNewTarget("reports/b.univer"),
    ])).toBeNull();

    expect(resolveGeneralSessionUniverNewPromotion({}, [
      univerNewTarget("reports/a.univer"),
      univerNewTarget("reports/b.univer"),
    ])).toBeNull();
  });

  test("resolves General-origin direct mention runs as handoff session creation", () => {
    const session: {
      primaryUniverTarget: { path: string; name: string };
      univerLifecycleOrigin: "generalDirectMention";
    } = {
      primaryUniverTarget: { path: "reports/a.univer", name: "a.univer" },
      univerLifecycleOrigin: "generalDirectMention",
    };

    expect(isGeneralOriginFirstStageSession(session)).toBe(true);
    expect(resolveSessionUniverNewLifecycle(session, [
      univerNewTarget("reports/b.univer"),
    ])).toEqual({
      action: "createHandoffSession",
      primaryTarget: { path: "reports/b.univer", name: "b.univer" },
    });
  });

  test("keeps ordinary bound sessions out of univer new lifecycle handoff", () => {
    expect(resolveSessionUniverNewLifecycle({
      primaryUniverTarget: { path: "reports/a.univer", name: "a.univer" },
    }, [
      univerNewTarget("reports/b.univer"),
    ])).toBeNull();
  });

  test("lets callers filter stale univer new targets before resolving lifecycle", () => {
    const stale = univerNewTarget("reports/stale.univer");
    const fresh = univerNewTarget("reports/fresh.univer");
    expect(isUniverNewLifecycleTarget(stale)).toBe(true);
    expect(resolveSessionUniverNewLifecycle({}, [stale, fresh])).toBeNull();
    expect(resolveSessionUniverNewLifecycle({}, [fresh])).toEqual({
      action: "promoteCurrentSession",
      primaryTarget: { path: "reports/fresh.univer", name: "fresh.univer" },
    });
  });
});
