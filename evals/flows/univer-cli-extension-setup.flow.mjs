/**
 * Univer CLI built-in extension is discoverable and exposes installer controls.
 */
export default {
  id: "univer-cli-extension-setup",
  title: "Univer CLI extension exposes setup controls",
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
      name: "Navigate to built-in extension marketplace",
      run: async (ctx) => {
        await ctx.control("settings.panel.open", { panel: "cloud-marketplaces" });
        await ctx.waitFor("window.location.hash.includes('/settings/cloud-marketplaces')", {
          timeoutMs: 15_000,
          label: "settings marketplace route",
        });
        await ctx.expectText("Extension Marketplace", { timeoutMs: 30_000 });
      },
    },
    {
      name: "Univer CLI built-in is visible",
      run: async (ctx) => {
        await ctx.expectText("Univer CLI", { timeoutMs: 30_000 });
        await ctx.prove("Univer CLI appears as a built-in extension without requiring cloud sign-in", {
          action: async () => {
            const hash = await ctx.eval("window.location.hash");
            ctx.assert(typeof hash === "string" && hash.includes("/settings/cloud-marketplaces"), "Expected settings marketplace route.");
          },
          assert: async () => {
            await ctx.expectText("Univer CLI");
            await ctx.expectText("Browse built-in OpenWork extensions");
            await ctx.expectText("OpenWork Extension");
          },
          screenshot: {
            name: "univer-cli-built-in",
            requireText: ["Extension Marketplace", "Univer CLI", "Browse built-in OpenWork extensions"],
            rejectText: ["Something went wrong"],
          },
        });
      },
    },
    {
      name: "Setup panel exposes installer actions",
      run: async (ctx) => {
        await ctx.clickText("Univer CLI", { timeoutMs: 15_000 });
        await ctx.expectText("Univer CLI setup", { timeoutMs: 15_000 });
        await ctx.prove("Univer CLI detail exposes setup status, install, and repair controls", {
          action: async () => {
            await ctx.expectText("Univer CLI setup");
          },
          assert: async () => {
            await ctx.expectText("Check setup");
            await ctx.expectText("Install");
            await ctx.expectText("Repair");
          },
          screenshot: {
            name: "univer-cli-setup-panel",
            requireText: ["Univer CLI setup", "Check setup", "Install", "Repair"],
            rejectText: ["Something went wrong"],
          },
        });
      },
    },
    {
      name: "Existing install is detected under new id",
      run: async (ctx) => {
        await ctx.clickText("Check setup", { timeoutMs: 15_000 });
        await ctx.expectText("Univer CLI is ready for this workspace.", { timeoutMs: 30_000 });
        await ctx.prove("The renamed Univer CLI extension detects the existing local install without reinstalling", {
          action: async () => {
            await ctx.expectText("Univer CLI setup");
          },
          assert: async () => {
            await ctx.expectText("Ready");
            await ctx.expectText("Univer CLI is ready for this workspace.");
          },
          screenshot: {
            name: "univer-cli-existing-install-ready",
            requireText: ["Univer CLI setup", "Ready", "Univer CLI is ready for this workspace."],
            rejectText: ["Setup failed", "Failed to fetch hub file"],
          },
        });
      },
    },
  ],
};
