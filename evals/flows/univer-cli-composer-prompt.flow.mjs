/**
 * Univer CLI composer prompt steers office work to native .univer targets.
 */

async function ensureSession(ctx) {
  await ctx.waitFor("Boolean(window.__openworkControl)", {
    timeoutMs: 60_000,
    label: "control API",
  });

  const hasCreateTask = await ctx.eval(
    "window.__openworkControl.listActions().some((action) => action.id === 'session.create_task' && !action.disabled)",
  );
  if (!hasCreateTask) {
    await ctx.control("route.session");
    await ctx.waitFor(
      "window.__openworkControl.listActions().some((action) => action.id === 'session.create_task' && !action.disabled)",
      { timeoutMs: 60_000, label: "session.create_task action" },
    );
  }

  const route = await ctx.eval("window.__openworkControl.snapshot().route");
  if (typeof route !== "string" || !route.includes("/session/")) {
    await ctx.control("session.create_task");
    await ctx.waitFor(
      "window.__openworkControl.snapshot().route.includes('/session/')",
      { timeoutMs: 60_000, label: "session route after task creation" },
    );
  }

  await ctx.eval(`(() => {
    for (const label of ["Continue without OpenWork Models", "Close"]) {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        candidate.textContent?.trim() === label && !candidate.disabled
      );
      if (button) button.click();
    }
    return true;
  })()`);
}

async function enableUniverCliExtension(ctx) {
  await ctx.eval(`(() => {
    window.localStorage.setItem("openwork.extension.enabled.univer-cli", "1");
    window.localStorage.setItem("openwork.extension.hidden.univer-cli", "0");
    window.dispatchEvent(new CustomEvent("openwork:extension-state-changed", {
      detail: { id: "univer-cli", enabled: true, hidden: false },
    }));
    return true;
  })()`);
}

async function openComposerExtensions(ctx) {
  await ctx.eval(`(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return true;
  })()`);
  const opened = await ctx.eval(`(() => {
    const button = Array.from(document.querySelectorAll("button[title]"))
      .find((candidate) => candidate.getAttribute("title")?.includes("MCP"));
    if (!(button instanceof HTMLButtonElement) || button.disabled) return "missing";
    button.click();
    return button.title;
  })()`);
  ctx.assert(typeof opened === "string" && opened.length > 0 && opened !== "missing", `Tool menu did not open: ${opened}`);

  await ctx.waitFor(
    `Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.trim() === "Extensions" && !button.disabled)`,
    { timeoutMs: 15_000, label: "Extensions section button" },
  );
  const selected = await ctx.eval(`(() => {
    const button = Array.from(document.querySelectorAll("button"))
      .find((candidate) => candidate.textContent?.trim() === "Extensions" && !candidate.disabled);
    if (!(button instanceof HTMLButtonElement)) return "missing";
    button.click();
    return "clicked";
  })()`);
  ctx.assert(selected === "clicked", `Extensions section was not selected: ${selected}`);
}

function composerDraftExpression() {
  return `Array.from(document.querySelectorAll('[contenteditable="true"]'))
    .map((node) => node.textContent || "")
    .join("\\n")`;
}

export default {
  id: "univer-cli-composer-prompt",
  title: "Univer CLI composer prompt uses native .univer office defaults",
  spec: "openspec/changes/introduce-univer-office-extension/specs/native-univer-office-surface/spec.md",
  steps: [
    {
      name: "Open a session with Univer CLI enabled",
      run: async (ctx) => {
        await ctx.prove("A session composer is available and Univer CLI is enabled for composer extensions", {
          action: async () => {
            await ensureSession(ctx);
            await enableUniverCliExtension(ctx);
          },
          assert: async () => {
            const enabled = await ctx.eval(`window.localStorage.getItem("openwork.extension.enabled.univer-cli")`);
            ctx.assert(enabled === "1", "Univer CLI extension was not enabled for the composer.");
            await ctx.waitFor(`document.querySelectorAll('[contenteditable="true"]').length > 0`, {
              timeoutMs: 15_000,
              label: "composer editor",
            });
          },
          screenshot: {
            name: "univer-cli-composer-ready",
            rejectText: ["Something went wrong"],
          },
        });
      },
    },
    {
      name: "Univer CLI appears in composer extensions",
      run: async (ctx) => {
        await ctx.prove("The composer extensions menu offers Univer CLI to the user", {
          action: async () => {
            await openComposerExtensions(ctx);
          },
          assert: async () => {
            await ctx.expectText("Univer CLI");
            await ctx.expectText("Built-in Univer cowork bundle for native .univer spreadsheets, documents, and slides.");
          },
          screenshot: {
            name: "univer-cli-composer-extension-menu",
            requireText: ["Extensions", "Univer CLI", "native .univer spreadsheets"],
            rejectText: ["No extensions enabled"],
          },
        });
      },
    },
    {
      name: "Selecting Univer CLI inserts the native office prompt",
      run: async (ctx) => {
        await ctx.prove("Selecting Univer CLI inserts a prompt that makes .univer primary and external formats exchange-only", {
          action: async () => {
            const clicked = await ctx.eval(`(() => {
              const button = Array.from(document.querySelectorAll("button"))
                .find((candidate) => candidate.textContent?.includes("Univer CLI") && !candidate.disabled);
              if (!(button instanceof HTMLButtonElement)) return "missing";
              button.click();
              return "clicked";
            })()`);
            ctx.assert(clicked === "clicked", `Univer CLI composer item was not clicked: ${clicked}`);
          },
          assert: async () => {
            await ctx.waitFor(`${composerDraftExpression()}.includes("native .univer office files")`, {
              timeoutMs: 15_000,
              label: "native .univer draft text",
            });
            const draft = await ctx.eval(composerDraftExpression());
            ctx.assert(draft.includes("Create .univer by default"), `Draft missing native default instruction: ${draft}`);
            ctx.assert(draft.includes("exchange formats"), `Draft missing exchange format instruction: ${draft}`);
          },
          screenshot: {
            name: "univer-cli-native-office-draft",
            requireText: ["native .univer office files", "Create .univer by default", "exchange formats"],
            rejectText: ["Something went wrong"],
          },
        });
      },
    },
  ],
};
