import { describe, expect, test } from "bun:test";

describe("session route Univer task routing", () => {
  test("routes overview and terminal Univer sessions into a new bound task on send", async () => {
    const source = await Bun.file(new URL("../src/react-app/shell/session-route.tsx", import.meta.url)).text();
    const createBranchStart = source.indexOf("sourceSession.univerSessionKind === \"overview\"");
    const createBranchEnd = source.indexOf("targetSessionId = created.id;", createBranchStart);
    const createBranch = source.slice(createBranchStart, createBranchEnd);

    expect(createBranchStart).toBeGreaterThan(0);
    expect(createBranchEnd).toBeGreaterThan(createBranchStart);
    expect(createBranch).toContain("sourceSession.sessionUniverWorktreeTerminalState");
    expect(createBranch).toContain("opencodeClient.session.create");
    expect(createBranch).toContain("title: seededTitle");
    expect(createBranch).toContain("univerSourceSessionId: sourceSession.id");
  });

  test("promotes direct Univerfile mentions only from General Sessions before send", async () => {
    const source = await Bun.file(new URL("../src/react-app/shell/session-route.tsx", import.meta.url)).text();
    const beforeSendStart = source.indexOf("onBeforeSendDraft: async");
    const beforeSendEnd = source.indexOf("onSendDraft: async", beforeSendStart);
    const beforeSend = source.slice(beforeSendStart, beforeSendEnd);

    expect(beforeSendStart).toBeGreaterThan(0);
    expect(beforeSendEnd).toBeGreaterThan(beforeSendStart);
    expect(beforeSend).toContain("if (!isGeneralUniverLifecycleSession(sourceSession)) return draft");
    expect(beforeSend).toContain("directComposerUniverMentions(draft)");
    expect(beforeSend).toContain("requestUniverPrimaryChoice(mentionedTargets)");
    expect(beforeSend).toContain("applySessionUniverLifecycle");
    expect(beforeSend).toContain("event: \"directMention\"");
  });

  test("applies univer new lifecycle results locally so sidebar grouping or handoff focus moves immediately", async () => {
    const sessionPage = await Bun.file(new URL("../src/react-app/domains/session/chat/session-page.tsx", import.meta.url)).text();
    const lifecycleStart = sessionPage.indexOf("const resolution = resolveSessionUniverNewLifecycle");
    const lifecycleEnd = sessionPage.indexOf("resolveSessionUniverWorktreePersistence", lifecycleStart);
    const lifecycleBranch = sessionPage.slice(lifecycleStart, lifecycleEnd);

    expect(lifecycleStart).toBeGreaterThan(0);
    expect(lifecycleEnd).toBeGreaterThan(lifecycleStart);
    expect(lifecycleBranch).toContain("applySessionUniverLifecycle");
    expect(lifecycleBranch).toContain("props.onSessionUniverMetadataChanged");
    expect(lifecycleBranch).toContain("result.sourceMetadata");
    expect(lifecycleBranch).toContain("result.createdSession");
    expect(lifecycleBranch).toContain("props.onSessionUniverLifecycleSessionCreated");

    const route = await Bun.file(new URL("../src/react-app/shell/session-route.tsx", import.meta.url)).text();
    const pageStart = route.indexOf("<SessionPage");
    const pageEnd = route.indexOf("sidebar={{", pageStart);
    const pageProps = route.slice(pageStart, pageEnd);

    expect(pageStart).toBeGreaterThan(0);
    expect(pageEnd).toBeGreaterThan(pageStart);
    expect(pageProps).toContain("onSessionUniverMetadataChanged={applySessionUniverMetadataLocally}");
    expect(pageProps).toContain("onSessionUniverLifecycleSessionCreated={applyCreatedUniverLifecycleSessionLocally}");
    expect(pageProps).toContain("isFreshUniverLifecycleTarget={isFreshUniverLifecycleTarget}");

    const controlActions = await Bun.file(new URL("../src/react-app/domains/session/control/session-control-actions.ts", import.meta.url)).text();
    const controlStart = controlActions.indexOf("id: \"eval.session.apply_univer_lifecycle\"");
    const controlEnd = controlActions.indexOf("id: \"session.list_sessions\"", controlStart);
    const controlBranch = controlActions.slice(controlStart, controlEnd);

    expect(controlStart).toBeGreaterThan(0);
    expect(controlEnd).toBeGreaterThan(controlStart);
    expect(controlBranch).toContain("applySessionUniverLifecycle");
    expect(controlBranch).toContain("onSessionUniverMetadataChanged");
    expect(controlBranch).toContain("onSessionUniverLifecycleSessionCreated");
    expect(controlBranch).toContain("result.sourceMetadata ?? result.metadata");
    expect(controlBranch).toContain("result.action === \"createdSession\"");
    expect(controlBranch).toContain("onSessionUniverLifecycleSessionCreated?.(selectedWorkspaceId, result.createdSession)");
    expect(controlBranch).toContain("navigateToSession(result.createdSession.id)");

    const controlHookStart = route.indexOf("useSessionControlActions({");
    const controlHookEnd = route.indexOf("});", controlHookStart);
    const controlHookProps = route.slice(controlHookStart, controlHookEnd);
    expect(controlHookProps).toContain("onSessionUniverLifecycleSessionCreated: applyCreatedUniverLifecycleSessionLocally");

    const localCreateStart = route.indexOf("const applyCreatedUniverLifecycleSessionLocally");
    const localCreateEnd = route.indexOf("const isFreshUniverLifecycleTarget", localCreateStart);
    const localCreateBranch = route.slice(localCreateStart, localCreateEnd);
    expect(localCreateBranch).toContain("sessionsByWorkspaceIdRef.current = next");
    expect(localCreateBranch.indexOf("sessionsByWorkspaceIdRef.current = next")).toBeLessThan(
      localCreateBranch.indexOf("void refreshRouteState()"),
    );

    const localMetadataStart = route.indexOf("const applySessionUniverMetadataLocally");
    const localMetadataEnd = route.indexOf("const applyCreatedUniverLifecycleSessionLocally", localMetadataStart);
    const localMetadataBranch = route.slice(localMetadataStart, localMetadataEnd);
    expect(localMetadataBranch).toContain("univerLifecycleOrigin: metadata.univerLifecycleOrigin ?? null");
    expect(localMetadataBranch).toContain("sessionsByWorkspaceIdRef.current = next");
  });

  test("records a baseline of existing univer new targets when direct mention starts a General-origin run", async () => {
    const source = await Bun.file(new URL("../src/react-app/shell/session-route.tsx", import.meta.url)).text();
    const beforeSendStart = source.indexOf("onBeforeSendDraft: async");
    const beforeSendEnd = source.indexOf("onSendDraft: async", beforeSendStart);
    const beforeSend = source.slice(beforeSendStart, beforeSendEnd);

    expect(beforeSendStart).toBeGreaterThan(0);
    expect(beforeSendEnd).toBeGreaterThan(beforeSendStart);
    expect(beforeSend).toContain("paletteAccessibleTargets");
    expect(beforeSend).toContain("isUniverNewLifecycleTarget");
    expect(beforeSend).toContain("generalOriginLifecycleBaselineTargetIdsRef.current.set");
    expect(beforeSend).toContain("activeGeneralOriginLifecycleSessionIdsRef.current.add");
  });

  test("creates missing-state recovery tasks without inheriting the old worktree id", async () => {
    const source = await Bun.file(new URL("../src/react-app/shell/session-route.tsx", import.meta.url)).text();
    const handlerStart = source.indexOf("const handleCreateTaskFromUniverSession");
    const handlerEnd = source.indexOf("const handleOpenUniverTargetOverview", handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThan(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    expect(handler).toContain("sourceSession.id");
    expect(handler).not.toContain("sessionUniverWorktreeId");
  });
});
