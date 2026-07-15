import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { Buffer } from "node:buffer";
import { parseBehaviorTreeDocument } from "./parse";
import { buildPreviewDocument } from "./viewModel";
import type { BtPreviewDocument } from "./viewModel";
import type { BtUserSettings } from "../userSettings";

const MAGIC = Buffer.from("SBTLOG1\0", "utf8");
const FILE_LOGGER2_MAGIC = Buffer.from("BTCPP4-FileLogger2", "utf8");
const FILE_LOGGER2_TRANSITION_SIZE = 9;

export interface BtPlaybackHeader {
  type: string;
  schemaVersion: number;
  codec: string;
  treeName: string;
  rootNodeName: string;
  createdWallTimeUs: number | string | null;
  statusCodes: Record<string, string>;
  eventTypes: Record<string, string>;
  xml: string;
}

export interface BtPlaybackNodeDefinition {
  uid: number;
  name: string;
  nodeType: number | string | null;
}

export interface BtPlaybackTransition {
  frameIndex: number;
  seq: number;
  tUs: number;
  wallUs: number | string | null;
  uid: number;
  prevStatusCode: number | string | null;
  statusCode: number | string | null;
  prevStatus: string;
  status: string;
  durationUs: number | string | null;
}

export interface BtPlaybackBlackboardEvent {
  frameIndex: number;
  kind: "snapshot" | "patch";
  seq: number;
  tUs: number;
  wallUs: number | string | null;
  values?: unknown;
  patch?: unknown;
}

export interface BtPlaybackFrame {
  index: number;
  kind: "node" | "blackboard";
  tUs: number;
  wallUs: number | string | null;
  seq: number | null;
  transitionIndex?: number;
  blackboardIndex?: number;
}

export interface BtPlaybackLog {
  fileName: string;
  filePath: string;
  header: BtPlaybackHeader;
  preview: BtPreviewDocument;
  frames: BtPlaybackFrame[];
  transitions: BtPlaybackTransition[];
  blackboardEvents: BtPlaybackBlackboardEvent[];
  nodeDefinitions: BtPlaybackNodeDefinition[];
  compactTransitions?: BtCompactFileLogger2Transitions;
}

export interface BtCompactFileLogger2Transitions {
  codec: "filelogger2-base64-v1";
  transitionCount: number;
  trailingBytes: number;
  transitionBytesBase64: string;
}

export interface BtPlaybackDecodeOptions {
  allowTruncatedLog?: boolean;
}

type AsyncDecodeState = {
  lastYieldAt: number;
};

const ASYNC_DECODE_YIELD_INTERVAL_MS = 16;
const FILE_LOGGER2_ASYNC_BATCH_SIZE = 25_000;
const FILE_LOGGER2_COMPACT_THRESHOLD = 200_000;

export function decodeBtlogFile(
  filePath: string,
  settings: BtUserSettings,
  options: BtPlaybackDecodeOptions = {}
): BtPlaybackLog {
  const allowTruncatedLog = options.allowTruncatedLog === true;
  const compressed = fs.readFileSync(filePath);
  const bytes = maybeGunzip(compressed, allowTruncatedLog);

  if (
    bytes.length >= FILE_LOGGER2_MAGIC.length &&
    bytes.subarray(0, FILE_LOGGER2_MAGIC.length).equals(FILE_LOGGER2_MAGIC)
  ) {
    return decodeFileLogger2Bytes(filePath, bytes, settings, allowTruncatedLog);
  }

  if (bytes.length < MAGIC.length || !bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Unsupported btlog format: missing SBTLOG1 header.");
  }

  return decodeSbtlogBytes(filePath, bytes, settings, allowTruncatedLog);
}

export async function decodeBtlogFileAsync(
  filePath: string,
  settings: BtUserSettings,
  options: BtPlaybackDecodeOptions = {}
): Promise<BtPlaybackLog> {
  const allowTruncatedLog = options.allowTruncatedLog === true;
  const compressed = await fs.promises.readFile(filePath);
  return decodeBtlogBytesAsync(path.basename(filePath), filePath, compressed, settings, allowTruncatedLog);
}

export async function decodeBtlogContentAsync(
  fileName: string,
  bytes: Buffer,
  settings: BtUserSettings,
  options: BtPlaybackDecodeOptions = {}
): Promise<BtPlaybackLog> {
  return decodeBtlogBytesAsync(fileName, fileName, bytes, settings, options.allowTruncatedLog === true);
}

