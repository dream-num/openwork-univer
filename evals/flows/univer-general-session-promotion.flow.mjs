/**
 * General Session -> Univerfile task lifecycle.
 *
 * Proves that a General Session can be promoted through the server-owned
 * Univer lifecycle API, that the sidebar moves the session under the created
 * Univerfile row, and that a bound session does not rebind or redirect when a
 * second `.univer` creation signal is reported.
 */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const RUN_SUFFIX = Date.now().toString(36);
const PRIMARY_BASENAME = `general-promotion-${RUN_SUFFIX}.univer`;
const SECONDARY_BASENAME = `ignored-bound-target-${RUN_SUFFIX}.univer`;
const PRIMARY_RELATIVE_PATH = `artifacts/${PRIMARY_BASENAME}`;
const SECONDARY_RELATIVE_PATH = `artifacts/${SECONDARY_BASENAME}`;
let evalWorkspaceRoot = "";
let generalCountBeforePromotion = 0;

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

function workspaceIdForPath(path) {
  return `ws_${createHash("sha256").update(resolve(path)).digest("hex").slice(0, 12)}`;
}

async function activateTemporaryWorkspace(ctx, workspaceRoot) {
  const workspaceId = workspaceIdForPath(workspaceRoot);
  await ctx.waitFor(
    "window.__openworkControl.listActions().some((action) => action.id === 'workspace.activate' && !action.disabled)",
    { timeoutMs: 30_000, label: "workspace.activate action" },
  );
  await ctx.control("workspace.activate", { id: workspaceId });
  await ctx.waitFor(`(() => {
    const route = window.__openworkControl.snapshot().route || "";
    return route.includes(${JSON.stringify(`/workspace/${workspaceId}/session`)});
  })()`, {
    timeoutMs: 60_000,
    label: "activated temporary workspace route",
  });
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
  ctx.log(`workspace.create did not return success; trying activation recovery: ${lastError ?? "unknown error"}`);
  await activateTemporaryWorkspace(ctx, workspaceRoot);
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

  evalWorkspaceRoot = await mkdtemp(join(tmpdir(), "openwork-univer-general-promotion-"));
  await createTemporaryWorkspace(ctx, evalWorkspaceRoot);
  await ctx.waitFor(`(() => {
    const route = window.__openworkControl.snapshot().route || "";
    return route.includes("/session/");
  })()`, {
    timeoutMs: 60_000,
    label: "fresh temporary workspace session route",
  });
  await ctx.waitFor(`(() => {
    const actions = window.__openworkControl.listActions();
    return actions.some((action) => action.id === "eval.workspace.info" && !action.disabled) &&
      actions.some((action) => action.id === "eval.session.current_univer_metadata" && !action.disabled);
  })()`, {
    timeoutMs: 30_000,
    label: "temporary workspace eval controls",
  });
  await waitForSelectedWorkspaceRoot(ctx, evalWorkspaceRoot);
  const metadata = await currentUniverMetadata(ctx).catch(() => null);
  if (!metadata?.ok || metadata.primaryUniverTarget) {
    await ctx.control("session.create_task");
    await waitForCurrentGeneralSession(ctx);
  }
  const generalHeader = await ctx.waitFor(sectionHeaderExpression("General Sessions"), {
    timeoutMs: 30_000,
    label: "General Sessions section in temporary workspace",
  });
  if (generalHeader.count < 1) {
    await ctx.control("session.create_task");
    await waitForCurrentGeneralSession(ctx);
    await ctx.waitFor(`(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const button = buttons.find((candidate) => (candidate.textContent || "").toLowerCase().includes("general sessions"));
      if (!button) return false;
      const spans = Array.from(button.querySelectorAll("span"));
      const count = Number.parseInt(spans.at(-1)?.textContent?.trim() ?? "", 10);
      return count > 0;
    })()`, {
      timeoutMs: 30_000,
      label: "visible General Session after explicit create",
    });
  }
  await closeBlockingDialogs(ctx);
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
  await writeFile(absolutePath, "OpenWork Univer lifecycle fraimz probe\n", "utf8");
  return absolutePath;
}

