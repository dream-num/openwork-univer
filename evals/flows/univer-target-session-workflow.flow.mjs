/**
 * Primary Univerfile workflow.
 *
 * Proves that a bound session is grouped under its `.univer` file in the
 * sidebar and that the composer toolbar exposes Units and Tasks instead of
 * Workspace Files for that session.
 */
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const RUN_SUFFIX = Date.now().toString(36);
const UNIVER_BASENAME = `primary-target-eval-${RUN_SUFFIX}.univer`;
const CSV_BASENAME = `primary-target-eval-${RUN_SUFFIX}.csv`;
const UNIT_DISPLAY_NAME = UNIVER_BASENAME.replace(/\.univer$/, "");
const RELATIVE_UNIVER_PATH = `artifacts/${UNIVER_BASENAME}`;
const RELATIVE_CSV_PATH = `artifacts/${CSV_BASENAME}`;
const UNIVER_EXECUTABLE = process.env.OPENWORK_UNIVER_EXECUTABLE?.trim() || "univer";
let evalWorkspaceRoot = null;
let readyWorktreeId = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runUniver(args, cwd, env) {
  const mergedEnv = { ...process.env, ...env };
  return execFileAsync(UNIVER_EXECUTABLE, args, {
    cwd,
    env: mergedEnv,
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function gatewayOriginFromStatus(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    const origin = parsed?.collabGateway?.origin;
    return typeof origin === "string" && origin.trim() ? origin.trim() : null;
  } catch {
    return null;
  }
}

function parseJsonEnvelope(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`${label} did not return JSON.`);
  }
}

function findStringField(value, fieldNames) {
  if (!value || typeof value !== "object") return null;
  for (const fieldName of fieldNames) {
    const fieldValue = value[fieldName];
    if (typeof fieldValue === "string" && fieldValue.trim()) return fieldValue.trim();
  }
  for (const child of Object.values(value)) {
    const found = findStringField(child, fieldNames);
    if (found) return found;
  }
  return null;
}

function findWorktreeStatus(value, worktreeId) {
  if (!value || typeof value !== "object") return null;
  if (value.worktreeId === worktreeId && typeof value.status === "string") return value.status;
  for (const child of Object.values(value)) {
    const found = findWorktreeStatus(child, worktreeId);
    if (found) return found;
  }
  return null;
}

async function resolveGatewayOrigin(cwd) {
  const current = await runUniver(["daemon", "status", "--json"], cwd, {}).catch(() => null);
  const currentOrigin = current ? gatewayOriginFromStatus(current.stdout) : null;
  if (currentOrigin) return currentOrigin;

  await runUniver(["daemon", "start"], cwd, {});
  const started = await runUniver(["daemon", "status", "--json"], cwd, {});
  const startedOrigin = gatewayOriginFromStatus(started.stdout);
  if (!startedOrigin) throw new Error("Univer daemon did not report a gateway origin.");
  return startedOrigin;
}

async function univerEnv(workspaceRoot) {
  const gatewayOrigin = await resolveGatewayOrigin(workspaceRoot);
  return {
    UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT: workspaceRoot,
    UNIVER_GATEWAY_ORIGIN: gatewayOrigin,
  };
}

async function createUniverfile(workspaceRoot) {
  const absolutePath = join(workspaceRoot, RELATIVE_UNIVER_PATH);
  const csvPath = join(workspaceRoot, RELATIVE_CSV_PATH);
  await rm(absolutePath, { recursive: true, force: true });
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(csvPath, "Metric,Value\nRevenue,42000\nCost,17000\nMargin,25000\n", "utf8");
  await runUniver(["import", "--file", csvPath, absolutePath, "--json"], workspaceRoot, await univerEnv(workspaceRoot));
}

async function createReadyWorktree(workspaceRoot) {
  const absolutePath = join(workspaceRoot, RELATIVE_UNIVER_PATH);
  const env = await univerEnv(workspaceRoot);
  const added = await runUniver(
    ["worktree", "add", absolutePath, "--name", `Review ${RUN_SUFFIX}`, "--json"],
    workspaceRoot,
    env,
  );
  const worktreeId = findStringField(parseJsonEnvelope(added.stdout, "worktree add"), [
    "worktreeId",
    "id",
  ]);
  if (!worktreeId) throw new Error("worktree add did not return a worktree id.");
  await runUniver(
    ["worktree", "ready", absolutePath, "--worktree", worktreeId, "--json"],
    workspaceRoot,
    env,
  );
  return worktreeId;
}

