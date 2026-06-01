import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module from "node:module";
import zlib from "node:zlib";

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === "vscode") {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { decodeBtlogFile } = await import("../dist/core/btlog.js");
Module._load = originalLoad;

const baseSettings = {
  language: "en-US",
  themePreset: "midnight",
  showMainTreeLocator: true,
  showBehaviorTreeRoot: true,
  requireNodeDeleteConfirmation: false,
  copyNodeWithDescendants: true,
  playbackAutoNavigateToTree: true,
  allowUnclosedPlaybackLog: false,
  nodeAttributeLayout: "inline",
  simplifyHiddenSections: [],
  presetNodes: []
};

test("decodeBtlogFile can ignore a truncated gzip log when enabled", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "btree-tool-btlog-"));
  const filePath = path.join(tempDir, "sample.btlog");

  try {
    const fullLog = buildBtlogBytes();
    const compressed = zlib.gzipSync(fullLog);
    const truncated = compressed.subarray(0, Math.max(0, compressed.length - 64));
    fs.writeFileSync(filePath, truncated);

    assert.throws(() => decodeBtlogFile(filePath, baseSettings));

    const decoded = decodeBtlogFile(filePath, baseSettings, {
      allowTruncatedLog: true
    });

    assert.equal(decoded.header.xml.includes("BehaviorTree"), true);
    assert.equal(decoded.frames.length, 1);
    assert.equal(decoded.transitions.length, 1);
    assert.equal(decoded.blackboardEvents.length, 0);
    assert.equal(decoded.nodeDefinitions.length, 0);
    assert.equal(decoded.frames[0].kind, "node");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function buildBtlogBytes() {
  const magic = Buffer.from("SBTLOG1\0", "utf8");
  const headerXml =
    '<root main_tree_to_execute="Main"><BehaviorTree ID="Main"><Sequence/></BehaviorTree></root>';
  const header = encodeFrame(
    encode({
      type: "header",
      codec: "msgpack",
      tree_name: "Main",
      root_node_name: "Sequence",
      created_wall_time_us: null,
      schema_version: 1,
      status_codes: { 0: "IDLE", 1: "RUNNING", 2: "SUCCESS", 3: "FAILURE" },
      event_types: {},
      xml: headerXml
    })
  );
  const firstFrame = encodeFrame(encode(["n", 1, 1000, 1000, 42, 0, 1, 100]));
  const noisyTail = createNoisyString(8192);
  const secondFrame = encodeFrame(encode(["n", 2, 2000, 2000, 43, 1, 2, 100, noisyTail]));
  return Buffer.concat([magic, header, firstFrame, secondFrame]);
}

function encodeFrame(payload) {
  const length = Buffer.alloc(4);
  length.writeUInt32LE(payload.length, 0);
  return Buffer.concat([length, payload]);
}

function encode(value) {
  if (value === null) {
    return Buffer.from([0xc0]);
  }

  if (value === false) {
    return Buffer.from([0xc2]);
  }

  if (value === true) {
    return Buffer.from([0xc3]);
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      if (value >= 0 && value <= 0x7f) {
        return Buffer.from([value]);
      }
      if (value >= -32 && value < 0) {
        return Buffer.from([0xe0 | (value + 32)]);
      }
      if (value >= 0 && value <= 0xff) {
        return Buffer.from([0xcc, value]);
      }
      if (value >= 0 && value <= 0xffff) {
        const buf = Buffer.alloc(3);
        buf[0] = 0xcd;
        buf.writeUInt16BE(value, 1);
        return buf;
      }
      if (value >= 0 && value <= 0xffffffff) {
        const buf = Buffer.alloc(5);
        buf[0] = 0xce;
        buf.writeUInt32BE(value, 1);
        return buf;
      }
      if (value >= -0x80 && value < 0) {
        const buf = Buffer.alloc(2);
        buf[0] = 0xd0;
        buf.writeInt8(value, 1);
        return buf;
      }
      if (value >= -0x8000 && value < 0) {
        const buf = Buffer.alloc(3);
        buf[0] = 0xd1;
        buf.writeInt16BE(value, 1);
        return buf;
      }
      const buf = Buffer.alloc(5);
      buf[0] = 0xd2;
      buf.writeInt32BE(value, 1);
      return buf;
    }

    const buf = Buffer.alloc(9);
    buf[0] = 0xcb;
    buf.writeDoubleBE(value, 1);
    return buf;
  }

  if (typeof value === "string") {
    const bytes = Buffer.from(value, "utf8");
    if (bytes.length <= 0x1f) {
      return Buffer.concat([Buffer.from([0xa0 | bytes.length]), bytes]);
    }
    if (bytes.length <= 0xff) {
      return Buffer.concat([Buffer.from([0xd9, bytes.length]), bytes]);
    }
    if (bytes.length <= 0xffff) {
      const header = Buffer.alloc(3);
      header[0] = 0xda;
      header.writeUInt16BE(bytes.length, 1);
      return Buffer.concat([header, bytes]);
    }
    const header = Buffer.alloc(5);
    header[0] = 0xdb;
    header.writeUInt32BE(bytes.length, 1);
    return Buffer.concat([header, bytes]);
  }

  if (Array.isArray(value)) {
    const items = value.map((entry) => encode(entry));
    if (value.length <= 0x0f) {
      return Buffer.concat([Buffer.from([0x90 | value.length]), ...items]);
    }
    if (value.length <= 0xffff) {
      const header = Buffer.alloc(3);
      header[0] = 0xdc;
      header.writeUInt16BE(value.length, 1);
      return Buffer.concat([header, ...items]);
    }
    const header = Buffer.alloc(5);
    header[0] = 0xdd;
    header.writeUInt32BE(value.length, 1);
    return Buffer.concat([header, ...items]);
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    const encoded = [];
    for (const [key, entry] of entries) {
      encoded.push(encode(String(key)));
      encoded.push(encode(entry));
    }
    if (entries.length <= 0x0f) {
      return Buffer.concat([Buffer.from([0x80 | entries.length]), ...encoded]);
    }
    if (entries.length <= 0xffff) {
      const header = Buffer.alloc(3);
      header[0] = 0xde;
      header.writeUInt16BE(entries.length, 1);
      return Buffer.concat([header, ...encoded]);
    }
    const header = Buffer.alloc(5);
    header[0] = 0xdf;
    header.writeUInt32BE(entries.length, 1);
    return Buffer.concat([header, ...encoded]);
  }

  throw new TypeError(`Unsupported value type: ${typeof value}`);
}

function createNoisyString(length) {
  let state = 0x12345678;
  let output = "";
  while (output.length < length) {
    state = (state * 1664525 + 1013904223) >>> 0;
    output += state.toString(16).padStart(8, "0");
  }
  return output.slice(0, length);
}
