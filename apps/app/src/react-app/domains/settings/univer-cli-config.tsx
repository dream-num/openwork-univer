/** @jsxImportSource react */
import { CheckCircle2, Loader2, PackageCheck, RefreshCw, Wrench, XCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { registerExtensionRuntime, type ExtensionConfigContext } from "./extension-registry";

export type UniverCliConfigProps = {
  busy: boolean;
  status: string | null;
  error: string | null;
  ready: boolean;
  onCheck: () => void | Promise<void>;
  onInstall: () => void | Promise<void>;
  onRepair: () => void | Promise<void>;
};

const univerCliConfigFactory = (ctx: ExtensionConfigContext) => (
  <UniverCliConfig
    busy={ctx.univerCli.busy}
    status={ctx.univerCli.status}
    error={ctx.univerCli.error}
    ready={ctx.univerCli.ready}
    onCheck={ctx.univerCli.onCheck}
    onInstall={ctx.univerCli.onInstall}
    onRepair={ctx.univerCli.onRepair}
  />
);

registerExtensionRuntime({
  id: "univer-cli",
  settingsPanel: univerCliConfigFactory,
  settingsPanelRefs: ["openwork.univerCli.setup"],
  isConnected: (_entry, ctx) => ctx.extensionConnections?.["univer-cli"] === true,
});

export function UniverCliConfig(props: UniverCliConfigProps) {
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
      </CardContent>
      <CardFooter className="flex-wrap gap-2 border-t border-border justify-between">
        <Button variant="outline" onClick={() => void props.onCheck()} disabled={props.busy}>
          {props.busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw size={14} />}
          Check setup
        </Button>
        <Button onClick={() => void props.onInstall()} disabled={props.busy || props.ready}>
          {props.busy ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck size={14} />}
          Install
        </Button>
        <Button variant="outline" onClick={() => void props.onRepair()} disabled={props.busy}>
          {props.busy ? <Loader2 className="size-4 animate-spin" /> : <Wrench size={14} />}
          Repair
        </Button>
      </CardFooter>
    </Card>
  );
}
