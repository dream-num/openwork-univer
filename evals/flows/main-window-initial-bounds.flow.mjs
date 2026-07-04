/**
 * Main window initial bounds.
 *
 * Proves that the Electron shell opens close to the current display's
 * available work area instead of the old fixed 1180x820 default.
 */

const METRICS_EXPRESSION = `(() => {
  const metrics = {
    userAgent: navigator.userAgent,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    availWidth: screen.availWidth,
    availHeight: screen.availHeight,
    devicePixelRatio: window.devicePixelRatio,
  };
  if (!metrics.userAgent.includes("Electron")) return { ...metrics, electron: false };
  if (!Number.isFinite(metrics.outerWidth) || !Number.isFinite(metrics.outerHeight)) return null;
  if (!Number.isFinite(metrics.availWidth) || !Number.isFinite(metrics.availHeight)) return null;
  return { ...metrics, electron: true };
})()`;

export default {
  id: "main-window-initial-bounds",
  title: "Electron main window opens at the screen work area size",
  spec: "apps/desktop/electron/main.mjs",
  steps: [
    {
      name: "Initial Electron window bounds match the available screen area",
      run: async (ctx) => {
        const metrics = await ctx.waitFor(METRICS_EXPRESSION, {
          timeoutMs: 30_000,
          label: "Electron window metrics",
        });
        ctx.assert(metrics.electron === true, "This flow must run against the Electron app target.");
        ctx.log(`window metrics: ${JSON.stringify(metrics)}`);

        await ctx.prove("The Electron main window opens using the screen's available work area", {
          action: async () => {},
          assert: async () => {
            const latest = await ctx.eval(METRICS_EXPRESSION);
            ctx.assert(latest?.electron === true, "Missing Electron window metrics.");

            const widthDelta = Math.abs(latest.outerWidth - latest.availWidth);
            const heightDelta = Math.abs(latest.outerHeight - latest.availHeight);
            const allowedWidthDelta = Math.max(48, Math.floor(latest.availWidth * 0.05));
            const allowedHeightDelta = Math.max(96, Math.floor(latest.availHeight * 0.12));

            ctx.assert(
              widthDelta <= allowedWidthDelta,
              `Expected window width to match available width. ${JSON.stringify({ widthDelta, allowedWidthDelta, latest })}`,
            );
            ctx.assert(
              heightDelta <= allowedHeightDelta,
              `Expected window height to match available height. ${JSON.stringify({ heightDelta, allowedHeightDelta, latest })}`,
            );
          },
          screenshot: {
            name: "main-window-work-area",
            claim: "The app window visibly opens across the available screen area.",
          },
        });
      },
    },
  ],
};
