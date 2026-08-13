import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadViewportRuntime(options = {}) {
  const windowListeners = {};
  const documentListeners = {};
  const runtime = {
    state: {
      currentZoom: 1,
      MIN_ZOOM: 0.2,
      MAX_ZOOM: 2,
      currentSettings: {}
    },
    refs: {
      treeSwitcher: null,
      warningList: null,
      zoomLevelLabel: null
    },
    modeRules: {
      isPlaybackMode() {
        return false;
      }
    },
    app: options.app,
    canvas: options.canvas,
    editAssistant: options.editAssistant
  };
  const ElementClass = options.Element || class {};
  const context = {
    window: {
      BTreeToolRuntime: runtime,
      addEventListener(type, handler) {
        windowListeners[type] = windowListeners[type] || [];
        windowListeners[type].push(handler);
      },
      removeEventListener(type, handler) {
        windowListeners[type] = (windowListeners[type] || []).filter((entry) => entry !== handler);
      },
      setTimeout: options.setTimeout || (() => {}),
      clearTimeout: options.clearTimeout || (() => {}),
      requestAnimationFrame: options.requestAnimationFrame || ((callback) => callback())
    },
    document: {
      body: createElementStub("body"),
      createElement(tagName) {
        return createElementStub(tagName);
      },
      querySelectorAll() {
        return [];
      },
      addEventListener(type, handler) {
        documentListeners[type] = documentListeners[type] || [];
        documentListeners[type].push(handler);
      },
      removeEventListener(type, handler) {
        documentListeners[type] = (documentListeners[type] || []).filter((entry) => entry !== handler);
      },
      hidden: false
    },
    Element: ElementClass,
    HTMLElement: ElementClass,
    cancelAnimationFrame: options.cancelAnimationFrame || (() => {}),
    requestAnimationFrame: options.requestAnimationFrame || ((callback) => callback())
  };
  const scriptPath = path.resolve("media/runtime/viewport/viewport-layout.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  runtime.__windowListeners = windowListeners;
  runtime.__documentListeners = documentListeners;
  return runtime;
}

function createElementStub(tagName = "div") {
  return {
    tagName: tagName.toUpperCase(),
    children: [],
    dataset: {},
    style: {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...children) {
      this.children = children;
    }
  };
}

function createTimerHarness() {
  let nextId = 0;
  const timers = new Map();
  return {
    timers,
    setTimeout(callback, delay) {
      nextId += 1;
      timers.set(nextId, { callback, delay });
      return nextId;
    },
    clearTimeout(timerId) {
      timers.delete(timerId);
    },
    run(delay) {
      const entry = Array.from(timers.entries()).find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `Expected a ${delay}ms timer`);
      timers.delete(entry[0]);
      entry[1].callback();
    }
  };
}

class InteractiveElementStub {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.style = {};
    this.clientWidth = 800;
    this.clientHeight = 600;
    this.className = "";
    this.classList = {
      add: (...names) => this.updateClasses(names, true),
      remove: (...names) => this.updateClasses(names, false),
      toggle: (name, force) => this.updateClasses([name], force === undefined ? !this.hasClass(name) : Boolean(force)),
      contains: (name) => this.hasClass(name)
    };
  }

  updateClasses(names, shouldAdd) {
    const classes = new Set(this.className.split(/\s+/).filter(Boolean));
    names.forEach((name) => {
      if (shouldAdd) {
        classes.add(name);
      } else {
        classes.delete(name);
      }
    });
    this.className = Array.from(classes).join(" ");
  }

  hasClass(name) {
    return this.className.split(/\s+/).includes(name);
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  removeEventListener(type, handler) {
    if (this.listeners[type] === handler) {
      delete this.listeners[type];
    }
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  querySelector() {
    return null;
  }

  closest() {
    return null;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, right: this.clientWidth, bottom: this.clientHeight };
  }

  setPointerCapture() {}

  releasePointerCapture() {}
}

function createCanvasState(node, overrides = {}) {
  return {
    shell: {
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect() {
        return { left: 100, top: 50, right: 900, bottom: 650 };
      },
      addEventListener() {}
    },
    stage: {
      style: {}
    },
    layout: {
      width: 2000,
      height: 1400,
      nodes: [node]
    },
    panX: -300,
    panY: -120,
    zoom: 1.5,
    ...overrides
  };
}

