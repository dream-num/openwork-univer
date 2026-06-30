/**
 * Compact Chat Pane: default chat layout is dense, full-width, and remains
 * usable beside a widened .univer artifact panel.
 */
import { execFile } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const RUN_SUFFIX = Date.now().toString(36);
const UNIVER_BASENAME = `compact-chat-pane-${RUN_SUFFIX}.univer`;
const CSV_BASENAME = `compact-chat-pane-${RUN_SUFFIX}.csv`;
const RELATIVE_UNIVER_PATH = `artifacts/${UNIVER_BASENAME}`;
const RELATIVE_CSV_PATH = `artifacts/${CSV_BASENAME}`;
const MIN_UNIVER_ARTIFACT_IFRAME_WIDTH = 600;

function isDaemonBuildMismatch(error) {
  return /Daemon build mismatch/i.test(`${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? ""}`);
}

async function runUniver(args, cwd, env) {
  return execFileAsync("univer", args, {
    cwd,
    env: { ...process.env, ...env },
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

async function startUniverDaemon(cwd) {
  const env = { UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT: cwd };
  try {
    await runUniver(["daemon", "start"], cwd, env);
  } catch (error) {
    if (!isDaemonBuildMismatch(error)) throw error;
    await runUniver(["daemon", "stop"], cwd, env);
    await runUniver(["daemon", "start"], cwd, env);
  }
}

async function createUniverfile(workspaceRoot) {
  const absolutePath = join(workspaceRoot, RELATIVE_UNIVER_PATH);
  const csvPath = join(workspaceRoot, RELATIVE_CSV_PATH);
  const env = { UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT: workspaceRoot };
  await runUniver(["daemon", "stop"], workspaceRoot, env).catch(() => undefined);
  await rm(absolutePath, { recursive: true, force: true });
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(csvPath, "Metric,Value\nRevenue,42000\nCost,17000\nMargin,25000\n", "utf8");
  await startUniverDaemon(workspaceRoot);
  await runUniver(["import", "--file", csvPath, absolutePath, "--json"], workspaceRoot, env);
  return stat(absolutePath);
}

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
  if (typeof route !== "string" || !/\/session\/[^/?#]+/.test(route)) {
    await ctx.control("session.create_task");
    await ctx.waitFor(
      `(() => {
        const route = window.__openworkControl.snapshot().route || "";
        return /\\/session\\/[^/?#]+/.test(route);
      })()`,
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

async function ensureSidePanelActions(ctx) {
  await ensureSession(ctx);
  const hasSeedAction = await ctx.eval(
    `window.__openworkControl.listActions().some((action) => action.id === "eval.artifact_tabs.seed_univer" && !action.disabled)`,
  );
  if (!hasSeedAction) {
    await ctx.eval(`(() => {
      const button = Array.from(document.querySelectorAll("button"))
        .find((item) => item.getAttribute("aria-label") === "Browser" && !item.disabled);
      button?.click();
      return Boolean(button);
    })()`);
  }
  await ctx.waitFor(
    `window.__openworkControl.listActions().some((action) => action.id === "eval.workspace.info" && !action.disabled)`,
    { timeoutMs: 30_000, label: "workspace info action enabled" },
  );
  await ctx.waitFor(
    `window.__openworkControl.listActions().some((action) => action.id === "eval.artifact_tabs.seed_univer" && !action.disabled)`,
    { timeoutMs: 30_000, label: "Univer artifact seed action enabled" },
  );
}

function compactChatMetricsExpression() {
  return `(() => {
    const transcript = document.querySelector('[data-testid="compact-chat-transcript"]');
    const composer = document.querySelector('[data-testid="compact-chat-composer"]');
    const editor = document.querySelector('[contenteditable="true"]');
    const composerInner = composer?.firstElementChild;
    const transcriptParent = transcript?.parentElement;
    if (!transcript || !composer || !editor || !composerInner || !transcriptParent) {
      return { ok: false, reason: "compact chat elements missing" };
    }
    const transcriptRect = transcript.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    const composerInnerRect = composerInner.getBoundingClientRect();
    const parentRect = transcriptParent.getBoundingClientRect();
    const composerStyle = getComputedStyle(composer);
    const editorStyle = getComputedStyle(editor);
    return {
      ok: true,
      transcriptWidth: Math.round(transcriptRect.width),
      composerInnerWidth: Math.round(composerInnerRect.width),
      paneWidth: Math.round(parentRect.width),
      composerHeight: Math.round(composerRect.height),
      composerBorderTopWidth: composerStyle.borderTopWidth,
      composerRadius: composerStyle.borderTopLeftRadius,
      editorMinHeight: editorStyle.minHeight,
      hasRunTask: Boolean(document.querySelector('button[aria-label="Run task"]')),
      hasModel: Boolean(document.querySelector('button[aria-label="Change model"]')),
      hasDefaultAgentSelector: Array.from(document.querySelectorAll("button")).some((button) =>
        button.textContent?.trim() === "Default agent"
      ),
      hasAttach: Array.from(document.querySelectorAll("button")).some((button) =>
        (button.getAttribute("title") || "").toLowerCase().includes("attach")
      ),
      hasTools: Array.from(document.querySelectorAll("button")).some((button) =>
        (button.getAttribute("title") || "").toLowerCase().includes("tool") ||
        (button.getAttribute("title") || "").toLowerCase().includes("mcp")
      ),
      bodyText: document.body.innerText,
    };
  })()`;
}

function assertCompactChat(ctx, metrics) {
  ctx.assert(metrics.ok, metrics.reason || "Compact chat metrics unavailable.");
  ctx.assert(metrics.transcriptWidth >= Math.min(1280, metrics.paneWidth) - 32, `Transcript is not using compact full width: ${JSON.stringify(metrics)}`);
  ctx.assert(Math.abs(metrics.transcriptWidth - metrics.composerInnerWidth) <= 4, `Composer and transcript width rhythm differ: ${JSON.stringify(metrics)}`);
  ctx.assert(metrics.composerBorderTopWidth !== "0px", `Composer has no top divider: ${JSON.stringify(metrics)}`);
  ctx.assert(metrics.composerRadius === "0px", `Composer should not have rounded outer chrome: ${JSON.stringify(metrics)}`);
  ctx.assert(Number.parseFloat(metrics.editorMinHeight) <= 40, `Editor minimum height is too large: ${JSON.stringify(metrics)}`);
  ctx.assert(metrics.hasRunTask, "Compact composer is missing the Run task control.");
  ctx.assert(metrics.hasModel, "Compact composer is missing the model control.");
  ctx.assert(!metrics.hasDefaultAgentSelector, "Compact composer should not show a persistent Default agent selector.");
  ctx.assert(metrics.hasAttach, "Compact composer is missing the attach control.");
  ctx.assert(metrics.hasTools, "Compact composer is missing the tools control.");
}

export default {
  id: "compact-chat-pane",
  title: "Compact Chat Pane is dense by default and beside .univer artifacts",
  spec: "openspec/changes/introduce-compact-chat-pane/specs/compact-chat-pane/spec.md",
  steps: [
    {
      name: "Default session uses the compact chat pane",
      run: async (ctx) => {
        await ctx.prove("The default session transcript and composer share compact full-width rhythm", {
          action: async () => {
            await ensureSession(ctx);
            await ctx.control("composer.set_text", { text: "compact layout smoke" });
            await ctx.waitFor(`document.querySelector('[contenteditable="true"]')?.textContent?.includes("compact layout smoke")`, {
              timeoutMs: 15_000,
              label: "composer draft text",
            });
          },
          assert: async () => {
            const metrics = await ctx.eval(compactChatMetricsExpression());
            assertCompactChat(ctx, metrics);
            ctx.assert(metrics.composerHeight < 120, `Empty/draft composer is too tall: ${JSON.stringify(metrics)}`);
          },
          screenshot: {
            name: "compact-chat-pane-default",
            requireText: ["compact layout smoke"],
            rejectText: ["Something went wrong"],
          },
        });
      },
    },
    {
      name: "Compact chat remains beside a widened Univer artifact panel",
      run: async (ctx) => {
        await ctx.prove("Opening a .univer artifact keeps the left chat pane compact and usable", {
          action: async () => {
            await ensureSidePanelActions(ctx);
            const info = await ctx.control("eval.workspace.info");
            ctx.assert(info?.ok === true, "Workspace info action did not return ok.");
            ctx.assert(typeof info.workspaceRoot === "string" && info.workspaceRoot.length > 0, "Missing workspace root.");
            ctx.assert(info.isRemoteWorkspace !== true, "Embedded Univer preview requires a local workspace.");
            const fileStat = await createUniverfile(info.workspaceRoot);
            ctx.assert(fileStat.isFile(), "univer import did not create a file.");
            await ctx.control("eval.artifact_tabs.seed_univer", {
              path: RELATIVE_UNIVER_PATH,
              size: fileStat.size,
              open: true,
            });
            await ctx.waitFor(
              `(() => {
                const header = document.querySelector('[data-testid="univer-artifact-header"]');
                const iframe = document.querySelector('iframe[data-testid="univer-collab-surface"]');
                if (!header || !iframe) return false;
                const rect = iframe.getBoundingClientRect();
                return header.textContent.includes(${JSON.stringify(UNIVER_BASENAME)})
                  && rect.width >= ${MIN_UNIVER_ARTIFACT_IFRAME_WIDTH}
                  && rect.height > 200;
              })()`,
              { timeoutMs: 60_000, label: "widened Univer artifact panel" },
            );
          },
          assert: async () => {
            const metrics = await ctx.eval(compactChatMetricsExpression());
            assertCompactChat(ctx, metrics);
            const artifact = await ctx.eval(`(() => {
              const iframe = document.querySelector('iframe[data-testid="univer-collab-surface"]');
              const header = document.querySelector('[data-testid="univer-artifact-header"]');
              if (!iframe || !header) return { ok: false, reason: "Univer artifact panel missing" };
              const rect = iframe.getBoundingClientRect();
              return {
                ok: true,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                headerText: header.textContent || "",
                errorVisible: /Failed to open Univer preview|Setup incomplete|remote workspaces only/i.test(document.body.innerText),
              };
            })()`);
            ctx.assert(artifact.ok, artifact.reason || "Univer artifact panel did not open.");
            ctx.assert(artifact.width >= MIN_UNIVER_ARTIFACT_IFRAME_WIDTH, `Univer artifact panel is not widened: ${JSON.stringify(artifact)}`);
            ctx.assert(artifact.headerText.includes(UNIVER_BASENAME), `Univer artifact header did not show the file: ${artifact.headerText}`);
            ctx.assert(!artifact.errorVisible, "OpenWork displayed a Univer preview error.");
          },
          screenshot: {
            name: "compact-chat-pane-with-univer-artifact",
            requireText: ["compact layout smoke", UNIVER_BASENAME],
            rejectText: ["Failed to open Univer preview", "Setup incomplete", "remote workspaces only"],
          },
        });
      },
    },
  ],
};
