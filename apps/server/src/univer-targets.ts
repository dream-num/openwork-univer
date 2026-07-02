import { readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

export type UniverTargetSummary = {
  path: string;
  name: string;
  size: number;
  updatedAt: number;
  unitCount: number | null;
};

const MAX_DISCOVERY_DEPTH = 8;
const MAX_DISCOVERY_ENTRIES = 10_000;
const GENERATED_OR_DEPENDENCY_DIRS = new Set([
  "node_modules",
  "bower_components",
  "dist",
  "build",
  "coverage",
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  ".vite",
  ".turbo",
  ".vercel",
  ".opencode",
  ".openwork",
  "target",
  "tmp",
  "temp",
]);

function relativePathSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function isHiddenOrGeneratedPath(path: string): boolean {
  const segments = relativePathSegments(path);
  return segments.some((segment) => segment.startsWith(".") || GENERATED_OR_DEPENDENCY_DIRS.has(segment));
}

function isVisibleUniverFile(path: string): boolean {
  return path.toLowerCase().endsWith(".univer") && !isHiddenOrGeneratedPath(path);
}

export async function discoverUniverTargets(workspaceRoot: string): Promise<UniverTargetSummary[]> {
  const root = resolve(workspaceRoot);
  const items: UniverTargetSummary[] = [];
  let visited = 0;

  async function walk(dirPath: string, depth: number): Promise<void> {
    if (depth > MAX_DISCOVERY_DEPTH || visited >= MAX_DISCOVERY_ENTRIES) return;
    let entries: Dirent[];
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (visited >= MAX_DISCOVERY_ENTRIES) return;
      visited += 1;

      const absolutePath = join(dirPath, entry.name);
      const relativePath = relative(root, absolutePath).replace(/\\/g, "/");
      if (!relativePath || isHiddenOrGeneratedPath(relativePath)) continue;

      if (entry.isDirectory()) {
        await walk(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile() || !isVisibleUniverFile(relativePath)) continue;

      try {
        const info = await stat(absolutePath);
        items.push({
          path: relativePath,
          name: basename(relativePath),
          size: info.size,
          updatedAt: info.mtimeMs,
          unitCount: null,
        });
      } catch {
        continue;
      }
    }
  }

  await walk(root, 0);
  return items.sort((left, right) => left.path.localeCompare(right.path));
}
