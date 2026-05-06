export type PlaybackNodeStatus = "IDLE" | "RUNNING" | "SUCCESS" | "FAILURE" | string;

export interface PlaybackFrame {
  timestamp: number;
  timestampMs: number;
  offsetMs: number;
  nodeUid: string;
  nodeName: string;
  status: PlaybackNodeStatus;
  blackboardData: Record<string, unknown>;
}

export interface PlaybackLogPayload {
  fileName: string;
  frameCount: number;
  durationMs: number;
  frames: PlaybackFrame[];
  warnings: string[];
  treeName?: string;
  treeXml?: string;
  xmlHash?: string;
}

const BASE_FIELDS = new Set([
  "timestamp",
  "t",
  "duration",
  "node_uid",
  "nodeUid",
  "uid",
  "node_name",
  "nodeName",
  "name",
  "status",
  "type"
]);

export function parsePlaybackLogText(source: string, fileName = "btlog"): PlaybackLogPayload {
  const rawRecords = extractJsonRecords(source);
  const warnings: string[] = [];
  const eventPayload = rawRecords.some((record) => isObject(record) && typeof record.type === "string")
    ? normalizeEventRecords(rawRecords, warnings)
    : null;
  const frames = (eventPayload?.frames || rawRecords
    .map((record, index) => normalizeFrame(record, index, warnings))
    .filter((frame): frame is PlaybackFrame => frame !== null))
    .sort((left, right) => left.timestampMs - right.timestampMs);

  if (frames.length === 0) {
    throw new Error("No valid playback records were found.");
  }

  const startMs = frames[0].timestampMs;
  frames.forEach((frame) => {
    frame.offsetMs = Math.max(0, frame.timestampMs - startMs);
  });

  return {
    fileName,
    frameCount: frames.length,
    durationMs: frames[frames.length - 1].offsetMs,
    frames,
    warnings,
    treeName: eventPayload?.treeName,
    treeXml: eventPayload?.treeXml,
    xmlHash: eventPayload?.xmlHash
  };
}

function extractJsonRecords(source: string): unknown[] {
  const text = String(source || "").trim();
  if (!text) {
    return [];
  }

  const parsedWhole = tryParseJson(text);
  if (Array.isArray(parsedWhole)) {
    return parsedWhole;
  }
  if (isObject(parsedWhole)) {
    const container = parsedWhole as Record<string, unknown>;
    const nested = container.frames || container.records || container.data || container.logs;
    if (Array.isArray(nested)) {
      return nested;
    }
    return [container];
  }

  const records: unknown[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parsedLine = tryParseJson(trimmed);
    if (parsedLine !== null) {
      records.push(parsedLine);
      continue;
    }

    const pipeRecord = parsePipeRecord(trimmed);
    if (pipeRecord) {
      records.push(pipeRecord);
      continue;
    }

    const objectText = extractObjectText(trimmed);
    if (objectText) {
      const parsedObject = tryParseJson(objectText);
      if (parsedObject !== null) {
        records.push(parsedObject);
      }
    }
  }

  return records;
}

function normalizeEventRecords(
  records: unknown[],
  warnings: string[]
): Pick<PlaybackLogPayload, "frames" | "treeName" | "treeXml" | "xmlHash"> {
  const frames: PlaybackFrame[] = [];
  let currentBlackboard: Record<string, unknown> = {};
  let treeName: string | undefined;
  let treeXml: string | undefined;
  let xmlHash: string | undefined;

  records.forEach((record, index) => {
    if (!isObject(record)) {
      warnings.push(`Skipped record ${index + 1}: expected a JSON object.`);
      return;
    }

    const type = typeof record.type === "string" ? record.type : "";
    if (type === "tree_snapshot") {
      treeName = stringifyValue(record.tree_name ?? record.treeName) || treeName;
      treeXml = typeof record.xml === "string" ? record.xml : treeXml;
      xmlHash = stringifyValue(record.xml_hash ?? record.xmlHash) || xmlHash;
      return;
    }

    if (type === "blackboard_snapshot") {
      currentBlackboard = cloneRecord(record.values);
      return;
    }

    if (type === "blackboard_patch") {
      currentBlackboard = applyJsonPatch(currentBlackboard, Array.isArray(record.patch) ? record.patch : []);
      return;
    }

    if (type !== "node_status") {
      return;
    }

    const frame = normalizeFrame(
      {
        timestamp: record.timestamp ?? record.t,
        node_uid: record.node_uid ?? record.uid,
        node_name: record.node_name ?? record.name,
        status: record.status,
        blackboard_data: currentBlackboard
      },
      index,
      warnings
    );
    if (frame) {
      frames.push(frame);
    }
  });

  return {
    frames,
    treeName,
    treeXml,
    xmlHash
  };
}

