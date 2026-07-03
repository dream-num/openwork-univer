/**
 * Permission panel layout.
 *
 * Proves that inline permission approvals keep the prompt readable and place
 * actions in their own row instead of squeezing the title/description column.
 */

async function selectedSessionId(ctx) {
  const route = await ctx.eval("window.__openworkControl.snapshot().route");
  if (typeof route !== "string") return null;
  const marker = "/session/";
  const markerIndex = route.indexOf(marker);
  if (markerIndex < 0) return null;
  return route.slice(markerIndex + marker.length).split(/[/?#]/)[0] || null;
}

async function waitForCreatedSession(ctx, beforeSessionIds) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    const sessions = await ctx.control("session.list_sessions");
    if (Array.isArray(sessions)) {
      const created = sessions.find((session) => (
        typeof session?.sessionId === "string" && !beforeSessionIds.has(session.sessionId)
      ));
      if (created?.sessionId) return created.sessionId;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for a created session in session.list_sessions.");
}

async function closeBlockingDialogs(ctx) {
  await ctx.eval(`(() => {
    for (const label of ["Continue without OpenWork Models", "Close"]) {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        candidate.textContent?.trim() === label && !candidate.disabled
      );
      if (button) button.click();
    }
    return true;
  })()`);
}

async function ensureSession(ctx) {
  await ctx.waitFor("Boolean(window.__openworkControl)", {
    timeoutMs: 60_000,
    label: "control API",
  });
  await closeBlockingDialogs(ctx);

  let routeState = await ctx.waitFor(`(() => {
    const control = window.__openworkControl;
    const route = control.snapshot().route || "";
    if (route.startsWith("/welcome") || route.startsWith("/signin")) return "blocked";
    const action = control.listActions().find((candidate) => candidate.id === "session.create_task");
    if (action && !action.disabled) return "ready";
    return null;
  })()`, {
    timeoutMs: 30_000,
    label: "session.create_task action",
  });
  if (routeState === "blocked") {
    throw new Error("Profile is not onboarded; permission panel layout requires a workspace.");
  }
  if (routeState !== "ready") {
    await ctx.control("route.session");
    await closeBlockingDialogs(ctx);
    routeState = await ctx.waitFor(`(() => {
      const control = window.__openworkControl;
      const action = control.listActions().find((candidate) => candidate.id === "session.create_task");
      if (action && !action.disabled) return "ready";
      return null;
    })()`, {
      timeoutMs: 60_000,
      label: "session.create_task action after route reset",
    });
  }
  const beforeSessionId = await selectedSessionId(ctx);
  const beforeSessions = await ctx.control("session.list_sessions");
  const beforeSessionIds = new Set(
    Array.isArray(beforeSessions)
      ? beforeSessions
        .map((session) => typeof session?.sessionId === "string" ? session.sessionId : "")
        .filter(Boolean)
      : [],
  );
  await ctx.control("session.create_task");
  await closeBlockingDialogs(ctx);
  try {
    await ctx.waitFor(`(() => {
      const route = window.__openworkControl.snapshot().route || "";
      if (!route.includes("/session/")) return false;
      const before = ${JSON.stringify(beforeSessionId)};
      return !before || !route.includes(before);
    })()`, {
      timeoutMs: 15_000,
      label: "new session route",
    });
  } catch {
    const createdSessionId = await waitForCreatedSession(ctx, beforeSessionIds);
    await ctx.control("session.open", { sessionId: createdSessionId });
    await ctx.waitFor(
      `(() => {
        const route = window.__openworkControl.snapshot().route || "";
        return route.includes(${JSON.stringify(createdSessionId)});
      })()`,
      { timeoutMs: 30_000, label: "opened created session route" },
    );
  }
}

async function seedExternalDirectoryPermission(ctx) {
  const workspace = await ctx.control("eval.workspace.info");
  ctx.assert(workspace?.ok === true, "Workspace info action did not return ok.");
  const sessionId = await selectedSessionId(ctx);
  ctx.assert(typeof sessionId === "string" && sessionId.length > 0, "No selected session id.");

  const seeded = await ctx.eval(`(() => {
    const queryClient = globalThis.__owReactQueryClient;
    if (!queryClient) return { ok: false, reason: "missing query client" };
    const workspaceId = ${JSON.stringify(workspace.workspaceId)};
    const sessionId = ${JSON.stringify(sessionId)};
    queryClient.setQueryData(["react-session-permissions", workspaceId, sessionId], [{
      id: "eval-external-directory-permission",
      sessionID: sessionId,
      permission: "external_directory",
      patterns: ["/tmp/*"],
      metadata: { path: "/tmp/*" },
      always: { session: true, project: false },
      receivedAt: Date.now(),
      protocol: "legacy"
    }]);
    return { ok: true };
  })()`);
  ctx.assert(seeded?.ok === true, seeded?.reason ?? "Could not seed permission state.");
}

function panelLayoutMeasurementExpression() {
  return `(() => {
    function smallestExactText(text) {
      return Array.from(document.querySelectorAll("div,p,span")).filter((element) =>
        (element.textContent || "").trim() === text
      ).sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return leftRect.width * leftRect.height - rightRect.width * rightRect.height;
      })[0] || null;
    }
    const title = smallestExactText("Access an external folder?");
    const message = smallestExactText("Review the folder before allowing access outside the workspace.");
    const buttons = ["Deny", "Allow once", "Allow for session"].map((label) =>
      Array.from(document.querySelectorAll("button")).find((button) =>
        (button.textContent || "").trim() === label
      ) || null
    );
    const panel = Array.from(document.querySelectorAll("div")).filter((element) => {
      const text = element.innerText || "";
      return text.includes("Access an external folder?")
        && text.includes("External directory")
        && text.includes("/tmp/*")
        && text.includes("Allow once");
    }).sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return leftRect.width * leftRect.height - rightRect.width * rightRect.height;
    })[0] || null;
    if (!title || !message || !panel || buttons.some((button) => !button)) return null;
    const titleRect = title.getBoundingClientRect();
    const messageRect = message.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const buttonRects = buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        text: (button.textContent || "").trim(),
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
    });
    function overlaps(left, right) {
      return left.left < right.right
        && left.right > right.left
        && left.top < right.bottom
        && left.bottom > right.top;
    }
    const overlappingPairs = [];
    for (let leftIndex = 0; leftIndex < buttonRects.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < buttonRects.length; rightIndex += 1) {
        if (overlaps(buttonRects[leftIndex], buttonRects[rightIndex])) {
          overlappingPairs.push([buttonRects[leftIndex].text, buttonRects[rightIndex].text]);
        }
      }
    }
    return {
      titleWidth: titleRect.width,
      titleHeight: titleRect.height,
      messageBottom: messageRect.bottom,
      firstButtonTop: Math.min(...buttonRects.map((rect) => rect.top)),
      panelLeft: panelRect.left,
      panelRight: panelRect.right,
      buttonRects,
      overlappingPairs,
      buttonsInsidePanel: buttonRects.every((rect) =>
        rect.left >= panelRect.left - 1 && rect.right <= panelRect.right + 1
      )
    };
  })()`;
}

export default {
  id: "permission-panel-layout",
  title: "Permission panel keeps approval actions readable",
  spec: "evals/react-session-flows.md",
  precondition: async (ctx) => {
    await ctx.waitFor("Boolean(window.__openworkControl)", {
      timeoutMs: 60_000,
      label: "control API",
    });
    await closeBlockingDialogs(ctx);
    const routeState = await ctx.waitFor(`(() => {
      const route = window.__openworkControl.snapshot().route || "";
      if (route.startsWith("/welcome") || route.startsWith("/signin")) return "blocked";
      const action = window.__openworkControl.listActions().find((candidate) => candidate.id === "session.create_task");
      if (action && !action.disabled) return "ready";
      return null;
    })()`, {
      timeoutMs: 30_000,
      label: "workspace session availability",
    });
    return routeState === "blocked"
      ? "Profile is not onboarded; permission panel layout requires a workspace."
      : null;
  },
  steps: [
    {
      name: "External-directory approval stays readable",
      run: async (ctx) => {
        await ctx.prove("External-directory permission approval keeps copy and actions in separate readable blocks.", {
          action: async () => {
            await ensureSession(ctx);
            await seedExternalDirectoryPermission(ctx);
            await ctx.waitForText("Access an external folder?", { timeoutMs: 30_000 });
            await ctx.waitForText("Allow once", { timeoutMs: 30_000 });
          },
          assert: async () => {
            const measurement = await ctx.waitFor(panelLayoutMeasurementExpression(), {
              timeoutMs: 10_000,
              label: "permission panel layout measurement",
            });
            ctx.assert(measurement.titleWidth >= 180, `Permission title is squeezed: ${JSON.stringify(measurement)}`);
            ctx.assert(
              measurement.firstButtonTop >= measurement.messageBottom + 6,
              `Permission actions are not below the prompt copy: ${JSON.stringify(measurement)}`,
            );
            ctx.assert(measurement.overlappingPairs.length === 0, `Permission buttons overlap: ${JSON.stringify(measurement)}`);
            ctx.assert(measurement.buttonsInsidePanel === true, `Permission buttons overflow the panel: ${JSON.stringify(measurement)}`);
            ctx.recordEvidence({
              type: "assertion",
              status: "passed",
              assertion: "Permission title, copy, and approval buttons fit without overlap.",
              actual: measurement,
            });
          },
          screenshot: {
            name: "external-directory-permission-panel",
            requireText: ["Access an external folder?", "External directory", "/tmp/*", "Deny", "Allow once", "Allow for session"],
            rejectText: ["Something went wrong", "Application error"],
          },
        });
      },
    },
  ],
};