test("blank canvas pointerdown clears generated selected-node assistant prompt", () => {
  let clearedPromptCount = 0;
  let persistCount = 0;
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub,
    app: {
      persistUiState() {
        persistCount += 1;
      }
    },
    editAssistant: {
      clearSelectedNodePrompt() {
        clearedPromptCount += 1;
      }
    }
  });
  const shell = new InteractiveElementStub("section");
  const stage = new InteractiveElementStub("div");
  const layout = {
    width: 2000,
    height: 1400,
    nodes: []
  };
  runtime.state.selectedNodePath = "0.1";

  runtime.viewport.setupCanvas(shell, stage, layout, null, { active: false });
  shell.listeners.pointerdown({
    target: shell,
    button: 0,
    clientX: 10,
    clientY: 20,
    pointerId: 1,
    preventDefault() {}
  });

  assert.equal(runtime.state.selectedNodePath, null);
  assert.equal(clearedPromptCount, 1);
  assert.equal(persistCount, 1);
});

test("canvas pan stops when pointer returns after primary button was released", () => {
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub
  });
  const shell = new InteractiveElementStub("section");
  const stage = new InteractiveElementStub("div");
  const layout = {
    width: 2000,
    height: 1400,
    nodes: []
  };

  runtime.viewport.setupCanvas(shell, stage, layout, null, { active: false });
  const initialPanX = shell.__btreeCanvasState.panX;
  const initialPanY = shell.__btreeCanvasState.panY;

  shell.listeners.pointerdown({
    target: shell,
    button: 0,
    clientX: 10,
    clientY: 20,
    pointerId: 1,
    preventDefault() {}
  });

  assert.equal(shell.hasClass("is-dragging"), true);

  shell.listeners.pointermove({
    target: shell,
    buttons: 0,
    clientX: 80,
    clientY: 120,
    pointerId: 1
  });

  assert.equal(shell.hasClass("is-dragging"), false);
  assert.equal(shell.__btreeCanvasState.panX, initialPanX);
  assert.equal(shell.__btreeCanvasState.panY, initialPanY);

  shell.listeners.pointermove({
    target: shell,
    buttons: 1,
    clientX: 120,
    clientY: 180,
    pointerId: 1
  });

  assert.equal(shell.__btreeCanvasState.panX, initialPanX);
  assert.equal(shell.__btreeCanvasState.panY, initialPanY);
});

test("rebuilding a canvas disposes global listeners from the previous instance", () => {
  const runtime = loadViewportRuntime({ Element: InteractiveElementStub });
  const firstShell = new InteractiveElementStub("section");
  const secondShell = new InteractiveElementStub("section");
  const layout = { width: 2000, height: 1400, nodes: [] };

  runtime.viewport.setupCanvas(firstShell, new InteractiveElementStub("div"), layout, null, {
    active: false,
    paneId: "main"
  });
  const listenerCounts = Object.fromEntries(
    Object.entries(runtime.__windowListeners).map(([type, listeners]) => [type, listeners.length])
  );

  runtime.viewport.setupCanvas(secondShell, new InteractiveElementStub("div"), layout, null, {
    active: false,
    paneId: "main"
  });

  Object.entries(listenerCounts).forEach(([type, count]) => {
    assert.equal(runtime.__windowListeners[type].length, count, `${type} listeners accumulated`);
  });
  assert.equal(firstShell.__btreeCanvasState, null);
  assert.equal(runtime.state.canvasStatesByPane.main.shell, secondShell);
});

test("drag preview only zooms out one step instead of fitting a large tree", () => {
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub
  });
  const shell = new InteractiveElementStub("section");
  const canvasState = createCanvasState(null, {
    shell,
    layout: {
      width: 12000,
      height: 8000,
      nodes: []
    },
    panX: -300,
    panY: -120,
    zoom: 1
  });
  runtime.state.currentCanvasState = canvasState;

  runtime.viewport.beginDragPreviewViewport();

  assert.equal(canvasState.zoom, 0.85);
  assert.equal(runtime.state.currentZoom, 0.85);
});

