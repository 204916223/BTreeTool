import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadViewportRuntime(options = {}) {
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
      addEventListener() {},
      setTimeout() {}
    },
    document: {
      body: createElementStub("body"),
      createElement(tagName) {
        return createElementStub(tagName);
      },
      querySelectorAll() {
        return [];
      }
    },
    Element: ElementClass,
    HTMLElement: ElementClass,
    requestAnimationFrame: options.requestAnimationFrame || ((callback) => callback())
  };
  const scriptPath = path.resolve("media/runtime/viewport/viewport-layout.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return runtime;
}

function createElementStub(tagName = "div") {
  return {
    tagName: tagName.toUpperCase(),
    children: [],
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
