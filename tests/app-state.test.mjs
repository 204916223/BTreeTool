import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadAppStateRuntime() {
  const runtime = {
    viewport: {
      clampNumber(value, min, max, fallback) {
        return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
      }
    }
  };
  const context = {
    window: {
      BTreeToolRuntime: runtime
    }
  };
  const scriptPath = path.resolve("media/runtime/app/app-state.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return runtime.appState;
}

test("app state initializes edit and playback modes from persisted webview state", () => {
  const appState = loadAppStateRuntime();
  const editState = appState.createInitialState(
    {
      selectedTreeId: "MainTree",
      selectedNodePath: "0.1",
      editModeEnabled: true,
      catalogWidth: 999,
      playbackRightTab: "ai",
      playbackExpandedBlackboardKeys: ["robot.pose"]
    },
    "edit"
  );

  assert.equal(editState.selectedTreeId, "MainTree");
  assert.equal(editState.selectedNodePath, "0.1");
  assert.equal(editState.editModeEnabled, true);
  assert.equal(editState.catalogWidth, 460);
  assert.equal(editState.playbackRightTab, "trace");
  assert.equal(editState.playbackExpandedBlackboardKeys.has("robot.pose"), true);

  const playbackState = appState.createInitialState({ editModeEnabled: true }, "playback");
  assert.equal(playbackState.editModeEnabled, false);
});

test("app state gives each instance independent default settings collections", () => {
  const appState = loadAppStateRuntime();
  const firstState = appState.createInitialState();
  const secondState = appState.createInitialState();

  assert.equal(firstState.currentSettings.showMainTreeLocator, false);
  assert.equal(firstState.currentSettings.copyNodeWithDescendants, false);
  assert.equal(firstState.currentSettings.playbackAutoNavigateToTree, false);
  assert.equal(firstState.currentSettings.allowUnclosedPlaybackLog, true);

  firstState.currentSettings.presetNodes.push({ key: "Custom" });
  firstState.currentSettings.simplifyHiddenSections.push("description");

  assert.deepEqual(Array.from(secondState.currentSettings.presetNodes), []);
  assert.deepEqual(Array.from(secondState.currentSettings.simplifyHiddenSections), []);
});

test("app state seeds current settings from initial theme settings", () => {
  const appState = loadAppStateRuntime();
  const state = appState.createInitialState(
    {
      uiPreferences: {
        themePreset: "ocean",
        language: "zh-CN"
      }
    },
    "edit",
    {
      themePreset: "rose",
      language: "en-US"
    }
  );

  assert.equal(state.currentSettings.themePreset, "rose");
  assert.equal(state.currentSettings.language, "en-US");
});
