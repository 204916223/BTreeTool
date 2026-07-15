import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

test("playback transition list filter supports node names and exact uid", () => {
  const runtime = loadPlaybackDataRuntime();
  const log = {
    preview: { behaviorTrees: [] },
    nodeDefinitions: [
      { uid: 101, name: "ServoStatus" },
      { uid: 202, name: "ForceFallback" }
    ],
    transitions: [
      { frameIndex: 0, uid: 101 },
      { frameIndex: 1, uid: 202 },
      { frameIndex: 2, uid: 101 }
    ],
    blackboardEvents: []
  };

  const byName = runtime.playbackData.getPlaybackTransitionListModel(log, "servo");
  assert.equal(JSON.stringify(byName.indexes), JSON.stringify([0, 2]));

  const byUid = runtime.playbackData.getPlaybackTransitionListModel(log, "101");
  assert.equal(JSON.stringify(byUid.indexes), JSON.stringify([0, 2]));

  const byUidPrefix = runtime.playbackData.getPlaybackTransitionListModel(log, "uid:202");
  assert.equal(JSON.stringify(byUidPrefix.indexes), JSON.stringify([1]));
});

test("playback snapshots can be built at exact timeline time", () => {
  const runtime = loadPlaybackDataRuntime();
  const log = {
    preview: { behaviorTrees: [] },
    nodeDefinitions: [],
    transitions: [
      { frameIndex: 0, tUs: 1_000, uid: 101, seq: 1, status: "RUNNING" },
      { frameIndex: 0, tUs: 2_000, uid: 202, seq: 2, status: "RUNNING" },
      { frameIndex: 1, tUs: 5_000, uid: 101, seq: 3, status: "SUCCESS" }
    ],
    blackboardEvents: [
      { frameIndex: 0, tUs: 1_500, kind: "snapshot", values: { step: 1 } },
      { frameIndex: 0, tUs: 3_000, kind: "patch", patch: [{ op: "replace", path: "/step", value: 2 }] }
    ]
  };

  const beforeSecondTransition = runtime.playbackData.buildPlaybackSnapshotAtTime(log, 1_500);
  assert.equal(beforeSecondTransition.statusByUid["101"], "RUNNING");
  assert.equal(beforeSecondTransition.statusByUid["202"], undefined);
  assert.equal(beforeSecondTransition.blackboardValues.step, 1);

  const afterPatch = runtime.playbackData.buildPlaybackSnapshotAtTime(log, 3_000);
  assert.equal(afterPatch.statusByUid["101"], "RUNNING");
  assert.equal(afterPatch.statusByUid["202"], "RUNNING");
  assert.equal(afterPatch.blackboardValues.step, 2);
  assert.equal(runtime.playbackData.getActiveTransitionIndexAtTime(log, 3_000), 1);
  assert.equal(runtime.playbackData.findFirstTransitionIndexAfterTime(log.transitions, 3_000), 2);
});

test("compact FileLogger2 playback logs hydrate into lazy frame and transition accessors", () => {
  const runtime = loadPlaybackDataRuntime();
  const log = runtime.playbackData.hydratePlaybackLog({
    header: {
      createdWallTimeUs: 1_000_000,
      statusCodes: { 0: "IDLE", 1: "RUNNING", 2: "SUCCESS", 3: "FAILURE" }
    },
    preview: { behaviorTrees: [] },
    nodeDefinitions: [{ uid: 10, name: "Root" }],
    transitions: [],
    frames: [],
    blackboardEvents: [],
    compactTransitions: {
      codec: "filelogger2-base64-v1",
      transitionCount: 3,
      trailingBytes: 0,
      transitionBytesBase64: Buffer.concat([
        encodeFileLogger2Transition({ tUs: 100, uid: 10, status: 1 }),
        encodeFileLogger2Transition({ tUs: 250, uid: 10, status: 2 }),
        encodeFileLogger2Transition({ tUs: 300, uid: 11, status: 1 })
      ]).toString("base64")
    }
  });

  assert.equal(log.transitions.length, 3);
  assert.equal(log.frames.length, 3);
  assert.equal(log.transitions[0].status, "RUNNING");
  assert.equal(log.transitions[1].prevStatus, "RUNNING");
  assert.equal(log.transitions[1].status, "SUCCESS");
  assert.equal(log.transitions[1].durationUs, 150);
  assert.equal(log.frames[2].transitionIndex, 2);
  assert.equal(
    JSON.stringify(log.transitions.filter((transition) => transition.uid === 10).map((transition) => transition.seq)),
    JSON.stringify([1, 2])
  );

  const snapshot = runtime.playbackData.buildPlaybackSnapshot(log, 1);
  assert.equal(snapshot.statusByUid["10"], "SUCCESS");
  assert.equal(runtime.playbackData.getActiveTransitionIndexAtTime(log, 260), 1);
});

function encodeFileLogger2Transition({ tUs, uid, status }) {
  const buffer = Buffer.alloc(9);
  buffer.writeUIntLE(tUs, 0, 6);
  buffer.writeUInt16LE(uid, 6);
  buffer.writeUInt8(status, 8);
  return buffer;
}

function loadPlaybackDataRuntime() {
  const runtime = {
    state: {}
  };
  const context = {
    Buffer,
    window: {
      BTreeToolRuntime: runtime
    }
  };
  const mathScriptPath = path.resolve("media/runtime/shared/math.js");
  vm.runInNewContext(fs.readFileSync(mathScriptPath, "utf8"), context, { filename: mathScriptPath });
  const scriptPath = path.resolve("media/runtime/playback/playback-data.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return runtime;
}
