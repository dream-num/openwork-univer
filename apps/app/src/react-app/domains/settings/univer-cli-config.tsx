/** @jsxImportSource react */
import { CheckCircle2, Loader2, PackageCheck, RefreshCw, Wrench, XCircle } from "lucide-react";

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
import { registerExtensionRuntime, type ExtensionConfigContext, type UniverCliVersionInfo } from "./extension-registry";

export type UniverCliConfigProps = {
  busy: boolean;
  status: string | null;
  error: string | null;
  ready: boolean | null;
  checking: boolean;
  versionInfo: UniverCliVersionInfo | null;
  onCheck: () => void | Promise<void>;
  onRepair: () => void | Promise<void>;
};

const univerCliConfigFactory = (ctx: ExtensionConfigContext) => (
  <UniverCliConfig
    busy={ctx.univerCli.busy}
    status={ctx.univerCli.status}
    error={ctx.univerCli.error}
    ready={ctx.univerCli.ready}
    checking={ctx.univerCli.checking}
    versionInfo={ctx.univerCli.versionInfo}
    onCheck={ctx.univerCli.onCheck}
    onRepair={ctx.univerCli.onRepair}
  />
);

registerExtensionRuntime({
  id: "univer-cli",
  settingsPanel: univerCliConfigFactory,
  settingsPanelRefs: ["openwork.univerCli.setup"],
  isConnected: (_entry, ctx) => ctx.extensionConnections?.["univer-cli"] === true,
});

function sourceLabel(source: string) {
  if (source === "bundled") return "Built into OpenWork";
  if (source === "override") return "Development Univer Executable Override";
  if (source === "unresolved") return "Unresolved";
  return source;
}

function displayValue(value: string | null) {
  return value && value.trim() ? value : "Not detected";
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
  return (
    <Card variant="outline" size="sm">
      <CardHeader>
        <CardTitle>Offline-Ready Univer Distribution</CardTitle>
        <CardDescription>
          Cowork, Univer SDK, CLI, native bindings, and the canonical skill update together with OpenWork.
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
            <AlertTitle>Needs attention</AlertTitle>
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
              <Badge variant="outline">Atomic with OpenWork</Badge>
            </div>
            <div className="space-y-2">
              <VersionRow label="Source" value={sourceLabel(info.source)} />
              <VersionRow label="Command" value={displayValue(info.commandVersion)} />
              <VersionRow label="CLI package" value={displayValue(info.packageVersion)} />
              <VersionRow label="Executable" value={displayValue(info.path)} />
              {info.source === "override" ? <VersionRow label="Distribution" value="OpenWork compatibility set plus executable override" /> : null}
            </div>
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 border-t border-border">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void props.onCheck()} disabled={props.busy}>
            {props.busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw size={14} />}
            Check setup
          </Button>
          <Button variant="outline" onClick={() => void props.onRepair()} disabled={props.busy}>
            {props.busy ? <Loader2 className="size-4 animate-spin" /> : <Wrench size={14} />}
            Repair distribution
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
