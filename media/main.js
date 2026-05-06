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
    editModeEnabled: persistedState.editModeEnabled !== false,
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
    currentHasBlockingIssues: false,
    treeSwitcherScrollLeft: Number.isFinite(persistedState.treeSwitcherScrollLeft)
      ? persistedState.treeSwitcherScrollLeft
      : 0,
    searchVisible: false,
    searchQuery: "",
    searchAdvancedVisible: false,
    searchIncludeDescription: false,
    searchIncludeAttributes: false,
    searchResults: [],
    activeSearchResultIndex: -1,
    searchMatchedNodePaths: new Set(),
    currentCanvasState: null,
    currentPreview: null,
    currentCatalogGroups: [],
    currentSettings: {
      language: "en-US",
      themePreset: "midnight",
      showMainTreeLocator: true,
      showBehaviorTreeRoot: true,
      simplifyHiddenSections: [],
      presetNodes: []
    },
    copiedNodeTemplate: null,
    forceHideNodeDetails: false,
    playbackLog: null,
    playbackFrameIndex: 0,
    playbackError: "",
    prePlaybackPanels: null,
    settingsFilePath: "",
    currentZoom: 1,
    treeNavigationParents: persistedState.treeNavigationParents || {},
    suppressNodeClickUntil: 0,
    isSpacePressed: false,
    currentDragState: null,
    MIN_ZOOM: 0.45,
    MAX_ZOOM: 1.8
  };

  runtime.refs = {
    treeSwitcher: document.getElementById("tree-switcher"),
    editModeButton: document.getElementById("mode-edit"),
    playbackModeButton: document.getElementById("mode-playback"),
    saveDocumentButton: document.getElementById("save-document"),
    fileLabel: document.getElementById("file-label"),
    treeWorkspace: document.querySelector(".tree-workspace"),
    treeRoot: document.getElementById("tree-root"),
    treeContent: document.getElementById("tree-content"),
    mainTreeLocator: document.getElementById("main-tree-locator"),
    playbackTimeline: document.getElementById("playback-timeline"),
    playbackImportButton: document.getElementById("playback-import"),
    playbackPrevFrameButton: document.getElementById("playback-prev-frame"),
    playbackNextFrameButton: document.getElementById("playback-next-frame"),
    playbackRange: document.getElementById("playback-range"),
    playbackTime: document.getElementById("playback-time"),
    treeSearchPanel: document.getElementById("tree-search-panel"),
    treeSearchTitle: document.getElementById("tree-search-title"),
    treeSearchInput: document.getElementById("tree-search-input"),
    treeSearchCloseButton: document.getElementById("tree-search-close"),
    treeSearchAdvancedToggle: document.getElementById("tree-search-advanced-toggle"),
    treeSearchOptions: document.getElementById("tree-search-options"),
    treeSearchDescriptionCheckbox: document.getElementById("tree-search-description"),
    treeSearchDescriptionLabel: document.getElementById("tree-search-description-label"),
    treeSearchAttributesCheckbox: document.getElementById("tree-search-attributes"),
    treeSearchAttributesLabel: document.getElementById("tree-search-attributes-label"),
    treeSearchCount: document.getElementById("tree-search-count"),
    treeSearchPrevButton: document.getElementById("tree-search-prev"),
    treeSearchNextButton: document.getElementById("tree-search-next"),
    treeSearchResults: document.getElementById("tree-search-results"),
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
    openSettingsButton: document.getElementById("open-settings"),
    inspectorPanel: document.getElementById("inspector-panel"),
    inspectorEyebrow: document.getElementById("inspector-eyebrow"),
    inspectorTitle: document.getElementById("inspector-title"),
    inspectorKind: document.getElementById("inspector-kind"),
    inspectorSummary: document.getElementById("inspector-summary"),
    inspectorStatus: document.getElementById("inspector-status"),
    inspectorWarnings: document.getElementById("inspector-warnings"),
    attributeList: document.getElementById("attribute-list"),
    inspectorActions: document.querySelector(".inspector-actions"),
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
    applyWorkspacePanels: runtime.workspacePanels.apply,
    applyUserSettings,
    isEditModeEnabled,
    canPerformAction,
    navigateToSubTree: runtime.treeNavigation.navigateToSubTree,
    navigateToParentTree: runtime.treeNavigation.navigateToParentTree,
    updateEditModeButton,
    updateSaveIndicator,
    openSearchPanel: runtime.search.openPanel,
    closeSearchPanel: runtime.search.closePanel,
    refreshSearchResults: runtime.search.refreshResults,
    navigateSearchResults: runtime.search.navigateResults,
    activateSearchResult: runtime.search.activateResult
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

    if (message?.type === "playbackLogResult") {
      runtime.playback?.handlePlaybackLogResult(message.payload);
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

    if ((event.metaKey || event.ctrlKey) && String(event.key || "").toLowerCase() === "f") {
      if (document.body.classList.contains("has-blocking-overlay")) {
        return;
      }
      event.preventDefault();
      runtime.search.openPanel();
      return;
    }

    if (event.code === "Escape") {
      if (runtime.state.searchVisible) {
        runtime.search.closePanel();
        return;
      }
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
    runtime.overlays.hideCanvasContextMenu?.();
  });

  runtime.catalog.init();
  runtime.inspector.init();
  runtime.overlays.init();
  runtime.playback?.init();
  runtime.viewport.init();
  runtime.workspacePanels.enableResize(runtime.refs.catalogResizer, "catalog");
  runtime.workspacePanels.enableResize(runtime.refs.inspectorResizer, "inspector");

  runtime.refs.toggleCatalogButton?.addEventListener("click", () => {
    runtime.state.showCatalog = !runtime.state.showCatalog;
    persistUiState();
    runtime.workspacePanels.apply();
  });

  runtime.refs.toggleInspectorButton?.addEventListener("click", () => {
    runtime.state.showInspector = !runtime.state.showInspector;
    persistUiState();
    runtime.workspacePanels.apply();
  });

  runtime.refs.editModeButton?.addEventListener("click", () => {
    setPreviewMode("edit");
  });
  runtime.refs.playbackModeButton?.addEventListener("click", () => {
    setPreviewMode("playback");
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
  runtime.refs.treeSearchCloseButton?.addEventListener("click", () => {
    runtime.search.closePanel();
  });
  runtime.refs.treeSearchAdvancedToggle?.addEventListener("click", () => {
    runtime.state.searchAdvancedVisible = !runtime.state.searchAdvancedVisible;
    runtime.search.updateUi();
  });
  runtime.refs.treeSearchDescriptionCheckbox?.addEventListener("change", () => {
    runtime.state.searchIncludeDescription = Boolean(runtime.refs.treeSearchDescriptionCheckbox.checked);
    runtime.search.refreshResults({ renderTree: true, focusActive: false });
  });
  runtime.refs.treeSearchAttributesCheckbox?.addEventListener("change", () => {
    runtime.state.searchIncludeAttributes = Boolean(runtime.refs.treeSearchAttributesCheckbox.checked);
    runtime.search.refreshResults({ renderTree: true, focusActive: false });
  });
  runtime.refs.treeSearchInput?.addEventListener("input", () => {
    runtime.state.searchQuery = runtime.refs.treeSearchInput.value || "";
    runtime.search.refreshResults({ renderTree: true, focusActive: true });
  });
  runtime.refs.treeSearchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runtime.search.navigateResults(event.shiftKey ? -1 : 1);
    }
  });
  runtime.refs.treeSearchPrevButton?.addEventListener("click", () => {
    runtime.search.navigateResults(-1);
  });
  runtime.refs.treeSearchNextButton?.addEventListener("click", () => {
    runtime.search.navigateResults(1);
  });
  runtime.refs.treeSwitcher?.addEventListener("scroll", () => {
    runtime.state.treeSwitcherScrollLeft = runtime.refs.treeSwitcher.scrollLeft || 0;
  });

  vscode.postMessage({ type: "ready" });
  runtime.viewport.updateZoomLabel();
  runtime.workspacePanels.apply();
  updateEditModeButton();
  updateSaveIndicator();
  runtime.search.updateUi();

  function render(payload) {
    const appCopy = runtime.i18n.getAppCopy();
    const inspectorCopy = runtime.i18n.getInspectorCopy();
    const incomingDocumentPath = payload.hasDocument ? payload.fileName || "" : "";
    if (incomingDocumentPath !== runtime.state.currentDocumentPath) {
      runtime.state.treeNavigationParents = {};
    }
    runtime.state.currentDocumentPath = incomingDocumentPath;
    runtime.state.currentHasDocument = Boolean(payload.hasDocument);
    runtime.state.hasUnsavedXmlChanges = Boolean(payload.isDirty);
    runtime.state.currentHasBlockingIssues = false;
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
      runtime.state.currentHasBlockingIssues = false;
      runtime.viewport.updateZoomLabel();
      runtime.refs.treeSwitcher.replaceChildren();
      runtime.refs.catalogList.replaceChildren();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.search.clearResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.openBehaviorTreeFile));
      runtime.mainTreeLocator.clear();
      runtime.inspector.renderInspectorEmpty(inspectorCopy.emptyTitle, inspectorCopy.emptySummary);
      updateSaveIndicator();
      runtime.search.updateUi();
      return;
    }

    if (payload.parseError) {
      runtime.state.currentFileName = toBaseName(payload.fileName);
      runtime.state.currentPreview = null;
      runtime.state.currentHasBlockingIssues = true;
      runtime.refs.treeSwitcher.replaceChildren();
      renderWarnings([{ severity: "error", message: payload.parseError }]);
      runtime.refs.catalogList.replaceChildren();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.search.clearResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.parseFailed(payload.parseError)));
      runtime.mainTreeLocator.clear();
      runtime.inspector.renderInspectorEmpty(inspectorCopy.unavailableTitle, inspectorCopy.parseErrorSummary);
      updateSaveIndicator();
      runtime.search.updateUi();
      return;
    }

    const result = payload.preview;
    if (!result) {
      runtime.state.currentFileName = toBaseName(payload.fileName);
      runtime.state.currentPreview = null;
      runtime.state.currentCatalogGroups = [];
      runtime.state.currentHasBlockingIssues = false;
      runtime.refs.treeSwitcher.replaceChildren();
      runtime.refs.catalogList.replaceChildren();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.search.clearResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.noPreview));
      runtime.mainTreeLocator.clear();
      runtime.inspector.renderInspectorEmpty(inspectorCopy.unavailableTitle, inspectorCopy.noPreviewSummary);
      updateSaveIndicator();
      runtime.search.updateUi();
      return;
    }

    const hadViewport = Boolean(runtime.state.currentCanvasState);
    runtime.state.currentFileName = toBaseName(payload.fileName);
    runtime.state.currentPreview = result;
    runtime.state.currentCatalogGroups = result.catalog || [];
    runtime.state.currentHasBlockingIssues = Boolean(result.hasBlockingIssues);

    renderWarnings(result.warnings);
    runtime.catalog.renderCatalog(runtime.state.currentCatalogGroups);

    if (result.warnings.some((warning) => warning.code === "empty_document")) {
      runtime.state.currentCanvasState = null;
      runtime.state.currentZoom = 1;
      runtime.viewport.updateZoomLabel();
      runtime.refs.treeSwitcher.replaceChildren();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.search.clearResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.emptyFileOutline));
      runtime.mainTreeLocator.clear();
      runtime.inspector.renderInspectorEmpty(inspectorCopy.unavailableTitle, inspectorCopy.emptyFileSummary);
      updateSaveIndicator();
      runtime.search.updateUi();
      return;
    }

    if (result.behaviorTrees.length === 0) {
      runtime.state.currentCanvasState = null;
      runtime.state.currentZoom = 1;
      runtime.viewport.updateZoomLabel();
      runtime.refs.treeSwitcher.replaceChildren();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.search.clearResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.noBehaviorTreeOutline));
      runtime.mainTreeLocator.clear();
      runtime.inspector.renderInspectorEmpty(inspectorCopy.unavailableTitle, inspectorCopy.noBehaviorTreeSummary);
      updateSaveIndicator();
      runtime.search.updateUi();
      return;
    }

    runtime.state.selectedTreeId = pickTreeId(result);
    runtime.search.refreshResults({ renderTree: false, focusActive: false });
    renderCurrentTree(result, { preserveViewport: hadViewport });
    updateSaveIndicator();
    runtime.search.updateUi();
  }

  function applyUserSettings() {
    const chromeCopy = runtime.i18n.getChromeCopy();
    const catalogCopy = runtime.i18n.getCatalogCopy();
    const inspectorCopy = runtime.i18n.getInspectorCopy();
    const playbackCopy = runtime.i18n.getPlaybackCopy();
    const themePreset = runtime.state.currentSettings?.themePreset || "midnight";
    document.documentElement.dataset.btreeTheme = themePreset;
    document.documentElement.lang = runtime.state.currentSettings?.language || "en-US";
    runtime.refs.toggleCatalogButton.title = chromeCopy.toggleCatalogTitle;
    runtime.refs.toggleCatalogButton.setAttribute("aria-label", chromeCopy.toggleCatalogTitle);
    runtime.refs.toggleInspectorButton.title = chromeCopy.toggleInspectorTitle;
    runtime.refs.toggleInspectorButton.setAttribute("aria-label", chromeCopy.toggleInspectorTitle);
    runtime.refs.openSettingsButton.title = chromeCopy.openSettingsTitle;
    runtime.refs.openSettingsButton.setAttribute("aria-label", chromeCopy.openSettingsTitle);
    updateEditModeButton();
    const indicatorTitle = getSaveIndicatorTitle(chromeCopy);
    runtime.refs.saveDocumentButton.title = indicatorTitle;
    runtime.refs.saveDocumentButton.setAttribute("aria-label", indicatorTitle);
    runtime.refs.catalogEyebrow.textContent = catalogCopy.eyebrow;
    runtime.refs.catalogSummary.textContent = catalogCopy.summary;
    runtime.refs.catalogSearchInput.placeholder = catalogCopy.searchPlaceholder;
    runtime.refs.addNodeModelButton.title = catalogCopy.addModelTitle;
    runtime.refs.addNodeModelButton.setAttribute("aria-label", catalogCopy.addModelTitle);
    runtime.refs.editNodeDefinitionsButton.textContent = catalogCopy.editXml;
    runtime.refs.playbackImportButton.textContent = playbackCopy.importLog;
    runtime.refs.inspectorEyebrow.textContent = inspectorCopy.eyebrow;
    runtime.refs.applyAttributesButton.textContent = inspectorCopy.apply;
    const searchCopy = runtime.i18n.getSearchCopy();
    runtime.refs.treeSearchTitle.textContent = searchCopy.title;
    runtime.refs.treeSearchInput.placeholder = searchCopy.placeholder;
    runtime.refs.treeSearchCloseButton.textContent = searchCopy.close;
    runtime.refs.treeSearchAdvancedToggle.textContent = searchCopy.filters;
    runtime.refs.treeSearchDescriptionLabel.textContent = searchCopy.searchDescription;
    runtime.refs.treeSearchAttributesLabel.textContent = searchCopy.searchAttributes;
    runtime.refs.treeSearchPrevButton.title = searchCopy.prev;
    runtime.refs.treeSearchPrevButton.setAttribute("aria-label", searchCopy.prev);
    runtime.refs.treeSearchNextButton.title = searchCopy.next;
    runtime.refs.treeSearchNextButton.setAttribute("aria-label", searchCopy.next);
    updateSaveIndicator();
    runtime.search.updateUi();
  }

  function updateSaveIndicator() {
    const button = runtime.refs.saveDocumentButton;
    if (!button) {
      return;
    }

    const chromeCopy = runtime.i18n.getChromeCopy();
    const title = getSaveIndicatorTitle(chromeCopy);
    const indicatorState = getSaveIndicatorState();
    button.classList.toggle("is-healthy", indicatorState === "healthy");
    button.classList.toggle("is-dirty", indicatorState === "dirty");
    button.classList.toggle("has-errors", indicatorState === "error");
    button.disabled = !runtime.state.currentHasDocument || indicatorState === "error";
    button.hidden = !runtime.state.currentHasDocument;
    button.title = title;
    button.setAttribute("aria-label", title);
  }

  function updateEditModeButton() {
    const editButton = runtime.refs.editModeButton;
    const playbackButton = runtime.refs.playbackModeButton;
    if (!editButton || !playbackButton) {
      return;
    }

    const chromeCopy = runtime.i18n.getChromeCopy();
    const isEditingEnabled = runtime.modeRules.isEditingEnabled();
    const isPlaybackMode = runtime.modeRules.isPlaybackMode();
    editButton.classList.toggle("is-active", isEditingEnabled);
    playbackButton.classList.toggle("is-active", isPlaybackMode);
    document.body.classList.toggle("is-monitor-mode", isPlaybackMode);
    document.body.classList.toggle("is-playback-mode", isPlaybackMode);
    editButton.title = chromeCopy.editModeTitle;
    editButton.setAttribute("aria-label", chromeCopy.editModeTitle);
    playbackButton.title = chromeCopy.playbackModeTitle;
    playbackButton.setAttribute("aria-label", chromeCopy.playbackModeTitle);

    runtime.catalog.renderCatalog(runtime.state.currentCatalogGroups);
    runtime.inspector.renderInspector();
    runtime.overlays.hideAll?.();
    runtime.overlays.hideNodeContextMenu?.();
    runtime.overlays.hideCanvasContextMenu?.();
    runtime.canvas.clearDragState?.();
    runtime.playback?.syncPlaybackUi();
  }

  function setPreviewMode(mode) {
    const nextEditModeEnabled = mode !== "playback";
    if (runtime.state.editModeEnabled === nextEditModeEnabled) {
      return;
    }

    if (mode === "playback") {
      runtime.state.prePlaybackPanels = {
        showCatalog: runtime.state.showCatalog,
        showInspector: runtime.state.showInspector
      };
      runtime.state.showCatalog = true;
      runtime.state.showInspector = true;
    } else if (runtime.state.prePlaybackPanels) {
      runtime.state.showCatalog = runtime.state.prePlaybackPanels.showCatalog;
      runtime.state.showInspector = runtime.state.prePlaybackPanels.showInspector;
      runtime.state.prePlaybackPanels = null;
    }

    runtime.state.editModeEnabled = nextEditModeEnabled;
    persistUiState();
    runtime.workspacePanels.apply();
    updateEditModeButton();
  }

  function isEditModeEnabled() {
    return runtime.modeRules.isEditingEnabled();
  }

  function canPerformAction(action, context = {}) {
    return runtime.modeRules.can(action, context);
  }

  function getSaveIndicatorState() {
    if (!runtime.state.currentHasDocument) {
      return "idle";
    }

    if (runtime.state.currentHasBlockingIssues) {
      return "error";
    }

    if (runtime.state.hasUnsavedXmlChanges) {
      return "dirty";
    }

    return "healthy";
  }

  function getSaveIndicatorTitle(chromeCopy) {
    const indicatorState = getSaveIndicatorState();
    if (indicatorState === "error") {
      return chromeCopy.saveXmlErrorTitle;
    }
    if (indicatorState === "dirty") {
      return chromeCopy.saveXmlDirtyTitle;
    }
    return chromeCopy.saveXmlHealthyTitle;
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

    runtime.treeSwitcher.render(result, { ensureActiveVisible: options.ensureActiveTreeVisible === true });

    const selectedTree = getSelectedTree(result);
    if (!selectedTree) {
      const appCopy = runtime.i18n.getAppCopy();
      const inspectorCopy = runtime.i18n.getInspectorCopy();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.search.clearResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.selectedTreeNotFound));
      runtime.mainTreeLocator.clear();
      runtime.inspector.renderInspectorEmpty(inspectorCopy.unavailableTitle, inspectorCopy.missingTreeSummary);
      runtime.search.updateUi();
      return;
    }

    runtime.state.selectedNodePath = pickNodePath(selectedTree);
    persistUiState();
    runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
    runtime.refs.treeContent.replaceChildren(runtime.canvas.renderTree(selectedTree, result, viewportState));
    runtime.mainTreeLocator.render(result, selectedTree);
    runtime.canvas.clearDragState();
    runtime.inspector.renderInspector();
    runtime.playback?.syncPlaybackUi();
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
      editModeEnabled: runtime.state.editModeEnabled,
      collapsedCatalogGroups: runtime.state.collapsedCatalogGroups,
      collapsedNodePickerGroups: runtime.state.collapsedNodePickerGroups,
      catalogWidth: runtime.state.catalogWidth,
      inspectorWidth: runtime.state.inspectorWidth,
      treeSwitcherScrollLeft: runtime.state.treeSwitcherScrollLeft,
      treeNavigationParents: runtime.state.treeNavigationParents
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
