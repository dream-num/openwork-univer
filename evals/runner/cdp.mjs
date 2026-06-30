/**
 * Minimal Chrome DevTools Protocol client for the eval runner.
 *
 * Zero dependencies: uses the global fetch + WebSocket available in Node 22+.
 * Mirrors the pattern proven in apps/app/scripts/voice-cdp.mjs.
 */

export async function listTargets(baseUrl) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/json/list`);
  if (!response.ok) {
    throw new Error(`Could not list CDP targets at ${baseUrl}: ${response.status}`);
  }
  return response.json();
}

export async function pickAppTarget(baseUrl) {
  const targets = await listTargets(baseUrl);
  const pages = targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
  const target =
    pages.find((page) => page.title === "OpenWork") ??
    pages.find(
      (page) =>
        page.url.includes("localhost") ||
        page.url.includes("127.0.0.1") ||
        page.url.includes("[::1]"),
    ) ??
    pages[0];
  if (!target) {
    throw new Error(`No CDP page target found at ${baseUrl}.`);
  }
  return target;
}

/**
 * Chromium reports webSocketDebuggerUrl with its own local host
 * (e.g. ws://127.0.0.1:9825/devtools/page/<id>), which breaks when the
 * endpoint is reached through a proxy (e.g. Daytona preview URLs).
 * Rebuild the ws URL on the base URL's host and scheme.
 */
export function debuggerUrlFor(baseUrl, target) {
  const base = new URL(baseUrl);
  const ws = new URL(target.webSocketDebuggerUrl);
  ws.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  ws.hostname = base.hostname;
  ws.port = base.port;
  return ws.toString();
}

/**
 * Probe a list of CDP base URL candidates and return the first that responds.
 */
export async function resolveCdpBaseUrl(candidates) {
  const errors = [];
  for (const candidate of candidates) {
    try {
      await listTargets(candidate);
      return candidate;
    } catch (error) {
      errors.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(
    `No CDP endpoint reachable. Tried:\n  ${errors.join("\n  ")}\n` +
      "Start the app first (pnpm dev) or pass --cdp-url.",
  );
}

export function connect(webSocketDebuggerUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketDebuggerUrl);
    let nextId = 1;
    const pending = new Map();
    let opened = false;

    const rejectPending = (error) => {
      for (const callbacks of pending.values()) callbacks.reject(error);
      pending.clear();
    };

    socket.addEventListener("open", () => {
      opened = true;
      resolve({
        close: () => socket.close(),
        send(method, params = {}, sessionId) {
          const id = nextId++;
          return new Promise((innerResolve, innerReject) => {
            pending.set(id, { resolve: innerResolve, reject: innerReject });
            try {
              socket.send(JSON.stringify({ id, method, params, ...(sessionId === undefined ? {} : { sessionId }) }));
            } catch (error) {
              pending.delete(id);
              innerReject(error);
            }
          });
        },
      });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const callbacks = pending.get(message.id);
      if (!callbacks) return;
      pending.delete(message.id);
      if (message.error) callbacks.reject(new Error(message.error.message));
      else callbacks.resolve(message.result);
    });
    socket.addEventListener("error", () => {
      const error = new Error("CDP websocket failed.");
      rejectPending(error);
      if (!opened) reject(error);
    });
    socket.addEventListener("close", () => {
      const error = new Error("CDP websocket closed.");
      rejectPending(error);
      if (!opened) reject(error);
    });
  });
}

export async function evaluate(client, expression, { awaitPromise = false, contextId, sessionId } = {}) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
    ...(contextId === undefined ? {} : { contextId }),
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        "Evaluation failed.",
    );
  }
  return result.result?.value;
}

export async function evaluateInFrameUrl(client, frameUrl, expression, options = {}) {
  const frames = await listFrames(client);
  const frame = frames.find((candidate) => matchesFrameUrl(candidate.url, frameUrl));
  if (frame) {
    const world = await client.send("Page.createIsolatedWorld", {
      frameId: frame.id,
      worldName: "openwork-eval-runner",
      grantUniveralAccess: true,
    });
    return evaluate(client, expression, { ...options, contextId: world.executionContextId });
  }

  const targets = await client.send("Target.getTargets");
  const target = (targets.targetInfos ?? []).find((candidate) => matchesFrameUrl(candidate.url, frameUrl));
  if (!target) {
    const frameUrls = frames.map((candidate) => candidate.url).join("\n  ");
    const targetUrls = (targets.targetInfos ?? []).map((candidate) => `${candidate.type}: ${candidate.url}`).join("\n  ");
    throw new Error(`Could not find frame URL ${frameUrl}. Frames:\n  ${frameUrls}\nTargets:\n  ${targetUrls}`);
  }

  const attached = await client.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  try {
    return await evaluate(client, expression, { ...options, sessionId: attached.sessionId });
  } finally {
    await client.send("Target.detachFromTarget", { sessionId: attached.sessionId }).catch(() => undefined);
  }
}

function matchesFrameUrl(candidate, expected) {
  if (candidate === expected) return true;
  try {
    const candidateUrl = new URL(candidate);
    const expectedUrl = new URL(expected);
    if (
      candidateUrl.protocol !== expectedUrl.protocol ||
      candidateUrl.host !== expectedUrl.host ||
      candidateUrl.pathname !== expectedUrl.pathname ||
      candidateUrl.hash !== expectedUrl.hash
    ) {
      return false;
    }
    return sameSearchParams(candidateUrl.searchParams, expectedUrl.searchParams);
  } catch {
    return false;
  }
}

function sameSearchParams(candidate, expected) {
  const keys = new Set([...candidate.keys(), ...expected.keys()]);
  for (const key of keys) {
    const candidateValues = candidate.getAll(key).sort();
    const expectedValues = expected.getAll(key).sort();
    if (candidateValues.length !== expectedValues.length) return false;
    for (let index = 0; index < candidateValues.length; index += 1) {
      if (candidateValues[index] !== expectedValues[index]) return false;
    }
  }
  return true;
}

async function listFrames(client) {
  const tree = await client.send("Page.getFrameTree");
  const frames = [];
  collectFrame(tree.frameTree, frames);
  return frames;
}

function collectFrame(node, frames) {
  if (!node) return;
  if (node.frame) frames.push(node.frame);
  for (const child of node.childFrames ?? []) collectFrame(child, frames);
}

export async function captureScreenshot(client) {
  const result = await client.send("Page.captureScreenshot", { format: "png" });
  return Buffer.from(result.data, "base64");
}
