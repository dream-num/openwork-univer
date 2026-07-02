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
});
