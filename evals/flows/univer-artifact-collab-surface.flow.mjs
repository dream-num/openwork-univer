/**
 * Native .univer artifacts open inside OpenWork through the Univer collab client.
 *
 * 1. Start from the active OpenWork workspace/session.
 * 2. Create a real `.univer` file with Univer CLI from a local CSV fixture.
 * 3. Seed it as an agent-created transcript artifact and open the artifact tab.
 * 4. Confirm the artifact panel renders the dedicated Univer header.
 * 5. Confirm the artifact panel embeds the local collab-client URL in an iframe.
 */
import { execFile } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const RUN_SUFFIX = Date.now().toString(36);
const UNIVER_BASENAME = `native-univer-eval-${RUN_SUFFIX}.univer`;
const CSV_BASENAME = `native-univer-eval-${RUN_SUFFIX}.csv`;
const RELATIVE_UNIVER_PATH = `artifacts/${UNIVER_BASENAME}`;
const RELATIVE_CSV_PATH = `artifacts/${CSV_BASENAME}`;
const MIN_UNIVER_ARTIFACT_IFRAME_WIDTH = 600;

let latestDeepLink = {
  worktreeId: "",
  unitId: "",
};

const SELECTED_SESSION_ROUTE_EXPR = `(() => {
  const route = window.__openworkControl.snapshot().route || "";
  return /\\/session\\/[^/?#]+/.test(route);
})()`;

function isDaemonBuildMismatch(error) {
  return /Daemon build mismatch/i.test(`${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? ""}`);
}

