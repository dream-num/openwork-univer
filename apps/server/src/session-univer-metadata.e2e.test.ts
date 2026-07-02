import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

const stops: Array<() => void | Promise<void>> = [];
const roots: string[] = [];
const previousRuntimeDb = process.env.OPENWORK_RUNTIME_DB;

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
  if (previousRuntimeDb === undefined) delete process.env.OPENWORK_RUNTIME_DB;
  else process.env.OPENWORK_RUNTIME_DB = previousRuntimeDb;
});

async function createWorkspaceRoot() {
  const root = await mkdtemp(join(tmpdir(), "openwork-session-univer-metadata-"));
  roots.push(root);
  process.env.OPENWORK_RUNTIME_DB = join(root, "runtime.sqlite");
  return root;
}

async function startOpenworkServer(workspaceRoot: string) {
  const port = await getFreePort();
  const config: ServerConfig = {
    host: "127.0.0.1",
    port,
    token: "owt_test_token",
    hostToken: "owt_host_token",
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["*"],
    workspaces: [{ id: "ws_1", name: "Workspace", path: workspaceRoot, preset: "starter", workspaceType: "local" }],
    authorizedRoots: [workspaceRoot],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
  };
  const server = await startServer(config);
  stops.push(() => server.stop());
  return { base: `http://127.0.0.1:${server.port}`, token: config.token };
}

async function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a local test port")));
        return;
      }
      const port = address.port;
      server.close(() => resolvePort(port));
    });
  });
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function json(response: Response) {
  expect(response.status).toBe(200);
  return response.json();
}

