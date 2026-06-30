/**
 * Real agent E2E: the user asks for a Mainland China payroll sheet and OpenWork
 * should produce a native .univer artifact, then open it in the embedded Univer surface.
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const USER_REQUEST = "制作一个中国大陆工资表";
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", ".turbo", ".next", "evals", "runs"]);

let workspaceRoot = "";
let startedAt = 0;
let payrollArtifact = "";
let payrollUnitSummary = "";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runUniver(args, cwd, env = {}) {
  const mergedEnv = { ...process.env, ...env, UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT: cwd };
  return execFileAsync("univer", args, {
    cwd,
    env: mergedEnv,
    timeout: 90_000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function isDaemonBuildMismatch(error) {
  return /Daemon build mismatch/i.test(`${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? ""}`);
}

async function startUniverDaemon(cwd) {
  try {
    await runUniver(["daemon", "start"], cwd);
  } catch (error) {
    if (!isDaemonBuildMismatch(error)) throw error;
    await runUniver(["daemon", "stop"], cwd).catch(() => undefined);
    await runUniver(["daemon", "start"], cwd);
  }
}

async function listUniverFiles(root) {
  const files = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".univer")) continue;
      const absolutePath = join(dir, entry.name);
      const fileStat = await stat(absolutePath);
      files.push({
        absolutePath,
        relativePath: relative(root, absolutePath).split(sep).join("/"),
        mtimeMs: fileStat.mtimeMs,
        size: fileStat.size,
      });
    }
  }
  await walk(root);
  return files;
}

async function runInspect(univerfile, tool, params) {
  const tempRoot = await mkdtemp(join(tmpdir(), "openwork-univer-payroll-inspect-"));
  const paramsPath = join(tempRoot, "params.json");
  await writeFile(paramsPath, JSON.stringify(params), "utf8");
  const { stdout } = await runUniver(["inspect", univerfile, "--tool", tool, "--params", paramsPath], workspaceRoot);
  return JSON.parse(stdout);
}

async function inspectNativePayrollArtifact(absolutePath) {
  await startUniverDaemon(workspaceRoot);
  const units = await runInspect(absolutePath, "units", {});
  const sheetUnit = units?.evidence?.units?.find((unit) => unit?.type === "sheet" && typeof unit.localUnitId === "string");
  if (!sheetUnit) {
    throw new Error(`No sheet unit found in ${absolutePath}: ${JSON.stringify(units).slice(0, 1200)}`);
  }

  payrollUnitSummary = `${sheetUnit.type}:${sheetUnit.localUnitId}`;
  return { units, sheetUnit };
}

async function waitForNewUniverFile(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastSeen = [];
  while (Date.now() < deadline) {
    lastSeen = await listUniverFiles(workspaceRoot);
    const candidates = lastSeen
      .filter((file) => file.mtimeMs >= startedAt - 1000 && file.size > 0)
      .sort((left, right) => right.mtimeMs - left.mtimeMs);
    for (const candidate of candidates) {
      await inspectNativePayrollArtifact(candidate.absolutePath);
      return candidate;
    }
    await sleep(3000);
  }
  throw new Error(`No valid new .univer payroll file appeared. Seen .univer files: ${JSON.stringify(lastSeen.map((file) => file.relativePath))}`);
}

async function waitForAgentIdle(ctx, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let sawRunning = false;
  while (Date.now() < deadline) {
    await ctx.eval(`(() => {
      const labels = ["Allow for session", "Allow once"];
      for (const label of labels) {
        const button = Array.from(document.querySelectorAll("button"))
          .find((candidate) => candidate.textContent?.trim() === label && !candidate.disabled);
        if (button) button.click();
      }
      return true;
    })()`);
    const running = await ctx.eval(`window.__openworkControl.listActions().some((action) => action.id === "composer.stop" && !action.disabled)`);
    if (running) sawRunning = true;
    if (sawRunning && !running) return;
    await sleep(1000);
  }
  throw new Error("Timed out waiting for the agent run to finish.");
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

  await ctx.control("session.create_task");
  await ctx.waitFor(
    "window.__openworkControl.snapshot().route.includes('/session/')",
    { timeoutMs: 60_000, label: "new session route" },
  );

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
    const infoReady = window.__openworkControl.listActions()
      .some((action) => action.id === "eval.workspace.info" && !action.disabled);
    if (infoReady) return "already-ready";
    const button = Array.from(document.querySelectorAll("button"))
      .find((item) => item.getAttribute("aria-label") === "Browser" && !item.disabled);
    button?.click();
    return button ? "clicked-browser" : "no-button";
  })()`);
  await ctx.waitFor(
    `window.__openworkControl.listActions().some((action) => action.id === "eval.workspace.info" && !action.disabled)`,
    { timeoutMs: 30_000, label: "workspace info action enabled" },
  );
}

function encodedArtifactNeedle() {
  return payrollArtifact.split("/").map(encodeURIComponent).join("%2F");
}

export default {
  id: "univer-agent-mainland-china-payroll",
  title: "Agent creates a native .univer Mainland China payroll sheet",
  spec: "openspec/changes/introduce-univer-office-extension/specs/native-univer-office-surface/spec.md",
  steps: [
    {
      name: "Open a fresh session in a local workspace",
      run: async (ctx) => {
        await ctx.prove("A local OpenWork session is ready for the exact payroll request", {
          action: async () => {
            await ensureSessionAndSidePanel(ctx);
          },
          assert: async () => {
            const info = await ctx.control("eval.workspace.info");
            ctx.assert(info?.ok === true, "Workspace info action did not return ok.");
            ctx.assert(info.isRemoteWorkspace !== true, "This E2E requires a local workspace.");
            ctx.assert(typeof info.workspaceRoot === "string" && info.workspaceRoot.length > 0, "Missing workspace root.");
            workspaceRoot = info.workspaceRoot;
            startedAt = Date.now();
            await mkdir(dirname(join(workspaceRoot, "artifacts", ".keep")), { recursive: true });
            await startUniverDaemon(workspaceRoot);
            ctx.log(`workspaceRoot=${workspaceRoot}`);
          },
          screenshot: {
            name: "payroll-session-ready",
            rejectText: ["Something went wrong"],
          },
        });
      },
    },
    {
      name: "Send the exact user request",
      run: async (ctx) => {
        await ctx.prove("The user sends exactly: 制作一个中国大陆工资表", {
          action: async () => {
            await ctx.waitFor(
              `window.__openworkControl.listActions().some((action) => action.id === "composer.set_text" && !action.disabled)`,
              { timeoutMs: 30_000, label: "composer.set_text enabled" },
            );
            await ctx.control("composer.set_text", { text: USER_REQUEST });
            await ctx.waitForText(USER_REQUEST, { timeoutMs: 15_000 });
            await ctx.control("composer.send");
          },
          assert: async () => {
            await ctx.waitForText(USER_REQUEST, { timeoutMs: 15_000 });
          },
          screenshot: {
            name: "payroll-request-sent",
            requireText: [USER_REQUEST],
            rejectText: ["Something went wrong"],
          },
        });
      },
    },
    {
      name: "Agent produces a payroll .univer artifact",
      run: async (ctx) => {
        await ctx.prove("The real agent run creates a valid native .univer spreadsheet artifact", {
          action: async () => {
            await waitForAgentIdle(ctx, 360_000);
            const created = await waitForNewUniverFile(180_000);
            payrollArtifact = created.relativePath;
            ctx.log(`payrollArtifact=${payrollArtifact}`);
            ctx.log(`payrollUnit=${payrollUnitSummary}`);
          },
          assert: async () => {
            const transcript = await ctx.control("session.read_transcript", { count: 8 });
            const text = JSON.stringify(transcript);
            ctx.assert(text.includes(".univer"), `Transcript did not mention a .univer artifact: ${text}`);
            ctx.assert(payrollArtifact.endsWith(".univer"), `Expected a .univer artifact, got ${payrollArtifact}`);
            ctx.assert(payrollUnitSummary.startsWith("sheet:"), `Generated .univer did not expose a sheet unit: ${payrollUnitSummary}`);
          },
          screenshot: {
            name: "payroll-agent-result",
            requireText: [".univer"],
            rejectText: ["Something went wrong", "Setup failed"],
          },
        });
      },
    },
    {
      name: "Open the payroll artifact in embedded Univer",
      run: async (ctx) => {
        await ctx.prove("The generated payroll .univer artifact opens in OpenWork's embedded Univer surface", {
          action: async () => {
            await ctx.waitFor(
              `(() => {
                const button = Array.from(document.querySelectorAll("button"))
                  .find((item) => (item.getAttribute("aria-label") || "").startsWith("Artifacts (") && !item.disabled);
                return Boolean(button);
              })()`,
              { timeoutMs: 60_000, label: "artifact rail button enabled" },
            );
            const clicked = await ctx.eval(`(() => {
              const button = Array.from(document.querySelectorAll("button"))
                .find((item) => (item.getAttribute("aria-label") || "").startsWith("Artifacts (") && !item.disabled);
              if (!button) return "missing";
              button.click();
              return button.getAttribute("aria-label");
            })()`);
            ctx.assert(typeof clicked === "string" && clicked.startsWith("Artifacts ("), `Artifact rail click failed: ${clicked}`);

            const tabClicked = await ctx.waitFor(
              `(() => {
                const expected = ${JSON.stringify(basename(payrollArtifact))};
                const button = Array.from(document.querySelectorAll("button"))
                  .find((item) => (item.getAttribute("aria-label") || "").includes(expected) && !item.disabled);
                if (!button) return false;
                button.click();
                return true;
              })()`,
              { timeoutMs: 60_000, label: "generated payroll artifact tab" },
            );
            ctx.assert(tabClicked === true, `Could not select artifact tab for ${payrollArtifact}`);
            await ctx.waitFor(
              `(() => {
                const iframe = document.querySelector('iframe[data-testid="univer-collab-surface"]');
                if (!iframe) return false;
                const rect = iframe.getBoundingClientRect();
                const url = new URL(iframe.src);
                return rect.width > 200
                  && rect.height > 200
                  && iframe.src.includes(${JSON.stringify(encodedArtifactNeedle())})
                  && url.searchParams.get("mode") === "embedded";
              })()`,
              { timeoutMs: 90_000, label: "payroll Univer iframe" },
            );
            await ctx.eval("new Promise((resolve) => setTimeout(resolve, 5000))", { awaitPromise: true });
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
                mode: url.searchParams.get("mode"),
                title: iframe.title,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                bodyText: document.body.innerText,
              };
            })()`);
            ctx.assert(result.ok, result.reason || "Univer iframe not found.");
            ctx.assert(/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):/.test(result.src), `Expected local iframe URL, got ${result.src}`);
            ctx.assert(result.src.includes(encodedArtifactNeedle()), `Iframe URL does not target ${payrollArtifact}: ${result.src}`);
            ctx.assert(result.mode === "embedded", `Iframe URL did not request embedded mode: ${result.src}`);
            ctx.assert(result.width > 200 && result.height > 200, `Iframe is not visibly sized (${result.width}x${result.height}).`);
            ctx.assert(!/Failed to open Univer preview|Setup incomplete|remote workspaces only/i.test(result.bodyText), "OpenWork displayed a Univer preview error.");
            const response = await fetch(result.src);
            ctx.assert(response.ok, `Iframe URL was not reachable: ${response.status} ${result.src}`);
            ctx.log(`iframe=${result.width}x${result.height} ${result.src}`);
          },
          screenshot: {
            name: "payroll-univer-surface",
            rejectText: ["Failed to open Univer preview", "Setup incomplete", "remote workspaces only"],
          },
        });
      },
    },
  ],
};