test("drag preview keeps the dragged node centered while zooming", () => {
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub
  });
  const shell = new InteractiveElementStub("section");
  const canvasState = createCanvasState(null, {
    shell,
    layout: {
      width: 2000,
      height: 1400,
      nodes: [{
        x: 500,
        y: 260,
        width: 220,
        height: 120,
        centerX: 610,
        dropTargetX: 880,
        dropTargetY: 400,
        dropTargetWidth: 300,
        dropTargetHeight: 250,
        node: { nodePath: "0.1", sourceTreeId: "MainTree" }
      }]
    },
    panX: -300,
    panY: -120,
    zoom: 1
  });
  runtime.state.currentCanvasState = canvasState;
  runtime.state.currentDragState = { kind: "move", treeId: "MainTree", sourceNodePath: "0.1" };

  const before = {
    x: 610 * canvasState.zoom + canvasState.panX,
    y: 320 * canvasState.zoom + canvasState.panY
  };
  runtime.viewport.beginDragPreviewViewport({
    screenX: shell.getBoundingClientRect().left + before.x,
    screenY: shell.getBoundingClientRect().top + before.y,
    nodePath: "0.1",
    treeId: "MainTree"
  });
  const after = {
    x: (880 + 300 / 2) * canvasState.zoom + canvasState.panX,
    y: (400 + 120 / 2) * canvasState.zoom + canvasState.panY
  };

  assert.ok(Math.abs(after.x - before.x) <= 1);
  assert.ok(Math.abs(after.y - before.y) <= 1);
});

test("palette drag keeps a nearby visible node anchored while opening drop targets", () => {
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub
  });
  const shell = new InteractiveElementStub("section");
  runtime.state.showCatalog = true;
  runtime.state.catalogWidth = 280;
  runtime.refs.catalogPanel = {
    hidden: false,
    getBoundingClientRect() {
      return { width: 280 };
    }
  };
  const anchorEntry = {
    x: 410,
    y: 240,
    width: 220,
    height: 120,
    dropTargetX: 700,
    dropTargetY: 390,
    dropTargetWidth: 300,
    dropTargetHeight: 250,
    node: { nodePath: "0.1", sourceTreeId: "MainTree" }
  };
  const canvasState = createCanvasState(null, {
    shell,
    layout: {
      width: 2000,
      height: 1400,
      nodes: [
        {
          x: 40,
          y: 36,
          width: 220,
          height: 100,
          dropTargetX: 40,
          dropTargetY: 36,
          dropTargetWidth: 230,
          dropTargetHeight: 250,
          node: { nodePath: "0", sourceTreeId: "MainTree" }
        },
        anchorEntry
      ]
    },
    panX: 0,
    panY: 0,
    zoom: 1
  });
  runtime.state.currentCanvasState = canvasState;
  runtime.state.selectedTreeId = "MainTree";

  const before = {
    x: anchorEntry.x + anchorEntry.width / 2,
    y: anchorEntry.y + anchorEntry.height / 2
  };
  runtime.viewport.beginDragPreviewViewport();
  const after = {
    x: (anchorEntry.dropTargetX + anchorEntry.dropTargetWidth / 2) * canvasState.zoom + canvasState.panX,
    y: (anchorEntry.dropTargetY + anchorEntry.height / 2) * canvasState.zoom + canvasState.panY
  };

  assert.equal(canvasState.zoom, 0.85);
  assert.ok(Math.abs(after.x - before.x) <= 1);
  assert.ok(Math.abs(after.y - before.y) <= 1);
});

test("drag preview animates from a compensated layout before applying the zoom", () => {
  const frames = [];
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub,
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    }
  });
  const shell = new InteractiveElementStub("section");
  const canvasState = createCanvasState({
    x: 500,
    y: 260,
    width: 220,
    height: 120,
    centerX: 610,
    dropTargetX: 880,
    dropTargetY: 400,
    dropTargetWidth: 300,
    dropTargetHeight: 250,
    node: { nodePath: "0.1", sourceTreeId: "MainTree" }
  }, { shell, zoom: 1 });
  runtime.state.currentCanvasState = canvasState;
  runtime.state.currentDragState = { kind: "move", treeId: "MainTree", sourceNodePath: "0.1" };

  runtime.viewport.beginDragPreviewViewport({
    screenX: 300,
    screenY: 250,
    nodePath: "0.1",
    treeId: "MainTree"
  });

  assert.equal(canvasState.zoom, 1);
  assert.equal(shell.hasClass("is-drag-preview-zooming"), true);
  assert.equal(frames.length, 1);

  frames.shift()();
  assert.equal(canvasState.zoom, 0.85);
  assert.equal(shell.hasClass("is-drag-preview-zooming"), true);

  runtime.viewport.endDragPreviewViewport({ cancelled: true });
  assert.equal(shell.hasClass("is-drag-preview-zooming"), false);
  assert.equal(canvasState.zoom, 1);
});

