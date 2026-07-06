import { discoverLocalUniverfiles } from "@univer/cowork/node";
import { relative, resolve } from "node:path";

export type UniverTargetSummary = {
  path: string;
  name: string;
  size: number;
  updatedAt: number;
  unitCount: number | null;
};

export async function discoverUniverTargets(workspaceRoot: string): Promise<UniverTargetSummary[]> {
  const root = resolve(workspaceRoot);
  const items = await discoverLocalUniverfiles(root);
  return items
    .map((item) => ({
      path: relative(root, item.localPath).replace(/\\/g, "/"),
      name: item.displayName,
      size: item.size,
      updatedAt: item.updatedAt,
      unitCount: null,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}
