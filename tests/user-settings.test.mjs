import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";

const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === "vscode") {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { DEFAULT_USER_SETTINGS, cloneUserSettings } = await import("../dist/userSettings.js");
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
