import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { listExperimentalExtensionActions } from "./index.js";
import {
  callUniverCliExtensionAction,
  inspectUniverSkillPackage,
  UNIVER_CLI_EXTENSION_ID,
  univerCliManagedExecutablePath,
  univerCliManagedRuntimeEnv,
  univerCliSetupStatus,
} from "./univer-cli.js";
import { createManagedOpencodeServer } from "../managed-opencode.js";
import type { ServerConfig } from "../types.js";

const roots: string[] = [];

afterEach(async () => {
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "openwork-univer-cli-"));
  roots.push(root);
  return root;
}

function serverConfig(root: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    token: "token",
    hostToken: "host-token",
    configPath: join(root, "server.json"),
    approval: { mode: "auto", timeoutMs: 0 },
    corsOrigins: [],
    workspaces: [{ id: "ws_1", name: "Workspace", path: root, preset: "starter", workspaceType: "local" }],
    authorizedRoots: [root],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "generated",
    hostTokenSource: "generated",
    logFormat: "pretty",
    logRequests: false,
  };
}

async function writeCompleteSkillPackage(root: string): Promise<void> {
  const skillDir = join(root, ".opencode", "skills", "univer-cli");
  await mkdir(join(skillDir, "references"), { recursive: true });
  await mkdir(join(skillDir, "inspect-tools"), { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), "---\nname: univer-cli\n---\n# Univer CLI\n", "utf8");
  await writeFile(join(skillDir, "references", "evidence-tools.md"), "# Evidence tools\n", "utf8");
  await writeFile(join(skillDir, "inspect-tools", "tools.manifest.json"), "{\"tools\":[]}\n", "utf8");
  await writeFile(join(skillDir, ".openwork-univer-cli.json"), JSON.stringify({
    source: { owner: "dream-num", repo: "skills", ref: "main" },
    skill: "univer-cli",
  }) + "\n", "utf8");
}

