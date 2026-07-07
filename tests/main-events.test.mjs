import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadMainEventsRuntime(mode = "playback") {
  const listeners = {};
  class HTMLElementStub {
    constructor(tagName = "DIV") {
      this.tagName = tagName;
      this.isContentEditable = false;
    }
  }

  const runtime = {
    state: {
      editModeEnabled: mode !== "playback",
      isSpacePressed: false,
      playbackLogImporting: false,
      playbackLog: { frames: [{}, {}] }
    },
    vscode: {
      messages: [],
      postMessage(message) {
        this.messages.push(message);
      }
    },
    app: {
      renderPlaybackStateCount: 0,
      applyUserSettingsCount: 0,
      renderPlaybackState() {
        this.renderPlaybackStateCount += 1;
      },
      applyUserSettings() {
        this.applyUserSettingsCount += 1;
      }
    },
    modeRules: {
      isPlaybackMode() {
        return mode === "playback";
      },
      can(action) {
        if (action === "openTreeSearch") {
          return mode !== "playback";
        }
        return mode !== "playback";
      }
    },
    viewport: {
      syncCount: 0,
      syncCanvasInteractionMode() {
        this.syncCount += 1;
      }
    },
    search: {
      openCount: 0,
      openPanel() {
        this.openCount += 1;
      },
      closePanel() {}
    },
    overlays: {
      hideAll() {},
      hideNodeContextMenu() {},
      hideCanvasContextMenu() {}
    }
  };

  const context = {
    window: {
      BTreeToolRuntime: runtime,
      addEventListener(type, handler) {
        listeners[type] = handler;
      }
    },
    document: {
      hidden: false,
      addEventListener(type, handler) {
        listeners[`document:${type}`] = handler;
      },
      body: {
        classList: {
          contains() {
            return false;
          }
        }
      }
    },
    HTMLElement: HTMLElementStub
  };

  const scriptPath = path.resolve("media/runtime/app/main-events.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return { runtime, listeners, document: context.document, HTMLElementStub };
}

function createKeyEvent(HTMLElementStub, options = {}) {
  return {
    code: options.code || "Space",
    key: options.key || " ",
    repeat: options.repeat === true,
    metaKey: options.metaKey === true,
    ctrlKey: options.ctrlKey === true,
    target: options.target || new HTMLElementStub("DIV"),
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
}

test("space toggles playback in playback mode without entering canvas pan mode", () => {
  const { runtime, listeners, HTMLElementStub } = loadMainEventsRuntime("playback");
  let toggleCount = 0;

  runtime.mainEvents.bindGlobalKeys({
    togglePlayback(log) {
      assert.equal(log, runtime.state.playbackLog);
      toggleCount += 1;
    }
  });

  const event = createKeyEvent(HTMLElementStub);
  listeners.keydown(event);

  assert.equal(toggleCount, 1);
  assert.equal(event.defaultPrevented, true);
  assert.equal(runtime.state.isSpacePressed, false);

  const repeatEvent = createKeyEvent(HTMLElementStub, { repeat: true });
  listeners.keydown(repeatEvent);
  assert.equal(toggleCount, 1);
});

test("ctrl f does not open tree search in playback mode", () => {
  const { runtime, listeners, HTMLElementStub } = loadMainEventsRuntime("playback");

  runtime.mainEvents.bindGlobalKeys();

  const event = createKeyEvent(HTMLElementStub, {
    code: "KeyF",
    key: "f",
    ctrlKey: true
  });
  listeners.keydown(event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(runtime.search.openCount, 0);
});

test("ctrl f opens tree search in edit mode", () => {
  const { runtime, listeners, HTMLElementStub } = loadMainEventsRuntime("edit");

  runtime.mainEvents.bindGlobalKeys();

  const event = createKeyEvent(HTMLElementStub, {
    code: "KeyF",
    key: "f",
    ctrlKey: true
  });
  listeners.keydown(event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(runtime.search.openCount, 1);
});

test("shortcut action opens tree search from extension keybinding", () => {
  const { runtime, listeners } = loadMainEventsRuntime("edit");

  runtime.mainEvents.bindWebviewMessages({});

  listeners.message({
    data: {
      type: "shortcutAction",
      payload: { action: "openSearch" }
    }
  });

  assert.equal(runtime.search.openCount, 1);
});

test("node clipboard state refreshes stale local copied node templates", () => {
  const { runtime, listeners } = loadMainEventsRuntime("edit");
  runtime.state.copiedNodeTemplate = {
    tagName: "OldNode",
    attributes: { old: "1" },
    children: []
  };

  runtime.mainEvents.bindWebviewMessages({});

  listeners.message({
    data: {
      type: "nodeClipboardState",
      payload: {
        hasNodeTemplate: true,
        nodeTemplate: {
          tagName: "NewNode",
          attributes: { next: "2" },
          children: [
            {
              tagName: "ChildNode",
              attributes: { child: "3" },
              children: []
            }
          ]
        }
      }
    }
  });

  assert.equal(runtime.state.hasSharedNodeTemplate, true);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.state.copiedNodeTemplate)), {
    tagName: "NewNode",
    attributes: { next: "2" },
    children: [
      {
        tagName: "ChildNode",
        attributes: { child: "3" },
        children: []
      }
    ]
  });
});

test("ctrl s saves the current XML document", () => {
  const { runtime, listeners, HTMLElementStub } = loadMainEventsRuntime("edit");
  runtime.state.currentHasDocument = true;

  runtime.mainEvents.bindGlobalKeys();

  const event = createKeyEvent(HTMLElementStub, {
    code: "KeyS",
    key: "s",
    ctrlKey: true
  });
  listeners.keydown(event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(JSON.stringify(runtime.vscode.messages), JSON.stringify([{ type: "saveCurrentDocument" }]));
});

test("ctrl s is ignored when no XML document is attached", () => {
  const { runtime, listeners, HTMLElementStub } = loadMainEventsRuntime("edit");
  runtime.state.currentHasDocument = false;

  runtime.mainEvents.bindGlobalKeys();

  const event = createKeyEvent(HTMLElementStub, {
    code: "KeyS",
    key: "s",
    ctrlKey: true
  });
  listeners.keydown(event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(JSON.stringify(runtime.vscode.messages), JSON.stringify([]));
});

test("space keeps canvas pan behavior in edit mode", () => {
  const { runtime, listeners, HTMLElementStub } = loadMainEventsRuntime("edit");

  runtime.mainEvents.bindGlobalKeys({
    togglePlayback() {
      assert.fail("edit mode should not toggle playback");
    }
  });

  const event = createKeyEvent(HTMLElementStub);
  listeners.keydown(event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(runtime.state.isSpacePressed, true);
  assert.equal(runtime.viewport.syncCount, 1);
});

test("space does not toggle playback from text inputs", () => {
  const { runtime, listeners, HTMLElementStub } = loadMainEventsRuntime("playback");
  let toggleCount = 0;

  runtime.mainEvents.bindGlobalKeys({
    togglePlayback() {
      toggleCount += 1;
    }
  });

  const event = createKeyEvent(HTMLElementStub, {
    target: new HTMLElementStub("INPUT")
  });
  listeners.keydown(event);

  assert.equal(toggleCount, 0);
  assert.equal(event.defaultPrevented, false);
});

test("playback log import request is ignored while an import is pending", () => {
  const { runtime } = loadMainEventsRuntime("playback");

  runtime.mainEvents.requestPlaybackLogImport();
  runtime.mainEvents.requestPlaybackLogImport();

  assert.equal(runtime.state.playbackLogImporting, true);
  assert.equal(runtime.app.renderPlaybackStateCount, 1);
  assert.equal(JSON.stringify(runtime.vscode.messages), JSON.stringify([{ type: "choosePlaybackLogFile" }]));
});

test("settingsUpdated message refreshes current settings immediately", () => {
  const { runtime, listeners } = loadMainEventsRuntime("playback");

  runtime.mainEvents.bindWebviewMessages({
    pausePlayback() {},
    clearTraceMessages() {},
    getPlaybackFrameTimeUs() {},
    persistUiState() {},
    updateEditModeButton() {},
    renderPlaybackState() {},
    emptyState() {},
    buildCurrentPlaybackSnapshot() {},
    updatePlaybackTracePanel() {}
  });

  listeners.message({
    data: {
      type: "settingsUpdated",
      payload: {
        settings: {
          traceLearningEnabled: true,
          traceLearningEnhancementEnabled: true
        },
        settingsFilePath: "/storage/user-settings.json"
      }
    }
  });

  assert.equal(runtime.state.currentSettings.traceLearningEnhancementEnabled, true);
  assert.equal(runtime.state.currentSettings.traceLearningEnabled, true);
  assert.equal(runtime.state.settingsFilePath, "/storage/user-settings.json");
  assert.equal(runtime.app.applyUserSettingsCount, 1);
});

test("panel visibility and page hide pause playback", () => {
  const { runtime, listeners, document } = loadMainEventsRuntime("playback");
  let pauseCount = 0;

  runtime.mainEvents.bindWebviewMessages({
    pausePlayback() {
      pauseCount += 1;
    }
  });

  listeners.message({ data: { type: "panelVisibility", payload: { visible: true } } });
  assert.equal(pauseCount, 0);

  listeners.message({ data: { type: "panelVisibility", payload: { visible: false } } });
  assert.equal(pauseCount, 1);

  document.hidden = true;
  listeners["document:visibilitychange"]();
  assert.equal(pauseCount, 2);

  listeners.pagehide();
  assert.equal(pauseCount, 3);
});
