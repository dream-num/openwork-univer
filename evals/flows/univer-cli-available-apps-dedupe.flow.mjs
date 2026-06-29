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
        await ctx.eval(`(() => {
          for (const key of Object.keys(window.localStorage)) {
            if (key.startsWith("openwork.univerCli.ready.")) window.localStorage.removeItem(key);
          }
          window.location.hash = "#/settings/extensions/mcp";
          window.location.reload();
          return true;
        })()`);
        await ctx.waitFor("Boolean(window.__openworkControl)", {
          timeoutMs: 30_000,
          label: "control API after reload",
        });
      },
    },
    {
      name: "Univer CLI setup status is refreshed in Available Apps",
      run: async (ctx) => {
        await ctx.navigateHash("/settings/extensions/mcp");
        await ctx.waitFor("window.location.hash.includes('/settings/extensions/mcp')", {
          timeoutMs: 15_000,
          label: "settings extensions route",
        });
        await ctx.waitFor(
          "document.body.innerText.toLowerCase().includes('available apps')",
          { timeoutMs: 15_000, label: "available apps section" },
        );
        await ctx.expectText("Univer CLI", { timeoutMs: 30_000 });
        const initialCardState = await ctx.eval(`(() => {
          const card = document.querySelector('[data-extension-name="Univer CLI"]');
          return card ? card.textContent : "";
        })()`);
        ctx.assert(
          typeof initialCardState === "string" && !initialCardState.includes("Tap to connect"),
          `Expected Univer CLI to avoid the false Tap to connect state, saw ${JSON.stringify(initialCardState)}.`,
        );
        ctx.recordEvidence({
          type: "assertion",
          status: "passed",
          assertion: "Univer CLI card does not show Tap to connect while setup status is still resolving.",
          actual: JSON.stringify(initialCardState),
        });
        await ctx.waitFor(`
          (() => {
            const card = document.querySelector('[data-extension-name="Univer CLI"]');
            const text = card ? card.textContent : "";
            return text.includes("Connected") && text.includes("View details") && !text.includes("Tap to connect");
          })()
        `, {
          timeoutMs: 30_000,
          label: "Univer CLI Available Apps connected state",
        });
        ctx.recordEvidence({
          type: "assertion",
          status: "passed",
          assertion: "Available Apps refreshes the Univer CLI setup state automatically.",
        });
      },
    },
    {
      name: "Available Apps shows only the extension card",
      run: async (ctx) => {
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
          requireText: ["One-click connect", "Univer CLI", "Connected", "View details"],
          rejectText: ["Something went wrong"],
          hashIncludes: "/settings/extensions/mcp",
        });
      },
    },
  ],
};
