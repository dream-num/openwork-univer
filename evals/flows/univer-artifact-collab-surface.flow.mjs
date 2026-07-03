/**
 * Native .univer artifacts open inside OpenWork through the Univer collab client.
 *
 * 1. Start from the active OpenWork workspace/session.
 * 2. Create a real `.univer` file with Univer CLI from a local CSV fixture.
 * 3. Seed it as an agent-created transcript artifact and open the artifact tab.
 * 4. Confirm the artifact panel renders the dedicated Univer header.
 * 5. Confirm the artifact panel embeds the native Cowork Content Viewer component.
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
const DEEP_LINK_WORKTREE_DISPLAY_NAME = "OpenWork deep link review";
const MIN_UNIVER_ARTIFACT_VIEWER_WIDTH = 600;
const UNIT_STATUS_LABELS = ["已修改", "未改动", "新增", "删除", "冲突"];
const PRIMARY_STATUS_LABELS = ["冲突", "基线有变", "待处理", "编辑中", "只读", "可编辑"];
const LONG_STATUS_LABELS = ["最新版本有改动", "有待处理修改", "正在编辑当前版本"];
const UNIVER_EXECUTABLE = process.env.OPENWORK_UNIVER_EXECUTABLE?.trim() || "univer";

let latestDeepLink = {
  worktreeId: "",
  unitId: "",
};

const SELECTED_SESSION_ROUTE_EXPR = `(() => {
  const route = window.__openworkControl.snapshot().route || "";
  return /\\/session\\/[^/?#]+/.test(route);
})()`;

function normalizeUniverPath(value) {
  return `${value ?? ""}`.trim().replace(/[\\]+/g, "/").replace(/^\.\//, "").toLowerCase();
}

function isDaemonBuildMismatch(error) {
  return /Daemon build mismatch/i.test(`${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? ""}`);
}

async function runUniver(args, cwd, env) {
  const mergedEnv = { ...process.env, ...env };
  return execFileAsync(UNIVER_EXECUTABLE, args, {
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
  const worktree = await runUniver(["worktree", "add", absolutePath, "--name", DEEP_LINK_WORKTREE_DISPLAY_NAME, "--json"], workspaceRoot, {
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

async function ensureSessionCanOpenUniverArtifact(ctx, relativePath) {
  const metadata = await ctx.control("eval.session.current_univer_metadata");
  const currentPrimaryPath = metadata?.primaryUniverTarget?.path;
  if (normalizeUniverPath(currentPrimaryPath) === "" || normalizeUniverPath(currentPrimaryPath) === normalizeUniverPath(relativePath)) {
    return;
  }

  const previousRoute = await ctx.eval("window.__openworkControl.snapshot().route");
  ctx.log(`Current session is bound to ${currentPrimaryPath}; creating a fresh task for ${relativePath}`);
  const created = await ctx.control("session.create_task");
  ctx.assert(created === true, "Could not create a fresh task for the generated Univer artifact.");
  await ctx.waitFor(
    `(() => {
      const route = window.__openworkControl.snapshot().route || "";
      return route !== ${JSON.stringify(previousRoute)} && /\\/session\\/[^/?#]+/.test(route);
    })()`,
    { timeoutMs: 60_000, label: "fresh task route" },
  );
  await ensureSessionAndSidePanel(ctx);
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
      name: "Open the .univer artifact in the native Cowork Content Viewer",
      run: async (ctx) => {
        await ctx.prove("Opening a native .univer artifact mounts Cowork Content Viewer inside OpenWork without iframe fallback", {
          action: async () => {
            await ensureSessionCanOpenUniverArtifact(ctx, RELATIVE_UNIVER_PATH);
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
                const tab = Array.from(document.querySelectorAll("button"))
                  .find((button) => button.getAttribute("aria-label") === ${JSON.stringify(`Select tab: ${UNIVER_BASENAME}`)});
                if (!tab) return false;
                tab.click();
                return true;
              })()`,
              { timeoutMs: 30_000, label: "seeded Univer artifact tab selected" },
            );
            await ctx.waitFor(
              `document.querySelector('[data-testid="univer-artifact-header"]')?.textContent?.includes(${JSON.stringify(DEEP_LINK_WORKTREE_DISPLAY_NAME)})`,
              { timeoutMs: 30_000, label: "seeded Univer artifact header selected" },
            );
            await ctx.waitFor(
              `(() => {
                const header = document.querySelector('[data-testid="univer-artifact-header"]');
                const nativeViewer = document.querySelector('[data-testid="univer-artifact-native-viewer"]');
                const viewerMount = document.querySelector('[data-testid="univer-cowork-content-viewer"]');
                if (!header || !nativeViewer || !viewerMount) return false;
                const rect = nativeViewer.getBoundingClientRect();
                const primaryStatusText = header.querySelector('[data-testid="univer-artifact-header-primary-status"]')?.textContent || "";
                return !document.querySelector('iframe[data-testid="univer-collab-surface"]')
                  && header.textContent.includes(${JSON.stringify(DEEP_LINK_WORKTREE_DISPLAY_NAME)})
                  && ${JSON.stringify(PRIMARY_STATUS_LABELS)}.some((label) => primaryStatusText.includes(label))
                  && ${JSON.stringify(LONG_STATUS_LABELS)}.every((label) => !header.textContent.includes(label))
                  && !document.querySelector('[data-testid="univer-artifact-header"] button[aria-label="Open externally"]')
                  && Boolean(document.querySelector('[data-testid="univer-artifact-header"] button[aria-label="Download artifact"]'))
                  && Boolean(document.querySelector('[data-testid="univer-artifact-header"] button[aria-label="Show in folder"]'))
                  && Boolean(document.querySelector('[data-testid="univer-artifact-header"] button[aria-label="Close artifact"]'))
                  && rect.width >= ${MIN_UNIVER_ARTIFACT_VIEWER_WIDTH}
                  && rect.height > 200;
              })()`,
              { timeoutMs: 60_000, label: "native Univer content viewer and dedicated header" },
            );
            await ctx.waitFor(
              `(() => {
                const header = document.querySelector('[data-testid="univer-artifact-header"]');
                if (!header) return false;
                const reviewActions = header.querySelector('[data-testid="univer-artifact-header-review-actions"]');
                return Boolean(reviewActions?.querySelector('button[aria-label="合入当前版本"]'))
                  && Boolean(reviewActions?.querySelector('button[aria-label="丢弃修改"]'))
                  && !reviewActions.textContent.includes("合入当前版本")
                  && !reviewActions.textContent.includes("丢弃修改");
              })()`,
              { timeoutMs: 30_000, label: "direct worktree review actions visible" },
            );
            await closeComposerToolbarPopovers(ctx);
            await ctx.waitFor(
              `(() => {
                const trigger = document.querySelector('[data-testid="univer-surface-selector"]');
                if (!trigger) return false;
                if (trigger.getAttribute("aria-expanded") === "true") return true;
                trigger.click();
                return false;
              })()`,
              { timeoutMs: 30_000, label: "surface selector menu opened" },
            );
            await ctx.waitFor(
              `(() => {
                const bodyText = document.body.innerText || "";
                return bodyText.includes(${JSON.stringify(latestDeepLink.worktreeId)})
                  && bodyText.includes("可合入")
                  && ${JSON.stringify(UNIT_STATUS_LABELS)}.some((label) => bodyText.includes(label));
              })()`,
              { timeoutMs: 30_000, label: "surface selector expanded details" },
            );
            await ctx.eval("new Promise((resolve) => setTimeout(resolve, 8000))", { awaitPromise: true });
          },
          assert: async () => {
            const result = await ctx.eval(`(() => {
              const header = document.querySelector('[data-testid="univer-artifact-header"]');
              const nativeViewer = document.querySelector('[data-testid="univer-artifact-native-viewer"]');
              const viewerMount = document.querySelector('[data-testid="univer-cowork-content-viewer"]');
              const oldIframe = document.querySelector('iframe[data-testid="univer-collab-surface"]');
              if (!header) return { ok: false, reason: "Univer artifact header missing" };
              if (!nativeViewer) return { ok: false, reason: "native viewer missing" };
              if (!viewerMount) return { ok: false, reason: "cowork viewer mount missing" };
              const rect = nativeViewer.getBoundingClientRect();
              const mountRect = viewerMount.getBoundingClientRect();
              const headerText = header.textContent || "";
              const descendantCount = viewerMount.querySelectorAll("*").length;
              const canvasCount = viewerMount.querySelectorAll("canvas").length;
              const viewerText = viewerMount.textContent || "";
              const surfaceSelector = header.querySelector('[data-testid="univer-surface-selector"]');
              const primaryStatus = header.querySelector('[data-testid="univer-artifact-header-primary-status"]');
              const selectorChildren = surfaceSelector ? Array.from(surfaceSelector.children) : [];
              const selectorSlashGaps = selectorChildren
                .map((node, index) => ({ node, index }))
                .filter(({ node }) => (node.textContent || "").trim() === "/")
                .map(({ node, index }) => {
                  const previous = selectorChildren[index - 1];
                  const next = selectorChildren[index + 1];
                  const slashRect = node.getBoundingClientRect();
                  const previousRect = previous?.getBoundingClientRect();
                  const nextRect = next?.getBoundingClientRect();
                  return {
                    before: previousRect ? Math.round(slashRect.left - previousRect.right) : null,
                    after: nextRect ? Math.round(nextRect.left - slashRect.right) : null,
                  };
                });
              return {
                ok: true,
                hasOldIframe: Boolean(oldIframe),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                mountWidth: Math.round(mountRect.width),
                mountHeight: Math.round(mountRect.height),
                mountChildCount: viewerMount.children.length,
                descendantCount,
                canvasCount,
                viewerText,
                headerText,
                selectorText: surfaceSelector?.textContent || "",
                primaryStatusText: primaryStatus?.textContent || "",
                selectorSlashGaps,
                hasOpenExternally: Boolean(header.querySelector('button[aria-label="Open externally"]')),
                hasDownload: Boolean(header.querySelector('button[aria-label="Download artifact"]')),
                hasReveal: Boolean(header.querySelector('button[aria-label="Show in folder"]')),
                hasClose: Boolean(header.querySelector('button[aria-label="Close artifact"]')),
                hasReviewActionZone: Boolean(header.querySelector('[data-testid="univer-artifact-header-review-actions"]')),
                hasViewSwitchZone: Boolean(header.querySelector('[data-testid="univer-artifact-header-view-switch"]')),
                errorVisible: /Failed to open Univer preview|Setup incomplete|remote workspaces only/i.test(document.body.innerText),
              };
            })()`);
            ctx.assert(result.ok, result.reason || "Univer content viewer not found.");
            ctx.assert(result.selectorText.includes(DEEP_LINK_WORKTREE_DISPLAY_NAME), `Dedicated Univer surface selector did not show the worktree display name: ${result.headerText}`);
            ctx.assert(!result.selectorText.includes(UNIVER_BASENAME), `Dedicated Univer surface selector should not show the Univerfile: ${result.selectorText}`);
            ctx.assert(!result.selectorText.includes(latestDeepLink.worktreeId), `Dedicated Univer surface selector should keep the worktree id in the expanded menu: ${result.selectorText}`);
            ctx.assert(!result.selectorText.includes("可合入"), `Dedicated Univer surface selector should not show worktree status while collapsed: ${result.selectorText}`);
            ctx.assert(UNIT_STATUS_LABELS.every((label) => !result.selectorText.includes(label)), `Dedicated Univer surface selector should not show unit status while collapsed: ${result.selectorText}`);
            ctx.assert(PRIMARY_STATUS_LABELS.some((label) => result.primaryStatusText.includes(label)), `Dedicated Univer header did not show a controlled primary status: ${result.headerText}`);
            ctx.assert(LONG_STATUS_LABELS.every((label) => !result.headerText.includes(label)), `Dedicated Univer header showed a phrase-length status: ${result.headerText}`);
            ctx.assert(result.selectorSlashGaps.length >= 1, "Dedicated Univer surface selector did not render the worktree/unit divider.");
            for (const gap of result.selectorSlashGaps) {
              ctx.assert((gap.before ?? 0) <= 12 && (gap.after ?? 0) <= 12, `Surface selector divider is visually detached: ${JSON.stringify(gap)}`);
            }
            ctx.assert(!result.hasOpenExternally, "Dedicated Univer header should not expose normal Open externally.");
            ctx.assert(result.hasDownload, "Dedicated Univer header did not keep Download artifact fallback.");
            ctx.assert(result.hasReveal, "Dedicated Univer header did not keep Show in folder fallback.");
            ctx.assert(result.hasClose, "Dedicated Univer header did not keep Close artifact.");
            ctx.assert(result.hasReviewActionZone, "Dedicated Univer header did not show direct review actions.");
            ctx.assert(result.hasViewSwitchZone, "Dedicated Univer header did not show the worktree view switch.");
            ctx.assert(!result.hasOldIframe, "The old collab-client iframe fallback is still present.");
            ctx.assert(result.width >= MIN_UNIVER_ARTIFACT_VIEWER_WIDTH, `Native viewer is narrower than the Univer artifact default (${result.width}px).`);
            ctx.assert(result.height > 200, `Native viewer is not visibly tall (${result.width}x${result.height}).`);
            ctx.assert(result.mountWidth > 200 && result.mountHeight > 200, `Cowork viewer mount is not visibly sized (${result.mountWidth}x${result.mountHeight}).`);
            ctx.assert(result.mountChildCount > 0, "Cowork viewer mount is empty after loading.");
            ctx.assert(result.descendantCount >= 50, `Cowork viewer content disappeared after loading (${result.descendantCount} descendants).`);
            ctx.assert(result.canvasCount >= 1, `Cowork viewer did not render a sheet canvas (${result.canvasCount} canvases).`);
            ctx.assert(/Start|Insert|Data|Sheet/i.test(result.viewerText), `Cowork viewer did not render recognizable Univer UI text: ${result.viewerText.slice(0, 120)}`);
            ctx.assert(!result.errorVisible, "OpenWork displayed a Univer preview error.");
            ctx.log(`Univer native viewer ${result.width}x${result.height}, mount ${result.mountWidth}x${result.mountHeight}, ${result.descendantCount} nodes, ${result.canvasCount} canvases`);
          },
          screenshot: {
            name: "univer-cowork-content-viewer",
            requireText: [UNIVER_BASENAME, DEEP_LINK_WORKTREE_DISPLAY_NAME, "Start"],
            rejectText: [
              "Open externally",
              "Failed to open Univer preview",
              "Setup incomplete",
              "remote workspaces only",
              "状态",
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
