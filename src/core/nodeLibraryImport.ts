import { promises as fs } from "node:fs";
import * as path from "node:path";
import { BtNodeModel, BtPortModel } from "./btAst";
import { parseBehaviorTreeDocument } from "./parse";

const NODE_LIBRARY_CATEGORY_NAMES = ["Action", "Condition", "Control", "Decorator"] as const;
const NODE_LIBRARY_CATEGORIES = new Set<string>(NODE_LIBRARY_CATEGORY_NAMES);
export const DEFAULT_NODE_LIBRARY_BACKUP_FILE = "defaultnode.btt";

export interface NodeLibraryImportResult {
  importedCount: number;
  skippedCount: number;
  writtenFiles: string[];
  conflicts: NodeLibraryImportConflict[];
  canceled: boolean;
}

export interface DefaultNodeLibraryBackupResult {
  backedUpCount: number;
  backupFilePath: string;
}

export interface RestoreDefaultNodeLibraryResult {
  restoredCount: number;
  removedCount: number;
}

export interface NodeLibraryImportConflict {
  nodeId: string;
  category: "Action" | "Condition" | "Control" | "Decorator";
  filePath: string;
}

export type NodeLibraryConflictDecision = "overwrite" | "skip" | "cancel";

export interface NodeLibraryImportOptions {
  resolveConflicts?: (conflicts: NodeLibraryImportConflict[]) => Promise<NodeLibraryConflictDecision>;
}

type NodeLibraryImportEntry = {
  nodeId: string;
  category: "Action" | "Condition" | "Control" | "Decorator";
  filePath: string;
  content: string;
};

export async function importTreeNodesModelToNodeLibrary(
  source: string,
  libraryRootPath: string,
  options: NodeLibraryImportOptions = {}
): Promise<NodeLibraryImportResult> {
  const document = parseBehaviorTreeDocument(source);
  const entriesByFilePath = new Map<string, NodeLibraryImportEntry>();
  const writtenFiles: string[] = [];
  let skippedCount = 0;

  for (const model of document.nodeModels) {
    const category = toNodeLibraryCategory(model.modelKind);
    if (!category) {
      skippedCount += 1;
      continue;
    }

    const fileName = `${sanitizeFileName(model.id)}.btt`;
    const categoryPath = path.join(libraryRootPath, category);
    const filePath = path.join(categoryPath, fileName);
    entriesByFilePath.set(filePath, {
      nodeId: model.id,
      category,
      filePath,
      content: serializeNodeModel(model, category)
    });
  }

  const entries = Array.from(entriesByFilePath.values());
  const conflicts = await findConflicts(entries);
  let conflictDecision: NodeLibraryConflictDecision = "overwrite";
  if (conflicts.length > 0) {
    conflictDecision = options.resolveConflicts ? await options.resolveConflicts(conflicts) : "overwrite";
  }

  if (conflictDecision === "cancel") {
    return {
      importedCount: 0,
      skippedCount: skippedCount + entries.length,
      writtenFiles: [],
      conflicts,
      canceled: true
    };
  }

  const skippedConflictPaths = new Set(
    conflictDecision === "skip" ? conflicts.map((conflict) => conflict.filePath) : []
  );

  for (const entry of entries) {
    if (skippedConflictPaths.has(entry.filePath)) {
      skippedCount += 1;
      continue;
    }

    await fs.mkdir(path.dirname(entry.filePath), { recursive: true });
    await fs.writeFile(entry.filePath, entry.content, "utf8");
    writtenFiles.push(entry.filePath);
  }

  return {
    importedCount: writtenFiles.length,
    skippedCount,
    writtenFiles,
    conflicts,
    canceled: false
  };
}

