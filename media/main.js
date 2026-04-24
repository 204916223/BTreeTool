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
    applyWorkspacePanels,
    applyUserSettings,
    isEditModeEnabled,
    canPerformAction,
    updateEditModeButton,
    updateSaveIndicator,
    openSearchPanel,
    closeSearchPanel,
    refreshSearchResults,
    navigateSearchResults,
    activateSearchResult
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
      openSearchPanel();
      return;
    }

    if (event.code === "Escape") {
      if (runtime.state.searchVisible) {
        closeSearchPanel();
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
    closeSearchPanel();
  });
  runtime.refs.treeSearchAdvancedToggle?.addEventListener("click", () => {
    runtime.state.searchAdvancedVisible = !runtime.state.searchAdvancedVisible;
    updateSearchUi();
  });
  runtime.refs.treeSearchDescriptionCheckbox?.addEventListener("change", () => {
    runtime.state.searchIncludeDescription = Boolean(runtime.refs.treeSearchDescriptionCheckbox.checked);
    refreshSearchResults({ renderTree: true, focusActive: false });
  });
  runtime.refs.treeSearchAttributesCheckbox?.addEventListener("change", () => {
    runtime.state.searchIncludeAttributes = Boolean(runtime.refs.treeSearchAttributesCheckbox.checked);
    refreshSearchResults({ renderTree: true, focusActive: false });
  });
  runtime.refs.treeSearchInput?.addEventListener("input", () => {
    runtime.state.searchQuery = runtime.refs.treeSearchInput.value || "";
    refreshSearchResults({ renderTree: true, focusActive: true });
  });
  runtime.refs.treeSearchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      navigateSearchResults(event.shiftKey ? -1 : 1);
    }
  });
  runtime.refs.treeSearchPrevButton?.addEventListener("click", () => {
    navigateSearchResults(-1);
  });
  runtime.refs.treeSearchNextButton?.addEventListener("click", () => {
    navigateSearchResults(1);
  });
  runtime.refs.treeSwitcher?.addEventListener("scroll", () => {
    runtime.state.treeSwitcherScrollLeft = runtime.refs.treeSwitcher.scrollLeft || 0;
  });

  vscode.postMessage({ type: "ready" });
  runtime.viewport.updateZoomLabel();
  applyWorkspacePanels();
  updateEditModeButton();
  updateSaveIndicator();
  updateSearchUi();

  function render(payload) {
    const appCopy = runtime.i18n.getAppCopy();
    const inspectorCopy = runtime.i18n.getInspectorCopy();
    const incomingDocumentPath = payload.hasDocument ? payload.fileName || "" : "";
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
      clearSearchResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.openBehaviorTreeFile));
      runtime.inspector.renderInspectorEmpty(inspectorCopy.emptyTitle, inspectorCopy.emptySummary);
      updateSaveIndicator();
      updateSearchUi();
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
      clearSearchResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.parseFailed(payload.parseError)));
      runtime.inspector.renderInspectorEmpty(inspectorCopy.unavailableTitle, inspectorCopy.parseErrorSummary);
      updateSaveIndicator();
      updateSearchUi();
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
      clearSearchResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.noPreview));
      runtime.inspector.renderInspectorEmpty(inspectorCopy.unavailableTitle, inspectorCopy.noPreviewSummary);
      updateSaveIndicator();
      updateSearchUi();
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
      clearSearchResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.emptyFileOutline));
      runtime.inspector.renderInspectorEmpty(inspectorCopy.unavailableTitle, inspectorCopy.emptyFileSummary);
      updateSaveIndicator();
      updateSearchUi();
      return;
    }

    if (result.behaviorTrees.length === 0) {
      runtime.state.currentCanvasState = null;
      runtime.state.currentZoom = 1;
      runtime.viewport.updateZoomLabel();
      runtime.refs.treeSwitcher.replaceChildren();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      clearSearchResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.noBehaviorTreeOutline));
      runtime.inspector.renderInspectorEmpty(inspectorCopy.unavailableTitle, inspectorCopy.noBehaviorTreeSummary);
      updateSaveIndicator();
      updateSearchUi();
      return;
    }

    runtime.state.selectedTreeId = pickTreeId(result);
    refreshSearchResults({ renderTree: false, focusActive: false });
    renderCurrentTree(result, { preserveViewport: hadViewport });
    updateSaveIndicator();
    updateSearchUi();
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
    updateSearchUi();
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
    applyWorkspacePanels();
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

    renderTreeSwitcher(result, { ensureActiveVisible: options.ensureActiveTreeVisible === true });

    const selectedTree = getSelectedTree(result);
    if (!selectedTree) {
      const appCopy = runtime.i18n.getAppCopy();
      const inspectorCopy = runtime.i18n.getInspectorCopy();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      clearSearchResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.selectedTreeNotFound));
      runtime.inspector.renderInspectorEmpty(inspectorCopy.unavailableTitle, inspectorCopy.missingTreeSummary);
      updateSearchUi();
      return;
    }

    runtime.state.selectedNodePath = pickNodePath(selectedTree);
    persistUiState();
    runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
    runtime.refs.treeContent.replaceChildren(runtime.canvas.renderTree(selectedTree, result, viewportState));
    runtime.canvas.clearDragState();
    runtime.inspector.renderInspector();
    runtime.playback?.syncPlaybackUi();
  }

  function renderTreeSwitcher(result, options = {}) {
    const ensureActiveVisible = options.ensureActiveVisible === true;
    const previousScrollLeft = runtime.refs.treeSwitcher?.scrollLeft || runtime.state.treeSwitcherScrollLeft || 0;
    const fragment = document.createDocumentFragment();
    let activeButton = null;
    result.behaviorTrees.forEach((tree) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = tree.id === runtime.state.selectedTreeId ? "tree-tab is-active" : "tree-tab";
      button.textContent = tree.id;
      if (tree.id === runtime.state.selectedTreeId) {
        activeButton = button;
      }
      button.addEventListener("click", () => {
        runtime.state.selectedTreeId = tree.id;
        runtime.state.selectedNodePath = "0";
        persistUiState();
        renderCurrentTree(result, { ensureActiveTreeVisible: true });
      });
      fragment.appendChild(button);
    });
    runtime.refs.treeSwitcher.replaceChildren(fragment);
    requestAnimationFrame(() => {
      if (!runtime.refs.treeSwitcher) {
        return;
      }

      if (ensureActiveVisible && activeButton) {
        activeButton.scrollIntoView({ block: "nearest", inline: "nearest" });
      } else {
        runtime.refs.treeSwitcher.scrollLeft = previousScrollLeft;
      }

      runtime.state.treeSwitcherScrollLeft = runtime.refs.treeSwitcher.scrollLeft || 0;
    });
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
      treeSwitcherScrollLeft: runtime.state.treeSwitcherScrollLeft
    });
  }

  function openSearchPanel() {
    runtime.state.searchVisible = true;
    updateSearchUi();
    requestAnimationFrame(() => {
      runtime.refs.treeSearchInput?.focus();
      runtime.refs.treeSearchInput?.select();
    });
  }

  function closeSearchPanel() {
    runtime.state.searchVisible = false;
    runtime.state.searchQuery = "";
    runtime.state.searchResults = [];
    runtime.state.searchMatchedNodePaths = new Set();
    runtime.state.activeSearchResultIndex = -1;
    if (runtime.refs.treeSearchInput) {
      runtime.refs.treeSearchInput.value = "";
    }
    updateSearchUi();
    if (runtime.state.currentPreview) {
      renderCurrentTree(runtime.state.currentPreview, { preserveViewport: true });
    }
  }

  function clearSearchResults() {
    runtime.state.searchResults = [];
    runtime.state.searchMatchedNodePaths = new Set();
    runtime.state.activeSearchResultIndex = -1;
  }

  function refreshSearchResults(options = {}) {
    const renderTree = options.renderTree === true;
    const focusActive = options.focusActive !== false;
    const query = String(runtime.state.searchQuery || "").trim();
    const result = runtime.state.currentPreview;
    const previousActiveMatchKey =
      runtime.state.activeSearchResultIndex >= 0
        ? runtime.state.searchResults[runtime.state.activeSearchResultIndex]?.matchKey
        : getSearchMatchKey(runtime.state.selectedTreeId, runtime.state.selectedNodePath);

    if (!query || !result) {
      clearSearchResults();
      updateSearchUi();
      if (renderTree && result) {
        renderCurrentTree(result, { preserveViewport: true });
      }
      return;
    }

    const searchResults = buildSearchResults(result, query);
    runtime.state.searchResults = searchResults;
    runtime.state.searchMatchedNodePaths = new Set(searchResults.map((item) => item.matchKey));
    runtime.state.activeSearchResultIndex =
      searchResults.length > 0
        ? Math.max(
            0,
            searchResults.findIndex((item) => item.matchKey === previousActiveMatchKey)
          )
        : -1;

    if (focusActive && runtime.state.activeSearchResultIndex >= 0) {
      const activeResult = runtime.state.searchResults[runtime.state.activeSearchResultIndex];
      runtime.state.selectedTreeId = activeResult.treeId;
      runtime.state.selectedNodePath = activeResult.nodePath;
    }

    updateSearchUi();
    if (renderTree && result) {
      renderCurrentTree(result, { preserveViewport: true });
      if (focusActive && runtime.state.activeSearchResultIndex >= 0) {
        requestAnimationFrame(() => {
          runtime.viewport.focusNodePath(runtime.state.searchResults[runtime.state.activeSearchResultIndex].nodePath);
        });
      }
    }
  }

  function navigateSearchResults(direction) {
    if (!runtime.state.searchResults.length) {
      return;
    }

    const count = runtime.state.searchResults.length;
    const currentIndex = runtime.state.activeSearchResultIndex >= 0 ? runtime.state.activeSearchResultIndex : 0;
    const nextIndex = (currentIndex + direction + count) % count;
    activateSearchResult(nextIndex);
  }

  function activateSearchResult(index) {
    if (!runtime.state.searchResults.length || !runtime.state.currentPreview) {
      return;
    }

    const nextIndex = Math.max(0, Math.min(index, runtime.state.searchResults.length - 1));
    const nextResult = runtime.state.searchResults[nextIndex];
    runtime.state.activeSearchResultIndex = nextIndex;
    runtime.state.selectedTreeId = nextResult.treeId;
    runtime.state.selectedNodePath = nextResult.nodePath;
    updateSearchUi();
    renderCurrentTree(runtime.state.currentPreview, { preserveViewport: true });
    requestAnimationFrame(() => {
      runtime.viewport.focusNodePath(nextResult.nodePath);
    });
  }

  function updateSearchUi() {
    const refs = runtime.refs;
    const searchCopy = runtime.i18n.getSearchCopy();
    refs.treeSearchPanel.hidden = !runtime.state.searchVisible;
    refs.treeSearchOptions.hidden = !runtime.state.searchAdvancedVisible;
    refs.treeSearchDescriptionCheckbox.checked = runtime.state.searchIncludeDescription;
    refs.treeSearchAttributesCheckbox.checked = runtime.state.searchIncludeAttributes;

    const total = runtime.state.searchResults.length;
    const active = total > 0 && runtime.state.activeSearchResultIndex >= 0 ? runtime.state.activeSearchResultIndex + 1 : 0;
    refs.treeSearchCount.textContent = `${active} / ${total}`;
    refs.treeSearchPrevButton.disabled = total === 0;
    refs.treeSearchNextButton.disabled = total === 0;

    refs.treeSearchResults.replaceChildren();
    if (!runtime.state.searchVisible) {
      return;
    }

    if (!String(runtime.state.searchQuery || "").trim()) {
      refs.treeSearchResults.replaceChildren(createSearchEmptyState(searchCopy.noQuery));
      return;
    }

    if (!runtime.state.searchResults.length) {
      refs.treeSearchResults.replaceChildren(createSearchEmptyState(searchCopy.noResults));
      return;
    }

    const fragment = document.createDocumentFragment();
    runtime.state.searchResults.forEach((result, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = index === runtime.state.activeSearchResultIndex ? "tree-search-result is-active" : "tree-search-result";

      const title = document.createElement("span");
      title.className = "tree-search-result-title";
      title.textContent = result.title;

      const meta = document.createElement("span");
      meta.className = "tree-search-result-meta";
      meta.textContent = [result.treeId, result.kind, result.matchScopes.join(" • "), result.preview]
        .filter(Boolean)
        .join(" • ");

      button.appendChild(title);
      button.appendChild(meta);
      button.addEventListener("click", () => {
        activateSearchResult(index);
      });
      fragment.appendChild(button);
    });
    refs.treeSearchResults.replaceChildren(fragment);
  }

  function createSearchEmptyState(message) {
    const item = document.createElement("div");
    item.className = "tree-search-empty";
    item.textContent = message;
    return item;
  }

  function buildSearchResults(preview, query) {
    const searchCopy = runtime.i18n.getSearchCopy();
    const tokens = String(query || "")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!tokens.length) {
      return [];
    }

    const results = [];
    (preview.behaviorTrees || []).forEach((tree) => {
      walkTree(tree.node, (node) => {
        const matchScopes = [];
        const defaultSearchText = buildDefaultSearchText(node);
        let previewText = "";

        if (matchesTokens(defaultSearchText, tokens)) {
          matchScopes.push(searchCopy.matchName);
          previewText = buildNamePreview(node);
        }
        if (runtime.state.searchIncludeDescription && matchesTokens(node.description, tokens)) {
          matchScopes.push(searchCopy.matchDescription);
          previewText ||= node.description;
        }
        if (runtime.state.searchIncludeAttributes && matchesTokens(buildAttributeSearchText(node), tokens)) {
          matchScopes.push(searchCopy.matchAttributes);
          previewText ||= buildAttributePreview(node, tokens);
        }

        if (matchScopes.length > 0) {
          results.push({
            treeId: tree.id,
            nodePath: node.nodePath,
            matchKey: getSearchMatchKey(tree.id, node.nodePath),
            title: node.title,
            kind: node.kind,
            matchScopes,
            preview: previewText
          });
        }
      });
    });

    return results;
  }

  function getSearchMatchKey(treeId, nodePath) {
    return `${treeId || ""}::${nodePath || ""}`;
  }

  function buildDefaultSearchText(node) {
    return [node.title, node.instanceName, node.kind, node.targetTreeId, node.summary].filter(Boolean).join(" ");
  }

  function buildNamePreview(node) {
    if (node.instanceName && node.instanceName !== node.title) {
      return node.instanceName;
    }
    if (node.targetTreeId && node.targetTreeId !== node.title) {
      return node.targetTreeId;
    }
    return node.summary || "";
  }

  function buildAttributeSearchText(node) {
    return buildAttributeEntries(node).join(" ");
  }

  function buildAttributePreview(node, tokens) {
    const matchingEntries = buildAttributeEntries(node).filter((entry) =>
      tokens.some((token) => String(entry || "").toLowerCase().includes(token))
    );
    return matchingEntries.slice(0, 2).join(" • ");
  }

  function buildAttributeEntries(node) {
    const entries = new Set();

    Object.entries(node.attributes || {}).forEach(([key, value]) => {
      entries.add(key);
      if (value) {
        entries.add(value);
        entries.add(`${key}: ${value}`);
      }
    });

    ["inputs", "outputs", "params"].forEach((groupKey) => {
      (node.ioGroups?.[groupKey] || []).forEach((entry) => {
        entries.add(entry.key);
        if (entry.value) {
          entries.add(entry.value);
          entries.add(`${entry.key}: ${entry.value}`);
        }
      });
    });

    if (node.code) {
      entries.add(node.code);
      entries.add(`code: ${node.code}`);
    }

    if (node.summary) {
      entries.add(node.summary);
    }

    return Array.from(entries).filter(Boolean);
  }

  function matchesTokens(text, tokens) {
    const haystack = String(text || "").toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  }

  function walkTree(node, visitor) {
    if (!node) {
      return;
    }
    visitor(node);
    (node.children || []).forEach((child) => walkTree(child, visitor));
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

    if (runtime.state.currentCanvasState) {
      requestAnimationFrame(() => {
        runtime.viewport.refreshViewport();
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