async function decodeBtlogBytesAsync(
  fileName: string,
  filePath: string,
  compressed: Buffer,
  settings: BtUserSettings,
  allowTruncatedLog: boolean
): Promise<BtPlaybackLog> {
  const bytes = await maybeGunzipAsync(compressed, allowTruncatedLog);
  const asyncState: AsyncDecodeState = { lastYieldAt: Date.now() };

  if (
    bytes.length >= FILE_LOGGER2_MAGIC.length &&
    bytes.subarray(0, FILE_LOGGER2_MAGIC.length).equals(FILE_LOGGER2_MAGIC)
  ) {
    return decodeFileLogger2BytesAsync(fileName, filePath, bytes, settings, allowTruncatedLog, asyncState);
  }

  if (bytes.length < MAGIC.length || !bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Unsupported btlog format: missing SBTLOG1 header.");
  }

  return decodeSbtlogBytesAsync(fileName, filePath, bytes, settings, allowTruncatedLog, asyncState);
}

function decodeSbtlogBytes(
  filePath: string,
  bytes: Buffer,
  settings: BtUserSettings,
  allowTruncatedLog: boolean
): BtPlaybackLog {
  let offset = MAGIC.length;
  let header: BtPlaybackHeader | null = null;
  const frames: BtPlaybackFrame[] = [];
  const transitions: BtPlaybackTransition[] = [];
  const blackboardEvents: BtPlaybackBlackboardEvent[] = [];
  const nodeDefinitions: BtPlaybackNodeDefinition[] = [];

  while (offset < bytes.length) {
    if (offset + 4 > bytes.length) {
      if (allowTruncatedLog) {
        break;
      }
      throw new Error("Corrupt btlog: truncated frame length.");
    }

    const frameLength = bytes.readUInt32LE(offset);
    offset += 4;
    const frameEnd = offset + frameLength;
    if (frameLength < 0 || frameEnd > bytes.length) {
      if (allowTruncatedLog) {
        break;
      }
      throw new Error("Corrupt btlog: frame payload exceeds file size.");
    }

    let payload: unknown;
    try {
      payload = decodeMsgpack(bytes.subarray(offset, frameEnd));
    } catch (error) {
      if (allowTruncatedLog && frameEnd >= bytes.length) {
        break;
      }
      if (allowTruncatedLog && isTruncationError(error)) {
        break;
      }
      throw error;
    }
    offset = frameEnd;

    if (isRecord(payload) && payload.type === "header") {
      header = normalizeHeader(payload);
      continue;
    }

    if (Array.isArray(payload)) {
      const frameIndex = frames.length;
      const eventType = String(payload[0] ?? "");
      if (eventType === "d") {
        nodeDefinitions.push({
          uid: toNumber(payload[1], 0),
          name: String(payload[2] ?? ""),
          nodeType: toScalar(payload[3])
        });
      } else if (eventType === "n") {
        const transition = normalizeTransition(payload, frameIndex, header?.statusCodes || {});
        const transitionIndex = transitions.length;
        transitions.push(transition);
        frames.push({
          index: frameIndex,
          kind: "node",
          tUs: transition.tUs,
          wallUs: transition.wallUs,
          seq: transition.seq,
          transitionIndex
        });
      } else if (eventType === "bs" || eventType === "bp") {
        const blackboardEvent = normalizeBlackboardEvent(payload, frameIndex, eventType);
        const blackboardIndex = blackboardEvents.length;
        blackboardEvents.push(blackboardEvent);
        frames.push({
          index: frameIndex,
          kind: "blackboard",
          tUs: blackboardEvent.tUs,
          wallUs: blackboardEvent.wallUs,
          seq: blackboardEvent.seq,
          blackboardIndex
        });
      }
    }
  }

  if (!header?.xml) {
    throw new Error("Unsupported btlog format: header XML was not found.");
  }

  const ast = parseBehaviorTreeDocument(header.xml);
  const preview = buildPreviewDocument(ast, settings);
  const normalizedNodeDefinitions = nodeDefinitions.length > 0
    ? nodeDefinitions
    : collectNodeDefinitionsFromPreview(preview);

  return {
    fileName: path.basename(filePath),
    filePath,
    header,
    preview,
    frames,
    transitions,
    blackboardEvents,
    nodeDefinitions: normalizedNodeDefinitions
  };
}