test("drag edge auto-pan keeps moving and cancellation restores the original viewport", () => {
  const frames = [];
  const timerHarness = createTimerHarness();
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub,
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelAnimationFrame() {},
    setTimeout: timerHarness.setTimeout,
    clearTimeout: timerHarness.clearTimeout
  });
  const shell = new InteractiveElementStub("section");
  const stage = new InteractiveElementStub("div");
  const layout = { width: 2000, height: 1400, nodes: [] };
  runtime.viewport.setupCanvas(shell, stage, layout, null, { active: false });
  const canvasState = shell.__btreeCanvasState;
  runtime.state.currentCanvasState = canvasState;
  runtime.state.currentDragState = { kind: "move", treeId: "MainTree", sourceNodePath: "0.1" };
  const originalPanX = canvasState.panX;
  runtime.viewport.beginDragPreviewViewport();
  frames.length = 0;
  timerHarness.timers.clear();

  shell.listeners.dragover({ clientX: 50, clientY: 350 });
  assert.equal(frames.length, 0);
  assert.equal(canvasState.panX, originalPanX);
  timerHarness.run(500);
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(canvasState.panX, originalPanX + 11);

  runtime.viewport.endDragPreviewViewport({ cancelled: true });
  assert.equal(canvasState.panX, originalPanX);
});

test("drag edge auto-pan shows a directional 0.5 second waiting hint", () => {
  const frames = [];
  const timerHarness = createTimerHarness();
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub,
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelAnimationFrame() {},
    setTimeout: timerHarness.setTimeout,
    clearTimeout: timerHarness.clearTimeout
  });
  const shell = new InteractiveElementStub("section");
  const stage = new InteractiveElementStub("div");
  runtime.state.currentSettings.language = "zh-CN";
  runtime.viewport.setupCanvas(shell, stage, { width: 2000, height: 1400, nodes: [] }, null, { active: false });
  const canvasState = shell.__btreeCanvasState;
  runtime.state.currentCanvasState = canvasState;
  runtime.state.currentDragState = { kind: "move", treeId: "MainTree", sourceNodePath: "0.1" };
  frames.length = 0;
  timerHarness.timers.clear();

  shell.listeners.dragover({ clientX: 5, clientY: 350, button: 0, buttons: 1 });
  assert.equal(canvasState.dragAutoPanHint.hidden, false);
  assert.equal(canvasState.dragAutoPanHint.dataset.direction, "left");
  assert.match(canvasState.dragAutoPanHint.textContent, /停留 0\.5 秒后向左移动/);
  assert.equal(canvasState.dragAutoPanHint.className, "drag-auto-pan-hint is-waiting");

  timerHarness.run(500);
  assert.equal(canvasState.dragAutoPanHint.hidden, true);
  assert.equal(frames.length, 1);
});

test("drag edge auto-pan restarts its waiting hint when direction changes", () => {
  const timerHarness = createTimerHarness();
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub,
    requestAnimationFrame() {
      return 1;
    },
    cancelAnimationFrame() {},
    setTimeout: timerHarness.setTimeout,
    clearTimeout: timerHarness.clearTimeout
  });
  const shell = new InteractiveElementStub("section");
  const stage = new InteractiveElementStub("div");
  runtime.state.currentSettings.language = "zh-CN";
  runtime.viewport.setupCanvas(shell, stage, { width: 2000, height: 1400, nodes: [] }, null, { active: false });
  const canvasState = shell.__btreeCanvasState;
  runtime.state.currentCanvasState = canvasState;
  runtime.state.currentDragState = { kind: "move", treeId: "MainTree", sourceNodePath: "0.1" };
  timerHarness.timers.clear();

  shell.listeners.dragover({ clientX: 5, clientY: 350, button: 0, buttons: 1 });
  const firstTimerId = Array.from(timerHarness.timers.keys())[0];
  shell.listeners.dragover({ clientX: 795, clientY: 350, button: 0, buttons: 1 });

  assert.equal(timerHarness.timers.has(firstTimerId), false);
  assert.equal(canvasState.dragAutoPanHint.hidden, false);
  assert.equal(canvasState.dragAutoPanHint.dataset.direction, "right");
  assert.match(canvasState.dragAutoPanHint.textContent, /停留 0\.5 秒后向右移动/);
  assert.equal(Array.from(timerHarness.timers.values()).filter((timer) => timer.delay === 500).length, 1);

  shell.listeners.dragover({ clientX: 400, clientY: 350, button: 0, buttons: 1 });
  assert.equal(canvasState.dragAutoPanHint.hidden, true);
  assert.equal(Array.from(timerHarness.timers.values()).filter((timer) => timer.delay === 500).length, 0);
});

