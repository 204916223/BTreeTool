import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function createElementStub() {
  return {
    title: "",
    hidden: false,
    disabled: false,
    tabIndex: -1,
    textContent: "",
    placeholder: "",
    attributes: {},
    classList: {
      values: new Set(),
      add(name) {
        this.values.add(name);
      },
      toggle(name, active) {
        if (active) {
          this.values.add(name);
        } else {
          this.values.delete(name);
        }
      }
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    removeAttribute(name) {
      delete this.attributes[name];
    }
  };
}

function loadChromeStateRuntime(mode = "edit") {
  const runtime = {
    state: {
      currentSettings: {},
      currentHasDocument: true,
      currentPreview: { behaviorTrees: [] },
      currentHasBlockingIssues: false,
      hasUnsavedXmlChanges: false,
      splitViewEnabled: false
    },
    refs: {
      toggleCatalogButton: createElementStub(),
      openSettingsButton: createElementStub(),
      addBehaviorTreeButton: createElementStub(),
      splitViewButton: createElementStub(),
      saveDocumentButton: createElementStub(),
      catalogEyebrow: createElementStub(),
      catalogSearchInput: createElementStub(),
      openNodeAtlasButton: createElementStub(),
      addNodeModelButton: createElementStub(),
      treeSearchTitle: createElementStub(),
      treeSearchInput: createElementStub(),
      treeSearchCloseButton: createElementStub(),
      treeSearchAdvancedToggle: createElementStub(),
      treeSearchNodeLabel: createElementStub(),
      treeSearchDescriptionLabel: createElementStub(),
      treeSearchAttributesLabel: createElementStub(),
      treeSearchPrevButton: createElementStub(),
      treeSearchNextButton: createElementStub(),
      editModeButton: createElementStub(),
      playbackModeButton: createElementStub(),
      fileLabel: createElementStub()
    },
    modeRules: {
      isPlaybackMode() {
        return mode === "playback";
      },
      isEditingEnabled() {
        return mode !== "playback";
      }
    },
    app: {
      canPerformAction() {
        return true;
      }
    },
    search: {
      updateUi() {}
    },
    overlays: {
      hideAll() {},
      hideNodeContextMenu() {},
      hideCanvasContextMenu() {}
    },
    canvas: {
      clearDragState() {}
    }
  };

  const documentElement = {
    dataset: {},
    lang: "",
    style: {
      values: {},
      setProperty(name, value) {
        this.values[name] = value;
      }
    }
  };
  const context = {
    window: {
      BTreeToolRuntime: runtime
    },
    document: {
      documentElement,
      body: {
        classList: {
          values: new Set(),
          toggle(name, active) {
            if (active) {
              this.values.add(name);
            } else {
              this.values.delete(name);
            }
          }
        }
      }
    }
  };

  vm.runInNewContext(
    fs.readFileSync(path.resolve("media/runtime/i18n.js"), "utf8"),
    context,
    { filename: "media/runtime/i18n.js" }
  );
  vm.runInNewContext(
    fs.readFileSync(path.resolve("media/runtime/app/chrome-state.js"), "utf8"),
    context,
    { filename: "media/runtime/app/chrome-state.js" }
  );
  return runtime;
}

test("chrome state applies file label action copy in edit mode during startup", () => {
  const runtime = loadChromeStateRuntime("edit");

  assert.doesNotThrow(() => runtime.chromeState.applyUserSettings());
  assert.equal(runtime.refs.fileLabel.attributes.role, "button");
  assert.equal(runtime.refs.fileLabel.title, "Open existing XML");
});

test("chrome state applies file label action copy in playback mode during startup", () => {
  const runtime = loadChromeStateRuntime("playback");

  assert.doesNotThrow(() => runtime.chromeState.applyUserSettings());
  assert.equal(runtime.refs.fileLabel.attributes.role, "button");
  assert.equal(runtime.refs.fileLabel.title, "Import Log");
});