async function decodeSbtlogBytesAsync(
  fileName: string,
  filePath: string,
  bytes: Buffer,
  settings: BtUserSettings,
  allowTruncatedLog: boolean,
  asyncState: AsyncDecodeState
): Promise<BtPlaybackLog> {
  let offset = MAGIC.length;
  let header: BtPlaybackHeader | null = null;
  const frames: BtPlaybackFrame[] = [];
  const transitions: BtPlaybackTransition[] = [];
  const blackboardEvents: BtPlaybackBlackboardEvent[] = [];
  const nodeDefinitions: BtPlaybackNodeDefinition[] = [];

  while (offset < bytes.length) {
    if (offset + 4 > bytes.length) {
      if (allowTruncatedLog) {
        break;
      }
      throw new Error("Corrupt btlog: truncated frame length.");
    }

    const frameLength = bytes.readUInt32LE(offset);
    offset += 4;
    const frameEnd = offset + frameLength;
    if (frameLength < 0 || frameEnd > bytes.length) {
      if (allowTruncatedLog) {
        break;
      }
      throw new Error("Corrupt btlog: frame payload exceeds file size.");
    }

    let payload: unknown;
    try {
      payload = decodeMsgpack(bytes.subarray(offset, frameEnd));
    } catch (error) {
      if (allowTruncatedLog && frameEnd >= bytes.length) {
        break;
      }
      if (allowTruncatedLog && isTruncationError(error)) {
        break;
      }
      throw error;
    }
    offset = frameEnd;

    if (isRecord(payload) && payload.type === "header") {
      header = normalizeHeader(payload);
    } else if (Array.isArray(payload)) {
      const frameIndex = frames.length;
      const eventType = String(payload[0] ?? "");
      if (eventType === "d") {
        nodeDefinitions.push({
          uid: toNumber(payload[1], 0),
          name: String(payload[2] ?? ""),
          nodeType: toScalar(payload[3])
        });
      } else if (eventType === "n") {
        const transition = normalizeTransition(payload, frameIndex, header?.statusCodes || {});
        const transitionIndex = transitions.length;
        transitions.push(transition);
        frames.push({
          index: frameIndex,
          kind: "node",
          tUs: transition.tUs,
          wallUs: transition.wallUs,
          seq: transition.seq,
          transitionIndex
        });
      } else if (eventType === "bs" || eventType === "bp") {
        const blackboardEvent = normalizeBlackboardEvent(payload, frameIndex, eventType);
        const blackboardIndex = blackboardEvents.length;
        blackboardEvents.push(blackboardEvent);
        frames.push({
          index: frameIndex,
          kind: "blackboard",
          tUs: blackboardEvent.tUs,
          wallUs: blackboardEvent.wallUs,
          seq: blackboardEvent.seq,
          blackboardIndex
        });
      }
    }

    await yieldToEventLoopIfNeeded(asyncState);
  }

  if (!header?.xml) {
    throw new Error("Unsupported btlog format: header XML was not found.");
  }

  const ast = parseBehaviorTreeDocument(header.xml);
  const preview = buildPreviewDocument(ast, settings);
  const normalizedNodeDefinitions = nodeDefinitions.length > 0
    ? nodeDefinitions
    : collectNodeDefinitionsFromPreview(preview);

  return {
    fileName,
    filePath,
    header,
    preview,
    frames,
    transitions,
    blackboardEvents,
    nodeDefinitions: normalizedNodeDefinitions
  };
}

