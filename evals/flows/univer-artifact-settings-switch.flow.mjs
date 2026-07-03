/**
 * Opening a .univer artifact and switching the right rail to settings and back
 * must not crash the session page.
 */
import { execFile } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const RUN_SUFFIX = Date.now().toString(36);
const UNIVER_BASENAME = `settings-switch-${RUN_SUFFIX}.univer`;
const CSV_BASENAME = `settings-switch-${RUN_SUFFIX}.csv`;
const RELATIVE_UNIVER_PATH = `artifacts/${UNIVER_BASENAME}`;
const RELATIVE_CSV_PATH = `artifacts/${CSV_BASENAME}`;
const UNIVER_EXECUTABLE = process.env.OPENWORK_UNIVER_EXECUTABLE?.trim() || "univer";

let latestUniverHeaderText = "";

const SELECTED_SESSION_ROUTE_EXPR = `(() => {
  const route = window.__openworkControl.snapshot().route || "";
  return /\\/session\\/[^/?#]+/.test(route);
})()`;

function isDaemonBuildMismatch(error) {
  return /Daemon build mismatch/i.test(`${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? ""}`);
}

async function runUniver(args, cwd, env) {
  return execFileAsync(UNIVER_EXECUTABLE, args, {
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
  return {
    fileStat: await stat(absolutePath),
    unitId: readJsonString(imported.stdout, "unitId"),
  };
}

async function closeStartupModals(ctx) {
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
  await closeStartupModals(ctx);

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
  await closeStartupModals(ctx);

  await ctx.eval(`(() => {
    const seedReady = window.__openworkControl.listActions()
      .some((action) => action.id === "eval.artifact_tabs.seed_univer" && !action.disabled);
    if (seedReady) return "already-open";
    const button = document.querySelector('button[aria-label="Browser"]');
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
}

async function waitForControl(ctx) {
  await ctx.waitFor("Boolean(window.__openworkControl)", {
    timeoutMs: 60_000,
    label: "control API",
  });
}

async function openSeededUniverArtifact(ctx, unitId) {
  await waitForControl(ctx);
  const seeded = await ctx.control("eval.artifact_tabs.seed_univer", {
    path: RELATIVE_UNIVER_PATH,
    unitId,
  });
  ctx.assert(seeded?.activeTabId === `file:${RELATIVE_UNIVER_PATH}`, `Univer artifact did not open: ${seeded?.activeTabId}`);
  await ctx.waitFor(
    `(() => {
      const header = document.querySelector('[data-testid="univer-artifact-header"]');
      const nativeViewer = document.querySelector('[data-testid="univer-artifact-native-viewer"]');
      const viewerMount = document.querySelector('[data-testid="univer-cowork-content-viewer"]');
      if (!header || !nativeViewer || !viewerMount) return false;
      const rect = nativeViewer.getBoundingClientRect();
      return rect.width > 300
        && rect.height > 200
        && viewerMount.querySelectorAll("*").length > 50;
    })()`,
    { timeoutMs: 60_000, label: "Univer artifact mounted" },
  );
  latestUniverHeaderText = await ctx.eval(`document.querySelector('[data-testid="univer-artifact-header"]')?.textContent || ""`);
}

export default {
  id: "univer-artifact-settings-switch",
  title: "Open Univer artifact survives settings rail switch",
  spec: "openspec/changes/bind-univer-sessions-to-primary-targets/specs/univer-target-session-workflow/spec.md",
  steps: [
    {
      name: "Prepare a session with an open Univer artifact",
      run: async (ctx) => {
        await ctx.prove("A real .univer artifact is open in the right rail", {
          action: async () => {
            await ensureSessionAndSidePanel(ctx);
            await waitForControl(ctx);
            const info = await ctx.control("eval.workspace.info");
            ctx.assert(info?.ok === true, "Workspace info action did not return ok.");
            ctx.assert(typeof info.workspaceRoot === "string" && info.workspaceRoot.length > 0, "Missing workspace root.");
            ctx.assert(info.isRemoteWorkspace !== true, "Embedded Univer preview requires a local workspace.");
            const created = await createUniverfile(info.workspaceRoot);
            ctx.assert(created.fileStat.isFile(), "univer import did not create a file.");
            await openSeededUniverArtifact(ctx, created.unitId);
          },
          assert: async () => {
            const result = await ctx.eval(`(() => {
              const header = document.querySelector('[data-testid="univer-artifact-header"]');
              const viewerMount = document.querySelector('[data-testid="univer-cowork-content-viewer"]');
              return {
                headerText: header?.textContent || "",
                descendants: viewerMount?.querySelectorAll("*").length ?? 0,
              };
            })()`);
            ctx.assert(result.headerText.includes(".univer"), `Univer header missing file name: ${result.headerText}`);
            ctx.assert(result.descendants > 50, `Cowork viewer content did not mount (${result.descendants} descendants).`);
            latestUniverHeaderText = result.headerText;
          },
          screenshot: {
            name: "univer-artifact-open",
            requireText: ["当前版本", "Start"],
            rejectText: ["Application error", "Layout not found for Panel", "Failed to open Univer preview"],
          },
        });
      },
    },
    {
      name: "Switch to settings and back",
      run: async (ctx) => {
        await ctx.prove("The Univer artifact remounts after switching to Extensions and back", {
          action: async () => {
            const openedSettings = await ctx.waitFor(`(() => {
              const button = document.querySelector('button[aria-label="Extensions"]');
              if (!button || button.disabled) return false;
              button.click();
              return true;
            })()`, {
              timeoutMs: 30_000,
              label: "Extensions rail button",
            });
            ctx.assert(openedSettings === true, "Could not open the settings rail.");
            await ctx.waitFor(
              `document.querySelector('button[aria-label="Extensions"]')?.getAttribute("aria-pressed") === "true"`,
              { timeoutMs: 10_000, label: "settings rail active" },
            );

            const openedArtifacts = await ctx.waitFor(`(() => {
              const button = Array.from(document.querySelectorAll("button"))
                .find((candidate) => candidate.getAttribute("aria-label")?.startsWith("Artifacts"));
              if (!button || button.disabled) return false;
              button.click();
              return true;
            })()`, {
              timeoutMs: 30_000,
              label: "Artifacts rail button",
            });
            ctx.assert(openedArtifacts === true, "Could not return to the artifact rail.");
            await ctx.waitFor(
              `(() => {
                const header = document.querySelector('[data-testid="univer-artifact-header"]');
                const viewer = document.querySelector('[data-testid="univer-cowork-content-viewer"]');
                return Boolean(header && viewer && header.textContent.includes(".univer"));
              })()`,
              { timeoutMs: 60_000, label: "Univer artifact remounted after settings switch" },
            );
          },
          assert: async () => {
            const result = await ctx.eval(`(() => {
              const header = document.querySelector('[data-testid="univer-artifact-header"]');
              const viewerMount = document.querySelector('[data-testid="univer-cowork-content-viewer"]');
              const appText = document.body.innerText || "";
              const mountRect = viewerMount?.getBoundingClientRect();
              return {
                headerText: header?.textContent || "",
                hasViewer: Boolean(viewerMount),
                mountWidth: Math.round(mountRect?.width ?? 0),
                mountHeight: Math.round(mountRect?.height ?? 0),
                descendants: viewerMount?.querySelectorAll("*").length ?? 0,
                appCrashed: /Application error|Layout not found for Panel|Unhandled Runtime Error/i.test(appText),
              };
            })()`);
            ctx.assert(result.headerText.includes(".univer"), `Univer header did not return: ${result.headerText}`);
            ctx.assert(result.hasViewer, "Cowork viewer did not remount after returning from settings.");
            ctx.assert(result.mountWidth > 200 && result.mountHeight > 200, `Cowork viewer remounted at invalid size (${result.mountWidth}x${result.mountHeight}).`);
            ctx.assert(result.descendants > 50, `Cowork viewer content disappeared after remount (${result.descendants} descendants).`);
            ctx.assert(!result.appCrashed, "The app rendered a crash/error screen after returning from settings.");
          },
          screenshot: {
            name: "settings-switch-back-to-univer",
            requireText: [latestUniverHeaderText.includes("当前版本") ? "当前版本" : ".univer", "Start"],
            rejectText: [
              "Application error",
              "Unhandled Runtime Error",
              "Layout not found for Panel",
              "Failed to open Univer preview",
            ],
          },
        });
      },
    },
  ],
};
