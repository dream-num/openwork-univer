import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import { deriveOpenTargets } from "../src/react-app/domains/session/artifacts/open-target";

describe("Univer worktree open targets", () => {
  test("extracts a session worktree from ordinary Univer CLI tool output", () => {
    const messages = [
      {
        id: "msg-1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "bash",
            toolCallId: "tool-1",
            state: "output-available",
            input: { command: "univer worktree add artifacts/payroll.univer --json" },
            output: "{\"path\":\"artifacts/payroll.univer\",\"worktreeId\":\"wt_1\"}",
          },
        ],
      },
    ] satisfies UIMessage[];

    const targets = deriveOpenTargets(messages);

    expect(targets).toContainEqual(expect.objectContaining({
      value: "artifacts/payroll.univer",
      preview: "univer",
      worktreeId: "wt_1",
    }));
  });

  test("marks successful univer new tool output as a lifecycle event", () => {
    const messages = [
      {
        id: "msg-1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "bash",
            toolCallId: "tool-1",
            state: "output-available",
            input: { command: "univer new artifacts/payroll.univer --json" },
            output: "{\"path\":\"artifacts/payroll.univer\"}",
          },
        ],
      },
    ] satisfies UIMessage[];

    const targets = deriveOpenTargets(messages);

    expect(targets).toContainEqual(expect.objectContaining({
      value: "artifacts/payroll.univer",
      preview: "univer",
      lifecycleEvent: "univerNew",
      reason: "univer new",
    }));
  });

  test("does not mark ordinary assistant file mentions as lifecycle events", () => {
    const messages = [
      {
        id: "msg-1",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Created artifact at artifacts/payroll.univer for review.",
          },
        ],
      },
    ] satisfies UIMessage[];

    const targets = deriveOpenTargets(messages);

    expect(targets).toContainEqual(expect.objectContaining({
      value: "artifacts/payroll.univer",
      preview: "univer",
      reason: "message",
    }));
    expect(targets.some((target) => target.lifecycleEvent === "univerNew")).toBe(false);
  });
});
