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
  const runtime = {
    state: {},
    app: {
      canPerformAction() {
        return true;
      },
      activateTreePane() {}
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
      createElement
    }
  };
  const scriptPath = path.resolve("media/runtime/overlays/context-menus.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
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
