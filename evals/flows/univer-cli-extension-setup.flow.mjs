/**
 * Univer CLI built-in bundle is discoverable and exposes local repair controls.
 */
export default {
  id: "univer-cli-extension-setup",
  title: "Univer CLI built-in bundle exposes setup controls",
  steps: [
    {
      name: "App booted",
      run: async (ctx) => {
        await ctx.waitFor("Boolean(window.__openworkControl)", {
          timeoutMs: 30_000,
          label: "control API",
        });
        await ctx.eval(`(() => {
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
      name: "Navigate to Available Apps",
      run: async (ctx) => {
        await ctx.navigateHash("/settings/extensions/mcp");
        await ctx.waitFor("window.location.hash.includes('/settings/extensions/mcp')", {
          timeoutMs: 15_000,
          label: "settings extensions route",
        });
        await ctx.waitFor(
          "document.body.innerText.toLowerCase().includes('available apps')",
          { timeoutMs: 30_000, label: "available apps section" },
        );
      },
    },
    {
      name: "Univer CLI built-in bundle is visible",
      run: async (ctx) => {
        await ctx.expectText("Univer CLI", { timeoutMs: 30_000 });
        await ctx.waitFor(`
          (() => {
            const card = document.querySelector('[data-extension-name="Univer CLI"]');
            const text = card ? card.textContent : "";
            return text.includes("Connected") && text.includes("View details") && !text.includes("Tap to connect");
          })()
        `, {
          timeoutMs: 30_000,
          label: "Univer CLI built-in bundle connected card",
        });
        await ctx.prove("Univer CLI appears as a connected built-in bundle without an install step", {
          action: async () => {
            const hash = await ctx.eval("window.location.hash");
            ctx.assert(typeof hash === "string" && hash.includes("/settings/extensions/mcp"), "Expected settings extensions route.");
          },
          assert: async () => {
            const cardText = await ctx.eval(`(() => {
              const card = document.querySelector('[data-extension-name="Univer CLI"]');
              return card ? card.textContent : "";
            })()`);
            ctx.assert(
              typeof cardText === "string" &&
                cardText.includes("Connected") &&
                cardText.includes("View details") &&
                cardText.includes("Built-in Univer cowork bundle") &&
                !cardText.includes("Tap to connect"),
              `Unexpected Univer CLI card text: ${JSON.stringify(cardText)}.`,
            );
          },
          screenshot: {
            name: "univer-cli-built-in",
            requireText: ["AVAILABLE APPS", "Univer CLI", "Connected", "View details"],
            rejectText: ["Something went wrong"],
            hashIncludes: "/settings/extensions/mcp",
          },
        });
      },
    },
    {
      name: "Setup panel exposes bundle actions",
      run: async (ctx) => {
        await ctx.clickText("Univer CLI", { timeoutMs: 15_000 });
        await ctx.expectText("Univer built-in bundle", { timeoutMs: 15_000 });
        await ctx.prove("Univer CLI detail exposes built-in bundle status and local repair controls", {
          action: async () => {
            await ctx.expectText("Univer built-in bundle");
          },
          assert: async () => {
            await ctx.expectText("Ready");
            await ctx.expectText("Univer bundle is ready for this workspace.");
            await ctx.expectText("Built into OpenWork");
            await ctx.expectText("Version");
            await ctx.expectText("Source");
            await ctx.expectText("Command");
            await ctx.expectText("Bundle");
            await ctx.expectText("Executable");
            await ctx.expectText("Check setup");
            await ctx.expectText("Repair bundle");
            await ctx.expectNoText("Install");
            await ctx.expectNoText("Auto-update managed CLI");
          },
          screenshot: {
            name: "univer-cli-setup-panel",
            requireText: ["Univer built-in bundle", "Ready", "Built into OpenWork", "Version", "Source", "Command", "Bundle", "Executable", "Check setup", "Repair bundle"],
            rejectText: ["Something went wrong", "Install", "Auto-update managed CLI"],
          },
        });
      },
    },
  ],
};
