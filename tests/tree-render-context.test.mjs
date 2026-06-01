import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadTreeRenderRuntime(state) {
  const runtime = {
    state,
    modeRules: {
      isPlaybackMode() {
        return true;
      }
    }
  };
  const context = {
    window: {
      BTreeToolRuntime: runtime
    }
  };
  const scriptPath = path.resolve("media/runtime/tree/tree-render-context.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return runtime.treeRender;
}

function createPreview() {
  return {
    defaultTreeId: "MainTree",
    mainTreeToExecute: "MainTree",
    behaviorTrees: [
      {
        id: "MainTree",
        node: {
          kind: "Sequence",
          nodePath: "0",
          children: [
            {
              kind: "SubTree",
              targetTreeId: "SubA",
              nodePath: "0.0",
              children: []
            }
          ]
        }
      },
      {
        id: "SubA",
        node: {
          kind: "AlwaysSuccess",
          nodePath: "0",
          children: []
        }
      }
    ]
  };
}

test("tree render context expands SubTree references when edit render mode is expanded", () => {
  const state = {
    currentSettings: {
      editTreeRenderMode: "expanded",
      playbackTreeRenderMode: "paged",
      playbackPanelLayout: "dashboard"
    },
    selectedTreeId: "MainTree",
    selectedNodePath: "0"
  };
  const treeRender = loadTreeRenderRuntime(state);
  const preview = createPreview();
  const getTreeMap = (result) => new Map(result.behaviorTrees.map((tree) => [tree.id, tree]));

  const context = treeRender.getTreeRenderContext(preview, "edit", getTreeMap);
  const injectedNode = context.tree.node.children[0].children[0];

  assert.equal(context.expanded, true);
  assert.equal(context.rootTreeId, "MainTree");
  assert.equal(injectedNode.sourceTreeId, "SubA");
  assert.equal(injectedNode.expandedSubtreeInjection, true);

  state.selectedTreeId = "Missing";
  state.selectedNodePath = "0.9";
  treeRender.ensureRenderSelection(context);
  assert.equal(state.selectedTreeId, "MainTree");
  assert.equal(state.selectedNodePath, "0");
});

test("tree render context exposes playback layout mode helpers", () => {
  const treeRender = loadTreeRenderRuntime({
    currentSettings: {
      editTreeRenderMode: "paged",
      playbackTreeRenderMode: "expanded",
      playbackPanelLayout: "dashboard"
    },
    selectedTreeId: null,
    selectedNodePath: "0"
  });

  assert.equal(treeRender.getTreeRenderMode("edit"), "paged");
  assert.equal(treeRender.getTreeRenderMode("playback"), "expanded");
  assert.equal(treeRender.getPlaybackPanelLayout(), "dashboard");
  assert.equal(treeRender.isPlaybackTimeBasedMode(), true);
});