test("drag edge auto-pan follows the visible edges beside expanded side panels", () => {
  let scheduledFrames = 0;
  const timerHarness = createTimerHarness();
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub,
    requestAnimationFrame() {
      scheduledFrames += 1;
      return scheduledFrames;
    },
    cancelAnimationFrame() {},
    setTimeout: timerHarness.setTimeout,
    clearTimeout: timerHarness.clearTimeout
  });
  const shell = new InteractiveElementStub("section");
  const stage = new InteractiveElementStub("div");
  runtime.state.showCatalog = true;
  runtime.state.catalogWidth = 280;
  runtime.state.editAssistantVisible = true;
  runtime.state.editAssistantWidth = 320;
  runtime.refs.catalogPanel = {
    hidden: false,
    getBoundingClientRect() {
      return { width: 280 };
    }
  };
  runtime.refs.editAssistantPanel = {
    hidden: false,
    getBoundingClientRect() {
      return { width: 320 };
    }
  };
  runtime.viewport.setupCanvas(shell, stage, { width: 2000, height: 1400, nodes: [] }, null, { active: false });
  runtime.state.currentCanvasState = shell.__btreeCanvasState;
  runtime.state.currentDragState = { kind: "move", treeId: "MainTree", sourceNodePath: "0.1" };
  runtime.viewport.beginDragPreviewViewport();
  scheduledFrames = 0;
  timerHarness.timers.clear();

  shell.listeners.dragover({ clientX: 331, clientY: 350, button: 0, buttons: 1 });
  assert.equal(timerHarness.timers.size, 0);
  shell.listeners.dragover({ clientX: 330, clientY: 350, button: 0, buttons: 1 });
  assert.equal(scheduledFrames, 0);
  timerHarness.run(500);
  assert.equal(scheduledFrames, 1);

  shell.listeners.dragover({ clientX: 429, clientY: 350, button: 0, buttons: 1 });
  assert.equal(timerHarness.timers.size, 0);
  shell.listeners.dragover({ clientX: 430, clientY: 350, button: 0, buttons: 1 });
  timerHarness.run(500);
  assert.equal(scheduledFrames, 2);
});

test("drag edge auto-pan keeps its direction outside the canvas and updates on re-entry", () => {
  const frames = [];
  const timerHarness = createTimerHarness();
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub,
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelAnimationFrame() {},
    setTimeout: timerHarness.setTimeout,
    clearTimeout: timerHarness.clearTimeout
  });
  const shell = new InteractiveElementStub("section");
  const stage = new InteractiveElementStub("div");
  runtime.state.showCatalog = true;
  runtime.state.catalogWidth = 280;
  runtime.refs.catalogPanel = {
    hidden: false,
    getBoundingClientRect() {
      return { width: 280 };
    }
  };
  runtime.viewport.setupCanvas(shell, stage, { width: 2000, height: 1400, nodes: [] }, null, { active: false });
  runtime.state.currentCanvasState = shell.__btreeCanvasState;
  runtime.state.currentDragState = { kind: "move", treeId: "MainTree", sourceNodePath: "0.1" };
  frames.length = 0;
  timerHarness.timers.clear();

  shell.listeners.dragover({ clientX: 285, clientY: 350, button: 0, buttons: 1 });
  timerHarness.run(500);
  assert.equal(frames.length, 1);
  const panBeforeLeaving = shell.__btreeCanvasState.panX;
  shell.listeners.dragleave({ relatedTarget: null });
  frames.shift()();
  assert.ok(shell.__btreeCanvasState.panX > panBeforeLeaving);

  shell.listeners.dragenter({ clientX: 5, clientY: 350, button: 0, buttons: 1 });
  const panBeforeReentry = shell.__btreeCanvasState.panX;
  frames.shift()();
  assert.ok(shell.__btreeCanvasState.panX > panBeforeReentry);
});