function decodeFileLogger2Bytes(
  filePath: string,
  bytes: Buffer,
  settings: BtUserSettings,
  allowTruncatedLog: boolean
): BtPlaybackLog {
  let offset = FILE_LOGGER2_MAGIC.length;
  if (offset + 1 + 4 > bytes.length) {
    throw new Error("Corrupt FileLogger2 btlog: truncated header.");
  }

  const protocol = bytes.readUInt8(offset);
  offset += 1;
  if (protocol !== 1) {
    throw new Error(`Unsupported FileLogger2 btlog protocol: ${protocol}.`);
  }

  const xmlLength = bytes.readInt32LE(offset);
  offset += 4;
  if (xmlLength <= 0 || offset + xmlLength + 8 > bytes.length) {
    throw new Error("Corrupt FileLogger2 btlog: XML payload exceeds file size.");
  }

  const xml = bytes.subarray(offset, offset + xmlLength).toString("utf8");
  offset += xmlLength;

  const createdWallTimeUs = bigintToSerializable(bytes.readBigInt64LE(offset));
  offset += 8;

  const ast = parseBehaviorTreeDocument(xml);
  const preview = buildPreviewDocument(ast, settings);
  const nodeDefinitions = collectNodeDefinitionsFromPreview(preview);
  const statusCodes = {
    0: "IDLE",
    1: "RUNNING",
    2: "SUCCESS",
    3: "FAILURE",
    4: "SKIPPED"
  };
  const header: BtPlaybackHeader = {
    type: "header",
    schemaVersion: 1,
    codec: "filelogger2",
    treeName: ast.mainTreeToExecute || preview.defaultTreeId || "",
    rootNodeName: preview.behaviorTrees.find((tree) => tree.id === (ast.mainTreeToExecute || preview.defaultTreeId))?.node?.title || "",
    createdWallTimeUs,
    statusCodes,
    eventTypes: {},
    xml
  };

  const frames: BtPlaybackFrame[] = [];
  const transitions: BtPlaybackTransition[] = [];
  const lastStatusByUid = new Map<number, number | string | null>();
  const runningStartByUid = new Map<number, number>();

  while (offset < bytes.length) {
    if (offset + FILE_LOGGER2_TRANSITION_SIZE > bytes.length) {
      if (allowTruncatedLog) {
        break;
      }
      throw new Error("Corrupt FileLogger2 btlog: truncated transition.");
    }

    const frameIndex = frames.length;
    const tUs = bytes.readUIntLE(offset, 6);
    offset += 6;
    const uid = bytes.readUInt16LE(offset);
    offset += 2;
    const statusCode = bytes.readUInt8(offset);
    offset += 1;

    const prevStatusCode = lastStatusByUid.get(uid) ?? 0;
    const transition = {
      frameIndex,
      seq: frameIndex + 1,
      tUs,
      wallUs: addScalarMicroseconds(createdWallTimeUs, tUs),
      uid,
      prevStatusCode,
      statusCode,
      prevStatus: statusCodeToName(prevStatusCode, statusCodes),
      status: statusCodeToName(statusCode, statusCodes),
      durationUs: resolveFileLogger2Duration(uid, statusCode, tUs, runningStartByUid)
    };

    transitions.push(transition);
    frames.push({
      index: frameIndex,
      kind: "node",
      tUs: transition.tUs,
      wallUs: transition.wallUs,
      seq: transition.seq,
      transitionIndex: transitions.length - 1
    });
    lastStatusByUid.set(uid, statusCode);
  }

  return {
    fileName: path.basename(filePath),
    filePath,
    header,
    preview,
    frames,
    transitions,
    blackboardEvents: [],
    nodeDefinitions
  };
}

