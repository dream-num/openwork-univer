/** @jsxImportSource react */
import { CheckCircle2, Download, Loader2, PackageCheck, RefreshCw, Wrench, XCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { registerExtensionRuntime, type ExtensionConfigContext, type UniverCliVersionInfo } from "./extension-registry";

export type UniverCliConfigProps = {
  busy: boolean;
  status: string | null;
  error: string | null;
  ready: boolean | null;
  checking: boolean;
  versionInfo: UniverCliVersionInfo | null;
  autoUpdate: boolean;
  onCheck: () => void | Promise<void>;
  onCheckUpdates: () => void | Promise<void>;
  onInstall: () => void | Promise<void>;
  onUpdate: () => void | Promise<void>;
  onRepair: () => void | Promise<void>;
  onAutoUpdateChange: (enabled: boolean) => void | Promise<void>;
};

const univerCliConfigFactory = (ctx: ExtensionConfigContext) => (
  <UniverCliConfig
    busy={ctx.univerCli.busy}
    status={ctx.univerCli.status}
    error={ctx.univerCli.error}
    ready={ctx.univerCli.ready}
    checking={ctx.univerCli.checking}
    versionInfo={ctx.univerCli.versionInfo}
    autoUpdate={ctx.univerCli.autoUpdate}
    onCheck={ctx.univerCli.onCheck}
    onCheckUpdates={ctx.univerCli.onCheckUpdates}
    onInstall={ctx.univerCli.onInstall}
    onUpdate={ctx.univerCli.onUpdate}
    onRepair={ctx.univerCli.onRepair}
    onAutoUpdateChange={ctx.univerCli.onAutoUpdateChange}
  />
);

registerExtensionRuntime({
  id: "univer-cli",
  settingsPanel: univerCliConfigFactory,
  settingsPanelRefs: ["openwork.univerCli.setup"],
  isConnected: (_entry, ctx) => ctx.extensionConnections?.["univer-cli"] === true,
});

function sourceLabel(source: string) {
  if (source === "managed") return "Managed npm";
  if (source === "override") return "Development override";
  if (source === "system") return "System PATH";
  if (source === "unresolved") return "Unresolved";
  return source;
}

function displayValue(value: string | null) {
  return value && value.trim() ? value : "Not detected";
}

function updateStatus(info: UniverCliVersionInfo | null) {
  if (!info) return "Not checked";
  if (info.registryStatus === "failed") return info.registryDetail ?? "Registry check failed";
  if (info.updateAvailable === true) return `Update available: ${info.latestVersion}`;
  if (info.updateAvailable === false) return "Up to date";
  return info.latestVersion ? `Latest: ${info.latestVersion}` : "Not checked";
}

function VersionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-all font-mono text-xs leading-5 text-foreground">{value}</div>
    </div>
  );
}

export function UniverCliConfig(props: UniverCliConfigProps) {
  const info = props.versionInfo;
  const canUpdateManaged = info?.source === "managed";
  return (
    <Card variant="outline" size="sm">
      <CardHeader>
        <CardTitle>Univer CLI setup</CardTitle>
        <CardDescription>
          Install the canonical skill package and managed executable for native .univer work.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {props.ready ? (
          <Alert>
            <CheckCircle2 />
            <AlertTitle>Ready</AlertTitle>
            <AlertDescription>{props.status ?? "Univer CLI is ready for this workspace."}</AlertDescription>
          </Alert>
        ) : props.checking ? (
          <Alert>
            <Loader2 className="size-4 animate-spin" />
            <AlertTitle>Checking setup</AlertTitle>
            <AlertDescription>Checking the Univer CLI setup for this workspace.</AlertDescription>
          </Alert>
        ) : props.status ? (
          <Alert variant="warning">
            <PackageCheck />
            <AlertTitle>Needs setup</AlertTitle>
            <AlertDescription>{props.status}</AlertDescription>
          </Alert>
        ) : null}

        {props.error ? (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Setup failed</AlertTitle>
            <AlertDescription>{props.error}</AlertDescription>
          </Alert>
        ) : null}

        {info ? (
          <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium">Version</div>
              <Badge variant={info.updateAvailable ? "secondary" : "outline"}>
                {updateStatus(info)}
              </Badge>
            </div>
            <div className="space-y-2">
              <VersionRow label="Source" value={sourceLabel(info.source)} />
              <VersionRow label="Command" value={displayValue(info.commandVersion)} />
              <VersionRow label="Package" value={displayValue(info.packageVersion)} />
              <VersionRow label="Latest" value={displayValue(info.latestVersion)} />
              <VersionRow label="Executable" value={displayValue(info.path)} />
              <VersionRow label="Install root" value={info.installRoot} />
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/20 p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Auto-update managed CLI</div>
            <div className="text-xs leading-5 text-muted-foreground">
              Check npm registry and update managed installs when this page opens.
            </div>
          </div>
          <Switch
            aria-label="Auto-update managed CLI"
            checked={props.autoUpdate}
            disabled={props.busy}
            onCheckedChange={(checked) => void props.onAutoUpdateChange(checked === true)}
            size="sm"
          />
        </div>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 border-t border-border">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void props.onCheck()} disabled={props.busy}>
            {props.busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw size={14} />}
            Check setup
          </Button>
          <Button onClick={() => void props.onInstall()} disabled={props.busy || props.ready === true}>
            {props.busy ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck size={14} />}
            Install
          </Button>
          <Button variant="outline" onClick={() => void props.onRepair()} disabled={props.busy}>
            {props.busy ? <Loader2 className="size-4 animate-spin" /> : <Wrench size={14} />}
            Repair
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void props.onCheckUpdates()} disabled={props.busy}>
            {props.busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw size={14} />}
            Check update
          </Button>
          <Button variant="outline" onClick={() => void props.onUpdate()} disabled={props.busy || !canUpdateManaged}>
            {props.busy ? <Loader2 className="size-4 animate-spin" /> : <Download size={14} />}
            Update
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
