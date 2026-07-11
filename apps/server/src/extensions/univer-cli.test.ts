import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
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
const originalDistributionRoot = process.env.OPENWORK_TEST_UNIVER_DISTRIBUTION_ROOT;
const originalExecutableOverride = process.env.OPENWORK_UNIVER_EXECUTABLE;

beforeEach(async () => {
  const root = await tempRoot();
  process.env.OPENWORK_TEST_UNIVER_DISTRIBUTION_ROOT = await writeTestDistribution(root);
});

afterEach(async () => {
  while (roots.length) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
  if (originalDistributionRoot === undefined) delete process.env.OPENWORK_TEST_UNIVER_DISTRIBUTION_ROOT;
  else process.env.OPENWORK_TEST_UNIVER_DISTRIBUTION_ROOT = originalDistributionRoot;
  if (originalExecutableOverride === undefined) delete process.env.OPENWORK_UNIVER_EXECUTABLE;
  else process.env.OPENWORK_UNIVER_EXECUTABLE = originalExecutableOverride;
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "openwork-univer-cli-"));
  roots.push(root);
  return root;
}

async function treeDigest(root: string): Promise<{ digest: string; files: number }> {
  const files: string[] = [];
  async function visit(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path, relativePath);
      else if (entry.isFile()) files.push(relativePath);
    }
  }
  await visit(root, "");
  files.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  const digest = createHash("sha256");
  for (const relativePath of files) {
    const contentDigest = createHash("sha256").update(await readFile(join(root, ...relativePath.split("/")))).digest("hex");
    digest.update(relativePath);
    digest.update("\0");
    digest.update(contentDigest);
    digest.update("\n");
  }
  return { digest: digest.digest("hex"), files: files.length };
}