async function decodeFileLogger2BytesAsync(
  fileName: string,
  filePath: string,
  bytes: Buffer,
  settings: BtUserSettings,
  allowTruncatedLog: boolean,
  asyncState: AsyncDecodeState
): Promise<BtPlaybackLog> {
  let offset = FILE_LOGGER2_MAGIC.length;
  if (offset + 1 + 4 > bytes.length) {
    throw new Error("Corrupt FileLogger2 btlog: truncated header.");
  }

  const protocol = bytes.readUInt8(offset);
  offset += 1;
  if (protocol !== 1) {
    throw new Error(`Unsupported FileLogger2 btlog protocol: ${protocol}.`);
  }

  const xmlLength = bytes.readInt32LE(offset);
  offset += 4;
  if (xmlLength <= 0 || offset + xmlLength + 8 > bytes.length) {
    throw new Error("Corrupt FileLogger2 btlog: XML payload exceeds file size.");
  }

  const xml = bytes.subarray(offset, offset + xmlLength).toString("utf8");
  offset += xmlLength;

  const createdWallTimeUs = bigintToSerializable(bytes.readBigInt64LE(offset));
  offset += 8;
  const transitionStartOffset = offset;

  const ast = parseBehaviorTreeDocument(xml);
  const preview = buildPreviewDocument(ast, settings);
  const nodeDefinitions = collectNodeDefinitionsFromPreview(preview);
  const statusCodes = {
    0: "IDLE",
    1: "RUNNING",
    2: "SUCCESS",
    3: "FAILURE",
    4: "SKIPPED"
  };
  const header: BtPlaybackHeader = {
    type: "header",
    schemaVersion: 1,
    codec: "filelogger2",
    treeName: ast.mainTreeToExecute || preview.defaultTreeId || "",
    rootNodeName: preview.behaviorTrees.find((tree) => tree.id === (ast.mainTreeToExecute || preview.defaultTreeId))?.node?.title || "",
    createdWallTimeUs,
    statusCodes,
    eventTypes: {},
    xml
  };

  const remainingBytes = bytes.length - transitionStartOffset;
  const compactTransitionCount = Math.floor(remainingBytes / FILE_LOGGER2_TRANSITION_SIZE);
  const compactTrailingBytes = remainingBytes % FILE_LOGGER2_TRANSITION_SIZE;
  if (compactTransitionCount >= FILE_LOGGER2_COMPACT_THRESHOLD) {
    const transitionBytesEnd = transitionStartOffset + compactTransitionCount * FILE_LOGGER2_TRANSITION_SIZE;
    return {
      fileName,
      filePath,
      header,
      preview,
      frames: [],
      transitions: [],
      blackboardEvents: [],
      nodeDefinitions,
      compactTransitions: {
        codec: "filelogger2-base64-v1",
        transitionCount: compactTransitionCount,
        trailingBytes: compactTrailingBytes,
        transitionBytesBase64: bytes.subarray(transitionStartOffset, transitionBytesEnd).toString("base64")
      }
    };
  }

  const frames: BtPlaybackFrame[] = [];
  const transitions: BtPlaybackTransition[] = [];
  const lastStatusByUid = new Map<number, number | string | null>();
  const runningStartByUid = new Map<number, number>();
  let batchCount = 0;

  while (offset < bytes.length) {
    if (offset + FILE_LOGGER2_TRANSITION_SIZE > bytes.length) {
      if (allowTruncatedLog) {
        break;
      }
      throw new Error("Corrupt FileLogger2 btlog: truncated transition.");
    }

    const frameIndex = frames.length;
    const tUs = bytes.readUIntLE(offset, 6);
    offset += 6;
    const uid = bytes.readUInt16LE(offset);
    offset += 2;
    const statusCode = bytes.readUInt8(offset);
    offset += 1;

    const prevStatusCode = lastStatusByUid.get(uid) ?? 0;
    const transition = {
      frameIndex,
      seq: frameIndex + 1,
      tUs,
      wallUs: addScalarMicroseconds(createdWallTimeUs, tUs),
      uid,
      prevStatusCode,
      statusCode,
      prevStatus: statusCodeToName(prevStatusCode, statusCodes),
      status: statusCodeToName(statusCode, statusCodes),
      durationUs: resolveFileLogger2Duration(uid, statusCode, tUs, runningStartByUid)
    };

    transitions.push(transition);
    frames.push({
      index: frameIndex,
      kind: "node",
      tUs: transition.tUs,
      wallUs: transition.wallUs,
      seq: transition.seq,
      transitionIndex: transitions.length - 1
    });
    lastStatusByUid.set(uid, statusCode);

    batchCount += 1;
    if (batchCount >= FILE_LOGGER2_ASYNC_BATCH_SIZE) {
      batchCount = 0;
      await yieldToEventLoop(asyncState);
    }
  }

  return {
    fileName,
    filePath,
    header,
    preview,
    frames,
    transitions,
    blackboardEvents: [],
    nodeDefinitions
  };
}

function maybeGunzip(bytes: Buffer, allowTruncatedLog: boolean): Buffer {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (allowTruncatedLog) {
      return zlib.gunzipSync(bytes, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    }
    return zlib.gunzipSync(bytes);
  }

  return bytes;
}

function maybeGunzipAsync(bytes: Buffer, allowTruncatedLog: boolean): Promise<Buffer> {
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    return Promise.resolve(bytes);
  }

  return new Promise((resolve, reject) => {
    const callback = (error: Error | null, result: Buffer) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    };

    if (allowTruncatedLog) {
      zlib.gunzip(bytes, { finishFlush: zlib.constants.Z_SYNC_FLUSH }, callback);
      return;
    }

    zlib.gunzip(bytes, callback);
  });
}