function normalizeFrame(record: unknown, index: number, warnings: string[]): PlaybackFrame | null {
  if (!isObject(record)) {
    warnings.push(`Skipped record ${index + 1}: expected a JSON object.`);
    return null;
  }

  const source = record as Record<string, unknown>;
  const timestamp = toNumber(source.timestamp);
  if (!Number.isFinite(timestamp)) {
    warnings.push(`Skipped record ${index + 1}: missing timestamp.`);
    return null;
  }

  const status = typeof source.status === "string" ? normalizeStatus(source.status) : "";
  if (!status) {
    warnings.push(`Skipped record ${index + 1}: missing status.`);
    return null;
  }

  const nodeUid = stringifyValue(source.node_uid ?? source.nodeUid);
  const nodeName = stringifyValue(source.node_name ?? source.nodeName);
  if (!nodeUid && !nodeName) {
    warnings.push(`Skipped record ${index + 1}: missing node_uid and node_name.`);
    return null;
  }

  return {
    timestamp,
    timestampMs: normalizeTimestampMs(timestamp),
    offsetMs: 0,
    nodeUid,
    nodeName,
    status,
    blackboardData: normalizeBlackboardData(source)
  };
}

function parsePipeRecord(line: string): Record<string, unknown> | null {
  const parts = line.split("|");
  if (parts.length < 5) {
    return null;
  }

  const [timestamp, nodeUid, nodeName, duration, status] = parts;
  if (!timestamp || !nodeUid || !nodeName || !status || !Number.isFinite(Number(timestamp))) {
    return null;
  }

  const blackboardText = parts.slice(5).join("|");
  const blackboard = blackboardText.trim() ? tryParseJson(blackboardText) : {};
  return {
    timestamp,
    node_uid: nodeUid,
    node_name: nodeName,
    duration,
    status,
    blackboard_data: isObject(blackboard) ? blackboard : {}
  };
}

function normalizeBlackboardData(source: Record<string, unknown>): Record<string, unknown> {
  const nested = source.blackboard_data ?? source.blackboardData;
  if (isObject(nested)) {
    return nested as Record<string, unknown>;
  }

  const flat: Record<string, unknown> = {};
  Object.entries(source).forEach(([key, value]) => {
    if (!BASE_FIELDS.has(key)) {
      flat[key] = value;
    }
  });
  return flat;
}

function normalizeTimestampMs(timestamp: number): number {
  if (timestamp > 100_000_000_000_000) {
    return timestamp / 1000;
  }
  if (timestamp > 100_000_000_000) {
    return timestamp;
  }
  if (timestamp > 1_000_000_000) {
    return timestamp * 1000;
  }
  return timestamp;
}

function extractObjectText(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return Number(value);
  }
  return Number.NaN;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function normalizeStatus(value: string): string {
  return value
    .replace(/\u001b\[[0-9;]*m/g, "")
    .trim()
    .toUpperCase();
}

function applyJsonPatch(source: Record<string, unknown>, patch: unknown[]): Record<string, unknown> {
  const next = cloneRecord(source);
  for (const operation of patch) {
    if (!isObject(operation) || typeof operation.path !== "string") {
      continue;
    }

    const op = typeof operation.op === "string" ? operation.op : "";
    if (op !== "add" && op !== "replace" && op !== "remove") {
      continue;
    }

    applyJsonPatchOperation(next, op, operation.path, operation.value);
  }
  return next;
}

function applyJsonPatchOperation(target: unknown, op: string, path: string, value: unknown): void {
  const tokens = decodeJsonPointer(path);
  if (tokens.length === 0) {
    return;
  }

  let parent = target as Record<string, unknown> | unknown[];
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(parent)) {
      parent = parent[Number(token)] as Record<string, unknown> | unknown[];
    } else {
      parent = parent[token] as Record<string, unknown> | unknown[];
    }
    if (parent === null || typeof parent !== "object") {
      return;
    }
  }

  const key = tokens[tokens.length - 1];
  if (Array.isArray(parent)) {
    const index = key === "-" ? parent.length : Number(key);
    if (!Number.isInteger(index)) {
      return;
    }
    if (op === "remove") {
      parent.splice(index, 1);
    } else if (op === "add") {
      parent.splice(index, 0, cloneValue(value));
    } else {
      parent[index] = cloneValue(value);
    }
    return;
  }

  if (op === "remove") {
    delete parent[key];
  } else {
    parent[key] = cloneValue(value);
  }
}

function decodeJsonPointer(path: string): string[] {
  if (!path || path === "/") {
    return path === "/" ? [""] : [];
  }
  return path
    .replace(/^\//, "")
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function cloneRecord(value: unknown): Record<string, unknown> {
  const cloned = cloneValue(value);
  return isObject(cloned) ? cloned : {};
}

function cloneValue<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
