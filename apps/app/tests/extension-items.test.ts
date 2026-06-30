import { describe, expect, test } from "bun:test";

import type { McpDirectoryInfo } from "../src/app/constants";
import { buildExtensionItems } from "../src/react-app/domains/settings/extension-items";

const connectedBuiltIn: McpDirectoryInfo = {
  id: "openwork-browser",
  name: "OpenWork Browser",
  serverName: "openwork-browser",
  description: "Connected by default.",
  oauth: false,
  kind: "extension",
  extensionManifest: {
    schemaVersion: 1,
    id: "openwork-browser",
    name: "OpenWork Browser",
    description: "Connected by default.",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    resources: [],
  },
};

const availableBuiltIn: McpDirectoryInfo = {
  id: "computer-use",
  name: "Computer Use",
  serverName: "computer-use",
  description: "Marketplace-only until installed.",
  oauth: false,
  kind: "extension",
  extensionManifest: {
    schemaVersion: 1,
    id: "computer-use",
    name: "Computer Use",
    description: "Marketplace-only until installed.",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    resources: [],
  },
};

const univerCliBuiltIn: McpDirectoryInfo = {
  id: "univer-cli",
  name: "Univer CLI",
  serverName: "univer-cli",
  description: "Built-in Univer cowork bundle.",
  oauth: false,
  kind: "extension",
  extensionManifest: {
    schemaVersion: 1,
    id: "univer-cli",
    name: "Univer CLI",
    description: "Built-in Univer cowork bundle.",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    resources: [
      {
        type: "skill",
        id: "univer-cli-skill",
        label: "Bundled univer-cli skill",
        path: "builtin://univer-cli",
        required: true,
      },
    ],
  },
};

describe("extension item projection", () => {
  test("keeps unconnected built-ins out of My Extensions quick connect", () => {
    const result = buildExtensionItems({
      quickConnect: [connectedBuiltIn, availableBuiltIn],
      mcpServers: [],
      installedSkills: [],
      importedCloudPlugins: {},
      cloudMarketplaces: [],
      enablementContext: {},
      isBuiltInConnected: (entry) => entry.id === connectedBuiltIn.id,
    });

    expect(result.installedMcpEntries.map((entry) => entry.name)).toEqual(["OpenWork Browser"]);
    expect(result.builtInItems.map((item) => item.name)).toEqual(["OpenWork Browser", "Computer Use"]);
  });

  test("does not show built-in extension skill resources as standalone apps", () => {
    const result = buildExtensionItems({
      quickConnect: [univerCliBuiltIn],
      mcpServers: [],
      installedSkills: [
        {
          name: "univer-cli",
          description: "Use when working with .univer targets.",
          path: "/workspace/.opencode/skills/univer-cli",
        },
        {
          name: "custom-skill",
          description: "Standalone skill.",
          path: "/workspace/.opencode/skills/custom-skill",
        },
      ],
      importedCloudPlugins: {},
      cloudMarketplaces: [],
      enablementContext: {},
      isBuiltInConnected: (entry) => entry.id === "univer-cli",
    });

    expect(result.items.map((item) => item.id)).toEqual([
      "builtin:univer-cli",
      "skill:custom-skill",
    ]);
    expect(result.installedSkills.map((skill) => skill.name)).toEqual(["custom-skill"]);
  });
});