describe("session Univer metadata API", () => {
  test("discovers visible workspace .univer targets", async () => {
    const root = await createWorkspaceRoot();
    await mkdir(join(root, "reports"), { recursive: true });
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await mkdir(join(root, ".opencode"), { recursive: true });
    await mkdir(join(root, "dist"), { recursive: true });
    await writeFile(join(root, "reports", "budget.univer"), "visible", "utf8");
    await writeFile(join(root, "node_modules", "pkg", "ignored.univer"), "dependency", "utf8");
    await writeFile(join(root, ".opencode", "hidden.univer"), "hidden", "utf8");
    await writeFile(join(root, "dist", "generated.univer"), "generated", "utf8");
    const { base, token } = await startOpenworkServer(root);

    const discovered = await json(await fetch(`${base}/workspace/ws_1/univer-targets`, { headers: auth(token) }));

    expect(discovered).toMatchObject({
      items: [
        {
          path: "reports/budget.univer",
          name: "budget.univer",
          unitCount: null,
        },
      ],
    });
  });

  test("persists Primary Univer Target and locks accidental reassociation", async () => {
    const root = await createWorkspaceRoot();
    const { base, token } = await startOpenworkServer(root);

    const empty = await json(await fetch(`${base}/workspace/ws_1/session-univer-metadata`, { headers: auth(token) }));
    expect(empty).toMatchObject({ state: { sessions: {} }, updatedAt: null });

    const created = await json(await fetch(`${base}/workspace/ws_1/sessions/ses_1/univer-metadata`, {
      method: "PATCH",
      headers: auth(token),
      body: JSON.stringify({
        primaryUniverTarget: { path: "./reports/budget.univer" },
        sessionUniverWorktreeId: "wt_1",
        univerSessionKind: "task",
      }),
    }));
    expect(created).toMatchObject({
      metadata: {
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
        sessionUniverWorktreeId: "wt_1",
        univerSessionKind: "task",
      },
    });

    const targetSwitch = await fetch(`${base}/workspace/ws_1/sessions/ses_1/univer-metadata`, {
      method: "PATCH",
      headers: auth(token),
      body: JSON.stringify({ primaryUniverTarget: { path: "reports/next.univer" } }),
    });
    expect(targetSwitch.status).toBe(409);

    const worktreeSwitch = await fetch(`${base}/workspace/ws_1/sessions/ses_1/univer-metadata`, {
      method: "PATCH",
      headers: auth(token),
      body: JSON.stringify({ sessionUniverWorktreeId: "wt_2" }),
    });
    expect(worktreeSwitch.status).toBe(409);

    const reassociated = await json(await fetch(`${base}/workspace/ws_1/sessions/ses_1/univer-metadata`, {
      method: "PATCH",
      headers: auth(token),
      body: JSON.stringify({ sessionUniverWorktreeId: "wt_2", allowWorktreeReassociation: true }),
    }));
    expect(reassociated).toMatchObject({
      state: {
        sessions: {
          ses_1: {
            primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
            sessionUniverWorktreeId: "wt_2",
            univerSessionKind: "task",
          },
        },
      },
    });

    const terminal = await json(await fetch(`${base}/workspace/ws_1/sessions/ses_1/univer-metadata`, {
      method: "PATCH",
      headers: auth(token),
      body: JSON.stringify({ sessionUniverWorktreeTerminalState: "merged" }),
    }));
    expect(terminal).toMatchObject({
      state: {
        sessions: {
          ses_1: {
            primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
            sessionUniverWorktreeId: "wt_2",
            sessionUniverWorktreeTerminalState: "merged",
            univerSessionKind: "task",
          },
        },
      },
    });

    const splitIssue = await json(await fetch(`${base}/workspace/ws_1/sessions/ses_2/univer-metadata`, {
      method: "PATCH",
      headers: auth(token),
      body: JSON.stringify({
        primaryUniverTarget: { path: "reports/budget.univer" },
        sessionUniverWorktreeIssue: {
          kind: "multiple",
          worktreeIds: ["wt_a", "wt_b", "wt_a"],
        },
        univerSessionKind: "task",
      }),
    }));
    expect(splitIssue).toMatchObject({
      state: {
        sessions: {
          ses_2: {
            primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
            sessionUniverWorktreeIssue: {
              kind: "multiple",
              worktreeIds: ["wt_a", "wt_b"],
            },
            univerSessionKind: "task",
          },
        },
      },
    });
  });

  test("keeps one Target Overview Session per Primary Univer Target", async () => {
    const root = await createWorkspaceRoot();
    const { base, token } = await startOpenworkServer(root);

    const firstOverview = await json(await fetch(`${base}/workspace/ws_1/sessions/ses_overview_1/univer-metadata`, {
      method: "PATCH",
      headers: auth(token),
      body: JSON.stringify({
        primaryUniverTarget: { path: "reports/budget.univer" },
        univerSessionKind: "overview",
      }),
    }));
    expect(firstOverview).toMatchObject({
      metadata: {
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
        univerSessionKind: "overview",
      },
    });

    const taskForSameTarget = await json(await fetch(`${base}/workspace/ws_1/sessions/ses_task/univer-metadata`, {
      method: "PATCH",
      headers: auth(token),
      body: JSON.stringify({
        primaryUniverTarget: { path: "reports/budget.univer" },
        univerSessionKind: "task",
      }),
    }));
    expect(taskForSameTarget).toMatchObject({
      metadata: {
        primaryUniverTarget: { path: "reports/budget.univer", name: "budget.univer" },
        univerSessionKind: "task",
      },
    });

    const duplicateOverview = await fetch(`${base}/workspace/ws_1/sessions/ses_overview_2/univer-metadata`, {
      method: "PATCH",
      headers: auth(token),
      body: JSON.stringify({
        primaryUniverTarget: { path: "./reports/budget.univer" },
        univerSessionKind: "overview",
      }),
    });
    expect(duplicateOverview.status).toBe(409);

    const otherTargetOverview = await json(await fetch(`${base}/workspace/ws_1/sessions/ses_overview_3/univer-metadata`, {
      method: "PATCH",
      headers: auth(token),
      body: JSON.stringify({
        primaryUniverTarget: { path: "reports/next.univer" },
        univerSessionKind: "overview",
      }),
    }));
    expect(otherTargetOverview).toMatchObject({
      metadata: {
        primaryUniverTarget: { path: "reports/next.univer", name: "next.univer" },
        univerSessionKind: "overview",
      },
    });
  });
});
