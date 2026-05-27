import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { parseBehaviorTreeDocument } from "./parse";
import { buildPreviewDocument } from "./viewModel";
import type { BtPreviewDocument } from "./viewModel";
import type { BtUserSettings } from "../userSettings";

const MAGIC = Buffer.from("SBTLOG1\0", "utf8");

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
}

export function decodeBtlogFile(filePath: string, settings: BtUserSettings): BtPlaybackLog {
  const compressed = fs.readFileSync(filePath);
  const bytes = maybeGunzip(compressed);
  if (bytes.length < MAGIC.length || !bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Unsupported btlog format: missing SBTLOG1 header.");
  }

  let offset = MAGIC.length;
  let header: BtPlaybackHeader | null = null;
  const frames: BtPlaybackFrame[] = [];
  const transitions: BtPlaybackTransition[] = [];
  const blackboardEvents: BtPlaybackBlackboardEvent[] = [];
  const nodeDefinitions: BtPlaybackNodeDefinition[] = [];

  while (offset < bytes.length) {
    if (offset + 4 > bytes.length) {
      throw new Error("Corrupt btlog: truncated frame length.");
    }

    const frameLength = bytes.readUInt32LE(offset);
    offset += 4;
    if (frameLength < 0 || offset + frameLength > bytes.length) {
      throw new Error("Corrupt btlog: frame payload exceeds file size.");
    }

    const payload = decodeMsgpack(bytes.subarray(offset, offset + frameLength));
    offset += frameLength;

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

  return {
    fileName: path.basename(filePath),
    filePath,
    header,
    preview,
    frames,
    transitions,
    blackboardEvents,
    nodeDefinitions
  };
}

function maybeGunzip(bytes: Buffer): Buffer {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return zlib.gunzipSync(bytes);
  }

  return bytes;
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
    default:
      return "UNKNOWN";
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