async function runUniver(args, cwd, env) {
  const mergedEnv = { ...process.env, ...env };
  return execFileAsync("univer", args, {
    cwd,
    env: mergedEnv,
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

function readJsonString(stdout, key) {
  const parsed = JSON.parse(stdout);
  const value = parsed[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Univer JSON output is missing ${key}: ${stdout}`);
  }
  return value.trim();
}

async function createUniverfile(workspaceRoot) {
  const absolutePath = join(workspaceRoot, RELATIVE_UNIVER_PATH);
  const csvPath = join(workspaceRoot, RELATIVE_CSV_PATH);
  await runUniver(["daemon", "stop"], workspaceRoot, {
    UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT: workspaceRoot,
  }).catch(() => undefined);
  await rm(absolutePath, { recursive: true, force: true });
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(csvPath, "Metric,Value\nRevenue,42000\nCost,17000\nMargin,25000\n", "utf8");
  await startUniverDaemon(workspaceRoot);
  const imported = await runUniver(["import", "--file", csvPath, absolutePath, "--json"], workspaceRoot, {
    UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT: workspaceRoot,
  });
  const unitId = readJsonString(imported.stdout, "unitId");
  const worktree = await runUniver(["worktree", "create", absolutePath, "--name", "OpenWork deep link review", "--json"], workspaceRoot, {
    UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT: workspaceRoot,
  });
  const worktreeId = readJsonString(worktree.stdout, "worktreeId");

  await writeFile(csvPath, "Metric,Value\nRevenue,45000\nCost,17000\nMargin,28000\nForecast,7000\n", "utf8");
  await runUniver(["import", "--file", csvPath, absolutePath, "--worktree", worktreeId, "--json"], workspaceRoot, {
    UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT: workspaceRoot,
  });
  await runUniver(["worktree", "ready", absolutePath, "--worktree", worktreeId, "--json"], workspaceRoot, {
    UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT: workspaceRoot,
  });
  return {
    fileStat: await stat(absolutePath),
    worktreeId,
    unitId,
  };
}

async function ensureSessionAndSidePanel(ctx) {
  await ctx.waitFor("Boolean(window.__openworkControl)", {
    timeoutMs: 60_000,
    label: "control API",
  });

  await ctx.eval(`(() => {
    for (const label of ["Continue without OpenWork Models", "Close"]) {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        candidate.textContent?.trim() === label && !candidate.disabled
      );
      if (button) button.click();
    }
    return true;
  })()`);

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
      SELECTED_SESSION_ROUTE_EXPR,
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

  await ctx.eval(`(() => {
    const seedReady = window.__openworkControl.listActions()
      .some((action) => action.id === "eval.artifact_tabs.seed_univer" && !action.disabled);
    if (seedReady) return "already-open";
    const button = Array.from(document.querySelectorAll("button"))
      .find((item) => item.getAttribute("aria-label") === "Browser" && !item.disabled);
    button?.click();
    return button ? "clicked" : "no-button";
  })()`);

  await ctx.waitFor(
    `window.__openworkControl.listActions().some((action) => action.id === "eval.workspace.info" && !action.disabled)`,
    { timeoutMs: 30_000, label: "workspace info action enabled" },
  );
  await ctx.waitFor(
    `window.__openworkControl.listActions().some((action) => action.id === "eval.artifact_tabs.seed_univer" && !action.disabled)`,
    { timeoutMs: 30_000, label: "Univer artifact seed action enabled" },
  );
  await closeComposerToolbarPopovers(ctx);
}

async function closeComposerToolbarPopovers(ctx) {
  await ctx.eval(`(() => {
    const buttons = Array.from(document.querySelectorAll(
      'button[data-testid="composer-toolbar-files"], button[data-testid="composer-toolbar-changes"]'
    ));
    const openButton = buttons.find((button) => button.getAttribute("aria-pressed") === "true");
    if (openButton) {
      openButton.click();
      return "clicked";
    }
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    document.dispatchEvent(event);
    window.dispatchEvent(event);
    return "closed";
  })()`);
  await ctx.waitFor(
    `!document.querySelector('[data-testid="workspace-cowork-panel"]') && !document.querySelector('input[placeholder="Search files"]')`,
    { timeoutMs: 5_000, label: "composer toolbar popovers closed" },
  );
}

async function openChangesPopover(ctx) {
  const alreadyOpen = await ctx.eval(`Boolean(document.querySelector('[data-testid="workspace-cowork-panel"]'))`);
  if (alreadyOpen) {
    return;
  }

  const clicked = await ctx.waitFor(`(() => {
    const button = document.querySelector('button[data-testid="composer-toolbar-changes"]');
    if (button?.disabled) return false;
    if (!button) return false;
    button.click();
    return true;
  })()`, {
    timeoutMs: 30_000,
    label: "composer toolbar changes button",
  });
  ctx.assert(clicked === true, "Could not click the composer toolbar Changes button.");

  await ctx.waitFor(`Boolean(document.querySelector('[data-testid="workspace-cowork-panel"]'))`, {
    timeoutMs: 30_000,
    label: "workspace cowork panel",
  });
}

export default {
  id: "univer-artifact-collab-surface",
  title: "Native .univer artifacts open in the embedded Univer collab surface",
  spec: "openspec/changes/add-univer-artifact-header/specs/univer-artifact-header/spec.md",
  steps: [
    {
      name: "App is ready and Electron-backed",
      run: async (ctx) => {
        await ctx.prove("App boots with the eval control API available", {
          action: async () => {
            await ctx.waitFor("Boolean(window.__openworkControl)", {
              timeoutMs: 60_000,
              label: "control API",
            });
          },
          assert: async () => {
            const userAgent = await ctx.eval("navigator.userAgent");
            ctx.assert(userAgent.includes("Electron/"), `Expected Electron userAgent, got ${userAgent}`);
          },
        });
      },
    },
    {
      name: "Open a session and prepare a native .univer file",
      run: async (ctx) => {
        await ctx.prove("A local workspace session is active and contains a real .univer file", {
          action: async () => {
            await ensureSessionAndSidePanel(ctx);
          },
          assert: async () => {
            const info = await ctx.control("eval.workspace.info");
            ctx.assert(info?.ok === true, "Workspace info action did not return ok.");
            ctx.assert(typeof info.workspaceRoot === "string" && info.workspaceRoot.length > 0, "Missing workspace root.");
            ctx.assert(info.isRemoteWorkspace !== true, "Embedded Univer preview requires a local workspace.");
            const created = await createUniverfile(info.workspaceRoot);
            ctx.assert(created.fileStat.isFile(), "univer import did not create a file.");
            latestDeepLink = {
              worktreeId: created.worktreeId,
              unitId: created.unitId,
            };
            ctx.log(`Created ${RELATIVE_UNIVER_PATH} (${created.fileStat.size} bytes) in ${info.workspaceRoot}`);
            ctx.log(`Deep link worktree=${created.worktreeId} unit=${created.unitId}`);
          },
        });
      },
    },
    {
      name: "Open the .univer artifact in the embedded collab client",
      run: async (ctx) => {
        await ctx.prove("Opening a native .univer artifact mounts a local collab-client iframe inside OpenWork", {
          action: async () => {
            const seeded = await ctx.control("eval.artifact_tabs.seed_univer", {
              path: RELATIVE_UNIVER_PATH,
              worktreeId: latestDeepLink.worktreeId,
              unitId: latestDeepLink.unitId,
            });
            ctx.assert(seeded?.activeTabId === `file:${RELATIVE_UNIVER_PATH}`, `Univer artifact did not open the seeded tab: ${seeded?.activeTabId}`);
            await closeComposerToolbarPopovers(ctx);
            await ctx.waitFor(
              `document.querySelectorAll('button[aria-label^="Select tab: ${UNIVER_BASENAME}"]').length >= 1`,
              { timeoutMs: 30_000, label: "seeded Univer artifact tab present" },
            );
            await ctx.waitFor(
              `(() => {
                const header = document.querySelector('[data-testid="univer-artifact-header"]');
                const iframe = document.querySelector('iframe[data-testid="univer-collab-surface"]');
                if (!header || !iframe) return false;
                const rect = iframe.getBoundingClientRect();
                const url = new URL(iframe.src);
                return /^http:\\/\\/(?:127\\.0\\.0\\.1|localhost|\\[::1\\]):/.test(iframe.src)
                  && iframe.src.includes(${JSON.stringify(UNIVER_BASENAME)})
                  && url.searchParams.get("mode") === "embedded"
                  && url.searchParams.get("scope") === "worktree"
                  && url.searchParams.get("editable") === "false"
                  && url.searchParams.get("worktree") === ${JSON.stringify(latestDeepLink.worktreeId)}
                  && url.searchParams.get("unit") === ${JSON.stringify(latestDeepLink.unitId)}
                  && header.textContent.includes(${JSON.stringify(UNIVER_BASENAME)})
                  && header.textContent.includes("原始修改")
                  && header.textContent.includes("仅查看")
                  && !document.querySelector('[data-testid="univer-artifact-header"] button[aria-label="Open externally"]')
                  && Boolean(document.querySelector('[data-testid="univer-artifact-header"] button[aria-label="Download artifact"]'))
                  && Boolean(document.querySelector('[data-testid="univer-artifact-header"] button[aria-label="Show in folder"]'))
                  && Boolean(document.querySelector('[data-testid="univer-artifact-header"] button[aria-label="Close artifact"]'))
                  && rect.width >= ${MIN_UNIVER_ARTIFACT_IFRAME_WIDTH}
                  && rect.height > 200;
              })()`,
              { timeoutMs: 60_000, label: "local Univer collab iframe and dedicated header" },
            );
            await closeComposerToolbarPopovers(ctx);
            await ctx.eval("new Promise((resolve) => setTimeout(resolve, 8000))", { awaitPromise: true });
          },
          assert: async () => {
            const result = await ctx.eval(`(() => {
              const header = document.querySelector('[data-testid="univer-artifact-header"]');
              const iframe = document.querySelector('iframe[data-testid="univer-collab-surface"]');
              if (!header) return { ok: false, reason: "Univer artifact header missing" };
              if (!iframe) return { ok: false, reason: "iframe missing" };
              const rect = iframe.getBoundingClientRect();
              const url = new URL(iframe.src);
              const headerText = header.textContent || "";
              return {
                ok: true,
                src: iframe.src,
                mode: url.searchParams.get("mode"),
                scope: url.searchParams.get("scope"),
                editable: url.searchParams.get("editable"),
                worktree: url.searchParams.get("worktree"),
                unit: url.searchParams.get("unit"),
                title: iframe.title,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                headerText,
                hasOpenExternally: Boolean(header.querySelector('button[aria-label="Open externally"]')),
                hasDownload: Boolean(header.querySelector('button[aria-label="Download artifact"]')),
                hasReveal: Boolean(header.querySelector('button[aria-label="Show in folder"]')),
                hasClose: Boolean(header.querySelector('button[aria-label="Close artifact"]')),
                hasContentActionZone: Boolean(header.querySelector('[data-testid="univer-artifact-header-content-actions"]')),
                errorVisible: /Failed to open Univer preview|Setup incomplete|remote workspaces only/i.test(document.body.innerText),
              };
            })()`);
            ctx.assert(result.ok, result.reason || "Univer iframe not found.");
            ctx.assert(result.headerText.includes(UNIVER_BASENAME), `Dedicated Univer header did not show fallback file title: ${result.headerText}`);
            ctx.assert(result.headerText.includes("原始修改"), `Dedicated Univer header did not show cowork scope: ${result.headerText}`);
            ctx.assert(result.headerText.includes("仅查看"), `Dedicated Univer header did not show cowork edit gate: ${result.headerText}`);
            ctx.assert(!result.hasOpenExternally, "Dedicated Univer header should not expose normal Open externally.");
            ctx.assert(result.hasDownload, "Dedicated Univer header did not keep Download artifact fallback.");
            ctx.assert(result.hasReveal, "Dedicated Univer header did not keep Show in folder fallback.");
            ctx.assert(result.hasClose, "Dedicated Univer header did not keep Close artifact.");
            ctx.assert(result.hasContentActionZone, "Dedicated Univer header did not reserve the content action zone.");
            ctx.assert(/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):/.test(result.src), `Expected a local collab-client URL, got ${result.src}`);
            ctx.assert(result.src.includes(UNIVER_BASENAME), `Iframe URL does not target the seeded .univer file: ${result.src}`);
            ctx.assert(result.mode === "embedded", `Iframe URL did not request embedded mode: ${result.src}`);
            ctx.assert(result.scope === "worktree", `Iframe URL did not request worktree scope: ${result.src}`);
            ctx.assert(result.editable === "false", `Iframe URL did not request read-only worktree viewing: ${result.src}`);
            ctx.assert(result.worktree === latestDeepLink.worktreeId, `Iframe URL did not preserve worktree=${latestDeepLink.worktreeId}: ${result.src}`);
            ctx.assert(result.unit === latestDeepLink.unitId, `Iframe URL did not preserve unit=${latestDeepLink.unitId}: ${result.src}`);
            ctx.assert(result.width >= MIN_UNIVER_ARTIFACT_IFRAME_WIDTH, `Iframe is narrower than the Univer artifact default (${result.width}px).`);
            ctx.assert(result.height > 200, `Iframe is not visibly tall (${result.width}x${result.height}).`);
            const response = await fetch(result.src);
            ctx.assert(response.ok, `Iframe URL was not reachable from the eval runner: ${response.status} ${result.src}`);
            ctx.assert(!result.errorVisible, "OpenWork displayed a Univer preview error.");
            const embedded = await ctx.evalInFrameUrl(result.src, `(() => {
              const topbar = document.querySelector(".topbar");
              return {
                readyState: document.readyState,
                hasBody: Boolean(document.body),
                hasTopbar: Boolean(topbar),
                topbarText: topbar?.textContent || "",
              };
            })()`);
            ctx.assert(embedded.hasBody, "Embedded collab-client frame did not expose a body.");
            ctx.assert(!embedded.hasTopbar, `Embedded collab-client still rendered its own topbar: ${embedded.topbarText}`);
            ctx.log(`Univer iframe ${result.width}x${result.height}: ${result.src}`);
          },
          screenshot: {
            name: "univer-collab-surface-embedded",
            requireText: [UNIVER_BASENAME, "原始修改", "仅查看"],
            rejectText: [
              "Open externally",
              "Failed to open Univer preview",
              "Setup incomplete",
              "remote workspaces only",
              "MAIN WORKTREE",
              "READY FOR REVIEW",
              "ACTIVE CHANGES",
            ],
          },
        });
      },
    },
    {
      name: "Open cowork context from the Changes popover",
      run: async (ctx) => {
        await ctx.prove("The composer toolbar Changes popover shows Univer units and worktrees for the active artifact", {
          action: async () => {
            await openChangesPopover(ctx);
            await ctx.waitFor(`(() => {
              const panel = document.querySelector('[data-testid="workspace-cowork-panel"]');
              if (!panel) return false;
              const text = panel.textContent || "";
              const selectedWorktree = Array.from(panel.querySelectorAll("[data-worktree-id]"))
                .find((row) =>
                  row.getAttribute("data-worktree-id") === ${JSON.stringify(latestDeepLink.worktreeId)} &&
                  row.getAttribute("aria-pressed") === "true"
                );
              const reviewUnit = Array.from(panel.querySelectorAll('[data-cowork-row="review-unit"]'))
                .find((row) =>
                  row.getAttribute("data-worktree-id") === ${JSON.stringify(latestDeepLink.worktreeId)} &&
                  row.getAttribute("data-unit-id") === ${JSON.stringify(latestDeepLink.unitId)}
                );
              return text.includes("Main worktree")
                && text.includes("Active changes")
                && text.includes("Ready for review")
                && Boolean(selectedWorktree)
                && Boolean(reviewUnit)
                && !text.includes("Opening Univer surface")
                && !text.includes("Loading Univer workspace")
                && !text.includes("Failed to open Univer surface")
                && !text.includes("Failed to load Univer workspace")
                && !text.includes("Click refresh to load review details.")
                && !text.includes("Loading review details...");
            })()`, {
              timeoutMs: 60_000,
              label: "loaded workspace cowork panel",
            });
          },
          assert: async () => {
            const result = await ctx.eval(`(() => {
              const panel = document.querySelector('[data-testid="workspace-cowork-panel"]');
              if (!panel) return { ok: false, reason: "cowork panel missing" };
              const text = panel.textContent || "";
              const unitRow = Array.from(panel.querySelectorAll('[data-cowork-row="unit"]'))
                .find((row) => row.getAttribute("data-unit-id") === ${JSON.stringify(latestDeepLink.unitId)});
              const selectedWorktree = Array.from(panel.querySelectorAll("[data-worktree-id]"))
                .find((row) =>
                  row.getAttribute("data-worktree-id") === ${JSON.stringify(latestDeepLink.worktreeId)} &&
                  row.getAttribute("aria-pressed") === "true"
                );
              const reviewUnit = Array.from(panel.querySelectorAll('[data-cowork-row="review-unit"]'))
                .find((row) =>
                  row.getAttribute("data-worktree-id") === ${JSON.stringify(latestDeepLink.worktreeId)} &&
                  row.getAttribute("data-unit-id") === ${JSON.stringify(latestDeepLink.unitId)}
                );
              const fileTreeSearch = document.querySelector('input[placeholder="Search files"]');
              const filesButton = document.querySelector('button[data-testid="composer-toolbar-files"]');
              const changesButton = document.querySelector('button[data-testid="composer-toolbar-changes"]');
              return {
                ok: true,
                hasMainWorktree: text.includes("Main worktree"),
                hasActiveChanges: text.includes("Active changes"),
                hasReadyForReview: text.includes("Ready for review"),
                hasUnitRow: Boolean(unitRow),
                hasSelectedWorktree: Boolean(selectedWorktree),
                hasReviewUnit: Boolean(reviewUnit),
                selectedWorktreeLabel: selectedWorktree?.getAttribute("aria-label") || "",
                hasFileTree: Boolean(fileTreeSearch),
                hasFilesButton: Boolean(filesButton),
                hasChangesButton: Boolean(changesButton),
                errorVisible: /Failed to open Univer surface|Failed to load Univer workspace/i.test(text),
                manualRefreshPromptVisible: text.includes("Click refresh to load review details."),
                loadingReviewDetailsVisible: text.includes("Loading review details..."),
              };
            })()`);
            ctx.assert(result.ok, result.reason || "Cowork panel was not found.");
            ctx.assert(result.hasMainWorktree && result.hasActiveChanges && result.hasReadyForReview, "Cowork sections are incomplete.");
            ctx.assert(result.hasUnitRow, `Cowork units did not include deep-linked unit ${latestDeepLink.unitId}.`);
            ctx.assert(result.hasSelectedWorktree, `Cowork worktrees did not select deep-linked worktree ${latestDeepLink.worktreeId}.`);
            ctx.assert(result.hasReviewUnit, `Cowork review details did not auto-load deep-linked unit ${latestDeepLink.unitId}.`);
            ctx.assert(!result.hasFileTree, "Changes popover should not include the workspace file tree.");
            ctx.assert(result.hasFilesButton, "Composer toolbar Files button disappeared while Changes is open.");
            ctx.assert(result.hasChangesButton, "Composer toolbar Changes button disappeared while Changes is open.");
            ctx.assert(!result.errorVisible, "Cowork panel displayed an error state.");
            ctx.assert(!result.manualRefreshPromptVisible, "Cowork panel still asks users to click refresh for review details.");
            ctx.assert(!result.loadingReviewDetailsVisible, "Cowork panel did not finish loading review details.");
            ctx.log(`Selected cowork worktree row: ${result.selectedWorktreeLabel}`);
          },
          screenshot: {
            name: "univer-cowork-changes-popover",
            requireText: ["MAIN WORKTREE", "ACTIVE CHANGES", "READY FOR REVIEW", "OpenWork deep link review"],
            rejectText: [
              "Search files",
              "Failed to open Univer surface",
              "Failed to load Univer workspace",
              "Click refresh to load review details.",
              "Loading review details...",
            ],
          },
        });
      },
    },
  ],
};
