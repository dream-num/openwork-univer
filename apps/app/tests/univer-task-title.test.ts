import { describe, expect, test } from "bun:test";

import { seedUniverTaskTitleFromPrompt } from "../src/react-app/domains/session/univer-task-title";

describe("Univer task title seeding", () => {
  test("uses a compact first prompt as the task title", () => {
    expect(seedUniverTaskTitleFromPrompt("  Update\nbudget   formulas  ")).toBe("Update budget formulas");
  });

  test("omits empty prompts and truncates long prompts", () => {
    expect(seedUniverTaskTitleFromPrompt("   ")).toBeUndefined();
    expect(seedUniverTaskTitleFromPrompt("a".repeat(80))).toBe(`${"a".repeat(61)}...`);
  });
});
