import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function createElement() {
  return {
    hidden: false,
    style: {},
    children: [],
    appendChild(child) {
      this.children.push(child);
    }
  };
}

function loadContextMenusRuntime() {
  const messages = [];
  const tree = {
    id: "MainTree",
    node: {
      nodePath: "0",
      title: "Root",
      kind: "Sequence",
      attributes: {},
      children: []
    }
  };
  const runtime = {
    state: {
      currentPreview: {
        behaviorTrees: [tree],
        nodeModels: []
      },
      selectedNodePath: "0"
    },
    vscode: {
      postMessage(message) {
        messages.push(message);
      }
    },
    app: {
      canPerformAction() {
        return true;
      },
      activateTreePane() {},
      activateTreePaneByTreeId() {},
      persistUiState() {},
      getSelectedTree() {
        return tree;
      },
      findNodeByPath(rootNode, nodePath) {
        return nodePath === "0" ? rootNode : null;
      }
    },
    i18n: {
      getOverlayCopy() {
        return {
          copyNode: "Copy Node",
          addNewBefore: "Add New Before",
          addNewAfter: "Add New After",
          addNewChild: "Add New Child",
          pasteCopyBefore: "Paste Copy Before",
          pasteCopyAfter: "Paste Copy After",
          pasteCopyAsChild: "Paste Copy As Child",
          deleteNode: "Delete Node",
          showConfiguredNodeDetails: "Show Configured Node Details",
          hideAllNodeDetails: "Hide All Node Display Items"
        };
      }
    },
    modeRules: {
      isPlaybackMode() {
        return false;
      }
    },
    canvas: {
      canAppendChildren() {
        return true;
      },
      canDeleteNode() {
        return true;
      },
      getParentNodePath() {
        return null;
      },
      getNodeIndex() {
        return null;
      }
    },
    overlayRuntime: {
      state: {},
      parts: {},
      shared: {
        createMenuButton(label, onClick) {
          return { hidden: false, disabled: false, textContent: label, onClick };
        },
        setMenuButtonLabel(button, label) {
          button.textContent = label;
        },
        setMenuButtonDisabled(button, disabled) {
          button.disabled = disabled;
        }
      }
    }
  };
  const context = {
    window: {
      BTreeToolRuntime: runtime
    },
    document: {
      body: {
        classList: {
          contains() {
            return false;
          }
        }
      },
      createElement
    }
  };
  const scriptPath = path.resolve("media/runtime/overlays/context-menus.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  runtime.messages = messages;
  return runtime;
}

test("node and canvas context menus are mutually exclusive", () => {
  const runtime = loadContextMenusRuntime();
  const menus = runtime.overlayRuntime.parts.contextMenus;
  const overlayState = runtime.overlayRuntime.state;
  overlayState.nodeContextMenu = menus.createNodeContextMenu();
  overlayState.canvasContextMenu = menus.createCanvasContextMenu();

  menus.showCanvasContextMenu(10, 20);
  assert.equal(overlayState.canvasContextMenu.element.hidden, false);

  menus.showNodeContextMenu(30, 40, {
    treeId: "MainTree",
    nodePath: "0",
    nodeTitle: "Root",
    nodeTemplate: { tagName: "Sequence", attributes: {}, children: [] },
    allowAppendChild: true,
    childCount: 0,
    allowDelete: true
  });
  assert.equal(overlayState.canvasContextMenu.element.hidden, true);
  assert.equal(overlayState.nodeContextMenu.element.hidden, false);

  menus.showCanvasContextMenu(50, 60);
  assert.equal(overlayState.nodeContextMenu.element.hidden, true);
  assert.equal(overlayState.canvasContextMenu.element.hidden, false);
});

test("shared node clipboard can paste when the current webview has no local copied node", () => {
  const runtime = loadContextMenusRuntime();
  const menus = runtime.overlayRuntime.parts.contextMenus;
  const overlayState = runtime.overlayRuntime.state;
  overlayState.nodeContextMenu = menus.createNodeContextMenu();
  overlayState.canvasContextMenu = menus.createCanvasContextMenu();
  runtime.state.hasSharedNodeTemplate = true;

  const handled = menus.executeNodeShortcutAction("pasteAsChild");

  assert.equal(handled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.messages)), [
    {
      type: "pasteSharedNodeTemplate",
      payload: {
        treeId: "MainTree",
        paneId: null,
        targetParentPath: "0",
        targetIndex: 0
      }
    }
  ]);
});

test("copying a node includes its matching port model", () => {
  const runtime = loadContextMenusRuntime();
  const menus = runtime.overlayRuntime.parts.contextMenus;
  runtime.overlayRuntime.state.nodeContextMenu = menus.createNodeContextMenu();
  runtime.overlayRuntime.state.canvasContextMenu = menus.createCanvasContextMenu();
  const node = runtime.state.currentPreview.behaviorTrees[0].node;
  node.kind = "Action";
  node.attributes = { ID: "Calculate", source: "{x}", result: "{y}" };
  runtime.state.currentPreview.nodeModels = [
    {
      id: "Calculate",
      modelKind: "Action",
      attributes: { ID: "Calculate" },
      ports: [
        { tagName: "input_port", attributes: { name: "source" } },
        { tagName: "output_port", attributes: { name: "result" } }
      ]
    },
    {
      id: "Unrelated",
      modelKind: "Condition",
      attributes: { ID: "Unrelated" },
      ports: []
    }
  ];

  const handled = menus.executeNodeShortcutAction("copy");

  assert.equal(handled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.messages)), [
    {
      type: "copyNodeTemplate",
      payload: {
        nodeTemplate: {
          tagName: "Action",
          attributes: { ID: "Calculate", source: "{x}", result: "{y}" },
          children: []
        },
        nodeModels: [
          {
            id: "Calculate",
            modelKind: "Action",
            attributes: { ID: "Calculate" },
            ports: [
              { tagName: "input_port", attributes: { name: "source" } },
              { tagName: "output_port", attributes: { name: "result" } }
            ]
          }
        ]
      }
    }
  ]);
});
