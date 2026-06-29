import { describe, expect, test } from "bun:test";
import { OPENWORK_EXTENSION_CATALOG } from "../src/app/constants";
import { buildExtensionItems } from "../src/react-app/domains/settings/extension-items";

describe("extension item grouping", () => {
  test("describes Univer CLI as native .univer office work in composer", () => {
    const univer = OPENWORK_EXTENSION_CATALOG.find((entry) => entry.id === "univer-cli");

    expect(univer?.composerPrompt).toContain("native .univer office files");
    expect(univer?.composerPrompt).toContain("Create .univer by default");
    expect(univer?.composerPrompt).toContain("exchange formats");
  });

  test("groups imported cloud plugin resources and suppresses child skill rows", () => {
    const result = buildExtensionItems({
      quickConnect: [],
      mcpServers: [],
      installedSkills: [
        {
          name: "brief-builder",
          description: "Use for creative briefs",
          path: "/workspace/project/.opencode/skills/creative-brief-plugin/brief-builder/SKILL.md",
        },
      ],
      importedCloudPlugins: {
        plugin_1: {
          pluginId: "plugin_1",
          marketplaceId: "marketplace_1",
          name: "Creative Brief Plugin",
          description: "Brief writing workflow",
          updatedAt: "2026-06-02T00:00:00.000Z",
          importedAt: 1,
          files: [
            {
              configObjectId: "config_skill_1",
              versionId: "version_skill_1",
              objectType: "skill",
              title: "Brief Builder",
              path: ".opencode/skills/creative-brief-plugin/brief-builder/SKILL.md",
              updatedAt: "2026-06-02T00:00:00.000Z",
            },
          ],
        },
      },
      cloudMarketplaces: [],
      enablementContext: {},
      isBuiltInConnected: () => false,
    });

    expect(result.items.map((item) => item.id)).toEqual(["marketplace:installed:plugin_1"]);
    expect(result.items[0]?.resources).toEqual([
      {
        id: "config_skill_1",
        type: "skill",
        title: "Brief Builder",
        path: ".opencode/skills/creative-brief-plugin/brief-builder/SKILL.md",
      },
    ]);
  });
});