async function waitForWorktreeStatus(workspaceRoot, worktreeId, expectedStatus) {
  const absolutePath = join(workspaceRoot, RELATIVE_UNIVER_PATH);
  const env = await univerEnv(workspaceRoot);
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    const listed = await runUniver(["worktree", "list", absolutePath, "--json"], workspaceRoot, env);
    const status = findWorktreeStatus(parseJsonEnvelope(listed.stdout, "worktree list"), worktreeId);
    if (status === expectedStatus) return;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for worktree ${worktreeId} to become ${expectedStatus}.`);
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

async function ensureSession(ctx) {
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

  const beforeSessionId = await selectedSessionId(ctx);
  await ctx.control("session.create_task");
  await ctx.waitFor(newSessionRouteExpression(beforeSessionId), {
    timeoutMs: 60_000,
    label: "fresh session route",
  });
  await closeBlockingDialogs(ctx);
}

async function openToolbarPopover(ctx, testId, label) {
  const opened = await ctx.waitFor(`(() => {
    const button = document.querySelector(${JSON.stringify(`button[data-testid="${testId}"]`)});
    if (!button || button.disabled) return false;
    if (button.getAttribute("aria-expanded") === "true") return true;
    button.click();
    return false;
  })()`, {
    timeoutMs: 30_000,
    label,
  });
  ctx.assert(opened === true, `Could not open ${label}.`);
}

async function openUnits(ctx) {
  await openToolbarPopover(ctx, "composer-toolbar-units", "Units");
}

async function openTasks(ctx) {
  await openToolbarPopover(ctx, "composer-toolbar-tasks", "Tasks");
}

async function closeBoundUniverPopovers(ctx) {
  await ctx.eval(`(() => {
    for (const testId of ["composer-toolbar-units", "composer-toolbar-tasks"]) {
      const button = document.querySelector('button[data-testid="' + testId + '"]');
      if (button?.getAttribute("aria-expanded") === "true") button.click();
    }
    return true;
  })()`);
}

async function selectedSessionId(ctx) {
  const route = await ctx.eval("window.__openworkControl.snapshot().route");
  if (typeof route !== "string") return null;
  const marker = "/session/";
  const markerIndex = route.indexOf(marker);
  if (markerIndex < 0) return null;
  return route.slice(markerIndex + marker.length).split(/[/?#]/)[0] || null;
}

function newSessionRouteExpression(beforeSessionId) {
  const previous = beforeSessionId ? JSON.stringify(beforeSessionId) : "null";
  return `(() => {
    const route = window.__openworkControl.snapshot().route || "";
    if (!route.includes("/session/")) return false;
    const previous = ${previous};
    return !previous || !route.includes(previous);
  })()`;
}

async function clickTargetNewTask(ctx) {
  const clicked = await ctx.waitFor(`(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const button = buttons.find((candidate) =>
      candidate.getAttribute("aria-label") === ${JSON.stringify(`New task for ${UNIVER_BASENAME}`)}
    );
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`, {
    timeoutMs: 30_000,
    label: "univerfile row new task button",
  });
  ctx.assert(clicked === true, "Could not click univerfile row new task.");
}

async function clickMergeChanges(ctx) {
  await ctx.eval(`(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    return true;
  })()`);
  await sleep(250);
  const clicked = await ctx.waitFor(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) => {
      const text = (candidate.textContent || "").trim();
      return candidate.getAttribute("aria-label") === "Merge changes" ||
        text === "Merge changes" ||
        text === "合入到当前版本";
    });
    if (!button || button.disabled) return false;
    button.scrollIntoView({ block: "center", inline: "nearest" });
    button.click();
    return true;
  })()`, {
    timeoutMs: 30_000,
    label: "Merge changes button",
  });
  ctx.assert(clicked === true, "Could not click Merge changes.");
}

async function scrollTargetDoneGroupIntoView(ctx) {
  const visible = await ctx.waitFor(`(() => {
    const targetName = ${JSON.stringify(UNIVER_BASENAME)};
    const hubs = Array.from(document.querySelectorAll("div")).filter((element) =>
      String(element.className).includes("group/univer-target") &&
      (element.innerText || "").includes(targetName) &&
      (element.innerText || "").toLowerCase().includes("done")
    );
    const hub = hubs.sort((left, right) =>
      left.getBoundingClientRect().height - right.getBoundingClientRect().height
    )[0];
    if (!hub) return false;
    hub.scrollIntoView({ block: "center", inline: "nearest" });
    const done = Array.from(hub.querySelectorAll("button,span")).find((element) =>
      (element.innerText || element.textContent || "").trim().toLowerCase() === "done"
    );
    if (!done) return false;
    done.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = done.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
  })()`, {
    timeoutMs: 30_000,
    label: "visible target Done group",
  });
  ctx.assert(visible === true, "Could not reveal the target Done group.");
}

