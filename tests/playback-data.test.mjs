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

function loadPlaybackDataRuntime() {
  const runtime = {
    state: {}
  };
  const context = {
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
