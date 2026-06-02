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

const { DEFAULT_USER_SETTINGS, cloneUserSettings, loadUserSettings } = await import("../dist/userSettings.js");
Module._load = originalLoad;

test("default user settings match the product defaults", () => {
  assert.equal(DEFAULT_USER_SETTINGS.showMainTreeLocator, false);
  assert.equal(DEFAULT_USER_SETTINGS.copyNodeWithDescendants, false);
  assert.equal(DEFAULT_USER_SETTINGS.playbackAutoNavigateToTree, false);
  assert.equal(DEFAULT_USER_SETTINGS.allowUnclosedPlaybackLog, true);
});

test("cloned user settings keep the new boolean defaults", () => {
  const cloned = cloneUserSettings(DEFAULT_USER_SETTINGS);

  assert.equal(cloned.showMainTreeLocator, false);
  assert.equal(cloned.copyNodeWithDescendants, false);
  assert.equal(cloned.playbackAutoNavigateToTree, false);
  assert.equal(cloned.allowUnclosedPlaybackLog, true);
});

test("load user settings creates defaults only when the file is missing", async () => {
  fsState.files.clear();
  fsState.writes = [];

  const { settings } = await loadUserSettings({ fsPath: "/storage" });

  assert.equal(settings.themePreset, "midnight");
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

    assert.equal(settings.themePreset, "midnight");
    assert.equal(fsState.files.get("/storage/user-settings.json"), "{not-json");
    assert.equal(fsState.writes.length, 0);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});