async function selectedUniverMetadata(ctx) {
  const metadata = await ctx.control("eval.session.current_univer_metadata");
  ctx.assert(metadata?.ok === true, `Could not read selected session Univer metadata: ${metadata?.error ?? "unknown error"}`);
  return metadata;
}

async function waitForSelectedUniverMetadata(ctx, predicate, label) {
  const startedAt = Date.now();
  let lastMetadata = null;
  let lastError = null;
  while (Date.now() - startedAt < 60_000) {
    try {
      const metadata = await selectedUniverMetadata(ctx);
      lastMetadata = metadata;
      if (predicate(metadata)) return metadata;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  const lastState = lastMetadata ? JSON.stringify(lastMetadata) : "none";
  throw new Error(`Timed out waiting for ${label}. Last metadata: ${lastState}${lastError ? ` (${lastError.message})` : ""}`);
}

async function waitForUniverBreadcrumb(ctx) {
  const visible = await ctx.waitFor(`(() => {
    const breadcrumb = document.querySelector('[data-testid="univer-surface-breadcrumb"]');
    if (!breadcrumb) return false;
    const text = breadcrumb.textContent || "";
    const rect = breadcrumb.getBoundingClientRect();
    return rect.width > 0
      && rect.height > 0
      && text.includes(${JSON.stringify(UNIVER_BASENAME)})
      && text.includes(${JSON.stringify(UNIT_DISPLAY_NAME)});
  })()`, {
    timeoutMs: 60_000,
    label: "Univer surface breadcrumb",
  });
  ctx.assert(visible === true, "Could not find the Univer surface breadcrumb.");
}

async function openWorktreeBreadcrumbMenu(ctx) {
  const opened = await ctx.waitFor(`(() => {
    const trigger = Array.from(document.querySelectorAll("button"))
      .find((candidate) => candidate.getAttribute("aria-label")?.startsWith("Select worktree."));
    if (!trigger || trigger.disabled) return false;
    if (trigger.getAttribute("aria-expanded") === "true") return true;
    trigger.click();
    return false;
  })()`, {
    timeoutMs: 30_000,
    label: "worktree breadcrumb menu",
  });
  ctx.assert(opened === true, "Could not open the worktree breadcrumb menu.");
}

async function clickBreadcrumbMenuItem(ctx, selectorExpression, label) {
  const clicked = await ctx.waitFor(`(() => {
    const item = ${selectorExpression};
    if (!item) return false;
    item.click();
    return true;
  })()`, {
    timeoutMs: 30_000,
    label,
  });
  ctx.assert(clicked === true, `Could not click ${label}.`);
}

export default {
  id: "univer-target-session-workflow",
  title: "Sessions bind to a Primary Univerfile",
  spec: "openspec/changes/bind-univer-sessions-to-primary-targets/specs/univer-target-session-workflow/spec.md",
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
      name: "Bind the current session to a Primary Univerfile",
      run: async (ctx) => {
        await ctx.prove("A session can be explicitly bound to a workspace .univer file", {
          action: async () => {
            await ensureSession(ctx);
            const info = await ctx.control("eval.workspace.info");
            ctx.assert(info?.ok === true, "Workspace info action did not return ok.");
            ctx.assert(info.isRemoteWorkspace !== true, "This flow requires a local workspace.");
            evalWorkspaceRoot = info.workspaceRoot;
            await createUniverfile(info.workspaceRoot);
            await ctx.control("eval.session.bind_primary_univer_target", {
              path: RELATIVE_UNIVER_PATH,
            });
            await waitForSelectedUniverMetadata(
              ctx,
              (metadata) => metadata.primaryUniverTarget?.path === RELATIVE_UNIVER_PATH,
              "Primary Univerfile metadata",
            );
          },
          assert: async () => {
            await ctx.waitForText(UNIVER_BASENAME, { timeoutMs: 30_000 });
            await ctx.waitForText("Units", { timeoutMs: 30_000 });
            await ctx.waitForText("Tasks", { timeoutMs: 30_000 });
            const filesVisible = await ctx.eval(`Boolean(document.querySelector('button[data-testid="composer-toolbar-files"]'))`);
            const unitsVisible = await ctx.eval(`Boolean(document.querySelector('button[data-testid="composer-toolbar-units"]'))`);
            const tasksVisible = await ctx.eval(`Boolean(document.querySelector('button[data-testid="composer-toolbar-tasks"]'))`);
            ctx.assert(!filesVisible, "Bound session still shows the Files toolbar button.");
            ctx.assert(unitsVisible, "Bound session does not show Units.");
            ctx.assert(tasksVisible, "Bound session does not show Tasks.");
          },
          screenshot: {
            name: "target-hub-units-tasks",
            requireText: [UNIVER_BASENAME, "Units", "Tasks"],
            rejectText: ["Target", "Something went wrong"],
          },
        });
      },
    },
    {
      name: "Open Units and Tasks panels",
      run: async (ctx) => {
        await ctx.prove("Units opens the Univerfile unit list", {
          action: async () => {
            await openUnits(ctx);
          },
          assert: async () => {
            await ctx.waitForText(UNIT_DISPLAY_NAME, { timeoutMs: 30_000 });
            const redundantHeaderVisible = await ctx.hasText("UNITS");
            ctx.assert(!redundantHeaderVisible, "Units panel still shows a redundant section header.");
          },
          screenshot: {
            name: "units-panel",
            requireText: [UNIT_DISPLAY_NAME],
            rejectText: ["UNITS", "Failed to open Univer surface.", "Something went wrong"],
          },
        });
        await ctx.prove("Tasks opens this session's active task state", {
          action: async () => {
            await closeBoundUniverPopovers(ctx);
            await openTasks(ctx);
          },
          assert: async () => {
            await ctx.waitForText("No changes in this session", { timeoutMs: 30_000 });
            const redundantHeaderVisible = await ctx.hasText("ACTIVE TASK");
            ctx.assert(!redundantHeaderVisible, "Tasks panel still shows a redundant section header.");
          },
          screenshot: {
            name: "tasks-panel",
            requireText: ["No changes in this session"],
            rejectText: ["ACTIVE TASK", "Failed to open Univer surface.", "Something went wrong"],
          },
        });
      },
    },
    {
      name: "Create a new task from the univerfile row",
      run: async (ctx) => {
        await ctx.prove("The univerfile row plus action creates a new empty task bound to the same Primary Univerfile", {
          action: async () => {
            await closeBoundUniverPopovers(ctx);
            const beforeSessionId = await selectedSessionId(ctx);
            await clickTargetNewTask(ctx);
            await ctx.waitFor(newSessionRouteExpression(beforeSessionId), {
              timeoutMs: 30_000,
              label: "new univerfile task route",
            });
          },
          assert: async () => {
            await ctx.waitForText(UNIVER_BASENAME, { timeoutMs: 30_000 });
            await ctx.waitForText("Units", { timeoutMs: 30_000 });
            await ctx.waitForText("Tasks", { timeoutMs: 30_000 });
            const filesVisible = await ctx.eval(`Boolean(document.querySelector('button[data-testid="composer-toolbar-files"]'))`);
            ctx.assert(!filesVisible, "New univerfile task still shows Files instead of Units/Tasks.");
          },
          screenshot: {
            name: "target-hub-new-task",
            requireText: [UNIVER_BASENAME, "Units", "Tasks", "Describe your task"],
            rejectText: ["Target", "Something went wrong"],
          },
        });
      },
    },
    {
      name: "Auto-bind ready-for-review worktree state from transcript",
      run: async (ctx) => {
        await ctx.prove("A session-owned ready worktree from ordinary tool output appears as reviewable state in Tasks", {
          action: async () => {
            ctx.assert(typeof evalWorkspaceRoot === "string", "Workspace root was not captured.");
            readyWorktreeId = await createReadyWorktree(evalWorkspaceRoot);
            await ctx.control("eval.session.append_univer_worktree_tool_output", {
              path: RELATIVE_UNIVER_PATH,
              worktreeId: readyWorktreeId,
            });
            await waitForSelectedUniverMetadata(
              ctx,
              (metadata) => metadata.sessionUniverWorktreeId === readyWorktreeId,
              "transcript-derived session worktree metadata",
            );
            await closeBoundUniverPopovers(ctx);
            await openTasks(ctx);
          },
          assert: async () => {
            await ctx.waitForText("Review", { timeoutMs: 30_000 });
            await ctx.waitForText(`#`, { timeoutMs: 30_000 });
            const noChangesVisible = await ctx.hasText("No changes in this session");
            ctx.assert(!noChangesVisible, "Tasks still shows no changes after transcript-derived worktree binding.");
          },
          screenshot: {
            name: "ready-review-state",
            requireText: ["Review"],
            rejectText: ["No changes in this session", "Worktree missing or stale", "Something went wrong"],
          },
        });
      },
    },
    {
      name: "Switch the Univer Surface breadcrumb route",
      run: async (ctx) => {
        await ctx.prove("Breadcrumb worktree route switching does not change the session-owned Univer worktree", {
          action: async () => {
            ctx.assert(typeof readyWorktreeId === "string", "Ready worktree id was not captured.");
            await closeBoundUniverPopovers(ctx);
            await ctx.waitFor(`(() => {
              const actions = window.__openworkControl.listActions();
              return actions.some((action) => action.id === "eval.session.current_univer_metadata" && !action.disabled);
            })()`, {
              timeoutMs: 30_000,
              label: "current Univer metadata control action",
            });
            const before = await selectedUniverMetadata(ctx);
            ctx.assert(before.primaryUniverTarget?.path === RELATIVE_UNIVER_PATH, "Selected session is not bound to the expected Primary Univerfile.");
            ctx.assert(before.sessionUniverWorktreeId === readyWorktreeId, "Selected session is not bound to the ready worktree before route switching.");

            await waitForUniverBreadcrumb(ctx);
            await openWorktreeBreadcrumbMenu(ctx);
            await clickBreadcrumbMenuItem(
              ctx,
              `Array.from(document.querySelectorAll('[role="menuitem"]'))
                .find((candidate) => (candidate.textContent || "").trim().startsWith("Current version"))`,
              "Current version breadcrumb option",
            );
            await ctx.waitFor(`(() => {
              const breadcrumb = document.querySelector('[data-testid="univer-surface-breadcrumb"]');
              return Boolean(breadcrumb && (breadcrumb.textContent || "").includes("Current version"));
            })()`, {
              timeoutMs: 30_000,
              label: "breadcrumb switched to Current version",
            });

            await openWorktreeBreadcrumbMenu(ctx);
            await clickBreadcrumbMenuItem(
              ctx,
              `document.querySelector(${JSON.stringify(`[title="${readyWorktreeId}"]`)})`,
              "session worktree breadcrumb option",
            );
            await ctx.waitFor(`(() => {
              const breadcrumb = document.querySelector('[data-testid="univer-surface-breadcrumb"]');
              const text = breadcrumb?.textContent || "";
              return text.includes(${JSON.stringify(UNIVER_BASENAME)})
                && text.includes(${JSON.stringify(UNIT_DISPLAY_NAME)})
                && !text.includes(${JSON.stringify(readyWorktreeId)});
            })()`, {
              timeoutMs: 30_000,
              label: "breadcrumb switched back to session worktree label",
            });

            const after = await selectedUniverMetadata(ctx);
            ctx.assert(after.primaryUniverTarget?.path === before.primaryUniverTarget?.path, "Breadcrumb route switching changed the Primary Univerfile.");
            ctx.assert(after.sessionUniverWorktreeId === before.sessionUniverWorktreeId, "Breadcrumb route switching changed the session-owned worktree.");
            await openWorktreeBreadcrumbMenu(ctx);
          },
          assert: async () => {
            const result = await ctx.eval(`(() => {
              const breadcrumb = document.querySelector('[data-testid="univer-surface-breadcrumb"]');
              return {
                breadcrumbText: breadcrumb?.textContent || "",
                bodyText: document.body.innerText || "",
              };
            })()`);
            ctx.assert(result.breadcrumbText.includes(UNIVER_BASENAME), `Breadcrumb missing Univerfile: ${result.breadcrumbText}`);
            ctx.assert(result.breadcrumbText.includes(UNIT_DISPLAY_NAME), `Breadcrumb missing unit: ${result.breadcrumbText}`);
            ctx.assert(!result.breadcrumbText.includes(readyWorktreeId), "Breadcrumb shows the raw worktree id.");
            ctx.assert(result.bodyText.includes("Current version"), "Worktree menu does not show Current version.");
            ctx.assert(result.bodyText.includes("This session"), "Worktree menu does not group the session worktree.");
          },
          screenshot: {
            name: "breadcrumb-route-switching",
            requireText: [UNIVER_BASENAME, UNIT_DISPLAY_NAME, "Current version", "This session"],
            rejectText: ["Something went wrong", "Application error"],
          },
        });
      },
    },
    {
      name: "Merge moves the session to Done",
      run: async (ctx) => {
        await ctx.prove("Merging the session-owned worktree makes the task terminal and exposes Done state", {
          action: async () => {
            ctx.assert(typeof evalWorkspaceRoot === "string", "Workspace root was not captured.");
            ctx.assert(typeof readyWorktreeId === "string", "Ready worktree id was not captured.");
            await clickMergeChanges(ctx);
            await waitForWorktreeStatus(evalWorkspaceRoot, readyWorktreeId, "merged");
            await waitForSelectedUniverMetadata(
              ctx,
              (metadata) => metadata.sessionUniverWorktreeTerminalState === "merged",
              "merged session worktree metadata",
            );
            await openTasks(ctx);
            await scrollTargetDoneGroupIntoView(ctx);
          },
          assert: async () => {
            await ctx.waitForText("Merged into current Univerfile", { timeoutMs: 30_000 });
            await ctx.waitForText("Done", { timeoutMs: 30_000 });
            await ctx.waitForText("Merged", { timeoutMs: 30_000 });
          },
          screenshot: {
            name: "merged-done-state",
            requireText: ["Merged into current Univerfile", "Done", "Merged"],
            rejectText: ["Something went wrong"],
          },
        });
      },
    },
    {
      name: "Recover from missing worktree state",
      run: async (ctx) => {
        await ctx.prove("A missing session worktree stays needs-attention and starts clean recovery work from Create new task", {
          action: async () => {
            await closeBoundUniverPopovers(ctx);
            const beforeSessionId = await selectedSessionId(ctx);
            await clickTargetNewTask(ctx);
            await ctx.waitFor(newSessionRouteExpression(beforeSessionId), {
              timeoutMs: 30_000,
              label: "missing-state task route",
            });
            await ctx.control("eval.session.bind_primary_univer_target", {
              path: RELATIVE_UNIVER_PATH,
              worktreeId: `missing-${RUN_SUFFIX}`,
            });
            await waitForSelectedUniverMetadata(
              ctx,
              (metadata) => metadata.sessionUniverWorktreeId === `missing-${RUN_SUFFIX}`,
              "missing session worktree metadata",
            );
            await openTasks(ctx);
          },
          assert: async () => {
            await ctx.waitForText("Worktree missing or stale", { timeoutMs: 30_000 });
            await ctx.waitForText("Create new task", { timeoutMs: 30_000 });
            await ctx.waitForText("Refresh status", { timeoutMs: 30_000 });
          },
          screenshot: {
            name: "missing-worktree-recovery",
            requireText: ["Worktree missing or stale", "Create new task", "Refresh status"],
            rejectText: ["Something went wrong"],
          },
        });

        await ctx.prove("Create new task from missing state selects a clean bound task without the stale worktree", {
          action: async () => {
            const beforeSessionId = await selectedSessionId(ctx);
            await ctx.clickText("Create new task", { timeoutMs: 30_000 });
            await ctx.waitFor(newSessionRouteExpression(beforeSessionId), {
              timeoutMs: 30_000,
              label: "clean recovery task route",
            });
            await waitForSelectedUniverMetadata(
              ctx,
              (metadata) => metadata.primaryUniverTarget?.path === RELATIVE_UNIVER_PATH && !metadata.sessionUniverWorktreeId,
              "clean recovery task metadata",
            );
            await openTasks(ctx);
            await ctx.waitForText("No changes in this session", { timeoutMs: 30_000 });
          },
          assert: async () => {
            await ctx.waitForText("Tasks", { timeoutMs: 30_000 });
            await ctx.waitForText("No changes in this session", { timeoutMs: 30_000 });
            const staleVisible = await ctx.hasText("Worktree missing or stale");
            ctx.assert(!staleVisible, "Recovery task inherited the stale worktree state.");
          },
          screenshot: {
            name: "missing-worktree-clean-task",
            requireText: ["Tasks", "No changes in this session"],
            rejectText: ["Worktree missing or stale", "Something went wrong"],
          },
        });
      },
    },
  ],
};
