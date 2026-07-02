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
  assert.equal(editState.searchIncludeNode, true);
  assert.equal(editState.searchIncludeDescription, true);
  assert.equal(editState.searchIncludeAttributes, true);

  const playbackState = appState.createInitialState({ editModeEnabled: true }, "playback");
  assert.equal(playbackState.editModeEnabled, false);
  assert.equal(playbackState.playbackLogImporting, false);
});

test("app state gives each instance independent default settings collections", () => {
  const appState = loadAppStateRuntime();
  const firstState = appState.createInitialState();
  const secondState = appState.createInitialState();

  assert.equal(firstState.currentSettings.showMainTreeLocator, false);
  assert.equal(firstState.currentSettings.themePreset, "default");
  assert.equal(firstState.currentSettings.copyNodeWithDescendants, false);
  assert.equal(firstState.currentSettings.playbackAutoNavigateToTree, false);
  assert.equal(firstState.currentSettings.playbackPanelOpacity, 0.6);
  assert.equal(firstState.currentSettings.allowUnclosedPlaybackLog, true);
  assert.equal(firstState.currentSettings.traceLearningEnabled, false);
  assert.equal(firstState.currentSettings.traceLearningEnhancementEnabled, false);
  assert.equal(firstState.currentSettings.nodeSectionTitleMode, "regular");
  assert.deepEqual(Array.from(firstState.currentSettings.editAssistantWarningWhitelist), []);
  assert.equal(JSON.stringify(firstState.currentSettings.customTheme), JSON.stringify({
    primaryColor: "#5e8de6",
    secondaryColor: "#df78cf"
  }));

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
        customTheme: {
          primaryColor: "#48c",
          secondaryColor: "#123456"
        },
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
  assert.equal(JSON.stringify(state.currentSettings.customTheme), JSON.stringify({
    primaryColor: "#4488cc",
    secondaryColor: "#123456"
  }));
  assert.equal(state.currentSettings.language, "en-US");
});

test("app state accepts the default theme preset", () => {
  const appState = loadAppStateRuntime();
  const state = appState.createInitialState({}, "edit", {
    themePreset: "default"
  });

  assert.equal(state.currentSettings.themePreset, "default");
});

test("app state seeds full current settings from initial settings", () => {
  const appState = loadAppStateRuntime();
  const state = appState.createInitialState(
    {},
    "edit",
    {
      language: "zh-CN",
      themePreset: "custom",
      customTheme: {
        primaryColor: "#abcdef",
        secondaryColor: "#fedcba"
      },
      showMainTreeLocator: true,
      showBehaviorTreeRoot: false,
      requireNodeDeleteConfirmation: true,
      copyNodeWithDescendants: true,
      playbackAutoNavigateToTree: true,
      allowUnclosedPlaybackLog: false,
      traceLearningEnabled: true,
      traceLearningEnhancementEnabled: true,
      nodeAttributeLayout: "stacked",
      nodeSectionTitleMode: "emphasis",
      editTreeRenderMode: "expanded",
      playbackTreeRenderMode: "expanded",
      playbackPanelLayout: "dashboard",
      playbackPanelOpacity: 0.68,
      editAssistantWarningWhitelist: ["CustomAction"],
      simplifyHiddenSections: ["description"],
      presetNodes: [{ key: "Custom", fields: [{ key: "value" }] }]
    }
  );

  assert.equal(JSON.stringify(state.currentSettings), JSON.stringify({
    language: "zh-CN",
    themePreset: "custom",
    customTheme: {
      primaryColor: "#abcdef",
      secondaryColor: "#fedcba"
    },
    showMainTreeLocator: true,
    showBehaviorTreeRoot: true,
    requireNodeDeleteConfirmation: true,
    copyNodeWithDescendants: true,
    playbackAutoNavigateToTree: true,
    allowUnclosedPlaybackLog: true,
    traceLearningEnabled: true,
    traceLearningEnhancementEnabled: true,
    nodeAttributeLayout: "stacked",
    nodeSectionTitleMode: "emphasis",
    editTreeRenderMode: "expanded",
    playbackTreeRenderMode: "expanded",
    playbackPanelLayout: "dashboard",
    playbackPanelOpacity: 0.68,
    simplifyHiddenSections: ["description"],
    editAssistantWarningWhitelist: ["CustomAction"],
    presetNodes: [{ key: "Custom", fields: [{ key: "value" }] }]
  }));

  state.currentSettings.presetNodes[0].fields[0].key = "changed";
  const nextState = appState.createInitialState({}, "edit", {
    presetNodes: [{ key: "Custom", fields: [{ key: "value" }] }]
  });
  assert.equal(nextState.currentSettings.presetNodes[0].fields[0].key, "value");
});

test("app state makes learning enhancement imply learning", () => {
  const appState = loadAppStateRuntime();
  const state = appState.createInitialState({}, "edit", {
    traceLearningEnabled: false,
    traceLearningEnhancementEnabled: true
  });

  assert.equal(state.currentSettings.traceLearningEnabled, true);
  assert.equal(state.currentSettings.traceLearningEnhancementEnabled, true);
});

test("app state maps legacy remote learning setting to learning enhancement", () => {
  const appState = loadAppStateRuntime();
  const state = appState.createInitialState({}, "edit", {
    traceLearningEnabled: false,
    traceLearningCollectionEnabled: true
  });

  assert.equal(state.currentSettings.traceLearningEnabled, true);
  assert.equal(state.currentSettings.traceLearningEnhancementEnabled, true);
});
