import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function createClassList() {
  const values = new Set();
  return {
    values,
    toggle(name, enabled) {
      if (enabled) {
        values.add(name);
      } else {
        values.delete(name);
      }
    },
    contains(name) {
      return values.has(name);
    }
  };
}

function createElement() {
  const properties = new Map();
  return {
    hidden: false,
    classList: createClassList(),
    style: {
      setProperty(name, value) {
        properties.set(name, value);
      },
      getPropertyValue(name) {
        return properties.get(name);
      }
    },
    addEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {}
  };
}

function loadWorkspacePanelsRuntime(runtime) {
  const context = {
    window: {
      BTreeToolRuntime: runtime
    },
    document: {
      body: {
        classList: {
          add() {},
          remove() {}
        }
      }
    }
  };
  const scriptPath = path.resolve("media/runtime/workspace-panels.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return runtime.workspacePanels;
}

test("workspace panels tolerate missing assistant elements during startup", () => {
  const treeWorkspace = createElement();
  const catalogPanel = createElement();
  const catalogResizer = createElement();
  const toggleCatalogButton = createElement();
  const runtime = {
    state: {
      currentHasDocument: false,
      showCatalog: true,
      editAssistantVisible: true,
      catalogWidth: 280,
      editAssistantWidth: 320
    },
    refs: {
      treeWorkspace,
      catalogPanel,
      catalogResizer,
      toggleCatalogButton
    },
    modeRules: {
      isPlaybackMode() {
        return false;
      }
    },
    catalog: {
      syncDeleteTargetIndicator() {}
    }
  };

  const workspacePanels = loadWorkspacePanelsRuntime(runtime);

  assert.doesNotThrow(() => workspacePanels.apply());
  assert.equal(catalogPanel.hidden, true);
  assert.equal(catalogResizer.hidden, true);
  assert.equal(toggleCatalogButton.hidden, true);
  assert.equal(treeWorkspace.classList.contains("show-catalog"), false);
  assert.equal(treeWorkspace.classList.contains("show-edit-assistant"), false);
});

test("workspace panels place catalog and assistant only when a document is editable", () => {
  const treeWorkspace = createElement();
  const catalogPanel = createElement();
  const editAssistantPanel = createElement();
  const runtime = {
    state: {
      currentHasDocument: true,
      showCatalog: true,
      editAssistantVisible: true,
      catalogWidth: 300,
      editAssistantWidth: 360
    },
    refs: {
      treeWorkspace,
      catalogPanel,
      catalogResizer: createElement(),
      toggleCatalogButton: createElement(),
      editAssistantPanel,
      editAssistantResizer: createElement(),
      toggleEditAssistantButton: createElement()
    },
    modeRules: {
      isPlaybackMode() {
        return false;
      }
    },
    catalog: {
      syncDeleteTargetIndicator() {}
    }
  };

  const workspacePanels = loadWorkspacePanelsRuntime(runtime);
  workspacePanels.apply();

  assert.equal(catalogPanel.hidden, false);
  assert.equal(editAssistantPanel.hidden, false);
  assert.equal(treeWorkspace.style.getPropertyValue("--catalog-width"), "300px");
  assert.equal(treeWorkspace.style.getPropertyValue("--edit-assistant-width"), "360px");
  assert.equal(treeWorkspace.style.getPropertyValue("--workspace-left-overlay"), "300px");
  assert.equal(treeWorkspace.style.getPropertyValue("--workspace-right-overlay"), "360px");
  assert.equal(treeWorkspace.classList.contains("show-catalog"), true);
  assert.equal(treeWorkspace.classList.contains("show-edit-assistant"), true);
});