async function currentUniverMetadata(ctx) {
  const metadata = await ctx.control("eval.session.current_univer_metadata");
  if (!metadata?.ok) {
    throw new Error(`Unable to read current Univer metadata: ${JSON.stringify(metadata)}`);
  }
  return metadata;
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

async function waitForCurrentPrimary(ctx, expectedPath) {
  const expression = `(() => {
    const control = window.__openworkControl;
    return control.listActions().some((action) => action.id === "eval.session.current_univer_metadata" && !action.disabled);
  })()`;
  await ctx.waitFor(expression, { timeoutMs: 30_000, label: "metadata action after promotion" });
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

function targetRowExpression(targetName) {
  return `(() => {
    const targetName = ${JSON.stringify(targetName)};
    const rows = Array.from(document.querySelectorAll("div")).filter((element) =>
      String(element.className).includes("group/univer-target-row") &&
      (element.innerText || "").includes(targetName)
    );
    const row = rows[0];
    if (!row) return null;
    row.scrollIntoView({ block: "center", inline: "nearest" });
    const sectionText = document.body.innerText || "";
    return {
      targetName,
      rowText: row.innerText || "",
      hasUniverfilesSection: sectionText.includes("UNIVERFILES") || sectionText.includes("Univerfiles"),
      hasGeneralSection: sectionText.includes("GENERAL SESSIONS") || sectionText.includes("General Sessions"),
      hasUnavailableSection: sectionText.includes("UNAVAILABLE UNIVERFILES") || sectionText.includes("Unavailable Univerfiles"),
    };
  })()`;
}

function sectionHeaderExpression(label) {
  return `(() => {
    const label = ${JSON.stringify(label)};
    const buttons = Array.from(document.querySelectorAll("button"));
    const button = buttons.find((candidate) => {
      const text = candidate.textContent || "";
      return text.toLowerCase().includes(label.toLowerCase());
    });
    if (!button) return null;
    button.scrollIntoView({ block: "center", inline: "nearest" });
    const spans = Array.from(button.querySelectorAll("span"));
    const countText = spans.at(-1)?.textContent?.trim() ?? "";
    return {
      label,
      text: button.textContent || "",
      countText,
      count: Number.parseInt(countText, 10),
      expanded: button.getAttribute("aria-expanded"),
    };
  })()`;
}

function sidebarHierarchyExpression(primaryName, secondaryName) {
  return `(() => {
    const primaryName = ${JSON.stringify(primaryName)};
    const secondaryName = ${JSON.stringify(secondaryName)};
    const tree = document.querySelector('[data-sidebar="session-nav-tree"]');
    const sections = Array.from(document.querySelectorAll('[data-sidebar="session-nav-section"]'));
    const sectionEntries = sections.map((section, index) => {
      const header = section.querySelector('[data-sidebar="session-group-separator"]');
      const body = section.querySelector('[data-sidebar="session-nav-section-body"]');
      const headerRect = header?.getBoundingClientRect();
      const bodyRect = body?.getBoundingClientRect();
      return {
        index,
        label: section.getAttribute("data-section") || "",
        empty: section.getAttribute("data-empty") === "true",
        expanded: header?.getAttribute("aria-expanded") || "",
        headerText: header?.textContent || "",
        headerLeft: headerRect?.left ?? null,
        bodyLeft: bodyRect?.left ?? null,
      };
    });
    const sectionByLabel = new Map(sectionEntries.map((entry) => [entry.label, entry]));
    const univerfilesSection = sections.find((section) => section.getAttribute("data-section") === "Univerfiles");
    const unavailableSection = sections.find((section) => section.getAttribute("data-section") === "Unavailable Univerfiles");
    const univerRows = Array.from(univerfilesSection?.querySelectorAll('[data-sidebar="univerfile-row"]') ?? []);
    const primaryRow = univerRows.find((row) => (row.textContent || "").includes(primaryName));
    const secondaryRow = univerRows.find((row) => (row.textContent || "").includes(secondaryName));
    const primaryTreeRow = primaryRow?.closest('[data-sidebar="univerfile-tree-row"]');
    const taskRow = primaryTreeRow?.querySelector('[data-sidebar="univerfile-task-list"] [data-sidebar="menu-sub-button"]');
    const taskLabel = Array.from(taskRow?.querySelectorAll("span") ?? []).find((span) =>
      (span.textContent || "").trim().length > 0
    );
    const primaryRect = primaryRow?.getBoundingClientRect();
    const secondaryRect = secondaryRow?.getBoundingClientRect();
    const taskRect = taskRow?.getBoundingClientRect();
    const taskLabelRect = taskLabel?.getBoundingClientRect();
    const unavailableRect = unavailableSection?.getBoundingClientRect();
    const general = sectionByLabel.get("General Sessions");
    const univerfiles = sectionByLabel.get("Univerfiles");
    const unavailable = sectionByLabel.get("Unavailable Univerfiles");
    const univerfilesHeaderLeft = typeof univerfiles?.headerLeft === "number" ? univerfiles.headerLeft : null;
    const rowBeforeUnavailable = univerRows.every((row) =>
      Boolean(unavailableSection && (row.compareDocumentPosition(unavailableSection) & Node.DOCUMENT_POSITION_FOLLOWING))
    );
    const sectionOrder = sectionEntries.map((entry) => entry.label);
    const fileIconWrap = primaryTreeRow?.querySelector('.${"flex size-5".split(" ").join(".")}');
    const unavailableRows = unavailableSection
      ? Array.from(unavailableSection.querySelectorAll('[data-sidebar="univerfile-row"]')).length
      : null;
    return {
      hasTree: Boolean(tree),
      sectionOrder,
      general,
      univerfiles,
      unavailable,
      rowBeforeUnavailable,
      primaryInsideUniverfiles: Boolean(primaryRow && univerfilesSection?.contains(primaryRow)),
      secondaryInsideUniverfiles: Boolean(secondaryRow && univerfilesSection?.contains(secondaryRow)),
      primarySelected: primaryRow?.getAttribute("aria-selected") || "",
      primaryDiscovered: primaryRow?.getAttribute("data-discovered") || "",
      primaryIndent: primaryRect && univerfilesHeaderLeft !== null ? primaryRect.left - univerfilesHeaderLeft : null,
      secondaryIndent: secondaryRect && univerfilesHeaderLeft !== null ? secondaryRect.left - univerfilesHeaderLeft : null,
      taskIndent: taskRect && primaryRect ? taskRect.left - primaryRect.left : null,
      taskTextIndent: taskLabelRect && primaryRect ? taskLabelRect.left - primaryRect.left : null,
      unavailableTop: unavailableRect?.top ?? null,
      primaryBottom: primaryRect?.bottom ?? null,
      secondaryBottom: secondaryRect?.bottom ?? null,
      unavailableRows,
      fileIconVisible: Boolean(fileIconWrap),
    };
  })()`;
}

export default {
  id: "univer-general-session-promotion",
  title: "General Session promotes to a Univerfile task only while unbound",
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
        await ctx.prove("The user starts in an unbound General Session", {
          action: async () => {
            await ensureFreshGeneralSession(ctx);
          },
          assert: async () => {
            const info = await ctx.control("eval.workspace.info");
            ctx.assert(info?.ok === true, `Missing workspace info: ${JSON.stringify(info)}`);
            ctx.assert(info.isRemoteWorkspace !== true, "This flow requires a local workspace.");
            ctx.assert(typeof info.workspaceRoot === "string" && info.workspaceRoot.length > 0, "Missing workspace root.");
            ctx.assert(info.workspaceRoot === evalWorkspaceRoot, `Flow is not in the temporary workspace: ${JSON.stringify(info)}`);
            await ensureWorkspaceFile(info.workspaceRoot, PRIMARY_RELATIVE_PATH);
            await ensureWorkspaceFile(info.workspaceRoot, SECONDARY_RELATIVE_PATH);
            const metadata = await currentUniverMetadata(ctx);
            ctx.assert(!metadata.primaryUniverTarget, `Fresh session should be General: ${JSON.stringify(metadata)}`);
            const generalHeader = await ctx.waitFor(sectionHeaderExpression("General Sessions"), {
              timeoutMs: 30_000,
              label: "General Sessions section before promotion",
            });
            generalCountBeforePromotion = generalHeader.count;
            ctx.assert(generalCountBeforePromotion > 0, `Temporary workspace should have a General Session to promote: ${JSON.stringify(generalHeader)}`);
            ctx.log(`workspaceRoot=${info.workspaceRoot}`);
            ctx.log(`generalCountBeforePromotion=${generalCountBeforePromotion}`);
          },
          screenshot: { name: "general-session-before-promotion", requireText: ["GENERAL SESSIONS"], rejectText: ["Something went wrong", "Application error"] },
        });
      },
    },
    {
      name: "Promote the General Session through univer new lifecycle",
      run: async (ctx) => {
        await ctx.prove("The server lifecycle promotion moves the session under the new Univerfile row", {
          action: async () => {
            const result = await ctx.control("eval.session.apply_univer_lifecycle", {
              event: "univerNew",
              path: PRIMARY_RELATIVE_PATH,
            });
            ctx.assert(result?.ok === true, `Lifecycle action failed: ${JSON.stringify(result)}`);
            ctx.assert(result.lifecycle?.action === "promoted", `Expected promoted lifecycle action: ${JSON.stringify(result)}`);
          },
          assert: async () => {
            const metadata = await waitForCurrentPrimary(ctx, PRIMARY_RELATIVE_PATH);
            ctx.assert(metadata.primaryUniverTarget?.name === PRIMARY_BASENAME, `Wrong Primary Univerfile name: ${JSON.stringify(metadata)}`);
            const row = await ctx.waitFor(targetRowExpression(PRIMARY_BASENAME), {
              timeoutMs: 30_000,
              label: "promoted Univerfile row",
            });
            const generalHeader = await ctx.waitFor(sectionHeaderExpression("General Sessions"), {
              timeoutMs: 30_000,
              label: "empty General Sessions section after promotion",
            });
            ctx.assert(generalHeader.count === generalCountBeforePromotion - 1, `General Sessions count should decrease after promotion while the section remains visible: ${JSON.stringify({ before: generalCountBeforePromotion, after: generalHeader })}`);
            if (generalCountBeforePromotion === 1) {
              ctx.assert(generalHeader.count === 0, `General Sessions section should remain visible with count 0: ${JSON.stringify(generalHeader)}`);
            }
            ctx.assert(row.hasUniverfilesSection, `Univerfiles section missing after promotion: ${JSON.stringify(row)}`);
            ctx.assert(row.hasGeneralSection, `General Sessions section should remain visible: ${JSON.stringify(row)}`);
            ctx.assert(row.hasUnavailableSection, `Unavailable Univerfiles section should remain visible: ${JSON.stringify(row)}`);
            const hierarchy = await ctx.waitFor(sidebarHierarchyExpression(PRIMARY_BASENAME, SECONDARY_BASENAME), {
              timeoutMs: 30_000,
              label: "sidebar hierarchy",
            });
            ctx.assert(hierarchy.hasTree, `Missing Session Navigation Tree: ${JSON.stringify(hierarchy)}`);
            ctx.assert(
              hierarchy.sectionOrder.indexOf("General Sessions") < hierarchy.sectionOrder.indexOf("Univerfiles") &&
                hierarchy.sectionOrder.indexOf("Univerfiles") < hierarchy.sectionOrder.indexOf("Unavailable Univerfiles"),
              `Session Navigation Sections are not in the expected order: ${JSON.stringify(hierarchy)}`,
            );
            ctx.assert(hierarchy.primaryInsideUniverfiles, `Primary Univerfile row is not inside the Univerfiles section: ${JSON.stringify(hierarchy)}`);
            ctx.assert(hierarchy.secondaryInsideUniverfiles, `Secondary visible Univerfile row is not inside the Univerfiles section: ${JSON.stringify(hierarchy)}`);
            ctx.assert(hierarchy.rowBeforeUnavailable, `Visible Univerfile rows should render before Unavailable Univerfiles: ${JSON.stringify(hierarchy)}`);
            ctx.assert(hierarchy.primarySelected === "true", `Selected state should stay on the active Univerfile row: ${JSON.stringify(hierarchy)}`);
            ctx.assert(hierarchy.primaryDiscovered === "true", `Visible Univerfile row should be marked discovered: ${JSON.stringify(hierarchy)}`);
            ctx.assert(hierarchy.primaryIndent >= 12, `Univerfile rows should be indented under their section: ${JSON.stringify(hierarchy)}`);
            ctx.assert(hierarchy.taskTextIndent >= 16, `Task text should be indented under the owning Univerfile row: ${JSON.stringify(hierarchy)}`);
            ctx.assert(hierarchy.fileIconVisible, `Univerfile row should use file-specific icon treatment: ${JSON.stringify(hierarchy)}`);
            if (hierarchy.unavailable?.empty) {
              ctx.assert(hierarchy.unavailable.expanded === "false", `Empty Unavailable Univerfiles should stay collapsed: ${JSON.stringify(hierarchy)}`);
              ctx.assert(hierarchy.unavailableRows === 0, `Empty Unavailable Univerfiles should not show filler rows: ${JSON.stringify(hierarchy)}`);
            }
            ctx.recordEvidence({
              type: "assertion",
              status: "passed",
              assertion: "General Session promotion returns task metadata and the sidebar shows a contiguous Session Navigation Tree.",
              actual: { metadata, generalHeader, row, hierarchy },
            });
          },
          screenshot: {
            name: "promoted-under-univerfile-row",
            requireText: ["GENERAL SESSIONS", "UNIVERFILES", "UNAVAILABLE UNIVERFILES", PRIMARY_BASENAME, SECONDARY_BASENAME],
            rejectText: ["Something went wrong", "Application error"],
          },
        });
      },
    },
    {
      name: "Bound session ignores another Univerfile creation lifecycle signal",
      run: async (ctx) => {
        await ctx.prove("A bound session does not switch or redirect on a second Primary Univerfile signal", {
          action: async () => {
            const result = await ctx.control("eval.session.apply_univer_lifecycle", {
              event: "univerNew",
              path: SECONDARY_RELATIVE_PATH,
            });
            ctx.assert(result?.ok === true, `Second lifecycle action failed: ${JSON.stringify(result)}`);
            ctx.assert(result.lifecycle?.action === "unchanged", `Expected unchanged lifecycle action: ${JSON.stringify(result)}`);
          },
          assert: async () => {
            const metadata = await waitForCurrentPrimary(ctx, PRIMARY_RELATIVE_PATH);
            ctx.assert(metadata.primaryUniverTarget?.path === PRIMARY_RELATIVE_PATH, `Primary target changed unexpectedly: ${JSON.stringify(metadata)}`);
            const row = await ctx.waitFor(targetRowExpression(PRIMARY_BASENAME), {
              timeoutMs: 30_000,
              label: "original Univerfile row after ignored bound signal",
            });
            ctx.assert(row.rowText.includes(PRIMARY_BASENAME), `Original Univerfile row missing: ${JSON.stringify(row)}`);
            ctx.recordEvidence({
              type: "assertion",
              status: "passed",
              assertion: "Bound-session lifecycle signal returns unchanged and keeps the original Primary Univerfile.",
              actual: { metadata, row },
            });
            await ctx.eval(`(() => {
              const tree = document.querySelector('[data-sidebar="session-nav-tree"]');
              if (tree) tree.scrollTop += 24;
              return true;
            })()`);
          },
          screenshot: {
            name: "bound-session-second-target-ignored",
            requireText: [PRIMARY_BASENAME],
            rejectText: ["Something went wrong", "Application error"],
            allowDuplicate: true,
          },
        });
      },
    },
  ],
};
