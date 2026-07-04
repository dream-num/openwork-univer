/**
 * General-origin direct mention -> new Univerfile handoff lifecycle.
 *
 * Proves that a General Session first-stage `@A.univer` binding can hand off to
 * a newly created `B.univer` session, while the source session stays bound to A
 * and does not duplicate the handoff after its lifecycle marker is cleared.
 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const RUN_SUFFIX = Date.now().toString(36);
const SOURCE_BASENAME = `general-origin-source-${RUN_SUFFIX}.univer`;
const HANDOFF_BASENAME = `general-origin-handoff-${RUN_SUFFIX}.univer`;
const SOURCE_RELATIVE_PATH = `artifacts/${SOURCE_BASENAME}`;
const HANDOFF_RELATIVE_PATH = `artifacts/${HANDOFF_BASENAME}`;
let evalWorkspaceRoot = "";
let sourceSessionId = "";
let handoffSessionId = "";

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

async function waitForSelectedWorkspaceRoot(ctx, expectedRoot, timeoutMs = 30_000) {
  const startedAt = Date.now();
  let lastInfo = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastInfo = await ctx.control("eval.workspace.info").catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    if (lastInfo?.ok === true && lastInfo.workspaceRoot === expectedRoot) return lastInfo;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for temporary workspace ${expectedRoot}: ${JSON.stringify(lastInfo)}`);
}

async function createTemporaryWorkspace(ctx, workspaceRoot) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const created = await ctx.control("workspace.create", { path: workspaceRoot })
      .then(() => true)
      .catch((error) => {
        lastError = error instanceof Error ? error.message : String(error);
        ctx.log(`workspace.create attempt ${attempt} failed: ${lastError}`);
        return false;
      });
    if (created) return;

    const selected = await waitForSelectedWorkspaceRoot(ctx, workspaceRoot, 2_000).catch(() => null);
    if (selected?.ok === true) return;
  }
  throw new Error(`Unable to create temporary workspace ${workspaceRoot}: ${lastError ?? "unknown error"}`);
}

async function currentUniverMetadata(ctx) {
  const metadata = await ctx.control("eval.session.current_univer_metadata");
  if (!metadata?.ok) {
    throw new Error(`Unable to read current Univer metadata: ${JSON.stringify(metadata)}`);
  }
  return metadata;
}

async function selectedSessionId(ctx) {
  const route = await ctx.eval("window.__openworkControl.snapshot().route");
  if (typeof route !== "string") return null;
  const marker = "/session/";
  const markerIndex = route.indexOf(marker);
  if (markerIndex < 0) return null;
  return route.slice(markerIndex + marker.length).split(/[/?#]/)[0] || null;
}

async function ensureWorkspaceFile(root, relativePath) {
  const absolutePath = join(root, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, "OpenWork Univer lifecycle handoff fraimz probe\n", "utf8");
  return absolutePath;
}

async function waitForCurrentGeneralSession(ctx) {
  const startedAt = Date.now();
  let lastMetadata = null;
  while (Date.now() - startedAt < 30_000) {
    lastMetadata = await currentUniverMetadata(ctx).catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    if (lastMetadata?.ok === true && !lastMetadata.primaryUniverTarget) return lastMetadata;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for a General Session: ${JSON.stringify(lastMetadata)}`);
}

async function ensureFreshGeneralSession(ctx) {
  await ctx.waitFor("Boolean(window.__openworkControl)", {
    timeoutMs: 60_000,
    label: "control API",
  });
  await closeBlockingDialogs(ctx);
  await ctx.waitFor(
    "window.__openworkControl.listActions().some((action) => action.id === 'workspace.create' && !action.disabled)",
    { timeoutMs: 30_000, label: "workspace.create action" },
  );

  evalWorkspaceRoot = await mkdtemp(join(tmpdir(), "openwork-univer-general-origin-handoff-"));
  await createTemporaryWorkspace(ctx, evalWorkspaceRoot);
  await ctx.waitFor(`(() => {
    const route = window.__openworkControl.snapshot().route || "";
    return route.includes("/session/");
  })()`, {
    timeoutMs: 60_000,
    label: "fresh temporary workspace session route",
  });

  await waitForSelectedWorkspaceRoot(ctx, evalWorkspaceRoot);
  const metadata = await currentUniverMetadata(ctx).catch(() => null);
  if (!metadata?.ok || metadata.primaryUniverTarget) {
    await ctx.control("session.create_task");
    await waitForCurrentGeneralSession(ctx);
  }
  await closeBlockingDialogs(ctx);
}

async function waitForCurrentPrimary(ctx, expectedPath) {
  const startedAt = Date.now();
  let lastMetadata = null;
  while (Date.now() - startedAt < 30_000) {
    const metadata = await currentUniverMetadata(ctx).catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    lastMetadata = metadata;
    if (metadata.primaryUniverTarget?.path === expectedPath) return metadata;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for Primary Univerfile ${expectedPath}: ${JSON.stringify(lastMetadata)}`);
}

function targetRowsExpression(sourceName, handoffName) {
  return `(() => {
    const sourceName = ${JSON.stringify(sourceName)};
    const handoffName = ${JSON.stringify(handoffName)};
    const rows = Array.from(document.querySelectorAll('[data-sidebar="univerfile-row"]'));
    const sourceRow = rows.find((row) => (row.textContent || "").includes(sourceName));
    const handoffRow = rows.find((row) => (row.textContent || "").includes(handoffName));
    sourceRow?.scrollIntoView({ block: "center", inline: "nearest" });
    handoffRow?.scrollIntoView({ block: "center", inline: "nearest" });
    return {
      sourceText: sourceRow?.textContent || "",
      handoffText: handoffRow?.textContent || "",
      sourceSelected: sourceRow?.getAttribute("aria-selected") || "",
      handoffSelected: handoffRow?.getAttribute("aria-selected") || "",
      hasGeneralSection: (document.body.innerText || "").includes("GENERAL SESSIONS"),
      hasUniverfilesSection: (document.body.innerText || "").includes("UNIVERFILES"),
    };
  })()`;
}

export default {
  id: "univer-general-origin-handoff",
  title: "General-origin direct mention hands off to a newly created Univerfile session",
  spec: "openspec/changes/promote-general-sessions-to-univer-tasks/specs/univer-target-session-workflow/spec.md",
  precondition: async (ctx) => {
    await ctx.waitFor("Boolean(window.__openworkControl)", {
      timeoutMs: 60_000,
      label: "control API",
    });
    const state = await ctx.waitFor(
      `(() => {
        const control = window.__openworkControl;
        const route = control.snapshot().route;
        if (route.startsWith("/welcome") || route.startsWith("/signin")) return "blocked";
        const action = control.listActions().find((candidate) => candidate.id === "session.create_task");
        if (action && !action.disabled) return "ready";
        return null;
      })()`,
      { timeoutMs: 30_000, label: "session.create_task enabled" },
    );
    return state === "blocked"
      ? "Profile is not onboarded; this flow requires a workspace."
      : null;
  },
  steps: [
    {
      name: "Start from a fresh General Session",
      run: async (ctx) => {
        await ctx.prove("The user starts in an unbound General Session with two visible Univerfiles", {
          action: async () => {
            await ensureFreshGeneralSession(ctx);
          },
          assert: async () => {
            const info = await ctx.control("eval.workspace.info");
            ctx.assert(info?.ok === true, `Missing workspace info: ${JSON.stringify(info)}`);
            ctx.assert(info.isRemoteWorkspace !== true, "This flow requires a local workspace.");
            await ensureWorkspaceFile(info.workspaceRoot, SOURCE_RELATIVE_PATH);
            await ensureWorkspaceFile(info.workspaceRoot, HANDOFF_RELATIVE_PATH);
            const metadata = await currentUniverMetadata(ctx);
            sourceSessionId = await selectedSessionId(ctx);
            ctx.assert(typeof sourceSessionId === "string" && sourceSessionId.length > 0, "Missing source session id.");
            ctx.assert(!metadata.primaryUniverTarget, `Fresh session should be General: ${JSON.stringify(metadata)}`);
            ctx.log(`workspaceRoot=${info.workspaceRoot}`);
            ctx.log(`sourceSessionId=${sourceSessionId}`);
          },
          screenshot: {
            name: "general-origin-before-first-stage",
            requireText: ["GENERAL SESSIONS"],
            rejectText: ["Something went wrong", "Application error"],
          },
        });
      },
    },
    {
      name: "Bind the General Session to first-stage A context",
      run: async (ctx) => {
        await ctx.prove("A direct Univerfile mention marks the source session as General-origin first-stage context", {
          action: async () => {
            const result = await ctx.control("eval.session.apply_univer_lifecycle", {
              event: "directMention",
              path: SOURCE_RELATIVE_PATH,
            });
            ctx.assert(result?.ok === true, `Direct mention lifecycle action failed: ${JSON.stringify(result)}`);
            ctx.assert(result.lifecycle?.action === "promoted", `Expected promoted lifecycle action: ${JSON.stringify(result)}`);
          },
          assert: async () => {
            const metadata = await waitForCurrentPrimary(ctx, SOURCE_RELATIVE_PATH);
            ctx.assert(metadata.univerLifecycleOrigin === "generalDirectMention", `Missing General-origin marker: ${JSON.stringify(metadata)}`);
            const rows = await ctx.waitFor(targetRowsExpression(SOURCE_BASENAME, HANDOFF_BASENAME), {
              timeoutMs: 30_000,
              label: "source Univerfile row after first-stage binding",
            });
            ctx.assert(rows.sourceText.includes(SOURCE_BASENAME), `Source row missing: ${JSON.stringify(rows)}`);
            ctx.assert(rows.sourceSelected === "true", `Source row should be selected after first-stage binding: ${JSON.stringify(rows)}`);
            ctx.recordEvidence({
              type: "assertion",
              status: "passed",
              assertion: "Direct mention promotion persists General-origin first-stage metadata.",
              actual: { metadata, rows },
            });
          },
          screenshot: {
            name: "general-origin-first-stage-source-bound",
            requireText: ["UNIVERFILES", SOURCE_BASENAME],
            rejectText: ["Something went wrong", "Application error"],
          },
        });
      },
    },
    {
      name: "Hand off to B when the same General-origin run creates a new Univerfile",
      run: async (ctx) => {
        await ctx.prove("A later univer new signal creates and focuses a separate B.univer session", {
          action: async () => {
            const result = await ctx.control("eval.session.apply_univer_lifecycle", {
              event: "univerNew",
              path: HANDOFF_RELATIVE_PATH,
            });
            ctx.assert(result?.ok === true, `univer new lifecycle action failed: ${JSON.stringify(result)}`);
            ctx.assert(result.lifecycle?.action === "createdSession", `Expected createdSession lifecycle action: ${JSON.stringify(result)}`);
            ctx.assert(result.lifecycle?.createdSession?.id, `Missing created session in lifecycle result: ${JSON.stringify(result)}`);
            ctx.assert(result.lifecycle?.sourceMetadata?.primaryUniverTarget?.path === SOURCE_RELATIVE_PATH, `Source metadata should stay bound to A: ${JSON.stringify(result)}`);
            ctx.assert(!result.lifecycle?.sourceMetadata?.univerLifecycleOrigin, `Source marker should be cleared: ${JSON.stringify(result)}`);
            handoffSessionId = result.lifecycle.createdSession.id;
          },
          assert: async () => {
            const currentSessionId = await selectedSessionId(ctx);
            const metadata = await waitForCurrentPrimary(ctx, HANDOFF_RELATIVE_PATH);
            ctx.assert(currentSessionId === handoffSessionId, `Client did not focus the handoff session: ${JSON.stringify({ currentSessionId, handoffSessionId })}`);
            ctx.assert(metadata.univerSourceSessionId === sourceSessionId, `Handoff session should record the source session: ${JSON.stringify(metadata)}`);
            const rows = await ctx.waitFor(targetRowsExpression(SOURCE_BASENAME, HANDOFF_BASENAME), {
              timeoutMs: 30_000,
              label: "handoff Univerfile row selected",
            });
            ctx.assert(rows.sourceText.includes(SOURCE_BASENAME), `Source row missing after handoff: ${JSON.stringify(rows)}`);
            ctx.assert(rows.handoffText.includes(HANDOFF_BASENAME), `Handoff row missing after handoff: ${JSON.stringify(rows)}`);
            ctx.assert(rows.handoffSelected === "true", `Handoff row should be selected: ${JSON.stringify(rows)}`);
            ctx.recordEvidence({
              type: "assertion",
              status: "passed",
              assertion: "General-origin handoff creates a B session, focuses it, and preserves source provenance.",
              actual: { currentSessionId, metadata, rows },
            });
          },
          screenshot: {
            name: "general-origin-handoff-session-focused",
            requireText: ["UNIVERFILES", SOURCE_BASENAME, HANDOFF_BASENAME],
            rejectText: ["Something went wrong", "Application error"],
          },
        });
      },
    },
    {
      name: "Replaying the same source lifecycle signal does not duplicate B",
      run: async (ctx) => {
        await ctx.prove("After handoff, the source session's cleared marker prevents duplicate B session creation", {
          action: async () => {
            const opened = await ctx.control("session.open", { sessionId: sourceSessionId });
            ctx.assert(opened?.ok === true, `Unable to reopen source session: ${JSON.stringify(opened)}`);
            const result = await ctx.control("eval.session.apply_univer_lifecycle", {
              event: "univerNew",
              path: HANDOFF_RELATIVE_PATH,
            });
            ctx.assert(result?.ok === true, `Repeated lifecycle action failed: ${JSON.stringify(result)}`);
            ctx.assert(result.lifecycle?.action === "unchanged", `Expected repeated source lifecycle signal to be unchanged: ${JSON.stringify(result)}`);
          },
          assert: async () => {
            const metadata = await waitForCurrentPrimary(ctx, SOURCE_RELATIVE_PATH);
            ctx.assert(!metadata.univerLifecycleOrigin, `Source marker should remain cleared: ${JSON.stringify(metadata)}`);
            const rows = await ctx.waitFor(targetRowsExpression(SOURCE_BASENAME, HANDOFF_BASENAME), {
              timeoutMs: 30_000,
              label: "source row after duplicate prevention",
            });
            ctx.assert(rows.sourceSelected === "true", `Source row should be selected after reopening it: ${JSON.stringify(rows)}`);
            ctx.recordEvidence({
              type: "assertion",
              status: "passed",
              assertion: "Source lifecycle marker is cleared, so the same source signal cannot create another B session.",
              actual: { metadata, rows },
            });
          },
          screenshot: {
            name: "general-origin-source-no-duplicate-handoff",
            requireText: [SOURCE_BASENAME, HANDOFF_BASENAME],
            rejectText: ["Something went wrong", "Application error"],
          },
        });
      },
    },
  ],
};
