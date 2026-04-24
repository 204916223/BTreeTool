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
}

const BASE_FIELDS = new Set(["timestamp", "node_uid", "nodeUid", "node_name", "nodeName", "status"]);

export function parsePlaybackLogText(source: string, fileName = "btlog"): PlaybackLogPayload {
  const rawRecords = extractJsonRecords(source);
  const warnings: string[] = [];
  const frames = rawRecords
    .map((record, index) => normalizeFrame(record, index, warnings))
    .filter((frame): frame is PlaybackFrame => frame !== null)
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
    warnings
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
