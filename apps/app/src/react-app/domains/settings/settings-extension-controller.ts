/** @jsxImportSource react */
import { useCallback } from "react";

import type { McpDirectoryInfo } from "../../../app/constants";
import { evaluateEnablement, type EnablementContext } from "../../../app/enablement";
import type { OpenworkServerClient } from "../../../app/lib/openwork-server";
import type { McpServerEntry } from "../../../app/types";
import { getExtensionConfigSlot, getExtensionConnected, type ExtensionConfigContext, type UniverCliVersionInfo } from "./extension-registry";
import type { LocalProviderInstallInput } from "./openai-image-extension";

type ProviderLike = {
  id: string;
  source?: string | null;
};

type SettingsExtensionControllerInput = {
  openworkServerClient: OpenworkServerClient | null;
  hostOpenworkServerClient: OpenworkServerClient | null;
  enablementContext: EnablementContext;
  mcpServers: McpServerEntry[];
  mcpConnectingName: string | null;
  onComputerUsePermissionsChange: (permissions: { accessibility: boolean; screenRecording: boolean }) => void;
  googleWorkspaceConnected: boolean;
  setGoogleWorkspaceConnected: (connected: boolean) => void;
  restartLocalServer?: () => Promise<boolean>;
  connectMcp: (entry: McpDirectoryInfo) => void | Promise<void>;
  refreshMcpServers: () => void | Promise<void>;
  providers: ProviderLike[];
  providerConnectedIds: string[];
  userEnvKeys: string[];
  imageExtension: {
    busy: boolean;
    status: string | null;
    error: string | null;
    onInstall: (apiKey: string) => void | Promise<void>;
    onTestGenerate: (input: { apiKey: string; prompt: string }) => void | Promise<void>;
  };
  voiceExtension: {
    busy: boolean;
    status: string | null;
    error: string | null;
    onSaveApiKey: (apiKey: string) => void | Promise<void>;
    onTestSession: () => void | Promise<void>;
  };
  univerCli: {
    busy: boolean;
    status: string | null;
    error: string | null;
    ready: boolean | null;
    checking: boolean;
    versionInfo: UniverCliVersionInfo | null;
    onCheck: () => void | Promise<void>;
    onRepair: () => void | Promise<void>;
  };
  localProvider: {
    busy: boolean;
    status: string | null;
    error: string | null;
    onInstall: (input: LocalProviderInstallInput) => void | Promise<void>;
  };
};

function hasOpenAiEnv(input: Pick<SettingsExtensionControllerInput, "providers" | "providerConnectedIds" | "userEnvKeys">) {
  return input.userEnvKeys.includes("OPENAI_REALTIME_API_KEY") ||
    input.userEnvKeys.includes("OPENAI_API_KEY") ||
    input.userEnvKeys.includes("OPENWORK_OPENAI_IMAGE_API_KEY") ||
    input.providers.some((provider) => provider.id === "openai" && provider.source === "env") ||
    input.providerConnectedIds.includes("openai");
}

export function useSettingsExtensionController(input: SettingsExtensionControllerInput) {
  const configContextForEntry = useCallback((entry: McpDirectoryInfo): ExtensionConfigContext => ({
    openworkServerClient: input.openworkServerClient,
    hostOpenworkServerClient: input.hostOpenworkServerClient,
    restartLocalServer: input.restartLocalServer,
    extensionConnections: {
      "google-workspace": input.googleWorkspaceConnected,
      "univer-cli": input.univerCli.ready === true,
    },
    onExtensionConnectionChange: (extensionId, connected) => {
      if (extensionId === "google-workspace") input.setGoogleWorkspaceConnected(connected);
    },
    computerUse: {
      connected: input.mcpServers.some((server) => server.name === "computer-use"),
      connecting: input.mcpConnectingName === entry.name,
      onConnect: () => input.connectMcp(entry),
      onRefresh: input.refreshMcpServers,
      onPermissionsChange: input.onComputerUsePermissionsChange,
    },
    imageExtension: {
      ...input.imageExtension,
      envKeyDetected: hasOpenAiEnv(input),
    },
    voiceExtension: {
      ...input.voiceExtension,
      envKeyDetected: hasOpenAiEnv(input),
    },
    univerCli: input.univerCli,
    localProvider: input.localProvider,
  }), [input]);

  const configSlotForEntry = useCallback(
    (entry: McpDirectoryInfo) => getExtensionConfigSlot(entry, configContextForEntry(entry)),
    [configContextForEntry],
  );

  const isConnected = useCallback((entry: McpDirectoryInfo) => {
    if (entry.extensionManifest?.enablement) {
      return evaluateEnablement(entry.extensionManifest.enablement, input.enablementContext).active;
    }
    const runtimeConnected = getExtensionConnected(entry, {
      openworkServerClient: input.openworkServerClient,
      extensionConnections: {
        "google-workspace": input.googleWorkspaceConnected,
        "univer-cli": input.univerCli.ready === true,
      },
    });
    return runtimeConnected ?? false;
  }, [input]);

  const isChecking = useCallback((entry: McpDirectoryInfo) => {
    const id = entry.extensionManifest?.id ?? entry.serverName ?? entry.name;
    return id === "univer-cli" ? input.univerCli.checking : false;
  }, [input]);

  return {
    configContextForEntry,
    configSlotForEntry,
    isConnected,
    isChecking,
  };
}