test("right mouse button reported by dragover cancels the active node drag", () => {
  let cancelled = false;
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub,
    canvas: {
      clearDragState(options) {
        cancelled = options?.cancelled === true;
        runtime.state.currentDragState = null;
      }
    }
  });
  const shell = new InteractiveElementStub("section");
  const stage = new InteractiveElementStub("div");
  runtime.viewport.setupCanvas(shell, stage, { width: 2000, height: 1400, nodes: [] }, null, { active: false });
  runtime.state.currentCanvasState = shell.__btreeCanvasState;
  runtime.state.currentDragState = { kind: "move", treeId: "MainTree", sourceNodePath: "0.1" };

  shell.listeners.dragover({ clientX: 400, clientY: 300, button: 2, buttons: 3, preventDefault() {} });

  assert.equal(cancelled, true);
  assert.equal(runtime.state.currentDragState, null);
});

test("primary mouse release clears a drag when native dragend was lost outside the window", () => {
  const timers = [];
  let cancelled = false;
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub,
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
    canvas: {
      clearDragState(options) {
        cancelled = options?.cancelled === true;
        runtime.state.currentDragState = null;
      }
    }
  });
  const shell = new InteractiveElementStub("section");
  const stage = new InteractiveElementStub("div");
  runtime.viewport.setupCanvas(shell, stage, { width: 2000, height: 1400, nodes: [] }, null, { active: false });
  runtime.state.currentCanvasState = shell.__btreeCanvasState;
  runtime.state.currentDragState = { kind: "move", treeId: "MainTree", sourceNodePath: "0.1" };
  timers.length = 0;

  runtime.__windowListeners.mouseup.forEach((handler) => handler({ button: 0 }));
  assert.equal(cancelled, false);
  timers.shift()();
  assert.equal(cancelled, true);
  assert.equal(runtime.state.currentDragState, null);
});

test("window blur cancels an active drag before it can remain stuck on re-entry", () => {
  let cancelled = false;
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub,
    canvas: {
      clearDragState(options) {
        cancelled = options?.cancelled === true;
        runtime.state.currentDragState = null;
      }
    }
  });
  const shell = new InteractiveElementStub("section");
  const stage = new InteractiveElementStub("div");
  runtime.viewport.setupCanvas(shell, stage, { width: 2000, height: 1400, nodes: [] }, null, { active: false });
  runtime.state.currentCanvasState = shell.__btreeCanvasState;
  runtime.state.currentDragState = { kind: "move", treeId: "MainTree", sourceNodePath: "0.1" };

  runtime.__windowListeners.blur.forEach((handler) => handler({}));

  assert.equal(cancelled, true);
  assert.equal(runtime.state.currentDragState, null);
});

test("mouse movement after window re-entry releases stale edge auto-pan", () => {
  const frames = [];
  const timerHarness = createTimerHarness();
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub,
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelAnimationFrame() {},
    setTimeout: timerHarness.setTimeout,
    clearTimeout: timerHarness.clearTimeout
  });
  const shell = new InteractiveElementStub("section");
  const stage = new InteractiveElementStub("div");
  runtime.viewport.setupCanvas(shell, stage, { width: 2000, height: 1400, nodes: [] }, null, { active: false });
  runtime.state.currentCanvasState = shell.__btreeCanvasState;
  runtime.state.currentDragState = { kind: "move", treeId: "MainTree", sourceNodePath: "0.1" };
  frames.length = 0;
  timerHarness.timers.clear();

  shell.listeners.dragover({ clientX: 5, clientY: 350, button: 0, buttons: 1 });
  timerHarness.run(500);
  const panBeforeEdgeFrame = shell.__btreeCanvasState.panX;
  frames.shift()();
  assert.ok(shell.__btreeCanvasState.panX > panBeforeEdgeFrame);

  runtime.__windowListeners.mousemove.forEach((handler) => handler({
    clientX: 400,
    clientY: 350,
    button: 0,
    buttons: 1
  }));
  const panAfterReturn = shell.__btreeCanvasState.panX;
  frames.shift()();
  assert.equal(shell.__btreeCanvasState.panX, panAfterReturn);
});

