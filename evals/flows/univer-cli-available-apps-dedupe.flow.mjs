/**
 * Ready Univer CLI extension is shown once in Available Apps; its installed
 * skill resource is not rendered as a second app card.
 */
export default {
  id: "univer-cli-available-apps-dedupe",
  title: "Univer CLI Available Apps entry is deduplicated",
  spec: "openspec/changes/introduce-univer-office-extension/specs/univer-extension-installation/spec.md",
  steps: [
    {
      name: "App booted",
      run: async (ctx) => {
        await ctx.waitFor("Boolean(window.__openworkControl)", {
          timeoutMs: 30_000,
          label: "control API",
        });
      },
    },
    {
      name: "Univer CLI setup is ready",
      run: async (ctx) => {
        await ctx.control("settings.panel.open", { panel: "cloud-marketplaces" });
        await ctx.waitFor("window.location.hash.includes('/settings/cloud-marketplaces')", {
          timeoutMs: 15_000,
          label: "settings marketplace route",
        });
        await ctx.expectText("Univer CLI", { timeoutMs: 30_000 });
        await ctx.clickText("Univer CLI", { timeoutMs: 15_000 });
        await ctx.expectText("Univer CLI setup", { timeoutMs: 15_000 });
        await ctx.clickText("Check setup", { timeoutMs: 15_000 });
        await ctx.expectText("Univer CLI is ready for this workspace.", { timeoutMs: 30_000 });
      },
    },
    {
      name: "Available Apps shows only the extension card",
      run: async (ctx) => {
        await ctx.navigateHash("/settings/extensions/mcp");
        await ctx.expectHashIncludes("/settings/extensions/mcp");
        await ctx.waitFor(
          "document.body.innerText.toLowerCase().includes('available apps')",
          { timeoutMs: 15_000, label: "available apps section" },
        );
        await ctx.expectText("Univer CLI", { timeoutMs: 15_000 });
        const univerCliCards = await ctx.eval(`(() => {
          const names = Array.from(document.querySelectorAll("[data-extension-name]")).map((element) => element.getAttribute("data-extension-name"));
          return {
            topLevelExtensionCount: names.filter((name) => name === "Univer CLI").length,
            standaloneSkillCount: names.filter((name) => name === "univer-cli").length,
            names,
          };
        })()`);
        ctx.assert(univerCliCards.topLevelExtensionCount === 1, `Expected exactly one Univer CLI card, saw ${JSON.stringify(univerCliCards.names)}.`);
        ctx.assert(univerCliCards.standaloneSkillCount === 0, `Expected no standalone univer-cli skill card, saw ${JSON.stringify(univerCliCards.names)}.`);
        ctx.recordEvidence({
          type: "assertion",
          status: "passed",
          assertion: "Univer CLI appears once and its installed univer-cli skill resource is not shown as a standalone app.",
          actual: JSON.stringify(univerCliCards),
        });
        await ctx.screenshot("univer-cli-available-apps-dedupe", {
          claim: "Available Apps shows the ready Univer CLI extension once, without a separate univer-cli skill card.",
          requireText: ["One-click connect", "Univer CLI"],
          rejectText: ["Something went wrong"],
          hashIncludes: "/settings/extensions/mcp",
        });
      },
    },
  ],
};
