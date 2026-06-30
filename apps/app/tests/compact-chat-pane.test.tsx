import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  COMPACT_CHAT_EDGE_PADDING_CLASS,
  COMPACT_CHAT_SCROLL_PADDING_CLASS,
  COMPACT_CHAT_WIDTH_CLASS,
  COMPACT_COMPOSER_PANEL_CLASS,
  COMPACT_COMPOSER_SHELL_CLASS,
} from "../src/components/chat/compact-chat-layout";
import { MessageList } from "../src/components/chat/message-list";
import { MessageListProvider } from "../src/components/chat/message-list-provider";

const messages = [
  {
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text: "Create a payroll workbook." }],
  },
] satisfies UIMessage[];

function noop() {}

function renderMessages() {
  return renderToStaticMarkup(
    <MessageListProvider
      workspaceId="workspace"
      sessionId="session"
      showThinking={false}
      developerMode={false}
      displaySuggestions={false}
      providerConnectedCount={1}
      dispatchAction={noop}
      setPrompt={noop}
      onRevertToUserMessage={noop}
      onForkAtMessage={noop}
      onEditUserMessage={noop}
    >
      <MessageList messages={messages} status="ready" />
    </MessageListProvider>,
  );
}

describe("compact chat pane layout contract", () => {
  test("defines full-width chat and bottom-bar composer tokens", () => {
    expect(COMPACT_CHAT_WIDTH_CLASS).toContain("max-w-[1280px]");
    expect(COMPACT_CHAT_SCROLL_PADDING_CLASS).toContain("px-2");
    expect(COMPACT_CHAT_EDGE_PADDING_CLASS).toContain("px-1");
    expect(COMPACT_COMPOSER_SHELL_CLASS).toContain("border-t");
    expect(COMPACT_COMPOSER_SHELL_CLASS).not.toContain("rounded");
    expect(COMPACT_COMPOSER_PANEL_CLASS).toContain("bg-transparent");
    expect(COMPACT_COMPOSER_PANEL_CLASS).not.toContain("focus-within");
    expect(COMPACT_COMPOSER_PANEL_CLASS).not.toContain("border");
    expect(COMPACT_COMPOSER_PANEL_CLASS).not.toContain("rounded");
  });

  test("renders messages in full-width frames with compact footer actions", () => {
    const html = renderMessages();

    expect(html).toContain("max-w-none");
    expect(html).not.toContain("max-w-3xl");
    expect(html).toContain("aria-label=\"Copy message\"");
    expect(html).toContain("aria-label=\"Edit message\"");
    expect(html).toContain("aria-label=\"Branch in new chat\"");
    expect(html).toContain("aria-label=\"Revert\"");
    expect(html).toContain("size-6");
  });
});
