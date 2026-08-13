import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function createElementStub(tagName = "div") {
  return {
    tagName: tagName.toUpperCase(),
    className: "",
    dataset: {},
    style: {
      setProperty() {}
    },
    classList: {
      toggle() {}
    },
    addEventListener() {},
    textContent: "",
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...children) {
      this.children = children;
    }
  };
}

function loadEditControllerRuntime() {
  const splitViewportStates = {
    left: { zoom: 1.5, panX: -240, panY: -80 },
    right: { zoom: 1.8, panX: -420, panY: -140 }
  };
  const renderSplitCalls = [];
  const runtime = {
    dragImage: {
      setVisibleDragImage() {}
    },
    appState: {
      createInitialState() {
        return {
          currentSettings: {},
          currentCanvasState: null,
          canvasStatesByPane: {
            left: {},
            right: {}
          },
          splitViewEnabled: true,
          activeTreePane: "left",
          selectedTreeId: "MainTree",
          selectedNodePath: "0",
          currentCatalogGroups: [],
          playbackExpandedBlackboardKeys: new Set()
        };
      }
    },
    domRefs: {
      createRefs() {
        return {
          catalogResizer: createElementStub(),
          editAssistantResizer: createElementStub(),
          treeSwitcher: createElementStub(),
          warningList: createElementStub(),
          zoomLevelLabel: createElementStub(),
          treeContent: createElementStub(),
          fileLabel: createElementStub(),
          catalogList: createElementStub()
        };
      }
    },
    treeRender: {
      getTreeRenderContext(result) {
        return {
          expanded: false,
          rootTreeId: "MainTree",
          tree: result.behaviorTrees[0],
          switcherResult: result
        };
      },
      ensureRenderSelection() {}
    },
    chromeState: {
      applyUserSettings() {},
      updateSplitViewButton() {},
      updateSaveIndicator() {},
      updateEditModeButton() {}
    },
    editSplitView: {
      create() {
        return {
          renderSplitTreeView(_result, viewportStates) {
            renderSplitCalls.push(viewportStates);
            runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
          },
          getCanvasViewportState() {
            return null;
          },
          getSplitViewportStates() {
            return splitViewportStates;
          },
          ensureSplitPaneState() {}
        };
      }
    },
    playbackController: {
      create() {
        return {
          renderPlaybackState() {},
          renderPlaybackLog() {},
          togglePlayback() {},
          pausePlayback() {},
          stagePlaybackTransitionUidFilter() {},
          updatePlaybackTracePanel() {},
          handleTraceAnswerChunk() {},
          handleTraceAnswer() {},
          clearTraceMessages() {},
          getPlaybackFrameTimeUs() {},
          buildCurrentPlaybackSnapshot() {}
        };
      }
    },
    mainEvents: {
      bindWebviewMessages(handlers) {
        runtime.boundWebviewHandlers = handlers;
      },
      bindGlobalKeys() {},
      bindChromeControls() {}
    },
    catalog: {
      init() {},
      renderCatalog() {}
    },
    editAssistant: {
      init() {},
      render() {}
    },
    overlays: {
      init() {},
      hideAll() {}
    },
    viewport: {
      init() {},
      updateZoomLabel() {}
    },
    workspacePanels: {
      enableResize() {},
      apply() {}
    },
    search: {
      updateUi() {},
      refreshResults() {},
      clearResults() {}
    },
    treeSwitcher: {
      render() {}
    },
    mainTreeLocator: {
      render() {},
      clear() {}
    },
    treeNavigation: {
      navigateToSubTree() {},
      navigateToParentTree() {}
    },
    canvas: {
      clearDragState() {}
    },
    modeRules: {
      isPlaybackMode() {
        return false;
      },
      isEditingEnabled() {
        return true;
      },
      can() {
        return true;
      }
    },
    i18n: {
      getAppCopy() {
        return {
          parseFailed: (message) => message,
          noPreview: "No preview",
          emptyFileOutline: "Empty",
          noBehaviorTreeOutline: "No behavior tree",
          selectedTreeNotFound: "Tree not found",
          noActiveDocument: "No active document",
          openExistingXml: "Open existing XML",
          openExistingOpening: "Opening XML..."
        };
      }
    },
    startupState: {
      buildNoDocumentState() {
        return createElementStub();
      },
      buildDocumentOpeningState() {
        const element = createElementStub();
        element.dataset.state = "opening-document";
        return element;
      }
    }
  };
  const context = {
    window: {
      BTreeToolRuntime: runtime
    },
    document: {
      createElement: createElementStub,
      querySelectorAll() {
        return [];
      }
    },
    requestAnimationFrame(callback) {
      callback();
    }
  };
  const scriptPath = path.resolve("media/runtime/edit/edit-controller.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return { runtime, renderSplitCalls, splitViewportStates };
}

function createPayload() {
  return {
    hasDocument: true,
    fileName: "/tmp/tree.xml",
    isDirty: false,
    settings: {},
    preview: {
      warnings: [],
      catalog: [],
      defaultTreeId: "MainTree",
      hasBlockingIssues: false,
      behaviorTrees: [
        {
          id: "MainTree",
          node: {
            nodePath: "0",
            kind: "Sequence",
            children: []
          }
        },
        {
          id: "SubTree",
          node: {
            nodePath: "0",
            kind: "AlwaysSuccess",
            children: []
          }
        }
      ]
    }
  };
}

test("split view refresh preserves pane viewports even without an active canvas state", () => {
  const { runtime, renderSplitCalls, splitViewportStates } = loadEditControllerRuntime();
  const stateWrites = [];

  runtime.editController.start({
    vscode: {
      postMessage() {},
      setState(state) {
        stateWrites.push(state);
      }
    },
    persistedState: {},
    initialMode: "edit",
    initialSettings: {}
  });

  runtime.app.render(createPayload());

  assert.equal(renderSplitCalls.length, 1);
  assert.equal(renderSplitCalls[0], splitViewportStates);
  assert.ok(stateWrites.length > 0);
});

test("document open transition restores the previous payload when the picker is cancelled", () => {
  const { runtime } = loadEditControllerRuntime();

  runtime.editController.start({
    vscode: {
      postMessage() {},
      setState() {}
    },
    persistedState: {},
    initialMode: "edit",
    initialSettings: {}
  });

  runtime.app.render(createPayload());
  runtime.app.renderDocumentOpeningState();

  assert.equal(runtime.state.openingXmlDocument, true);
  assert.equal(runtime.refs.fileLabel.textContent, "Opening XML...");
  assert.equal(runtime.refs.treeContent.children[0].dataset.state, "opening-document");

  runtime.boundWebviewHandlers.finishDocumentOpen();

  assert.equal(runtime.state.openingXmlDocument, false);
  assert.equal(runtime.refs.fileLabel.textContent, "tree.xml");
});
