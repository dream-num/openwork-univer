const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

function unquoteEnvValue(rawValue) {
  const value = rawValue.trim();
  if (value.length < 2) return value;
  const quote = value[0];
  if ((quote !== "\"" && quote !== "'") || value[value.length - 1] !== quote) {
    return value;
  }
  const inner = value.slice(1, -1);
  if (quote === "'") return inner;
  return inner
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\r")
    .replaceAll("\\t", "\t")
    .replaceAll("\\\"", "\"")
    .replaceAll("\\\\", "\\");
}

function parseEnvFile(filePath) {
  const parsed = {};
  const source = readFileSync(filePath, "utf8");
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const assignment = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const separatorIndex = assignment.indexOf("=");
    if (separatorIndex <= 0) continue;
    const name = assignment.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    parsed[name] = unquoteEnvValue(assignment.slice(separatorIndex + 1));
  }
  return parsed;
}

function loadEnvFile(filePath, options = {}) {
  if (!existsSync(filePath)) {
    if (options.required) {
      throw new Error(`Missing notarization env file: ${filePath}`);
    }
    return {};
  }

  const parsed = parseEnvFile(filePath);
  for (const [name, value] of Object.entries(parsed)) {
    if (options.override || !process.env[name]) {
      process.env[name] = value;
    }
  }
  return parsed;
}

function defaultLocalNotarizationEnvPath(repoRoot) {
  return path.join(repoRoot, ".env.notarization.local", "openwork-notary.env");
}

function loadLocalNotarizationEnv(repoRoot, options = {}) {
  const envPath = process.env.OPENWORK_NOTARIZATION_ENV
    ? path.resolve(process.env.OPENWORK_NOTARIZATION_ENV)
    : defaultLocalNotarizationEnvPath(repoRoot);
  return {
    envPath,
    loaded: loadEnvFile(envPath, { required: true, override: options.override === true }),
  };
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for notarized Electron macOS packaging`);
  }
  return value;
}

function requireNotarizationEnv() {
  const required = [
    "APPLE_API_KEY_PATH",
    "APPLE_API_KEY",
    "APPLE_API_ISSUER",
  ];
  for (const name of required) {
    requireEnv(name);
  }
  const keyPath = process.env.APPLE_API_KEY_PATH;
  if (!existsSync(keyPath)) {
    throw new Error(`APPLE_API_KEY_PATH does not exist: ${keyPath}`);
  }
}

function requireSigningEnv() {
  if (process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD) return;
  if (process.env.CSC_NAME || process.env.APPLE_CODESIGN_IDENTITY) return;
  throw new Error("CSC_LINK + CSC_KEY_PASSWORD, CSC_NAME, or APPLE_CODESIGN_IDENTITY is required for signed macOS packaging");
}

module.exports = {
  defaultLocalNotarizationEnvPath,
  loadEnvFile,
  loadLocalNotarizationEnv,
  parseEnvFile,
  requireEnv,
  requireNotarizationEnv,
  requireSigningEnv,
};