async function writeTestDistribution(root: string): Promise<string> {
  const distributionRoot = join(root, "univer-distribution");
  const cliRoot = join(distributionRoot, "runtime", "node_modules", "univer-cli");
  const executablePath = join(cliRoot, "bin", "univer.js");
  const skillRoot = join(distributionRoot, "skill", "univer-cli");
  await mkdir(join(cliRoot, "bin"), { recursive: true });
  await mkdir(join(skillRoot, "references"), { recursive: true });
  await mkdir(join(skillRoot, "inspect-tools"), { recursive: true });
  await writeFile(executablePath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "univer 0.3.1"
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
exit 2
`, "utf8");
  await chmod(executablePath, 0o755);
  await writeFile(join(cliRoot, "package.json"), '{"name":"univer-cli","version":"0.3.1"}\n', "utf8");
  await writeFile(join(skillRoot, "SKILL.md"), "---\nname: univer-cli\n---\n# Univer CLI\n", "utf8");
  await writeFile(join(skillRoot, "references", "evidence-tools.md"), "# Evidence tools\n", "utf8");
  await writeFile(join(skillRoot, "inspect-tools", "tools.manifest.json"), '{"tools":[]}\n', "utf8");
  const skill = await treeDigest(skillRoot);
  const identity = "cowork-0.1.0__cli-0.3.1__test";
  const sourceCommit = "e9066dc0f266a9ba7a109b21008c146b9473f616";
  const target = `${process.platform}-${process.arch}`;
  await writeFile(join(distributionRoot, "compatibility.json"), `${JSON.stringify({
    schemaVersion: 1,
    identity,
    cowork: { package: "@univerjs-pro/cowork", version: "0.1.0", integrity: "test-integrity" },
    sdk: { cohortVersion: "1.0.0-test" },
    cli: { package: "univer-cli", version: "0.3.1", integrity: "test-integrity" },
    source: {
      repository: "dream-num/univer-cli",
      tag: "v0.3.1",
      commit: sourceCommit,
      archiveUrl: "https://example.invalid/univer-cli.tar.gz",
      skillPath: "packages/skills/skills/univer-cli",
      skillDigestAlgorithm: "sha256(path\\0sha256(content)\\n; UTF-8 bytewise sorted paths)",
      skillDigest: skill.digest,
    },
    distribution: {
      univerExecutable: "runtime/node_modules/univer-cli/bin/univer.js",
      skillsRoot: "skill/univer-cli",
      provenance: "provenance.json",
    },
    supportedTargets: [target],
  }, null, 2)}\n`, "utf8");
  await writeFile(join(distributionRoot, "provenance.json"), `${JSON.stringify({
    schemaVersion: 1,
    compatibilityIdentity: identity,
    target,
    cliVersion: "0.3.1",
    sourceCommit,
    skillDigest: skill.digest,
    skillFiles: skill.files,
    generatedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
  return distributionRoot;
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
    source: { owner: "dream-num", repo: "univer-cli", ref: "e9066dc0f266a9ba7a109b21008c146b9473f616" },
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
  echo "$UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT" > "$0.allowed-root"
  echo "$UNIVER_HOME" > "$0.univer-home"
  marker="$0.mismatch-once"
  if [ -f "$marker" ]; then
    rm -f "$marker"
    echo "ERROR CLI_ERROR" >&2
    echo "Daemon build mismatch. Expected new-build, got old-build. Run \`univer daemon stop\` and retry." >&2
    exit 1
  fi
  count_file="$0.start-count"
  count="$(cat "$count_file" 2>/dev/null || echo 0)"
  echo $((count + 1)) > "$count_file"
  timeout_marker="$0.timeout-once"
  if [ -f "$timeout_marker" ]; then
    rm -f "$timeout_marker"
    echo "ERROR CLI_ERROR" >&2
    echo "Timed out waiting for daemon startup after 15000ms; last health error: Daemon RPC timeout for daemon.health" >&2
    exit 1
  fi
  if [ -f "$0.slow-start" ]; then
    sleep 1
  fi
  echo "univer daemon: started"
  exit 0
fi
if [ "$1" = "daemon" ] && [ "$2" = "stop" ]; then
  stop_count_file="$0.stop-count"
  stop_count="$(cat "$stop_count_file" 2>/dev/null || echo 0)"
  echo $((stop_count + 1)) > "$stop_count_file"
  echo "univer daemon: stopped"
  exit 0
fi
if [ "$1" = "open" ]; then
  echo "$UNIVER_COLLAB_GATEWAY_ALLOWED_ROOT" > "$0.allowed-root"
  echo "$UNIVER_HOME" > "$0.univer-home"
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
    printf '{"ok":true,"openUrl":"http://127.0.0.1:5180/?file=%s&worktree=%s&unit=%s","target":{"type":"local-univerfile","path":"%s"}}\n' "$source" "$worktree" "$unit" "$source"
    exit 0
  fi
  printf '{"ok":true,"openUrl":"http://127.0.0.1:5180/?file=%s","target":{"type":"local-univerfile","path":"%s"}}\n' "$source" "$source"
  exit 0
fi
echo "unsupported $*" >&2
exit 2
`, "utf8");
  await chmod(bin, 0o755);
  process.env.OPENWORK_UNIVER_EXECUTABLE = bin;
  return bin;
}

async function writeFakeNodeRuntime(root: string): Promise<string> {
  const bin = join(root, "fake-node-runtime");
  await writeFile(bin, `#!/bin/sh
target="$1"
shift
if [ ! -f "$target" ]; then
  echo "missing target $target" >&2
  exit 2
fi
if [ "$1" = "--version" ]; then
  echo "univer 0.3.1"
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
    expect(actions).toEqual(["open_surface", "setup_install", "setup_repair", "setup_retry", "setup_status"]);
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
    await writeFakeUniver(root);

    const status = await univerCliSetupStatus(serverConfig(root), {}, { directory: root });
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

  test("uses the bundled skill package when the workspace has no installed skill", async () => {
    const root = await tempRoot();
    await writeFakeUniver(root);

    const status = await univerCliSetupStatus(serverConfig(root), {}, { directory: root });
    expect(status.ready).toBe(true);
    expect(status.skill.complete).toBe(true);
    expect(status.skill.source).toContain("bundled:dream-num/univer-cli@");
    expect(status.bundle.status).toBe("healthy");
    expect(status.health.inspectTools.status).toBe("ok");
    expect(status.issues).toEqual([]);
  });

  test("prepares the offline distribution and materializes its canonical workspace skill", async () => {
    const root = await tempRoot();
    const config = serverConfig(root);
    await writeFakeUniver(root);

    const result = await callUniverCliExtensionAction(
      config,
      "setup_install",
      {},
      { directory: root },
    );
    if (!result || result.action !== "setup_install") throw new Error("Expected Univer setup action result");

    expect(result.result.ready).toBe(true);
    expect(result.result.bundle.status).toBe("healthy");
    expect(result.install?.bundle?.action).toBe("ready");
    expect(result.install?.skill?.action).toBe("added");
    expect(result.install?.executable).toBeUndefined();
    expect((await inspectUniverSkillPackage(root)).installed).toBe(true);
    await stat(univerCliManagedExecutablePath(config));

    const managed = await createManagedOpencodeServer({
      bin: await writeFakeOpencode(root),
      cwd: root,
      env: univerCliManagedRuntimeEnv(config),
      timeoutMs: 2_000,
    });
    await managed.close();
    expect(managed.execution.env.some((entry) => entry.name === "OPENWORK_UNIVER_BIN")).toBe(true);
  });

  test("uses the bundled executable when no executable override is provided", async () => {
    const root = await tempRoot();
    const config = serverConfig(root);

    const result = await callUniverCliExtensionAction(
      config,
      "setup_install",
      {},
      { directory: root },
    );
    if (!result || result.action !== "setup_install") throw new Error("Expected Univer setup action result");

    expect(result.result.ready).toBe(true);
    expect(result.result.executable.source).toBe("bundled");
    expect(result.result.executable.version.commandVersion).toBe("0.3.1");
    expect(result.result.executable.version.packageVersion).toBe("0.3.1");
    expect(result.install?.bundle?.executablePath).toBe(univerCliManagedExecutablePath(config));
    expect(result.result.health.executable.status).toBe("ok");
    expect(result.result.health.inspectTools.status).toBe("ok");
    expect(result.result.health.sacMigrationTemplates.status).toBe("ok");
  });

  test("runs the bundled executable through the OpenWork runtime shim without node on PATH", async () => {
    const root = await tempRoot();
    const config = serverConfig(root);
    const fakeRuntime = await writeFakeNodeRuntime(root);
    const originalPath = process.env.PATH;
    const originalRuntime = process.env.OPENWORK_UNIVER_NODE_RUNTIME;
    const originalRuntimeMode = process.env.OPENWORK_UNIVER_NODE_RUNTIME_ELECTRON;
    process.env.PATH = "/usr/bin:/bin";
    process.env.OPENWORK_UNIVER_NODE_RUNTIME = fakeRuntime;
    process.env.OPENWORK_UNIVER_NODE_RUNTIME_ELECTRON = "1";

    try {
      const result = await callUniverCliExtensionAction(config, "setup_install", {}, { directory: root });
      if (!result || result.action !== "setup_install") throw new Error("Expected Univer setup action result");

      expect(result.result.ready).toBe(true);
      expect(result.result.executable.source).toBe("bundled");
      expect(result.result.executable.path).toBe(univerCliManagedExecutablePath(config));
      expect(result.result.health.executable.status).toBe("ok");
      expect(result.result.health.inspectTools.status).toBe("ok");
      expect(result.result.health.sacMigrationTemplates.status).toBe("ok");

      const shim = await readFile(univerCliManagedExecutablePath(config), "utf8");
      expect(shim).toContain(fakeRuntime);
      expect(shim).toContain("ELECTRON_RUN_AS_NODE=1");
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      if (originalRuntime === undefined) delete process.env.OPENWORK_UNIVER_NODE_RUNTIME;
      else process.env.OPENWORK_UNIVER_NODE_RUNTIME = originalRuntime;
      if (originalRuntimeMode === undefined) delete process.env.OPENWORK_UNIVER_NODE_RUNTIME_ELECTRON;
      else process.env.OPENWORK_UNIVER_NODE_RUNTIME_ELECTRON = originalRuntimeMode;
    }
  });

  test("skips npm registry checks for the bundled executable", async () => {
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

      expect(result.result.executable.source).toBe("bundled");
      expect(result.result.executable.version.packageVersion).toBe("0.3.1");
      expect(result.result.executable.version.latestVersion).toBeNull();
      expect(result.result.executable.version.updateAvailable).toBeNull();
      expect(result.result.executable.version.registryStatus).toBe("not_checked");
    } finally {
      restoreFetch();
      process.env.PATH = originalPath;
    }
  });

  test("does not expose an independently updatable Univer action", async () => {
    const root = await tempRoot();
    await writeCompleteSkillPackage(root);
    const config = serverConfig(root);
    const fakeNpmBinDir = await writeFakeNpm(root);
    const originalPath = process.env.PATH;
    process.env.PATH = originalPath ? `${fakeNpmBinDir}${delimiter}${originalPath}` : fakeNpmBinDir;

    try {
      const result = await callUniverCliExtensionAction(config, "setup_update", {}, { directory: root });
      expect(result).toBeNull();
    } finally {
      process.env.PATH = originalPath;
    }
  });

  test("ignores legacy auto-update requests for the bundled executable", async () => {
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

      expect(result.install).toBeUndefined();
      expect(result.result.executable.source).toBe("bundled");
      expect(result.result.executable.version.registryStatus).toBe("not_checked");
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
    await writeFakeUniver(root);

    const result = await callUniverCliExtensionAction(
      serverConfig(root),
      "open_surface",
      {
        workspaceId: "ws_1",
        path: "reports/budget.univer",
        worktreeId: "wt_1",
        unitId: "unit_1",
      },
      { workspaceId: "ws_1" },
    );

    if (!result || result.action !== "open_surface") throw new Error("Expected Univer open_surface result");
    expect(result.result).toMatchObject({
      workspaceId: "ws_1",
      path: "reports/budget.univer",
      origin: "http://127.0.0.1:5180",
      worktreeId: "wt_1",
      unitId: "unit_1",
    });
  });

  test("opens a realpathed workspace .univer file through the embedded collab surface action", async () => {
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
      },
      { workspaceId: "ws_1" },
    );

    if (!result || result.action !== "open_surface") throw new Error("Expected Univer open_surface result");
    expect(result.result.path).toBe("reports/budget.univer");
    const allowedRoot = (await readFile(`${executablePath}.allowed-root`, "utf8")).trim();
    expect(allowedRoot).toBe(await realpath(root));
    const univerHome = (await readFile(`${executablePath}.univer-home`, "utf8")).trim();
    expect(univerHome.startsWith(join(root, "extensions", "univer-cli", "daemon"))).toBe(true);
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
      },
      { workspaceId: "ws_1" },
    );

    if (!result || result.action !== "open_surface") throw new Error("Expected Univer open_surface result");
    expect(result.result.origin).toBe("http://127.0.0.1:5180");
    expect(result.result.univerfile.endsWith("/reports/budget.univer")).toBe(true);
  });

  test("restarts the Univer daemon when startup health checks time out", async () => {
    const root = await tempRoot();
    await writeCompleteSkillPackage(root);
    await mkdir(join(root, "reports"), { recursive: true });
    await writeFile(join(root, "reports", "budget.univer"), "fake sqlite payload", "utf8");
    const executablePath = await writeFakeUniver(root);
    await writeFile(`${executablePath}.timeout-once`, "hung\n", "utf8");

    const result = await callUniverCliExtensionAction(
      serverConfig(root),
      "open_surface",
      {
        workspaceId: "ws_1",
        path: "reports/budget.univer",
      },
      { workspaceId: "ws_1" },
    );

    if (!result || result.action !== "open_surface") throw new Error("Expected Univer open_surface result");
    expect(result.result.origin).toBe("http://127.0.0.1:5180");
    expect(result.result.univerfile.endsWith("/reports/budget.univer")).toBe(true);
    const startCountText = await readFile(`${executablePath}.start-count`, "utf8");
    const stopCountText = await readFile(`${executablePath}.stop-count`, "utf8");
    expect(Number.parseInt(startCountText, 10)).toBe(2);
    expect(Number.parseInt(stopCountText, 10)).toBe(1);
  });

  test("serializes concurrent Univer daemon starts for the same runtime", async () => {
    const root = await tempRoot();
    await writeCompleteSkillPackage(root);
    await mkdir(join(root, "reports"), { recursive: true });
    await writeFile(join(root, "reports", "budget.univer"), "fake sqlite payload", "utf8");
    const executablePath = await writeFakeUniver(root);
    await writeFile(`${executablePath}.slow-start`, "slow\n", "utf8");

    const callOpenSurface = () =>
      callUniverCliExtensionAction(
        serverConfig(root),
        "open_surface",
        {
          workspaceId: "ws_1",
          path: "reports/budget.univer",
        },
        { workspaceId: "ws_1" },
      );

    const [first, second] = await Promise.all([callOpenSurface(), callOpenSurface()]);

    if (!first || first.action !== "open_surface") throw new Error("Expected first Univer open_surface result");
    if (!second || second.action !== "open_surface") throw new Error("Expected second Univer open_surface result");
    expect(first.result.origin).toBe("http://127.0.0.1:5180");
    expect(second.result.origin).toBe("http://127.0.0.1:5180");
    const startCountText = await readFile(`${executablePath}.start-count`, "utf8");
    expect(Number.parseInt(startCountText, 10)).toBe(1);
  });

  test("injects the managed Univer bin directory into managed runtime env", async () => {
    const root = await tempRoot();
    const config = serverConfig(root);
    const env = univerCliManagedRuntimeEnv(config);
    expect(env.OPENWORK_UNIVER_BIN).toBe(univerCliManagedExecutablePath(config));
    expect(env.PATH.split(":")[0]).toBe(join(root, "extensions", "univer-cli", "bin"));
  });
});
