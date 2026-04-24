import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadModeRules() {
  const source = fs.readFileSync(
    path.join(process.cwd(), "media", "runtime", "mode-rules.js"),
    "utf8"
  );
  const context = {
    window: {},
    console
  };
  vm.runInNewContext(source, context);
  return context.window.BTreeToolRuntime.modeRules;
}

test("mode rules default to edit mode", () => {
  const modeRules = loadModeRules();

  assert.equal(modeRules.getMode({}), "edit");
  assert.equal(modeRules.can("openNodeEditor", { state: {} }), true);
});

test("mode rules block editing actions in playback mode", () => {
  const modeRules = loadModeRules();
  const state = {
    editModeEnabled: false,
    isSpacePressed: false
  };

  assert.equal(modeRules.getMode(state), "playback");
  assert.equal(modeRules.isPlaybackMode(state), true);
  assert.equal(modeRules.can("openNodeEditor", { state }), false);
  assert.equal(modeRules.can("saveNodeModel", { state }), false);
  assert.equal(modeRules.can("dragCanvasNode", { state, parentPath: "0", siblingIndex: 1 }), false);
});

test("mode rules allow canvas drag only for valid editable nodes", () => {
  const modeRules = loadModeRules();
  const state = {
    editModeEnabled: true,
    isSpacePressed: false
  };

  assert.equal(modeRules.can("dragCanvasNode", { state, parentPath: "0", siblingIndex: 0 }), true);
  assert.equal(modeRules.can("dragCanvasNode", { state, parentPath: null, siblingIndex: 0 }), false);
  assert.equal(modeRules.can("dragCanvasNode", { state, parentPath: "0", siblingIndex: null }), false);
});
