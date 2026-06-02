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
      playbackLog: { frames: [{}, {}] }
    },
    modeRules: {
      isPlaybackMode() {
        return mode === "playback";
      }
    },
    viewport: {
      syncCount: 0,
      syncCanvasInteractionMode() {
        this.syncCount += 1;
      }
    },
    search: {
      openPanel() {},
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
