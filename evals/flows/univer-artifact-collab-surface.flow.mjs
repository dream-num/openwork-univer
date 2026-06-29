/**
 * Native .univer artifacts open inside OpenWork through the Univer collab client.
 *
 * 1. Start from the active OpenWork workspace/session.
 * 2. Create a real `.univer` file with Univer CLI from a local CSV fixture.
 * 3. Seed it as an agent-created transcript artifact and click the artifact affordance.
 * 4. Confirm the artifact panel embeds the local collab-client URL in an iframe.
 */
import { execFile } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const RELATIVE_UNIVER_PATH = "artifacts/native-univer-eval.univer";
const RELATIVE_CSV_PATH = "artifacts/native-univer-eval.csv";

let latestDeepLink = {
  worktreeId: "",
  unitId: "",
};

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
}

async function openWorkspaceFilesPopover(ctx) {
  const alreadyOpen = await ctx.eval(`Boolean(document.querySelector('input[placeholder="Search files"]'))`);
  if (alreadyOpen) {
    return;
  }

  const clicked = await ctx.waitFor(`(() => {
    const button = Array.from(document.querySelectorAll("button"))
      .find((item) => item.getAttribute("aria-label") === "Workspace files" && !item.disabled);
    if (!button) return false;
    button.click();
    return true;
  })()`, {
    timeoutMs: 30_000,
    label: "workspace files popover button",
  });
  ctx.assert(clicked === true, "Could not click the workspace files popover button.");

  await ctx.waitFor(`Boolean(document.querySelector('input[placeholder="Search files"]'))`, {
    timeoutMs: 30_000,
    label: "workspace file tree search input",
  });
}

