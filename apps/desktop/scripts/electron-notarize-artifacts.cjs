const { createHash, randomBytes } = require("node:crypto");
const { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { fileURLToPath } = require("node:url");
const {
  requireNotarizationEnv,
  requireSigningEnv,
} = require("./notarization-env.cjs");

const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "../..");
const distElectronDir = path.join(desktopRoot, "dist-electron");
const latestMacYmlPath = path.join(distElectronDir, "latest-mac.yml");
let importedSigningKeychainDir = null;
let importedSigningKeychainPath = null;
let originalKeychainSearchList = null;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? desktopRoot,
    encoding: options.encoding ?? "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}${stderr ? `: ${stderr}` : ""}`);
  }
  return result.stdout ?? "";
}

function sha512Base64(filePath) {
  const hash = createHash("sha512");
  hash.update(readFileSync(filePath));
  return hash.digest("base64");
}

function artifactUrlsFromLatestMac() {
  if (!existsSync(latestMacYmlPath)) return [];
  const source = readFileSync(latestMacYmlPath, "utf8");
  return source
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s+url:\s+(.+)\s*$/) ?? line.match(/^\s+url:\s+(.+)\s*$/))
    .filter(Boolean)
    .map((match) => match[1].trim().replace(/^['"]|['"]$/g, ""))
    .filter((url) => url.startsWith("openwork-mac-") && (url.endsWith(".dmg") || url.endsWith(".zip")));
}

function distArtifactUrls() {
  return readdirSync(distElectronDir)
    .filter((name) => name.startsWith("openwork-mac-") && (name.endsWith(".dmg") || name.endsWith(".zip")));
}

function artifactUrls() {
  const fromLatest = artifactUrlsFromLatestMac();
  const urls = fromLatest.length > 0 ? fromLatest : distArtifactUrls();
  return [...new Set(urls)]
    .filter((url) => existsSync(path.join(distElectronDir, url)))
    .sort((a, b) => {
      if (a.endsWith(".zip") && !b.endsWith(".zip")) return -1;
      if (!a.endsWith(".zip") && b.endsWith(".zip")) return 1;
      return a.localeCompare(b);
    });
}

function appBuilderBinaryPath() {
  const appBuilderStoreDir = readdirSync(path.join(repoRoot, "node_modules", ".pnpm"))
    .find((name) => name.startsWith("app-builder-bin@"));
  if (!appBuilderStoreDir) {
    throw new Error("Could not find app-builder-bin in node_modules/.pnpm");
  }

  const base = path.join(repoRoot, "node_modules", ".pnpm", appBuilderStoreDir, "node_modules", "app-builder-bin");
  if (process.platform === "darwin") {
    return path.join(base, "mac", process.arch === "arm64" ? "app-builder_arm64" : "app-builder_amd64");
  }
  if (process.platform === "linux") {
    return path.join(base, "linux", process.arch === "arm64" ? "arm64" : "x64", "app-builder");
  }
  if (process.platform === "win32") {
    return path.join(base, "win", process.arch === "arm64" ? "arm64" : "x64", "app-builder.exe");
  }
  throw new Error(`Unsupported app-builder platform: ${process.platform}/${process.arch}`);
}

function rebuildBlockmap(artifactPath) {
  const blockmapPath = `${artifactPath}.blockmap`;
  console.log(`[electron-notarize-artifacts] rebuilding blockmap: ${path.relative(desktopRoot, blockmapPath)}`);
  run(appBuilderBinaryPath(), ["blockmap", "--input", artifactPath, "--output", blockmapPath]);
}

function keychainPathsFromOutput(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^"|"$/g, ""));
}

function keychainSearchList() {
  return keychainPathsFromOutput(run("security", ["list-keychains", "-d", "user"], { capture: true }));
}

function restoreKeychainSearchList() {
  if (!originalKeychainSearchList) return;
  const args = ["list-keychains", "-d", "user", "-s", ...originalKeychainSearchList];
  spawnSync("security", args, { cwd: desktopRoot, stdio: "ignore", env: process.env });
}

function cleanupImportedSigningKeychain() {
  restoreKeychainSearchList();
  if (importedSigningKeychainPath) {
    spawnSync("security", ["delete-keychain", importedSigningKeychainPath], {
      cwd: desktopRoot,
      stdio: "ignore",
      env: process.env,
    });
  }
  if (importedSigningKeychainDir) {
    rmSync(importedSigningKeychainDir, { recursive: true, force: true });
  }
}

function developerIdIdentityFromKeychain(keychainPath) {
  const args = ["find-identity", "-v", "-p", "codesigning"];
  if (keychainPath) args.push(keychainPath);
  const identities = run("security", args, { capture: true });
  const match = identities.match(/"((?:Developer ID Application:)[^"]+)"/);
  if (!match) {
    throw new Error("Could not find a Developer ID Application identity for DMG signing");
  }
  return match[1];
}

function existingDmgSigningIdentity() {
  return process.env.OPENWORK_DMG_CODESIGN_IDENTITY
    || process.env.CSC_NAME
    || process.env.APPLE_CODESIGN_IDENTITY;
}

function cscLinkCertificatePath(tempDir) {
  const cscLink = process.env.CSC_LINK;
  if (!cscLink) return null;
  if (cscLink.startsWith("file://")) return fileURLToPath(cscLink);
  if (existsSync(cscLink)) return path.resolve(cscLink);

  const base64 = cscLink.startsWith("data:") ? cscLink.slice(cscLink.indexOf(",") + 1) : cscLink;
  const certificatePath = path.join(tempDir, "codesign.p12");
  writeFileSync(certificatePath, Buffer.from(base64, "base64"));
  return certificatePath;
}

