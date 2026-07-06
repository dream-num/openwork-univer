/**
 * Focused host-contract smoke for visible Univerfile discovery and open surface.
 *
 * This intentionally avoids the longer review/worktree flows. It proves the
 * extraction boundary used by this change: OpenWork still discovers local
 * `.univer` files in the sidebar, then opens one through the Univer surface.
 */
import { execFile } from "node:child_process";
import { mkdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const RUN_SUFFIX = Date.now().toString(36);
const UNIVER_BASENAME = `host-contracts-${RUN_SUFFIX}.univer`;
const UNIVER_DISPLAY_NAME = UNIVER_BASENAME.replace(/\.univer$/, "");
const CSV_BASENAME = `host-contracts-${RUN_SUFFIX}.csv`;
const RELATIVE_UNIVER_PATH = `artifacts/${UNIVER_BASENAME}`;
const RELATIVE_CSV_PATH = `artifacts/${CSV_BASENAME}`;
const UNIVER_EXECUTABLE = process.env.OPENWORK_UNIVER_EXECUTABLE?.trim() || "univer";
const EVAL_UNIVER_HOME = join("/private/tmp", `openwork-univer-host-contracts-home-${RUN_SUFFIX}`);

let evalWorkspaceRoot = "";
let createdFileSize = 0;

const SELECTED_SESSION_ROUTE_EXPR = `(() => {
  const route = window.__openworkControl.snapshot().route || "";
  return /\\/session\\/[^/?#]+/.test(route);
})()`;

async function runUniver(args, cwd, env = {}) {
  return execFileAsync(UNIVER_EXECUTABLE, args, {
    cwd,
    env: { ...process.env, ...env },
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function isDaemonBuildMismatch(error) {
  return /Daemon build mismatch/i.test(`${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? ""}`);
}

async function startUniverDaemon(cwd) {
  const env = {
    UNIVER_HOME: EVAL_UNIVER_HOME,
    UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT: cwd,
  };
  try {
    await runUniver(["daemon", "start"], cwd, env);
  } catch (error) {
    if (!isDaemonBuildMismatch(error)) throw error;
    await runUniver(["daemon", "stop"], cwd, env);
    await runUniver(["daemon", "start"], cwd, env);
  }
}

async function closeBlockingDialogs(ctx) {
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

async function ensureSessionAndSidePanel(ctx) {
  await ctx.waitFor("Boolean(window.__openworkControl)", {
    timeoutMs: 60_000,
    label: "control API",
  });
  await closeBlockingDialogs(ctx);

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
    await ctx.waitFor(SELECTED_SESSION_ROUTE_EXPR, {
      timeoutMs: 60_000,
      label: "session route after task creation",
    });
  }

  await closeBlockingDialogs(ctx);
  await ensureArtifactControls(ctx);
}

async function prepareCurrentWorkspace(ctx) {
  await ensureSessionAndSidePanel(ctx);
  await ctx.waitFor(
    "window.__openworkControl.listActions().some((action) => action.id === 'eval.workspace.info' && !action.disabled)",
    { timeoutMs: 30_000, label: "workspace info action enabled" },
  );
  const info = await ctx.control("eval.workspace.info");
  if (!info?.ok || typeof info.workspaceRoot !== "string" || !info.workspaceRoot) {
    throw new Error(`Workspace info action did not return a usable workspace root: ${JSON.stringify(info)}`);
  }
  if (info.isRemoteWorkspace === true) {
    throw new Error("A local active workspace is required for this Univer host-contract flow.");
  }
  evalWorkspaceRoot = await realpath(info.workspaceRoot);
}

async function createUniverfile(workspaceRootInput) {
  const workspaceRoot = await realpath(workspaceRootInput);
  const absolutePath = join(workspaceRoot, RELATIVE_UNIVER_PATH);
  const csvPath = join(workspaceRoot, RELATIVE_CSV_PATH);
  await runUniver(["daemon", "stop"], workspaceRoot, {
    UNIVER_HOME: EVAL_UNIVER_HOME,
    UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT: workspaceRoot,
  }).catch(() => undefined);
  await rm(absolutePath, { recursive: true, force: true });
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(csvPath, "Metric,Value\nRevenue,42000\nCost,17000\nMargin,25000\n", "utf8");
  await startUniverDaemon(workspaceRoot);
  await runUniver(["import", "--file", csvPath, absolutePath, "--json"], workspaceRoot, {
    UNIVER_HOME: EVAL_UNIVER_HOME,
    UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT: workspaceRoot,
  });
  const fileStat = await stat(absolutePath);
  createdFileSize = fileStat.size;
}

async function ensureArtifactControls(ctx) {
  await ctx.eval(`(() => {
    const seedReady = window.__openworkControl.listActions()
      .some((action) => action.id === "eval.artifact_tabs.seed_univer" && !action.disabled);
    if (seedReady) return "ready";
    const button = Array.from(document.querySelectorAll("button"))
      .find((item) => item.getAttribute("aria-label") === "Browser" && !item.disabled);
    button?.click();
    return button ? "clicked" : "missing";
  })()`);
  await ctx.waitFor(
    `window.__openworkControl.listActions().some((action) => action.id === "eval.artifact_tabs.seed_univer" && !action.disabled)`,
    { timeoutMs: 30_000, label: "Univer artifact seed action enabled" },
  );
}

export default {
  id: "univer-host-contracts-discovery-open-surface",
  title: "Visible Univerfile discovery and open surface stay intact",
  spec: "openspec/changes/extract-univer-cowork-host-contracts/specs/univer-cowork-host-contracts/spec.md",
  precondition: async () => {
    try {
      await execFileAsync(UNIVER_EXECUTABLE, ["--version"], { timeout: 15_000 });
      return null;
    } catch {
      return `Missing Univer CLI executable: ${UNIVER_EXECUTABLE}`;
    }
  },
  steps: [
    {
      name: "Discover a local Univerfile in the sidebar",
      run: async (ctx) => {
        await ctx.prove("A newly created local .univer file appears under the sidebar Univerfiles section", {
          action: async () => {
            await prepareCurrentWorkspace(ctx);
            await createUniverfile(evalWorkspaceRoot);
          },
          assert: async () => {
            await ctx.waitFor(`(() => {
              const bodyText = document.body.innerText || "";
              return bodyText.includes(${JSON.stringify(UNIVER_BASENAME)})
                && bodyText.includes("UNIVERFILES");
            })()`, {
              timeoutMs: 30_000,
              label: "created Univerfile visible in sidebar",
            });
          },
          screenshot: {
            name: "sidebar-univerfile-discovery",
            requireText: [UNIVER_BASENAME, "UNIVERFILES"],
            rejectText: ["Something went wrong", "Application error"],
          },
        });
      },
    },
    {
      name: "Open the discovered Univerfile surface",
      run: async (ctx) => {
        await ctx.prove("Opening the discovered .univer file mounts the native Cowork Content Viewer", {
          action: async () => {
            await ensureArtifactControls(ctx);
            const seeded = await ctx.control("eval.artifact_tabs.seed_univer", {
              path: RELATIVE_UNIVER_PATH,
              size: createdFileSize,
            });
            ctx.assert(seeded?.activeTabId === `file:${RELATIVE_UNIVER_PATH}`, `Unexpected active tab: ${seeded?.activeTabId}`);
            await ctx.waitFor(`(() => {
              const header = document.querySelector('[data-testid="univer-artifact-header"]');
              const nativeViewer = document.querySelector('[data-testid="univer-artifact-native-viewer"]');
              const viewerMount = document.querySelector('[data-testid="univer-cowork-content-viewer"]');
              const oldIframe = document.querySelector('iframe[data-testid="univer-collab-surface"]');
              const bodyText = document.body.innerText || "";
              const rect = nativeViewer?.getBoundingClientRect();
              return Boolean(header)
                && header.textContent.includes(${JSON.stringify(UNIVER_DISPLAY_NAME)})
                && Boolean(nativeViewer)
                && Boolean(viewerMount)
                && !oldIframe
                && rect.width > 300
                && rect.height > 200
                && !bodyText.includes("Failed to open Univer")
                && !bodyText.includes("Setup incomplete")
                && !bodyText.includes("Application error");
            })()`, {
              timeoutMs: 120_000,
              label: "native Univer surface mounted",
            });
          },
          assert: async () => {
            const result = await ctx.eval(`(() => {
              const header = document.querySelector('[data-testid="univer-artifact-header"]');
              const nativeViewer = document.querySelector('[data-testid="univer-artifact-native-viewer"]');
              const viewerMount = document.querySelector('[data-testid="univer-cowork-content-viewer"]');
              const rect = nativeViewer?.getBoundingClientRect();
              return {
                headerText: header?.textContent || "",
                hasNativeViewer: Boolean(nativeViewer),
                hasCoworkViewer: Boolean(viewerMount),
                hasOldIframe: Boolean(document.querySelector('iframe[data-testid="univer-collab-surface"]')),
                width: Math.round(rect?.width ?? 0),
                height: Math.round(rect?.height ?? 0),
                errorVisible: /Failed to open Univer|Setup incomplete|Application error/i.test(document.body.innerText || ""),
              };
            })()`);
            ctx.assert(result.headerText.includes(UNIVER_DISPLAY_NAME), `Header did not show the opened Univerfile: ${result.headerText}`);
            ctx.assert(result.hasNativeViewer, "Native Univer viewer is missing.");
            ctx.assert(result.hasCoworkViewer, "Cowork Content Viewer mount is missing.");
            ctx.assert(!result.hasOldIframe, "The old iframe fallback is still present.");
            ctx.assert(result.width > 300 && result.height > 200, `Viewer is not visibly mounted: ${result.width}x${result.height}`);
            ctx.assert(!result.errorVisible, "OpenWork displayed a Univer surface error.");
            ctx.recordEvidence({
              type: "assertion",
              status: "passed",
              assertion: "Open surface resolved into the native Cowork Content Viewer without an iframe fallback.",
              actual: result,
            });
          },
          screenshot: {
            name: "native-univer-open-surface",
            requireText: [UNIVER_BASENAME],
            rejectText: ["Failed to open Univer", "Setup incomplete", "Application error"],
          },
        });
      },
    },
  ],
};
