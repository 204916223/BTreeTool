import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";

const originalLoad = Module._load;
const fsState = {
  files: new Map(),
  writes: []
};
const vscodeStub = {
  Uri: {
    joinPath(baseUri, fileName) {
      return { fsPath: `${baseUri.fsPath}/${fileName}` };
    }
  },
  workspace: {
    fs: {
      async createDirectory() {},
      async readFile(uri) {
        if (!fsState.files.has(uri.fsPath)) {
          const error = new Error("FileNotFound");
          error.code = "FileNotFound";
          throw error;
        }
        return Buffer.from(fsState.files.get(uri.fsPath), "utf8");
      },
      async writeFile(uri, content) {
        const text = Buffer.from(content).toString("utf8");
        fsState.files.set(uri.fsPath, text);
        fsState.writes.push({ path: uri.fsPath, text });
      }
    }
  }
};

Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === "vscode") {
    return vscodeStub;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { DEFAULT_USER_SETTINGS, THEME_PRESETS, cloneUserSettings, loadUserSettings } = await import("../dist/userSettings.js");
Module._load = originalLoad;

test("default user settings match the product defaults", () => {
  assert.equal(DEFAULT_USER_SETTINGS.themePreset, "default");
  assert.equal(DEFAULT_USER_SETTINGS.showMainTreeLocator, false);
  assert.equal(DEFAULT_USER_SETTINGS.copyNodeWithDescendants, false);
  assert.equal(DEFAULT_USER_SETTINGS.playbackAutoNavigateToTree, false);
  assert.equal(DEFAULT_USER_SETTINGS.playbackPanelOpacity, 0.6);
  assert.equal(DEFAULT_USER_SETTINGS.allowUnclosedPlaybackLog, true);
  assert.equal(DEFAULT_USER_SETTINGS.traceLearningEnabled, false);
  assert.equal(DEFAULT_USER_SETTINGS.traceLearningEnhancementEnabled, false);
  assert.equal(DEFAULT_USER_SETTINGS.nodeSectionTitleMode, "regular");
  assert.equal(DEFAULT_USER_SETTINGS.editNodeMode, "tree");
  assert.deepEqual(DEFAULT_USER_SETTINGS.editAssistantWarningWhitelist, []);
});

test("cloned user settings keep the new boolean defaults", () => {
  const cloned = cloneUserSettings(DEFAULT_USER_SETTINGS);

  assert.deepEqual(cloned.customTheme, {
    primaryColor: "#5e8de6",
    secondaryColor: "#df78cf"
  });
  assert.equal(cloned.showMainTreeLocator, false);
  assert.equal(cloned.copyNodeWithDescendants, false);
  assert.equal(cloned.playbackAutoNavigateToTree, false);
  assert.equal(cloned.playbackPanelOpacity, 0.6);
  assert.equal(cloned.allowUnclosedPlaybackLog, true);
  assert.equal(cloned.traceLearningEnabled, false);
  assert.equal(cloned.traceLearningEnhancementEnabled, false);
  assert.equal(cloned.nodeSectionTitleMode, "regular");
  assert.equal(cloned.editNodeMode, "tree");
  assert.deepEqual(cloned.editAssistantWarningWhitelist, []);
});

test("custom theme settings are normalized when loading user settings", async () => {
  fsState.files.clear();
  fsState.writes = [];
  fsState.files.set("/storage/user-settings.json", JSON.stringify({
    themePreset: "custom",
    customTheme: {
      primaryColor: "#ABC",
      secondaryColor: "#123456"
    }
  }));

  const { settings } = await loadUserSettings({ fsPath: "/storage" });

  assert.equal(settings.themePreset, "custom");
  assert.deepEqual(settings.customTheme, {
    primaryColor: "#aabbcc",
    secondaryColor: "#123456"
  });
});

test("default theme preset is available and normalized when loading user settings", async () => {
  fsState.files.clear();
  fsState.writes = [];
  fsState.files.set("/storage/user-settings.json", JSON.stringify({
    themePreset: "default"
  }));

  const { settings } = await loadUserSettings({ fsPath: "/storage" });

  assert.equal(settings.themePreset, "default");
  assert.deepEqual(
    THEME_PRESETS.find((theme) => theme.id === "default"),
    { id: "default", labelZh: "暖金", labelEn: "Warm Gold" }
  );
});

test("learning enhancement implies learning when loading user settings", async () => {
  fsState.files.clear();
  fsState.writes = [];
  fsState.files.set("/storage/user-settings.json", JSON.stringify({
    traceLearningEnabled: false,
    traceLearningEnhancementEnabled: true
  }));

  const { settings } = await loadUserSettings({ fsPath: "/storage" });

  assert.equal(settings.traceLearningEnabled, true);
  assert.equal(settings.traceLearningEnhancementEnabled, true);
});

test("playback panel opacity is clamped when loading user settings", async () => {
  fsState.files.clear();
  fsState.writes = [];
  fsState.files.set("/storage/user-settings.json", JSON.stringify({
    playbackPanelOpacity: 0.2
  }));

  const low = await loadUserSettings({ fsPath: "/storage" });
  assert.equal(low.settings.playbackPanelOpacity, 0.2);

  fsState.files.set("/storage/user-settings.json", JSON.stringify({
    playbackPanelOpacity: 1.4
  }));
  const high = await loadUserSettings({ fsPath: "/storage" });
  assert.equal(high.settings.playbackPanelOpacity, 0.8);
});

test("node section title mode is normalized when loading user settings", async () => {
  fsState.files.clear();
  fsState.writes = [];
  fsState.files.set("/storage/user-settings.json", JSON.stringify({
    nodeSectionTitleMode: "emphasis"
  }));

  const emphasis = await loadUserSettings({ fsPath: "/storage" });
  assert.equal(emphasis.settings.nodeSectionTitleMode, "emphasis");

  fsState.files.set("/storage/user-settings.json", JSON.stringify({
    nodeSectionTitleMode: "loud"
  }));
  const fallback = await loadUserSettings({ fsPath: "/storage" });
  assert.equal(fallback.settings.nodeSectionTitleMode, "regular");
});

test("edit node mode is normalized when loading user settings", async () => {
  fsState.files.clear();
  fsState.writes = [];
  fsState.files.set("/storage/user-settings.json", JSON.stringify({
    editNodeMode: "free"
  }));

  const free = await loadUserSettings({ fsPath: "/storage" });
  assert.equal(free.settings.editNodeMode, "free");

  fsState.files.set("/storage/user-settings.json", JSON.stringify({
    editNodeMode: "unknown"
  }));
  const fallback = await loadUserSettings({ fsPath: "/storage" });
  assert.equal(fallback.settings.editNodeMode, "tree");
});

test("legacy learning collection setting maps to learning enhancement", async () => {
  fsState.files.clear();
  fsState.writes = [];
  fsState.files.set("/storage/user-settings.json", JSON.stringify({
    traceLearningEnabled: false,
    traceLearningCollectionEnabled: true
  }));

  const { settings } = await loadUserSettings({ fsPath: "/storage" });

  assert.equal(settings.traceLearningEnabled, true);
  assert.equal(settings.traceLearningEnhancementEnabled, true);
});

test("edit assistant warning whitelist is normalized when loading user settings", async () => {
  fsState.files.clear();
  fsState.writes = [];
  fsState.files.set("/storage/user-settings.json", JSON.stringify({
    editAssistantWarningWhitelist: ["CustomAction", " CustomAction ", "", "OtherAction"]
  }));

  const { settings } = await loadUserSettings({ fsPath: "/storage" });

  assert.deepEqual(settings.editAssistantWarningWhitelist, ["CustomAction", "OtherAction"]);
});

test("load user settings creates defaults only when the file is missing", async () => {
  fsState.files.clear();
  fsState.writes = [];

  const { settings } = await loadUserSettings({ fsPath: "/storage" });

  assert.equal(settings.themePreset, "default");
  assert.equal(fsState.writes.length, 1);
  assert.equal(fsState.writes[0].path, "/storage/user-settings.json");
});

test("load user settings does not overwrite unreadable existing settings", async () => {
  fsState.files.clear();
  fsState.writes = [];
  fsState.files.set("/storage/user-settings.json", "{not-json");
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => {
    warnings.push(message);
  };

  try {
    const { settings } = await loadUserSettings({ fsPath: "/storage" });

    assert.equal(settings.themePreset, "default");
    assert.equal(fsState.files.get("/storage/user-settings.json"), "{not-json");
    assert.equal(fsState.writes.length, 0);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});