async function writeFakeUniver(root: string): Promise<string> {
  const bin = join(root, "fake-univer");
  await writeFile(bin, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "univer 0.0.0-test"
  exit 0
fi
if [ "$1" = "inspect" ] && [ "$2" = "tools" ] && [ "$3" = "list" ] && [ "$4" = "--json" ]; then
  echo '{"tools":[]}'
  exit 0
fi
if [ "$1" = "sac" ] && [ "$2" = "migration" ] && [ "$3" = "templates" ] && [ "$4" = "--json" ]; then
  echo '{"templates":[]}'
  exit 0
fi
if [ "$1" = "daemon" ] && [ "$2" = "start" ]; then
  marker="$0.mismatch-once"
  if [ -f "$marker" ]; then
    rm -f "$marker"
    echo "ERROR CLI_ERROR" >&2
    echo "Daemon build mismatch. Expected new-build, got old-build. Run \`univer daemon stop\` and retry." >&2
    exit 1
  fi
  echo "univer daemon: started"
  exit 0
fi
if [ "$1" = "daemon" ] && [ "$2" = "stop" ]; then
  echo "univer daemon: stopped"
  exit 0
fi
if [ "$1" = "open" ]; then
  source="$2"
  worktree=""
  unit=""
  shift 2
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "--worktree" ]; then
      shift
      worktree="$1"
    elif [ "$1" = "--unit" ]; then
      shift
      unit="$1"
    fi
    shift
  done
  if [ -n "$worktree" ] && [ -n "$unit" ]; then
    printf '{"ok":true,"url":"http://127.0.0.1:5180/?file=%s&worktree=%s&unit=%s","viewerUrl":"http://127.0.0.1:5180/","univerfile":"%s","worktreeId":"%s","unitId":"%s"}\n' "$source" "$worktree" "$unit" "$source" "$worktree" "$unit"
    exit 0
  fi
  printf '{"ok":true,"url":"http://127.0.0.1:5180/?file=%s","viewerUrl":"http://127.0.0.1:5180/","univerfile":"%s"}\n' "$source" "$source"
  exit 0
fi
echo "unsupported $*" >&2
exit 2
`, "utf8");
  await chmod(bin, 0o755);
  return bin;
}

async function writeFakeOpencode(root: string): Promise<string> {
  const bin = join(root, "fake-opencode");
  await writeFile(bin, `#!/bin/sh
univer --version >/dev/null || exit 42
echo "opencode server listening on http://127.0.0.1:48765"
while true; do sleep 1; done
`, "utf8");
  await chmod(bin, 0o755);
  return bin;
}

async function writeFakeNpm(root: string): Promise<string> {
  const binDir = join(root, "fake-npm-bin");
  await mkdir(binDir, { recursive: true });
  const bin = join(binDir, "npm");
  await writeFile(bin, `#!/bin/sh
if [ "$1" = "view" ] && [ "$2" = "univer-cli" ] && [ "$3" = "version" ]; then
  echo '"0.0.1-managed-test"'
  exit 0
fi
prefix=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--prefix" ]; then
    shift
    prefix="$1"
  fi
  shift
done
if [ -z "$prefix" ]; then
  echo "missing --prefix" >&2
  exit 2
fi
mkdir -p "$prefix/node_modules/.bin"
mkdir -p "$prefix/node_modules/univer-cli"
cat > "$prefix/node_modules/univer-cli/package.json" <<'PACKAGE'
{"name":"univer-cli","version":"0.0.0-managed-test"}
PACKAGE
cat > "$prefix/node_modules/.bin/univer" <<'UNIVER'
#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "univer 0.0.0-managed-test"
  exit 0
fi
if [ "$1" = "inspect" ] && [ "$2" = "tools" ] && [ "$3" = "list" ] && [ "$4" = "--json" ]; then
  echo '{"tools":[]}'
  exit 0
fi
if [ "$1" = "sac" ] && [ "$2" = "migration" ] && [ "$3" = "templates" ] && [ "$4" = "--json" ]; then
  echo '{"templates":[]}'
  exit 0
fi
echo "unsupported $*" >&2
exit 2
UNIVER
chmod +x "$prefix/node_modules/.bin/univer"
exit 0
`, "utf8");
  await chmod(bin, 0o755);
  return binDir;
}

function mockCanonicalSkillFetch() {
  const originalFetch = globalThis.fetch;
  const fakeFetch = async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    if (url.includes("/git/trees/main?recursive=1")) {
      return Response.json({
        tree: [
          { path: "skills/univer-cli/SKILL.md", mode: "100644", type: "blob" },
          { path: "skills/univer-cli/references/evidence-tools.md", mode: "100644", type: "blob" },
          { path: "skills/univer-cli/inspect-tools/tools.manifest.json", mode: "100644", type: "blob" },
        ],
      });
    }
    if (url.endsWith("/skills/univer-cli/SKILL.md")) {
      return new Response("---\nname: univer-cli\n---\n# Univer CLI\n");
    }
    if (url.endsWith("/skills/univer-cli/references/evidence-tools.md")) {
      return new Response("# Evidence tools\n");
    }
    if (url.endsWith("/skills/univer-cli/inspect-tools/tools.manifest.json")) {
      return new Response("{\"tools\":[]}\n");
    }
    return new Response("not found", { status: 404 });
  };
  Object.defineProperty(globalThis, "fetch", {
    value: fakeFetch,
    configurable: true,
    writable: true,
  });
  return () => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
  };
}

describe("Univer CLI extension", () => {
  test("uses the Univer CLI extension id", () => {
    expect(UNIVER_CLI_EXTENSION_ID).toBe("univer-cli");
  });

  test("exposes installer and embedded surface actions", () => {
    const actions = listExperimentalExtensionActions(UNIVER_CLI_EXTENSION_ID).map((action) => action.action).sort();
    expect(actions).toEqual(["open_surface", "setup_install", "setup_repair", "setup_retry", "setup_status", "setup_update"]);
    expect(actions).not.toContain("import");
    expect(actions).not.toContain("export");
    expect(actions).not.toContain("inspect");
    expect(actions).not.toContain("apply");
    expect(actions).not.toContain("verify");
    expect(actions).not.toContain("open");
  });

  test("does not treat a single SKILL.md as a complete skill package", async () => {
    const root = await tempRoot();
    const skillDir = join(root, ".opencode", "skills", "univer-cli");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: univer-cli\n---\n# Univer CLI\n", "utf8");

    const status = await inspectUniverSkillPackage(root);
    expect(status.installed).toBe(true);
    expect(status.complete).toBe(false);
    expect(status.sourceVerified).toBe(false);
    expect(status.checks).toEqual({
      skillFile: true,
      references: false,
      inspectTools: false,
    });
  });

  test("reports ready only when skill, executable, and health probes pass", async () => {
    const root = await tempRoot();
    await writeCompleteSkillPackage(root);
    const executablePath = await writeFakeUniver(root);

    const status = await univerCliSetupStatus(serverConfig(root), { executablePath }, { directory: root });
    expect(status.ready).toBe(true);
    expect(status.skill.complete).toBe(true);
    expect(status.skill.sourceVerified).toBe(true);
    expect(status.executable.source).toBe("override");
    expect(status.executable.version.commandVersion).toBe("0.0.0-test");
    expect(status.health.executable.status).toBe("ok");
    expect(status.health.inspectTools.status).toBe("ok");
    expect(status.health.sacMigrationTemplates.status).toBe("ok");
    expect(status.issues).toEqual([]);
  });

  test("keeps setup incomplete when health passes but the skill package is incomplete", async () => {
    const root = await tempRoot();
    const executablePath = await writeFakeUniver(root);

    const status = await univerCliSetupStatus(serverConfig(root), { executablePath }, { directory: root });
    expect(status.ready).toBe(false);
    expect(status.skill.complete).toBe(false);
    expect(status.health.inspectTools.status).toBe("ok");
    expect(status.issues).toContain("The univer-cli skill package is incomplete.");
  });

  test("installs the full canonical skill package through the setup action", async () => {
    const root = await tempRoot();
    const config = serverConfig(root);
    const executablePath = await writeFakeUniver(root);
    const restoreFetch = mockCanonicalSkillFetch();

    try {
      const result = await callUniverCliExtensionAction(
        config,
        "setup_install",
        { executablePath },
        { directory: root },
      );
      if (!result || result.action !== "setup_install") throw new Error("Expected Univer setup action result");

      expect(result.result.ready).toBe(true);
      expect(result.install?.skill?.written).toBe(3);
      expect(result.install?.executable?.skipped).toBe(true);
      expect(await readFile(join(root, ".opencode", "skills", "univer-cli", "references", "evidence-tools.md"), "utf8")).toContain("Evidence tools");
      expect(await readFile(join(root, ".opencode", "skills", "univer-cli", "inspect-tools", "tools.manifest.json"), "utf8")).toContain("tools");
      expect((await inspectUniverSkillPackage(root)).sourceVerified).toBe(true);
      await stat(univerCliManagedExecutablePath(config));

      const managed = await createManagedOpencodeServer({
        bin: await writeFakeOpencode(root),
        cwd: root,
        env: univerCliManagedRuntimeEnv(config),
        timeoutMs: 2_000,
      });
      await managed.close();
      expect(managed.execution.env.some((entry) => entry.name === "OPENWORK_UNIVER_BIN")).toBe(true);
    } finally {
      restoreFetch();
    }
  });

  test("uses managed npm install when no executable override is provided", async () => {
    const root = await tempRoot();
    const config = serverConfig(root);
    const fakeNpmBinDir = await writeFakeNpm(root);
    const originalPath = process.env.PATH;
    process.env.PATH = originalPath ? `${fakeNpmBinDir}${delimiter}${originalPath}` : fakeNpmBinDir;
    const restoreFetch = mockCanonicalSkillFetch();

    try {
      const result = await callUniverCliExtensionAction(
        config,
        "setup_install",
        {},
        { directory: root },
      );
      if (!result || result.action !== "setup_install") throw new Error("Expected Univer setup action result");

      expect(result.result.ready).toBe(true);
      expect(result.result.executable.source).toBe("managed");
      expect(result.result.executable.version.commandVersion).toBe("0.0.0-managed-test");
      expect(result.result.executable.version.packageVersion).toBe("0.0.0-managed-test");
      expect(result.install?.executable?.skipped).toBe(false);
      expect(result.install?.executable?.packageName).toBe("univer-cli");
      expect(result.install?.executable?.binPath).toBe(univerCliManagedExecutablePath(config));
      expect(result.result.health.executable.status).toBe("ok");
      expect(result.result.health.inspectTools.status).toBe("ok");
      expect(result.result.health.sacMigrationTemplates.status).toBe("ok");
    } finally {
      restoreFetch();
      process.env.PATH = originalPath;
    }
  });

  test("checks registry version metadata for the managed executable", async () => {
    const root = await tempRoot();
    const config = serverConfig(root);
    const fakeNpmBinDir = await writeFakeNpm(root);
    const originalPath = process.env.PATH;
    process.env.PATH = originalPath ? `${fakeNpmBinDir}${delimiter}${originalPath}` : fakeNpmBinDir;
    const restoreFetch = mockCanonicalSkillFetch();

    try {
      await callUniverCliExtensionAction(config, "setup_install", {}, { directory: root });
      const result = await callUniverCliExtensionAction(
        config,
        "setup_status",
        { checkForUpdates: true },
        { directory: root },
      );
      if (!result || result.action !== "setup_status") throw new Error("Expected Univer setup status result");

      expect(result.result.executable.source).toBe("managed");
      expect(result.result.executable.version.packageVersion).toBe("0.0.0-managed-test");
      expect(result.result.executable.version.latestVersion).toBe("0.0.1-managed-test");
      expect(result.result.executable.version.updateAvailable).toBe(true);
      expect(result.result.executable.version.registryStatus).toBe("ok");
    } finally {
      restoreFetch();
      process.env.PATH = originalPath;
    }
  });

  test("updates the managed executable from npm registry", async () => {
    const root = await tempRoot();
    await writeCompleteSkillPackage(root);
    const config = serverConfig(root);
    const fakeNpmBinDir = await writeFakeNpm(root);
    const originalPath = process.env.PATH;
    process.env.PATH = originalPath ? `${fakeNpmBinDir}${delimiter}${originalPath}` : fakeNpmBinDir;

    try {
      const result = await callUniverCliExtensionAction(config, "setup_update", {}, { directory: root });
      if (!result || result.action !== "setup_update") throw new Error("Expected Univer setup update result");

      expect(result.result.ready).toBe(true);
      expect(result.result.executable.source).toBe("managed");
      expect(result.install?.executable?.skipped).toBe(false);
      expect(result.result.executable.version.latestVersion).toBe("0.0.1-managed-test");
    } finally {
      process.env.PATH = originalPath;
    }
  });

  test("auto-updates the managed executable when registry check finds a newer version", async () => {
    const root = await tempRoot();
    const config = serverConfig(root);
    const fakeNpmBinDir = await writeFakeNpm(root);
    const originalPath = process.env.PATH;
    process.env.PATH = originalPath ? `${fakeNpmBinDir}${delimiter}${originalPath}` : fakeNpmBinDir;
    const restoreFetch = mockCanonicalSkillFetch();

    try {
      await callUniverCliExtensionAction(config, "setup_install", {}, { directory: root });
      const result = await callUniverCliExtensionAction(
        config,
        "setup_status",
        { checkForUpdates: true, autoUpdate: true },
        { directory: root },
      );
      if (!result || result.action !== "setup_status") throw new Error("Expected Univer setup status result");

      expect(result.install?.executable?.skipped).toBe(false);
      expect(result.result.executable.source).toBe("managed");
      expect(result.result.executable.version.registryStatus).toBe("ok");
    } finally {
      restoreFetch();
      process.env.PATH = originalPath;
    }
  });

  test("opens a workspace .univer file through the embedded collab surface action", async () => {
    const root = await tempRoot();
    await writeCompleteSkillPackage(root);
    await mkdir(join(root, "reports"), { recursive: true });
    await writeFile(join(root, "reports", "budget.univer"), "fake sqlite payload", "utf8");
    const executablePath = await writeFakeUniver(root);

    const result = await callUniverCliExtensionAction(
      serverConfig(root),
      "open_surface",
      {
        workspaceId: "ws_1",
        path: "reports/budget.univer",
        executablePath,
        worktreeId: "wt_1",
        unitId: "unit_1",
      },
      { workspaceId: "ws_1" },
    );

    if (!result || result.action !== "open_surface") throw new Error("Expected Univer open_surface result");
    expect(result.result).toMatchObject({
      workspaceId: "ws_1",
      path: "reports/budget.univer",
      viewerUrl: "http://127.0.0.1:5180/",
      worktreeId: "wt_1",
      unitId: "unit_1",
    });
    expect(result.result.url).toContain("worktree=wt_1");
    expect(result.result.url).toContain("unit=unit_1");
  });

  test("restarts the Univer daemon when a stale build is already running", async () => {
    const root = await tempRoot();
    await writeCompleteSkillPackage(root);
    await mkdir(join(root, "reports"), { recursive: true });
    await writeFile(join(root, "reports", "budget.univer"), "fake sqlite payload", "utf8");
    const executablePath = await writeFakeUniver(root);
    await writeFile(`${executablePath}.mismatch-once`, "stale\n", "utf8");

    const result = await callUniverCliExtensionAction(
      serverConfig(root),
      "open_surface",
      {
        workspaceId: "ws_1",
        path: "reports/budget.univer",
        executablePath,
      },
      { workspaceId: "ws_1" },
    );

    if (!result || result.action !== "open_surface") throw new Error("Expected Univer open_surface result");
    expect(result.result.url).toContain("reports/budget.univer");
  });

  test("injects the managed Univer bin directory into managed runtime env", async () => {
    const root = await tempRoot();
    const config = serverConfig(root);
    const env = univerCliManagedRuntimeEnv(config);
    expect(env.OPENWORK_UNIVER_BIN).toBe(univerCliManagedExecutablePath(config));
    expect(env.PATH.split(":")[0]).toBe(join(root, "extensions", "univer-cli", "bin"));
  });
});
