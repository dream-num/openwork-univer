/**
 * Workspace files popover: the header exposes a file tree for the current
 * workspace without consuming the right-side artifact/browser rail.
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

const IGNORED_DIRS = new Set([".git", ".next", ".turbo", "build", "dist", "evals", "node_modules", "runs"]);
const FALLBACK_PROBE_FILE = "artifacts/workspace-file-tree-eval.md";

let probeFile = "";

function isPreviewableFile(path) {
  const lower = path.toLowerCase();
  return [
    ".csv", ".gif", ".htm", ".html", ".jpeg", ".jpg", ".md", ".mdx", ".ods",
    ".pdf", ".png", ".ppt", ".pptx", ".svg", ".tsv", ".univer", ".webp",
    ".xls", ".xlsx",
  ].some((ext) => lower.endsWith(ext));
}

async function findProbeFile(root) {
  async function walk(dir, depth) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const sorted = entries
      .filter((entry) => !entry.name.startsWith("."))
      .sort((left, right) => {
        if (left.isFile() !== right.isFile()) return left.isFile() ? -1 : 1;
        return left.name.localeCompare(right.name);
      });

    for (const entry of sorted) {
      if (entry.isFile()) {
        const path = relative(root, join(dir, entry.name)).split(sep).join("/");
        if (isPreviewableFile(path)) return path;
      }
    }

    if (depth >= 2) return "";

    for (const entry of sorted) {
      if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) continue;
      const found = await walk(join(dir, entry.name), depth + 1);
      if (found) return found;
    }

    return "";
  }

  return walk(root, 0);
}

async function ensureProbeFile(root) {
  const existing = await findProbeFile(root);
  if (existing) return existing;

  const absolutePath = join(root, FALLBACK_PROBE_FILE);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, "# OpenWork file tree eval\n", "utf8");
  return FALLBACK_PROBE_FILE;
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

  const hasSession = await ctx.eval("window.__openworkControl.snapshot().route.includes('/session/')");
  if (!hasSession) {
    await ctx.control("session.create_task");
    await ctx.waitFor(
      "window.__openworkControl.snapshot().route.includes('/session/')",
      { timeoutMs: 60_000, label: "new session route" },
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

async function openFilesPopover(ctx) {
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
  await ctx.waitFor(
    `window.__openworkControl.listActions().some((action) => action.id === "eval.workspace.info" && !action.disabled)`,
    { timeoutMs: 30_000, label: "workspace info action enabled" },
  );
}

function rowExpression(relativePath) {
  return `Array.from(document.querySelectorAll("button")).some((button) =>
    button.getAttribute("aria-label") === ${JSON.stringify(`Open ${relativePath}`)}
  )`;
}

function clickRowExpression(relativePath) {
  return `(() => {
    const button = Array.from(document.querySelectorAll("button"))
      .find((item) => item.getAttribute("aria-label") === ${JSON.stringify(`Open ${relativePath}`)});
    if (!button) return false;
    button.click();
    return true;
  })()`;
}

export default {
  id: "workspace-files-popover",
  title: "Workspace files popover shows the current workspace file tree",
  spec: "evals/openable-items-flow.md",
  steps: [
    {
      name: "Open a session and mount the Files popover",
      run: async (ctx) => {
        await ctx.prove("The session header exposes a Files popover for the active local workspace", {
          action: async () => {
            await ensureSession(ctx);
            await openFilesPopover(ctx);
          },
          assert: async () => {
            const info = await ctx.control("eval.workspace.info");
            ctx.assert(info?.ok === true, "Workspace info action did not return ok.");
            ctx.assert(info.isRemoteWorkspace !== true, "This flow requires a local workspace.");
            ctx.assert(typeof info.workspaceRoot === "string" && info.workspaceRoot.length > 0, "Missing workspace root.");
            probeFile = await ensureProbeFile(info.workspaceRoot);
            ctx.log(`probeFile=${probeFile}`);
          },
          screenshot: {
            name: "workspace-files-mounted",
            requireText: ["Files"],
            rejectText: ["Something went wrong"],
          },
        });
      },
    },
    {
      name: "Search the current workspace file tree",
      run: async (ctx) => {
        await ctx.prove("The Files panel lists files from the current workspace catalog", {
          action: async () => {
            await ctx.eval(`(() => {
              const button = Array.from(document.querySelectorAll("button"))
                .find((item) => item.getAttribute("aria-label") === "Refresh files" && !item.disabled);
              button?.click();
              return Boolean(button);
            })()`);
            await ctx.fill('input[placeholder="Search files"]', probeFile);
          },
          assert: async () => {
            await ctx.waitFor(rowExpression(probeFile), {
              timeoutMs: 30_000,
              label: `visible workspace file row ${probeFile}`,
            });
          },
          screenshot: {
            name: "workspace-file-search-result",
            requireText: [probeFile.split("/").pop() ?? probeFile],
            rejectText: ["No files found.", "Workspace is not available.", "Failed to load files."],
          },
        });
      },
    },
    {
      name: "Keep Files state after closing and reopening the popover",
      run: async (ctx) => {
        await ctx.prove("The Files popover preserves search and tree state after closing and reopening", {
          action: async () => {
            const closed = await ctx.waitFor(`(() => {
              const button = Array.from(document.querySelectorAll("button"))
                .find((item) => item.getAttribute("aria-label") === "Workspace files" && !item.disabled);
              if (!button) return false;
              button.click();
              return true;
            })()`, {
              timeoutMs: 30_000,
              label: "close workspace files popover",
            });
            ctx.assert(closed === true, "Could not close the workspace files popover.");
            await ctx.waitFor(`!document.querySelector('input[placeholder="Search files"]')`, {
              timeoutMs: 30_000,
              label: "files popover unmounted",
            });
            await openFilesPopover(ctx);
          },
          assert: async () => {
            const value = await ctx.waitFor(
              `document.querySelector('input[placeholder="Search files"]')?.value || ""`,
              { timeoutMs: 30_000, label: "restored files search input value" },
            );
            ctx.assert(value === probeFile, `Expected restored search value ${probeFile}, got ${value}`);
            await ctx.waitFor(rowExpression(probeFile), {
              timeoutMs: 30_000,
              label: `restored visible workspace file row ${probeFile}`,
            });
          },
          screenshot: {
            name: "workspace-file-state-preserved",
            requireText: [probeFile.split("/").pop() ?? probeFile],
            rejectText: ["No files found.", "Workspace is not available.", "Failed to load files."],
          },
        });
      },
    },
    {
      name: "Open an artifact while keeping the file tree visible",
      run: async (ctx) => {
        await ctx.prove("Opening a previewable file from the popover shows the artifact in the right panel without replacing the file tree", {
          action: async () => {
            const clicked = await ctx.waitFor(clickRowExpression(probeFile), {
              timeoutMs: 30_000,
              label: `click workspace file row ${probeFile}`,
            });
            ctx.assert(clicked === true, `Could not click file row ${probeFile}`);
          },
          assert: async () => {
            await ctx.waitFor(`Boolean(document.querySelector('input[placeholder="Search files"]'))`, {
              timeoutMs: 30_000,
              label: "files popover remains open",
            });
            const name = probeFile.split("/").pop() || probeFile;
            await ctx.waitFor(
              `Array.from(document.querySelectorAll("button")).some((button) =>
                button.getAttribute("aria-label") === ${JSON.stringify(`Select tab: ${name}`)}
              )`,
              { timeoutMs: 30_000, label: `artifact tab selected for ${name}` },
            );
          },
          screenshot: {
            name: "workspace-file-and-artifact-visible",
            requireText: [probeFile.split("/").pop() ?? probeFile],
            rejectText: ["No files found.", "Workspace is not available.", "Failed to load files."],
          },
        });
      },
    },
  ],
};