export default {
  id: "univer-artifact-collab-surface",
  title: "Native .univer artifacts open in the embedded Univer collab surface",
  spec: "openspec/changes/introduce-univer-office-extension/specs/native-univer-office-surface/spec.md",
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
        await ctx.prove("Clicking a native .univer artifact mounts a local collab-client iframe inside OpenWork", {
          action: async () => {
            const seeded = await ctx.control("eval.artifact_tabs.seed_univer", {
              path: RELATIVE_UNIVER_PATH,
              worktreeId: latestDeepLink.worktreeId,
              unitId: latestDeepLink.unitId,
              open: false,
            });
            ctx.assert(seeded?.activeTabId === null, "Univer artifact should be seeded without opening the tab.");
            await ctx.waitFor(
              `(() => {
                const button = Array.from(document.querySelectorAll("button"))
                  .find((item) => (item.getAttribute("aria-label") || "").startsWith("Artifacts (") && !item.disabled);
                return Boolean(button);
              })()`,
              { timeoutMs: 30_000, label: "artifact rail button enabled after agent artifact mention" },
            );
            const clicked = await ctx.eval(`(() => {
              const button = Array.from(document.querySelectorAll("button"))
                .find((item) => (item.getAttribute("aria-label") || "").startsWith("Artifacts (") && !item.disabled);
              if (!button) return "missing";
              button.click();
              return button.getAttribute("aria-label");
            })()`);
            ctx.assert(typeof clicked === "string" && clicked.startsWith("Artifacts ("), `Artifact rail click failed: ${clicked}`);
            ctx.log(`Clicked artifact rail: ${clicked}`);
            await ctx.waitFor(
              `document.querySelectorAll('button[aria-label^="Select tab: native-univer-eval.univer"]').length >= 1`,
              { timeoutMs: 30_000, label: "seeded Univer artifact tab present" },
            );
            await ctx.waitFor(
              `(() => {
                const iframe = document.querySelector('iframe[data-testid="univer-collab-surface"]');
                if (!iframe) return false;
                const rect = iframe.getBoundingClientRect();
                const url = new URL(iframe.src);
                return /^http:\\/\\/(?:127\\.0\\.0\\.1|localhost|\\[::1\\]):/.test(iframe.src)
                  && iframe.src.includes("native-univer-eval.univer")
                  && url.searchParams.get("worktree") === ${JSON.stringify(latestDeepLink.worktreeId)}
                  && url.searchParams.get("unit") === ${JSON.stringify(latestDeepLink.unitId)}
                  && rect.width > 200
                  && rect.height > 200;
              })()`,
              { timeoutMs: 60_000, label: "local Univer collab iframe" },
            );
            await ctx.eval("new Promise((resolve) => setTimeout(resolve, 8000))", { awaitPromise: true });
          },
          assert: async () => {
            const result = await ctx.eval(`(() => {
              const iframe = document.querySelector('iframe[data-testid="univer-collab-surface"]');
              if (!iframe) return { ok: false, reason: "iframe missing" };
              const rect = iframe.getBoundingClientRect();
              const url = new URL(iframe.src);
              return {
                ok: true,
                src: iframe.src,
                worktree: url.searchParams.get("worktree"),
                unit: url.searchParams.get("unit"),
                title: iframe.title,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                errorVisible: /Failed to open Univer preview|Setup incomplete|remote workspaces only/i.test(document.body.innerText),
              };
            })()`);
            ctx.assert(result.ok, result.reason || "Univer iframe not found.");
            ctx.assert(/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):/.test(result.src), `Expected a local collab-client URL, got ${result.src}`);
            ctx.assert(result.src.includes("native-univer-eval.univer"), `Iframe URL does not target the seeded .univer file: ${result.src}`);
            ctx.assert(result.worktree === latestDeepLink.worktreeId, `Iframe URL did not preserve worktree=${latestDeepLink.worktreeId}: ${result.src}`);
            ctx.assert(result.unit === latestDeepLink.unitId, `Iframe URL did not preserve unit=${latestDeepLink.unitId}: ${result.src}`);
            ctx.assert(result.width > 200 && result.height > 200, `Iframe is not visibly sized (${result.width}x${result.height}).`);
            const response = await fetch(result.src);
            ctx.assert(response.ok, `Iframe URL was not reachable from the eval runner: ${response.status} ${result.src}`);
            ctx.assert(!result.errorVisible, "OpenWork displayed a Univer preview error.");
            ctx.log(`Univer iframe ${result.width}x${result.height}: ${result.src}`);
          },
          screenshot: {
            name: "univer-collab-surface-embedded",
            rejectText: ["Failed to open Univer preview", "Setup incomplete", "remote workspaces only"],
          },
        });
      },
    },
    {
      name: "Open cowork context from the Files popover",
      run: async (ctx) => {
        await ctx.prove("The Files popover shows Univer units and worktrees while the file tree remains available", {
          action: async () => {
            await openWorkspaceFilesPopover(ctx);
            await ctx.waitFor(`(() => {
              const panel = document.querySelector('[data-testid="workspace-cowork-panel"]');
              if (!panel) return false;
              const text = panel.textContent || "";
              return text.includes("Main worktree")
                && text.includes("Active changes")
                && text.includes("Ready for review")
                && !text.includes("Opening Univer surface")
                && !text.includes("Loading Univer workspace")
                && !text.includes("Failed to open Univer surface")
                && !text.includes("Failed to load Univer workspace");
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
              const fileTreeSearch = document.querySelector('input[placeholder="Search files"]');
              return {
                ok: true,
                hasMainWorktree: text.includes("Main worktree"),
                hasActiveChanges: text.includes("Active changes"),
                hasReadyForReview: text.includes("Ready for review"),
                hasUnitRow: Boolean(unitRow),
                hasSelectedWorktree: Boolean(selectedWorktree),
                selectedWorktreeLabel: selectedWorktree?.getAttribute("aria-label") || "",
                hasFileTree: Boolean(fileTreeSearch),
                errorVisible: /Failed to open Univer surface|Failed to load Univer workspace/i.test(text),
              };
            })()`);
            ctx.assert(result.ok, result.reason || "Cowork panel was not found.");
            ctx.assert(result.hasMainWorktree && result.hasActiveChanges && result.hasReadyForReview, "Cowork sections are incomplete.");
            ctx.assert(result.hasUnitRow, `Cowork units did not include deep-linked unit ${latestDeepLink.unitId}.`);
            ctx.assert(result.hasSelectedWorktree, `Cowork worktrees did not select deep-linked worktree ${latestDeepLink.worktreeId}.`);
            ctx.assert(result.hasFileTree, "The workspace file tree disappeared when cowork context mounted.");
            ctx.assert(!result.errorVisible, "Cowork panel displayed an error state.");
            ctx.log(`Selected cowork worktree row: ${result.selectedWorktreeLabel}`);
          },
          screenshot: {
            name: "univer-cowork-files-popover",
            requireText: ["Main worktree", "Active changes", "Ready for review"],
            rejectText: ["Failed to open Univer surface", "Failed to load Univer workspace"],
          },
        });
      },
    },
  ],
};