async function yieldToEventLoopIfNeeded(asyncState: AsyncDecodeState): Promise<void> {
  if (Date.now() - asyncState.lastYieldAt >= ASYNC_DECODE_YIELD_INTERVAL_MS) {
    await yieldToEventLoop(asyncState);
  }
}

function yieldToEventLoop(asyncState: AsyncDecodeState): Promise<void> {
  asyncState.lastYieldAt = Date.now();
  return new Promise((resolve) => {
    setImmediate(() => {
      asyncState.lastYieldAt = Date.now();
      resolve();
    });
  });
}

function isTruncationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("unexpected end of frame");
}

function normalizeHeader(value: Record<string, unknown>): BtPlaybackHeader {
  return {
    type: "header",
    schemaVersion: toNumber(value.schema_version, 1),
    codec: String(value.codec ?? ""),
    treeName: String(value.tree_name ?? ""),
    rootNodeName: String(value.root_node_name ?? ""),
    createdWallTimeUs: toScalar(value.created_wall_time_us),
    statusCodes: toStringMap(value.status_codes),
    eventTypes: toStringMap(value.event_types),
    xml: String(value.xml ?? "")
  };
}

function normalizeTransition(
  value: unknown[],
  frameIndex: number,
  statusCodes: Record<string, string>
): BtPlaybackTransition {
  const prevStatusCode = toScalar(value[5]);
  const statusCode = toScalar(value[6]);
  return {
    frameIndex,
    seq: toNumber(value[1], 0),
    tUs: toNumber(value[2], 0),
    wallUs: toScalar(value[3]),
    uid: toNumber(value[4], 0),
    prevStatusCode,
    statusCode,
    prevStatus: statusCodeToName(prevStatusCode, statusCodes),
    status: statusCodeToName(statusCode, statusCodes),
    durationUs: toScalar(value[7])
  };
}

function normalizeBlackboardEvent(
  value: unknown[],
  frameIndex: number,
  eventType: string
): BtPlaybackBlackboardEvent {
  const base = {
    frameIndex,
    kind: eventType === "bs" ? "snapshot" as const : "patch" as const,
    seq: toNumber(value[1], 0),
    tUs: toNumber(value[2], 0),
    wallUs: toScalar(value[3])
  };
  if (eventType === "bs") {
    return { ...base, values: value[4] };
  }
  return { ...base, patch: value[4] };
}

function statusCodeToName(code: unknown, statusCodes: Record<string, string>): string {
  const key = String(code ?? "");
  const fromHeader = statusCodes[key];
  if (fromHeader) {
    return fromHeader;
  }

  switch (Number(code)) {
    case 0:
      return "IDLE";
    case 1:
      return "RUNNING";
    case 2:
      return "SUCCESS";
    case 3:
      return "FAILURE";
    case 4:
      return "SKIPPED";
    default:
      return "UNKNOWN";
  }
}

function resolveFileLogger2Duration(
  uid: number,
  statusCode: number,
  tUs: number,
  runningStartByUid: Map<number, number>
): number | null {
  if (statusCode === 1) {
    runningStartByUid.set(uid, tUs);
    return null;
  }

  const startedAt = runningStartByUid.get(uid);
  if (startedAt == null) {
    return null;
  }
  if (statusCode !== 1) {
    runningStartByUid.delete(uid);
  }
  return Math.max(0, tUs - startedAt);
}

function addScalarMicroseconds(value: number | string | null, offsetUs: number): number | string | null {
  if (typeof value === "number") {
    return value + offsetUs;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return (BigInt(value) + BigInt(offsetUs)).toString();
  }
  return value;
}

function collectNodeDefinitionsFromPreview(preview: BtPreviewDocument): BtPlaybackNodeDefinition[] {
  const definitions: BtPlaybackNodeDefinition[] = [];

  for (const tree of preview.behaviorTrees) {
    walkPreviewNode(tree.node, (node) => {
      const uid = toNumber(node.attributes._uid, Number.NaN);
      if (!Number.isFinite(uid)) {
        return;
      }
      definitions.push({
        uid,
        name: node.title || node.instanceName || node.kind || `uid ${uid}`,
        nodeType: node.kind || null
      });
    });
  }

  return definitions;
}