function importCscLinkIdentity() {
  if (!process.env.CSC_LINK || !process.env.CSC_KEY_PASSWORD) {
    return null;
  }

  importedSigningKeychainDir = mkdtempSync(path.join(tmpdir(), "openwork-codesign-"));
  importedSigningKeychainPath = path.join(importedSigningKeychainDir, "signing.keychain-db");
  const keychainPassword = randomBytes(24).toString("hex");
  const certificatePath = cscLinkCertificatePath(importedSigningKeychainDir);

  console.log("[electron-notarize-artifacts] importing CSC_LINK certificate for DMG signing");
  originalKeychainSearchList = keychainSearchList();
  run("security", ["create-keychain", "-p", keychainPassword, importedSigningKeychainPath]);
  run("security", ["set-keychain-settings", "-lut", "21600", importedSigningKeychainPath]);
  run("security", ["unlock-keychain", "-p", keychainPassword, importedSigningKeychainPath]);
  run("security", [
    "import",
    certificatePath,
    "-k",
    importedSigningKeychainPath,
    "-P",
    process.env.CSC_KEY_PASSWORD,
    "-T",
    "/usr/bin/codesign",
    "-T",
    "/usr/bin/security",
  ]);
  run("security", ["list-keychains", "-d", "user", "-s", importedSigningKeychainPath, ...originalKeychainSearchList]);
  run("security", [
    "set-key-partition-list",
    "-S",
    "apple-tool:,apple:,codesign:",
    "-s",
    "-k",
    keychainPassword,
    importedSigningKeychainPath,
  ]);

  return {
    identity: existingDmgSigningIdentity() || developerIdIdentityFromKeychain(importedSigningKeychainPath),
    keychainPath: importedSigningKeychainPath,
  };
}

function dmgSigning() {
  const existingIdentity = existingDmgSigningIdentity();
  try {
    const keychainIdentity = developerIdIdentityFromKeychain();
    return { identity: existingIdentity || keychainIdentity, keychainPath: null };
  } catch (error) {
    const imported = importCscLinkIdentity();
    if (imported) return imported;
    if (existingIdentity) return { identity: existingIdentity, keychainPath: null };
    throw error;
  }
}

function signDmg(dmgPath, signing) {
  const args = ["--force", "--timestamp", "--sign", signing.identity];
  if (signing.keychainPath) args.push("--keychain", signing.keychainPath);
  args.push(dmgPath);
  console.log(`[electron-notarize-artifacts] signing dmg: ${path.relative(desktopRoot, dmgPath)} (${signing.identity})`);
  run("codesign", args);
  run("codesign", ["--verify", "--verbose=2", dmgPath]);
}

function writeLatestMacYml(urls) {
  const version = JSON.parse(readFileSync(path.join(desktopRoot, "package.json"), "utf8")).version;
  const files = urls.map((url) => {
    const filePath = path.join(distElectronDir, url);
    return {
      url,
      sha512: sha512Base64(filePath),
      size: statSync(filePath).size,
    };
  });
  const primary = files.find((file) => file.url.endsWith(".zip")) ?? files[0];
  if (!primary) return;

  const lines = [
    `version: ${version}`,
    "files:",
    ...files.flatMap((file) => [
      `  - url: ${file.url}`,
      `    sha512: ${file.sha512}`,
      `    size: ${file.size}`,
    ]),
    `path: ${primary.url}`,
    `sha512: ${primary.sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    "",
  ];
  writeFileSync(latestMacYmlPath, lines.join("\n"));
  console.log(`[electron-notarize-artifacts] wrote ${path.relative(desktopRoot, latestMacYmlPath)}`);
}

function notarizeDmg(dmgPath) {
  const keyPath = process.env.APPLE_API_KEY_PATH;
  const keyId = process.env.APPLE_API_KEY;
  const issuer = process.env.APPLE_API_ISSUER;
  console.log(`[electron-notarize-artifacts] notarizing dmg: ${path.relative(desktopRoot, dmgPath)}`);
  run("xcrun", [
    "notarytool",
    "submit",
    dmgPath,
    "--key",
    keyPath,
    "--key-id",
    keyId,
    "--issuer",
    issuer,
    "--wait",
  ]);
  run("xcrun", ["stapler", "staple", dmgPath]);
  run("xcrun", ["stapler", "validate", dmgPath]);
}

function main() {
  if (process.platform !== "darwin") {
    console.log("[electron-notarize-artifacts] skipping non-macOS artifact notarization");
    return;
  }
  if (process.env.MACOS_NOTARIZE !== "true") {
    console.log("[electron-notarize-artifacts] MACOS_NOTARIZE is not true; skipping artifact notarization");
    return;
  }

  requireNotarizationEnv();
  requireSigningEnv();
  const signing = dmgSigning();
  const urls = artifactUrls();
  const dmgUrls = urls.filter((url) => url.endsWith(".dmg"));
  if (dmgUrls.length === 0) {
    throw new Error(`No DMG artifacts found in ${distElectronDir}`);
  }

  for (const url of dmgUrls) {
    const dmgPath = path.join(distElectronDir, url);
    signDmg(dmgPath, signing);
    notarizeDmg(dmgPath);
    rebuildBlockmap(dmgPath);
  }
  writeLatestMacYml(urls);
}

let exitCode = 0;
try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  cleanupImportedSigningKeychain();
}
process.exit(exitCode);
