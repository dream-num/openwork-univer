import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { UniverTarget } from "../src/react-app/domains/session/artifacts/univer-cowork-session";
import { OfficeWorktreePopover, WorkspaceFilesPopover } from "../src/react-app/domains/session/panel/workspace-file-tree-popover";

function noop() {}

function renderWithQueryClient(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      {node}
    </QueryClientProvider>,
  );
}

const univerTarget = {
  id: "file:artifacts/payroll.univer",
  kind: "file",
  value: "artifacts/payroll.univer",
  name: "payroll.univer",
  preview: "univer",
  confidence: 100,
  reason: "test",
} satisfies UniverTarget;

describe("composer toolbar context entrypoints", () => {
  test("renders Files as a workspace-scoped toolbar entry point", () => {
    const html = renderToStaticMarkup(
      <WorkspaceFilesPopover
        open={false}
        onOpenChange={noop}
        sessionId="session-1"
        client={null}
        workspaceId="workspace-1"
        workspaceRoot="/workspace"
        onArtifactOpen={noop}
      />,
    );

    expect(html).toContain("composer-toolbar-files");
    expect(html).toContain("Files");
    expect(html).not.toContain("workspace-cowork-panel");
  });

  test("renders Changes only when a Univer artifact target is active", () => {
    const noTargetHtml = renderWithQueryClient(
      <OfficeWorktreePopover
        open={false}
        onOpenChange={noop}
        sessionId="session-1"
        client={null}
        workspaceId="workspace-1"
        target={null}
        onArtifactOpen={noop}
      />,
    );
    const univerHtml = renderWithQueryClient(
      <OfficeWorktreePopover
        open={false}
        onOpenChange={noop}
        sessionId="session-1"
        client={null}
        workspaceId="workspace-1"
        target={univerTarget}
        onArtifactOpen={noop}
      />,
    );

    expect(noTargetHtml).not.toContain("composer-toolbar-changes");
    expect(univerHtml).toContain("composer-toolbar-changes");
    expect(univerHtml).toContain("Changes");
  });

  test("places transient composer accessories above the toolbar slot", async () => {
    const source = await Bun.file(new URL("../src/react-app/domains/session/surface/composer/composer.tsx", import.meta.url)).text();
    const toolbarIndex = source.indexOf("data-testid=\"composer-toolbar-slot\"");
    const topAccessoryIndex = source.indexOf("props.topAccessory");

    expect(toolbarIndex).toBeGreaterThan(-1);
    expect(topAccessoryIndex).toBeGreaterThan(-1);
    expect(topAccessoryIndex).toBeLessThan(toolbarIndex);
  });
});