function walkPreviewNode(node: BtPreviewDocument["behaviorTrees"][number]["node"], visit: (node: NonNullable<BtPreviewDocument["behaviorTrees"][number]["node"]>) => void): void {
  if (!node) {
    return;
  }
  visit(node);
  for (const child of node.children) {
    walkPreviewNode(child, visit);
  }
}

function toNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toScalar(value: unknown): number | string | null {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }
  return value == null ? null : String(value);
}

function toStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[String(key)] = String(entry ?? "");
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeMsgpack(bytes: Buffer): unknown {
  let offset = 0;
  const decoder = new TextDecoder();

  const read = (length: number): Buffer => {
    if (offset + length > bytes.length) {
      throw new Error("Corrupt msgpack payload: unexpected end of frame.");
    }
    const slice = bytes.subarray(offset, offset + length);
    offset += length;
    return slice;
  };
  const readByte = () => read(1)[0];
  const readUInt16 = () => {
    const value = bytes.readUInt16BE(offset);
    offset += 2;
    return value;
  };
  const readUInt32 = () => {
    const value = bytes.readUInt32BE(offset);
    offset += 4;
    return value;
  };
  const readInt8 = () => {
    const value = bytes.readInt8(offset);
    offset += 1;
    return value;
  };
  const readInt16 = () => {
    const value = bytes.readInt16BE(offset);
    offset += 2;
    return value;
  };
  const readInt32 = () => {
    const value = bytes.readInt32BE(offset);
    offset += 4;
    return value;
  };
  const readUInt64 = () => {
    const value = bytes.readBigUInt64BE(offset);
    offset += 8;
    return bigintToSerializable(value);
  };
  const readInt64 = () => {
    const value = bytes.readBigInt64BE(offset);
    offset += 8;
    return bigintToSerializable(value);
  };

  const decodeValue = (): unknown => {
    const marker = readByte();
    if (marker <= 0x7f) {
      return marker;
    }
    if (marker >= 0xe0) {
      return marker - 0x100;
    }
    if ((marker & 0xe0) === 0xa0) {
      return decoder.decode(read(marker & 0x1f));
    }
    if ((marker & 0xf0) === 0x90) {
      return readArray(marker & 0x0f);
    }
    if ((marker & 0xf0) === 0x80) {
      return readMap(marker & 0x0f);
    }

    switch (marker) {
      case 0xc0:
        return null;
      case 0xc2:
        return false;
      case 0xc3:
        return true;
      case 0xc4:
        return Array.from(read(readByte()));
      case 0xc5:
        return Array.from(read(readUInt16()));
      case 0xc6:
        return Array.from(read(readUInt32()));
      case 0xca: {
        const value = bytes.readFloatBE(offset);
        offset += 4;
        return value;
      }
      case 0xcb: {
        const value = bytes.readDoubleBE(offset);
        offset += 8;
        return value;
      }
      case 0xcc:
        return readByte();
      case 0xcd:
        return readUInt16();
      case 0xce:
        return readUInt32();
      case 0xcf:
        return readUInt64();
      case 0xd0:
        return readInt8();
      case 0xd1:
        return readInt16();
      case 0xd2:
        return readInt32();
      case 0xd3:
        return readInt64();
      case 0xd9:
        return decoder.decode(read(readByte()));
      case 0xda:
        return decoder.decode(read(readUInt16()));
      case 0xdb:
        return decoder.decode(read(readUInt32()));
      case 0xdc:
        return readArray(readUInt16());
      case 0xdd:
        return readArray(readUInt32());
      case 0xde:
        return readMap(readUInt16());
      case 0xdf:
        return readMap(readUInt32());
      default:
        throw new Error(`Unsupported msgpack marker 0x${marker.toString(16)}.`);
    }
  };

  const readArray = (length: number): unknown[] => {
    const result = [];
    for (let index = 0; index < length; index += 1) {
      result.push(decodeValue());
    }
    return result;
  };

  const readMap = (length: number): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (let index = 0; index < length; index += 1) {
      const key = decodeValue();
      result[String(key)] = decodeValue();
    }
    return result;
  };

  const result = decodeValue();
  if (offset !== bytes.length) {
    throw new Error("Corrupt msgpack payload: trailing bytes.");
  }
  return result;
}

function bigintToSerializable(value: bigint): number | string {
  if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  return value.toString();
}
