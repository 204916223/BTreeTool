(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const vscode = acquireVsCodeApi();
  const persistedState = vscode.getState() || {};

  runtime.vscode = vscode;
  runtime.state = {
    selectedTreeId: persistedState.selectedTreeId || null,
    selectedNodePath: persistedState.selectedNodePath || "0",
    showCatalog: persistedState.showCatalog || false,
    showInspector: persistedState.showInspector || false,
    simplifyTreeFlow: persistedState.simplifyTreeFlow || false,
    collapsedCatalogGroups: persistedState.collapsedCatalogGroups || {},
    collapsedNodePickerGroups: persistedState.collapsedNodePickerGroups || {},
    catalogWidth: (runtime.viewport?.clampNumber || ((v, _min, _max, fallback) => fallback))(
      persistedState.catalogWidth,
      220,
      460,
      280
    ),
    inspectorWidth: (runtime.viewport?.clampNumber || ((v, _min, _max, fallback) => fallback))(
      persistedState.inspectorWidth,
      260,
      520,
      320
    ),
    currentDocumentPath: "",
    currentHasDocument: false,
    currentFileName: "No active document",
    hasUnsavedXmlChanges: false,
    currentCanvasState: null,
    currentPreview: null,
    currentCatalogGroups: [],
    currentSettings: {
      language: "en-US",
      themePreset: "midnight",
      simplifyHiddenSections: ["code", "inputs", "outputs", "params", "subtreeJump"],
      presetNodes: []
    },
    settingsFilePath: "",
    currentZoom: 1,
    suppressNodeClickUntil: 0,
    isSpacePressed: false,
    currentDragState: null,
    MIN_ZOOM: 0.45,
    MAX_ZOOM: 1.8
  };

  runtime.refs = {
    treeSwitcher: document.getElementById("tree-switcher"),
    saveDocumentButton: document.getElementById("save-document"),
    fileLabel: document.getElementById("file-label"),
    treeWorkspace: document.querySelector(".tree-workspace"),
    treeRoot: document.getElementById("tree-root"),
    catalogPanel: document.getElementById("catalog-panel"),
    catalogEyebrow: document.getElementById("catalog-eyebrow"),
    catalogSummary: document.getElementById("catalog-summary"),
    catalogList: document.getElementById("catalog-list"),
    catalogSearchInput: document.getElementById("catalog-search"),
    addNodeModelButton: document.getElementById("add-node-model"),
    editNodeDefinitionsButton: document.getElementById("edit-node-definitions"),
    catalogResizer: document.getElementById("catalog-resizer"),
    toggleCatalogButton: document.getElementById("toggle-catalog"),
    toggleInspectorButton: document.getElementById("toggle-inspector"),
    toggleSimplifyButton: document.getElementById("toggle-simplify"),
    openSettingsButton: document.getElementById("open-settings"),
    zoomLevelLabel: document.getElementById("zoom-level"),
    inspectorPanel: document.getElementById("inspector-panel"),
    inspectorEyebrow: document.getElementById("inspector-eyebrow"),
    inspectorTitle: document.getElementById("inspector-title"),
    inspectorKind: document.getElementById("inspector-kind"),
    inspectorSummary: document.getElementById("inspector-summary"),
    inspectorStatus: document.getElementById("inspector-status"),
    inspectorWarnings: document.getElementById("inspector-warnings"),
    attributeList: document.getElementById("attribute-list"),
    applyAttributesButton: document.getElementById("apply-attributes"),
    inspectorResizer: document.getElementById("inspector-resizer")
  };

  runtime.app = {
    render,
    renderCurrentTree,
    renderWarnings,
    emptyState,
    toBaseName,
    getTreeMap,
    getSelectedTree,
    findNodeByPath,
    pickNodePath,
    persistUiState,
    applyWorkspacePanels,
    applyUserSettings,
    updateSaveIndicator
  };

  window.addEventListener("message", (event) => {
    const message = event.data;

    if (message?.type === "btreeDocument") {
      render(message.payload);
      return;
    }

    if (message?.type === "editResult") {
      const appCopy = runtime.i18n.getAppCopy();
      if (message.payload?.dirtyState === "dirty") {
        runtime.state.hasUnsavedXmlChanges = true;
      } else if (message.payload?.dirtyState === "saved") {
        runtime.state.hasUnsavedXmlChanges = false;
      }
      updateSaveIndicator();
      runtime.inspector.renderInspectorStatus(
        message.payload?.message || appCopy.nodeEditFinished,
        message.payload?.ok ? "success" : "error"
      );
      runtime.overlays.handleEditResult?.(message.payload);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) {
        return;
      }

      runtime.state.isSpacePressed = true;
      runtime.viewport.syncCanvasInteractionMode();
      event.preventDefault();
      return;
    }

    if (event.code === "Escape") {
      runtime.overlays.hideAll();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      runtime.state.isSpacePressed = false;
      runtime.viewport.syncCanvasInteractionMode();
      event.preventDefault();
    }
  });

  window.addEventListener("blur", () => {
    runtime.state.isSpacePressed = false;
    runtime.viewport.syncCanvasInteractionMode();
    runtime.overlays.hideNodeContextMenu();
  });

  window.addEventListener("click", () => {
    runtime.overlays.hideNodeContextMenu();
  });

  runtime.catalog.init();
  runtime.inspector.init();
  runtime.overlays.init();
  runtime.viewport.init();
  enablePanelResize(runtime.refs.catalogResizer, "catalog");
  enablePanelResize(runtime.refs.inspectorResizer, "inspector");

  runtime.refs.toggleCatalogButton?.addEventListener("click", () => {
    runtime.state.showCatalog = !runtime.state.showCatalog;
    persistUiState();
    applyWorkspacePanels();
  });

  runtime.refs.toggleInspectorButton?.addEventListener("click", () => {
    runtime.state.showInspector = !runtime.state.showInspector;
    persistUiState();
    applyWorkspacePanels();
  });

  runtime.refs.toggleSimplifyButton?.addEventListener("click", () => {
    runtime.state.simplifyTreeFlow = !runtime.state.simplifyTreeFlow;
    persistUiState();
    if (runtime.state.currentPreview) {
      renderCurrentTree(runtime.state.currentPreview);
    }
  });
  runtime.refs.openSettingsButton?.addEventListener("click", () => {
    runtime.overlays.showSettingsDialog();
  });
  runtime.refs.saveDocumentButton?.addEventListener("click", () => {
    if (!runtime.state.currentHasDocument) {
      return;
    }

    const chromeCopy = runtime.i18n.getChromeCopy();
    vscode.postMessage({ type: "saveCurrentDocument" });
  });

  vscode.postMessage({ type: "ready" });
  runtime.viewport.updateZoomLabel();
  applyWorkspacePanels();
  updateSaveIndicator();

  function render(payload) {
    const appCopy = runtime.i18n.getAppCopy();
    const inspectorCopy = runtime.i18n.getInspectorCopy();
    const incomingDocumentPath = payload.hasDocument ? payload.fileName || "" : "";
    runtime.state.currentDocumentPath = incomingDocumentPath;
    runtime.state.currentHasDocument = Boolean(payload.hasDocument);
    runtime.state.hasUnsavedXmlChanges = Boolean(payload.isDirty);
    runtime.overlays.hideAll();
    runtime.state.currentSettings = payload.settings || runtime.state.currentSettings;
    runtime.state.settingsFilePath = payload.settingsFilePath || "";
    applyUserSettings();

    if (!payload.hasDocument) {
      runtime.state.currentFileName = appCopy.noActiveDocument;
      runtime.state.currentPreview = null;
      runtime.state.currentCanvasState = null;
      runtime.state.currentCatalogGroups = [];
      runtime.state.currentZoom = 1;
      runtime.viewport.updateZoomLabel();
      runtime.refs.treeSwitcher.replaceChildren();
      runtime.refs.catalogList.replaceChildren();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.refs.treeRoot.replaceChildren(emptyState(appCopy.openBehaviorTreeFile));
      runtime.inspector.renderInspectorEmpty(inspectorCopy.emptyTitle, inspectorCopy.emptySummary);
      updateSaveIndicator();
      return;
    }

    if (payload.parseError) {
      runtime.state.currentFileName = toBaseName(payload.fileName);
      runtime.state.currentPreview = null;
      runtime.refs.treeSwitcher.replaceChildren();
      renderWarnings([{ severity: "error", message: payload.parseError }]);
      runtime.refs.catalogList.replaceChildren();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.refs.treeRoot.replaceChildren(emptyState(appCopy.parseFailed(payload.parseError)));
      runtime.inspector.renderInspectorEmpty(inspectorCopy.unavailableTitle, inspectorCopy.parseErrorSummary);
      updateSaveIndicator();
      return;
    }

    const result = payload.preview;
    if (!result) {
      runtime.state.currentFileName = toBaseName(payload.fileName);
      runtime.state.currentPreview = null;
      runtime.state.currentCatalogGroups = [];
      runtime.refs.treeSwitcher.replaceChildren();
      runtime.refs.catalogList.replaceChildren();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.refs.treeRoot.replaceChildren(emptyState(appCopy.noPreview));
      runtime.inspector.renderInspectorEmpty(inspectorCopy.unavailableTitle, inspectorCopy.noPreviewSummary);
      updateSaveIndicator();
      return;
    }

    const hadViewport = Boolean(runtime.state.currentCanvasState);
    runtime.state.currentFileName = toBaseName(payload.fileName);
    runtime.state.currentPreview = result;
    runtime.state.currentCatalogGroups = result.catalog || [];

    renderWarnings(result.warnings);
    runtime.catalog.renderCatalog(runtime.state.currentCatalogGroups);

    if (result.warnings.some((warning) => warning.code === "empty_document")) {
      runtime.state.currentCanvasState = null;
      runtime.state.currentZoom = 1;
      runtime.viewport.updateZoomLabel();
      runtime.refs.treeSwitcher.replaceChildren();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.refs.treeRoot.replaceChildren(emptyState(appCopy.emptyFileOutline));
      runtime.inspector.renderInspectorEmpty(inspectorCopy.unavailableTitle, inspectorCopy.emptyFileSummary);
      updateSaveIndicator();
      return;
    }

    if (result.behaviorTrees.length === 0) {
      runtime.state.currentCanvasState = null;
      runtime.state.currentZoom = 1;
      runtime.viewport.updateZoomLabel();
      runtime.refs.treeSwitcher.replaceChildren();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.refs.treeRoot.replaceChildren(emptyState(appCopy.noBehaviorTreeOutline));
      runtime.inspector.renderInspectorEmpty(inspectorCopy.unavailableTitle, inspectorCopy.noBehaviorTreeSummary);
      updateSaveIndicator();
      return;
    }

    runtime.state.selectedTreeId = pickTreeId(result);
    renderCurrentTree(result, { preserveViewport: hadViewport });
    updateSaveIndicator();
  }

  function applyUserSettings() {
    const chromeCopy = runtime.i18n.getChromeCopy();
    const catalogCopy = runtime.i18n.getCatalogCopy();
    const inspectorCopy = runtime.i18n.getInspectorCopy();
    const themePreset = runtime.state.currentSettings?.themePreset || "midnight";
    document.documentElement.dataset.btreeTheme = themePreset;
    document.documentElement.lang = runtime.state.currentSettings?.language || "en-US";
    runtime.refs.toggleCatalogButton.title = chromeCopy.toggleCatalogTitle;
    runtime.refs.toggleCatalogButton.setAttribute("aria-label", chromeCopy.toggleCatalogTitle);
    runtime.refs.toggleInspectorButton.title = chromeCopy.toggleInspectorTitle;
    runtime.refs.toggleInspectorButton.setAttribute("aria-label", chromeCopy.toggleInspectorTitle);
    runtime.refs.toggleSimplifyButton.title = chromeCopy.toggleSimplifyTitle;
    runtime.refs.toggleSimplifyButton.setAttribute("aria-label", chromeCopy.toggleSimplifyTitle);
    runtime.refs.openSettingsButton.title = chromeCopy.openSettingsTitle;
    runtime.refs.openSettingsButton.setAttribute("aria-label", chromeCopy.openSettingsTitle);
    runtime.refs.saveDocumentButton.title = runtime.state.hasUnsavedXmlChanges
      ? chromeCopy.saveXmlDirtyTitle
      : chromeCopy.saveXmlTitle;
    runtime.refs.saveDocumentButton.setAttribute(
      "aria-label",
      runtime.state.hasUnsavedXmlChanges ? chromeCopy.saveXmlDirtyTitle : chromeCopy.saveXmlTitle
    );
    runtime.refs.catalogEyebrow.textContent = catalogCopy.eyebrow;
    runtime.refs.catalogSummary.textContent = catalogCopy.summary;
    runtime.refs.catalogSearchInput.placeholder = catalogCopy.searchPlaceholder;
    runtime.refs.addNodeModelButton.title = catalogCopy.addModelTitle;
    runtime.refs.addNodeModelButton.setAttribute("aria-label", catalogCopy.addModelTitle);
    runtime.refs.editNodeDefinitionsButton.textContent = catalogCopy.editXml;
    runtime.refs.inspectorEyebrow.textContent = inspectorCopy.eyebrow;
    runtime.refs.applyAttributesButton.textContent = inspectorCopy.apply;
    updateSaveIndicator();
  }

  function updateSaveIndicator() {
    const button = runtime.refs.saveDocumentButton;
    if (!button) {
      return;
    }

    const chromeCopy = runtime.i18n.getChromeCopy();
    const hasUnsavedXmlChanges = runtime.state.currentHasDocument && runtime.state.hasUnsavedXmlChanges;
    const title = hasUnsavedXmlChanges ? chromeCopy.saveXmlDirtyTitle : chromeCopy.saveXmlTitle;
    button.classList.toggle("is-dirty", runtime.state.hasUnsavedXmlChanges);
    button.disabled = !runtime.state.currentHasDocument;
    button.hidden = !runtime.state.currentHasDocument;
    button.title = title;
    button.setAttribute("aria-label", title);
  }

  function renderCurrentTree(result, options = {}) {
    const preserveViewport = Boolean(options.preserveViewport && runtime.state.currentCanvasState);
    const viewportState = preserveViewport
      ? {
          zoom: runtime.state.currentZoom,
          panX: runtime.state.currentCanvasState.panX,
          panY: runtime.state.currentCanvasState.panY
        }
      : null;

    renderTreeSwitcher(result);

    const selectedTree = getSelectedTree(result);
    if (!selectedTree) {
      const appCopy = runtime.i18n.getAppCopy();
      const inspectorCopy = runtime.i18n.getInspectorCopy();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.refs.treeRoot.replaceChildren(emptyState(appCopy.selectedTreeNotFound));
      runtime.inspector.renderInspectorEmpty(inspectorCopy.unavailableTitle, inspectorCopy.missingTreeSummary);
      return;
    }

    runtime.state.selectedNodePath = pickNodePath(selectedTree);
    persistUiState();
    runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
    runtime.refs.treeRoot.replaceChildren(runtime.canvas.renderTree(selectedTree, result, viewportState));
    runtime.canvas.clearDragState();
    runtime.inspector.renderInspector();
  }

  function renderTreeSwitcher(result) {
    const fragment = document.createDocumentFragment();
    result.behaviorTrees.forEach((tree) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = tree.id === runtime.state.selectedTreeId ? "tree-tab is-active" : "tree-tab";
      button.textContent = tree.id;
      button.addEventListener("click", () => {
        runtime.state.selectedTreeId = tree.id;
        runtime.state.selectedNodePath = "0";
        persistUiState();
        renderCurrentTree(result);
      });
      fragment.appendChild(button);
    });
    runtime.refs.treeSwitcher.replaceChildren(fragment);
  }

  function toBaseName(fileName) {
    const noActiveDocument = runtime.i18n.getAppCopy().noActiveDocument;
    if (!fileName || fileName === noActiveDocument) {
      return noActiveDocument;
    }
    const normalized = fileName.replace(/\\/g, "/");
    const segments = normalized.split("/");
    return segments[segments.length - 1] || fileName;
  }

  function pickTreeId(result) {
    if (runtime.state.selectedTreeId && getTreeMap(result).has(runtime.state.selectedTreeId)) {
      return runtime.state.selectedTreeId;
    }
    return result.defaultTreeId;
  }

  function persistUiState() {
    vscode.setState({
      selectedTreeId: runtime.state.selectedTreeId,
      selectedNodePath: runtime.state.selectedNodePath,
      showCatalog: runtime.state.showCatalog,
      showInspector: runtime.state.showInspector,
      simplifyTreeFlow: runtime.state.simplifyTreeFlow,
      collapsedCatalogGroups: runtime.state.collapsedCatalogGroups,
      collapsedNodePickerGroups: runtime.state.collapsedNodePickerGroups,
      catalogWidth: runtime.state.catalogWidth,
      inspectorWidth: runtime.state.inspectorWidth
    });
  }

  function applyWorkspacePanels() {
    runtime.refs.catalogPanel.hidden = !runtime.state.showCatalog;
    runtime.refs.catalogResizer.hidden = !runtime.state.showCatalog;
    runtime.refs.inspectorPanel.hidden = !runtime.state.showInspector;
    runtime.refs.inspectorResizer.hidden = !runtime.state.showInspector;

    runtime.refs.treeWorkspace.style.setProperty("--catalog-width", `${runtime.state.catalogWidth}px`);
    runtime.refs.treeWorkspace.style.setProperty("--inspector-width", `${runtime.state.inspectorWidth}px`);
    runtime.refs.treeWorkspace.classList.toggle("show-catalog", runtime.state.showCatalog);
    runtime.refs.treeWorkspace.classList.toggle("show-inspector", runtime.state.showInspector);

    runtime.refs.toggleCatalogButton.classList.toggle("is-active", runtime.state.showCatalog);
    runtime.refs.toggleInspectorButton.classList.toggle("is-active", runtime.state.showInspector);
    runtime.refs.toggleSimplifyButton.classList.toggle("is-active", runtime.state.simplifyTreeFlow);

    if (runtime.state.currentCanvasState) {
      requestAnimationFrame(() => {
        runtime.viewport.fitCanvas();
      });
    }
  }

  function enablePanelResize(handle, side) {
    if (!handle || !runtime.refs.treeWorkspace) {
      return;
    }

    handle.addEventListener("pointerdown", (event) => {
      if ((side === "catalog" && !runtime.state.showCatalog) || (side === "inspector" && !runtime.state.showInspector)) {
        return;
      }

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startCatalogWidth = runtime.state.catalogWidth;
      const startInspectorWidth = runtime.state.inspectorWidth;

      handle.setPointerCapture(pointerId);
      document.body.classList.add("is-resizing-panels");

      const onPointerMove = (moveEvent) => {
        const deltaX = moveEvent.clientX - startX;
        if (side === "catalog") {
          runtime.state.catalogWidth = runtime.viewport.clampNumber(startCatalogWidth + deltaX, 220, 460, startCatalogWidth);
        } else {
          runtime.state.inspectorWidth = runtime.viewport.clampNumber(
            startInspectorWidth - deltaX,
            260,
            520,
            startInspectorWidth
          );
        }
        persistUiState();
        applyWorkspacePanels();
      };

      const finishResize = () => {
        document.body.classList.remove("is-resizing-panels");
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerUp);
        handle.removeEventListener("pointercancel", onPointerCancel);
        try {
          handle.releasePointerCapture(pointerId);
        } catch (_error) {
          // Ignore stale pointer capture state.
        }
      };

      const onPointerUp = () => finishResize();
      const onPointerCancel = () => finishResize();

      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
      handle.addEventListener("pointercancel", onPointerCancel);
    });
  }

  function getSelectedTree(result) {
    return getTreeMap(result).get(runtime.state.selectedTreeId) || null;
  }

  function pickNodePath(tree) {
    if (!tree?.node) {
      return "0";
    }
    if (runtime.state.selectedNodePath && findNodeByPath(tree.node, runtime.state.selectedNodePath)) {
      return runtime.state.selectedNodePath;
    }
    return "0";
  }

  function findNodeByPath(rootNode, nodePath) {
    const parts = String(nodePath || "").split(".");
    if (parts.length === 0 || parts[0] !== "0") {
      return null;
    }

    let currentNode = rootNode;
    for (const part of parts.slice(1)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= currentNode.children.length) {
        return null;
      }
      currentNode = currentNode.children[index];
    }

    return currentNode;
  }

  function renderWarnings(warnings) {
    // Warnings are surfaced through VS Code's Problems panel instead of duplicating
    // them inside the webview footer.
    void warnings;
  }

  function getTreeMap(result) {
    return new Map(result.behaviorTrees.map((tree) => [tree.id, tree]));
  }

  function emptyState(message) {
    const paragraph = document.createElement("p");
    paragraph.className = "empty-state";
    paragraph.textContent = message;
    return paragraph;
  }
})();