export async function createDefaultNodeLibraryBackup(
  libraryRootPath: string,
  backupFilePath = path.join(libraryRootPath, DEFAULT_NODE_LIBRARY_BACKUP_FILE)
): Promise<DefaultNodeLibraryBackupResult> {
  const files = await listNodeLibraryFiles(libraryRootPath);
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<DefaultNodeLibrary version="1">`
  ];

  for (const file of files) {
    const content = await fs.readFile(path.join(libraryRootPath, file), "utf8");
    lines.push(`  <file path="${escapeXml(file)}" encoding="base64">${Buffer.from(content, "utf8").toString("base64")}</file>`);
  }

  lines.push(`</DefaultNodeLibrary>`);
  await fs.writeFile(backupFilePath, `${lines.join("\n")}\n`, "utf8");
  return {
    backedUpCount: files.length,
    backupFilePath
  };
}

export async function restoreDefaultNodeLibrary(
  libraryRootPath: string,
  backupFilePath = path.join(libraryRootPath, DEFAULT_NODE_LIBRARY_BACKUP_FILE)
): Promise<RestoreDefaultNodeLibraryResult> {
  const backupSource = await fs.readFile(backupFilePath, "utf8");
  const backupFiles = parseDefaultNodeLibraryBackup(backupSource);
  const currentFiles = await listNodeLibraryFiles(libraryRootPath);

  for (const file of currentFiles) {
    await fs.rm(path.join(libraryRootPath, file), { force: true });
  }

  for (const file of backupFiles) {
    const targetPath = path.join(libraryRootPath, file.relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, file.content, "utf8");
  }

  return {
    restoredCount: backupFiles.length,
    removedCount: currentFiles.length
  };
}

async function listNodeLibraryFiles(libraryRootPath: string): Promise<string[]> {
  const files: string[] = [];

  for (const category of NODE_LIBRARY_CATEGORY_NAMES) {
    const categoryPath = path.join(libraryRootPath, category);
    let entries: Array<{ name: string; isFile: boolean }>;

    try {
      entries = (await fs.readdir(categoryPath, { withFileTypes: true })).map((entry) => ({
        name: entry.name,
        isFile: entry.isFile()
      }));
    } catch (error) {
      if (isNotFoundError(error)) {
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      if (entry.isFile && entry.name.toLowerCase().endsWith(".btt")) {
        files.push(`${category}/${entry.name}`);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function parseDefaultNodeLibraryBackup(source: string): Array<{ relativePath: string; content: string }> {
  const files: Array<{ relativePath: string; content: string }> = [];
  const pattern = /<file\b([^>]*)>([\s\S]*?)<\/file>/g;

  for (const match of source.matchAll(pattern)) {
    const attrs = parseAttributes(match[1] || "");
    if (attrs.encoding !== "base64" || !attrs.path) {
      continue;
    }

    files.push({
      relativePath: normalizeBackupFilePath(attrs.path),
      content: Buffer.from((match[2] || "").replace(/\s+/g, ""), "base64").toString("utf8")
    });
  }

  return files;
}

function normalizeBackupFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const [category, fileName, ...rest] = normalized.split("/");
  if (
    rest.length > 0 ||
    !NODE_LIBRARY_CATEGORIES.has(category || "") ||
    !fileName ||
    fileName.includes("..") ||
    !fileName.toLowerCase().endsWith(".btt")
  ) {
    throw new Error(`Invalid node library backup path: ${filePath}`);
  }

  return `${category}/${fileName}`;
}

async function findConflicts(entries: NodeLibraryImportEntry[]): Promise<NodeLibraryImportConflict[]> {
  const conflicts: NodeLibraryImportConflict[] = [];

  for (const entry of entries) {
    try {
      const existing = await fs.readFile(entry.filePath, "utf8");
      if (existing !== entry.content) {
        conflicts.push({
          nodeId: entry.nodeId,
          category: entry.category,
          filePath: entry.filePath
        });
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  return conflicts;
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function toNodeLibraryCategory(modelKind: string): "Action" | "Condition" | "Control" | "Decorator" | null {
  return NODE_LIBRARY_CATEGORIES.has(modelKind) ? modelKind as "Action" | "Condition" | "Control" | "Decorator" : null;
}

function serializeNodeModel(model: BtNodeModel, category: "Action" | "Condition" | "Control" | "Decorator"): string {
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<node name="${escapeXml(model.id)}" category="${category}" modelKind="${escapeXml(model.modelKind)}" allowCustomAttributes="true">`
  ];

  for (const port of model.ports) {
    lines.push(`  ${serializePort(port)}`);
  }

  lines.push("</node>");
  return `${lines.join("\n")}\n`;
}

function serializePort(port: BtPortModel): string {
  const attributes = orderPortAttributes(port.attributes);
  const attributeText = attributes
    .map(([key, value]) => `${key}="${escapeXml(value)}"`)
    .join(" ");
  return `<${port.tagName}${attributeText ? ` ${attributeText}` : ""} />`;
}

function orderPortAttributes(attributes: Record<string, string>): Array<[string, string]> {
  const preferred = ["name", "type", "default", "description", "required"];
  const entries = Object.entries(attributes);
  const byKey = new Map(entries);
  const ordered: Array<[string, string]> = [];

  for (const key of preferred) {
    if (byKey.has(key)) {
      ordered.push([key, byKey.get(key) || ""]);
      byKey.delete(key);
    }
  }

  return [
    ...ordered,
    ...Array.from(byKey.entries()).sort(([left], [right]) => left.localeCompare(right))
  ];
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*"([^"]*)"/g;
  for (const match of source.matchAll(pattern)) {
    attrs[match[1]] = decodeXmlEntities(match[2] ?? "");
  }
  return attrs;
}

function sanitizeFileName(value: string): string {
  const sanitized = value.trim().replace(/[\/\\:*?"<>|]/g, "_");
  return sanitized || "UnnamedNode";
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll(`"`, "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&quot;", `"`)
    .replaceAll("&apos;", `'`)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