test("edge auto-pan stops when drag events are lost outside the webview", () => {
  const frames = [];
  const timerHarness = createTimerHarness();
  const runtime = loadViewportRuntime({
    Element: InteractiveElementStub,
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelAnimationFrame() {},
    setTimeout: timerHarness.setTimeout,
    clearTimeout: timerHarness.clearTimeout
  });
  const shell = new InteractiveElementStub("section");
  const stage = new InteractiveElementStub("div");
  runtime.viewport.setupCanvas(shell, stage, { width: 2000, height: 1400, nodes: [] }, null, { active: false });
  runtime.state.currentCanvasState = shell.__btreeCanvasState;
  runtime.state.currentDragState = { kind: "move", treeId: "MainTree", sourceNodePath: "0.1" };
  frames.length = 0;
  timerHarness.timers.clear();

  shell.listeners.dragover({ clientX: 5, clientY: 350, button: 0, buttons: 1 });
  timerHarness.run(500);
  frames.shift()();
  const panAfterEdgeFrame = shell.__btreeCanvasState.panX;
  timerHarness.run(180);

  frames.shift()();
  assert.equal(shell.__btreeCanvasState.panX, panAfterEdgeFrame);
});

test("tree layout reuses base measurements for expanded drop target sizing", () => {
  let buildNodeCardCalls = 0;
  const runtime = loadViewportRuntime({
    canvas: {
      buildNodeCard(node) {
        buildNodeCardCalls += 1;
        return {
          getBoundingClientRect() {
            return {
              width: node.nodePath === "0" ? 260 : 180,
              height: node.nodePath === "0" ? 120 : 80
            };
          }
        };
      }
    }
  });
  const root = {
    nodePath: "0",
    children: [
      { nodePath: "0.0", children: [] },
      { nodePath: "0.1", children: [] }
    ]
  };

  const layout = runtime.viewport.buildTreeLayout(root, { behaviorTrees: [{ id: "MainTree", node: root }] });

  assert.equal(layout.nodes.length, 3);
  assert.equal(buildNodeCardCalls, 6);
  assert.equal(layout.nodes[1].dropTargetWidth, 230);
  assert.equal(layout.nodes[1].dropTargetHeight, 250);
});

test("node position viewport anchor keeps the edited node at its current position", () => {
  const runtime = loadViewportRuntime();
  const canvasState = createCanvasState({
    x: 350,
    y: 200,
    width: 180,
    height: 100,
    centerX: 440,
    node: {
      sourceTreeId: "MainTree",
      nodePath: "0.1",
      renderPath: "MainTree::0.1"
    }
  });

  const anchor = runtime.viewport.captureNodePositionViewportAnchor(canvasState, "0.1", "MainTree");

  assert.equal(anchor.treeId, "MainTree");
  assert.equal(anchor.nodePath, "0.1");
  assert.equal(anchor.renderPath, "MainTree::0.1");
  assert.equal(anchor.screenX, 225);
  assert.equal(anchor.screenY, 180);
  assert.equal(anchor.localX, 0);
  assert.equal(anchor.localY, 0);

  runtime.state.pendingViewportAnchor = anchor;
  const viewportState = runtime.viewport.getCanvasViewportState(canvasState);

  assert.equal(viewportState.anchor, anchor);
  assert.equal(runtime.state.pendingViewportAnchor, null);
});

test("restoring a node position viewport anchor keeps the node at the same screen position", () => {
  const runtime = loadViewportRuntime();
  const shell = {
    clientWidth: 800,
    clientHeight: 600,
    getBoundingClientRect() {
      return { left: 100, top: 50, right: 900, bottom: 650 };
    },
    addEventListener() {}
  };
  const stage = { style: {} };
  const layout = {
    width: 2000,
    height: 1400,
    nodes: [
      {
        x: 500,
        y: 260,
        width: 220,
        height: 120,
        centerX: 610,
        node: {
          sourceTreeId: "MainTree",
          nodePath: "0.1",
          renderPath: "MainTree::0.1"
        }
      }
    ]
  };

  runtime.viewport.setupCanvas(
    shell,
    stage,
    layout,
    {
      zoom: 1.5,
      panX: -300,
      panY: -120,
      anchor: {
        treeId: "MainTree",
        nodePath: "0.1",
        renderPath: "MainTree::0.1",
        screenX: 225,
        screenY: 180,
        localX: 0,
        localY: 0
      }
    },
    { active: false }
  );

  assert.equal(shell.__btreeCanvasState.panX, -525);
  assert.equal(shell.__btreeCanvasState.panY, -210);
  assert.equal(stage.style.transform, "translate(-525px, -210px) scale(1.5)");
});

