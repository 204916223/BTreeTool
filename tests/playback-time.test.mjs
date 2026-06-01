import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadPlaybackTimeRuntime() {
  const runtime = {};
  const context = {
    window: {
      BTreeToolRuntime: runtime
    }
  };
  const mathScriptPath = path.resolve("media/runtime/shared/math.js");
  vm.runInNewContext(fs.readFileSync(mathScriptPath, "utf8"), context, { filename: mathScriptPath });
  const scriptPath = path.resolve("media/runtime/playback/playback-time.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return runtime.playbackTime;
}

test("playback time helpers find nearest and preceding frames", () => {
  const playbackTime = loadPlaybackTimeRuntime();
  const log = {
    frames: [{ tUs: 100 }, { tUs: 250 }, { tUs: 500 }],
    transitions: []
  };

  assert.equal(playbackTime.findFrameIndexAtTime(log, 240), 1);
  assert.equal(playbackTime.findFrameIndexAtTime(log, 390), 2);
  assert.equal(playbackTime.findFrameIndexAtOrBeforeTime(log, 390), 1);
  assert.equal(playbackTime.findFrameIndexAtTime(log, "bad", 2), 2);
});

test("playback time helpers clamp and resolve timeline bounds", () => {
  const playbackTime = loadPlaybackTimeRuntime();
  const log = {
    frames: [{ tUs: 100 }, { tUs: 250 }, { tUs: 500 }],
    transitions: [{ tUs: 750 }]
  };

  assert.equal(playbackTime.getFrameTimeUs(log, 99), 500);
  assert.equal(playbackTime.getFirstTimeUs(log), 100);
  assert.equal(playbackTime.getLastTimeUs(log), 500);
  assert.equal(playbackTime.clampTimeUs(log, 50), 100);
  assert.equal(playbackTime.clampTimeUs(log, 800), 500);
});
