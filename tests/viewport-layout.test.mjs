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
      MAX_ZOOM: 2
    },
    refs: {
      treeSwitcher: null,
      warningList: null,
      zoomLevelLabel: null
    }
  };
  const context = {
    window: {
      BTreeToolRuntime: runtime,
      addEventListener() {},
      setTimeout() {}
    },
    document: {
      querySelectorAll() {
        return [];
      }
    },
    requestAnimationFrame: options.requestAnimationFrame || ((callback) => callback())
  };
  const scriptPath = path.resolve("media/runtime/viewport/viewport-layout.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return runtime;
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