test("viewport capture reuses pending restore state before the canvas is ready", () => {
  const animationFrames = [];
  const runtime = loadViewportRuntime({
    requestAnimationFrame(callback) {
      animationFrames.push(callback);
    }
  });
  const shell = {
    clientWidth: 800,
    clientHeight: 600,
    getBoundingClientRect() {
      return { left: 100, top: 50, right: 900, bottom: 650 };
    },
    addEventListener() {}
  };
  const stage = { style: {} };
  const layout = {
    width: 2000,
    height: 1400,
    nodes: [
      {
        x: 500,
        y: 260,
        width: 220,
        height: 120,
        centerX: 610,
        node: {
          sourceTreeId: "MainTree",
          nodePath: "0.1",
          renderPath: "MainTree::0.1"
        }
      }
    ]
  };
  const viewportState = {
    zoom: 1.5,
    panX: -300,
    panY: -120,
    anchor: {
      treeId: "MainTree",
      nodePath: "0.1",
      renderPath: "MainTree::0.1",
      screenX: 225,
      screenY: 180,
      localX: 0,
      localY: 0
    }
  };

  runtime.viewport.setupCanvas(shell, stage, layout, viewportState, { active: false });

  assert.equal(shell.__btreeCanvasState.viewportReady, false);
  assert.equal(runtime.viewport.getCanvasViewportState(shell.__btreeCanvasState), viewportState);
  assert.equal(animationFrames.length, 1);
});

test("absolute viewport anchor preserves screen position across layout shifts", () => {
  const frames = [];
  const runtime = loadViewportRuntime({
    requestAnimationFrame(callback) {
      frames.push(callback);
    }
  });
  runtime.state.selectedTreeId = "MainTree";
  runtime.state.selectedNodePath = "0.1";
  let shellLeft = 100;
  const canvasState = createCanvasState({
    x: 500,
    y: 260,
    width: 220,
    height: 120,
    centerX: 610,
    node: {
      sourceTreeId: "MainTree",
      nodePath: "0.1",
      renderPath: "MainTree::0.1"
    }
  }, {
    shell: {
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect() {
        return { left: shellLeft, top: 50, right: shellLeft + 800, bottom: 650 };
      },
      addEventListener() {}
    }
  });
  runtime.state.currentCanvasState = canvasState;

  runtime.viewport.preserveViewportForLayout(() => {
    shellLeft = 320;
  });
  assert.equal(frames.length, 1);
  frames[0]();

  assert.equal(canvasState.panX, -520);
  assert.equal(canvasState.panY, -120);
  assert.equal(canvasState.stage.style.transform, "translate(-520px, -120px) scale(1.5)");
});

test("layout preservation can reuse a fixed drag anchor", () => {
  const frames = [];
  const runtime = loadViewportRuntime({
    requestAnimationFrame(callback) {
      frames.push(callback);
    }
  });
  runtime.state.selectedTreeId = "MainTree";
  runtime.state.selectedNodePath = "0.1";
  let shellLeft = 100;
  const canvasState = createCanvasState({
    x: 500,
    y: 260,
    width: 220,
    height: 120,
    centerX: 610,
    node: {
      sourceTreeId: "MainTree",
      nodePath: "0.1",
      renderPath: "MainTree::0.1"
    }
  }, {
    shell: {
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect() {
        return { left: shellLeft, top: 50, right: shellLeft + 800, bottom: 650 };
      },
      addEventListener() {}
    }
  });
  runtime.state.currentCanvasState = canvasState;
  const anchor = runtime.viewport.captureViewportForLayout();

  runtime.viewport.preserveViewportForLayout(() => {
    shellLeft = 220;
  }, anchor, { defer: false });
  runtime.viewport.preserveViewportForLayout(() => {
    shellLeft = 320;
  }, anchor, { defer: false });
  assert.equal(frames.length, 0);

  assert.equal(canvasState.panX, -520);
  assert.equal(canvasState.panY, -120);
});
