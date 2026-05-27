(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const vscode = acquireVsCodeApi();
  const persistedState = vscode.getState() || {};
  const initialMode = window.BTreeToolInitialMode === "playback" ? "playback" : "edit";
  runtime.vscode = vscode;
  runtime.state = {
    selectedTreeId: persistedState.selectedTreeId || null,
    selectedNodePath: persistedState.selectedNodePath || "0",
    showCatalog: persistedState.showCatalog || false,
    editModeEnabled: initialMode === "playback" ? false : persistedState.editModeEnabled !== false,
    collapsedCatalogGroups: persistedState.collapsedCatalogGroups || {},
    collapsedNodePickerGroups: persistedState.collapsedNodePickerGroups || {},
    catalogWidth: (runtime.viewport?.clampNumber || ((v, _min, _max, fallback) => fallback))(
      persistedState.catalogWidth,
      220,
      460,
      280
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
    canvasStatesByPane: {},
    latestPayload: null,
    currentPreview: null,
    currentCatalogGroups: [],
    splitViewEnabled: persistedState.splitViewEnabled === true,
    activeTreePane: persistedState.activeTreePane === "right" ? "right" : "left",
    splitPaneTreeIds: {
      left: persistedState.splitPaneTreeIds?.left || persistedState.selectedTreeId || null,
      right: persistedState.splitPaneTreeIds?.right || null
    },
    splitPaneNodePaths: persistedState.splitPaneNodePaths || {},
    playbackLog: null,
    playbackFrameIndex: Number.isInteger(persistedState.playbackFrameIndex) ? persistedState.playbackFrameIndex : 0,
    playbackLeftVisible: persistedState.playbackLeftVisible !== false,
    playbackRightVisible: persistedState.playbackRightVisible !== false,
    playbackLeftWidth: (runtime.viewport?.clampNumber || ((v, _min, _max, fallback) => fallback))(
      persistedState.playbackLeftWidth,
      220,
      520,
      300
    ),
    playbackRightWidth: (runtime.viewport?.clampNumber || ((v, _min, _max, fallback) => fallback))(
      persistedState.playbackRightWidth,
      220,
      560,
      320
    ),
    playbackStatusByUid: {},
    playbackLatestTransitionByUid: {},
    playbackLastTerminalStatusByUid: {},
    playbackCurrentFrameTransitionKeys: new Set(),
    playbackUidByTreePath: {},
    playbackNodeLocationsByUid: {},
    playbackChildrenByUid: {},
    playbackDepthByUid: {},
    playbackTransitionFilter: persistedState.playbackTransitionFilter || "",
    playbackTransitionScrollTop: Number.isFinite(persistedState.playbackTransitionScrollTop)
      ? persistedState.playbackTransitionScrollTop
      : 0,
    playbackBlackboardFilter: persistedState.playbackBlackboardFilter || "",
    playbackExpandedBlackboardKeys: new Set(persistedState.playbackExpandedBlackboardKeys || []),
    playbackBlackboardScrollTop: Number.isFinite(persistedState.playbackBlackboardScrollTop)
      ? persistedState.playbackBlackboardScrollTop
      : 0,
    playbackIsPlaying: false,
    playbackPlaybackSpeed: Number.isFinite(persistedState.playbackPlaybackSpeed)
      ? persistedState.playbackPlaybackSpeed
      : 1,
    currentSettings: {
      language: "en-US",
      themePreset: "midnight",
      showMainTreeLocator: true,
      showBehaviorTreeRoot: true,
      requireNodeDeleteConfirmation: false,
      copyNodeWithDescendants: true,
      playbackAutoNavigateToTree: true,
      nodeAttributeLayout: "inline",
      simplifyHiddenSections: [],
      presetNodes: []
    },
    copiedNodeTemplate: null,
    forceHideNodeDetails: false,
    settingsFilePath: "",
    currentZoom: 1,
    treeNavigationParents: persistedState.treeNavigationParents || {},
    suppressNodeClickUntil: 0,
    isSpacePressed: false,
    currentDragState: null,
    MIN_ZOOM: 0.45,
    MAX_ZOOM: 1.8
  };

  let playbackFrameUpdateHandle = 0;
  let pendingPlaybackFrameUpdate = null;
  let playbackAutoAdvanceHandle = 0;
  let shortcutChord = null;
  let shortcutChordResetHandle = 0;
  const PLAYBACK_TRANSITION_ROW_HEIGHT = 23;
  const PLAYBACK_TRANSITION_OVERSCAN_ROWS = 12;
  const PLAYBACK_SPEED_OPTIONS = [
    { value: 0.1, label: "0.1x" },
    { value: 0.5, label: "0.5x" },
    { value: 1, label: "1.0x" },
    { value: 1.5, label: "1.5x" },
    { value: 2, label: "2.0x" },
    { value: 3, label: "3.0x" }
  ];
  let playbackDomCache = null;

  runtime.refs = {
    treeSwitcher: document.getElementById("tree-switcher"),
    editModeButton: document.getElementById("mode-edit"),
    playbackModeButton: document.getElementById("mode-playback"),
    saveDocumentButton: document.getElementById("save-document"),
    fileLabel: document.getElementById("file-label"),
    treeWorkspace: document.querySelector(".tree-workspace"),
    treeRoot: document.getElementById("tree-root"),
    treeContent: document.getElementById("tree-content"),
    addBehaviorTreeButton: document.getElementById("add-behavior-tree"),
    splitViewButton: document.getElementById("toggle-split-view"),
    mainTreeLocator: document.getElementById("main-tree-locator"),
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
    openSettingsButton: document.getElementById("open-settings")
  };

  runtime.app = {
    render,
    renderCurrentTree,
    renderPlaybackLog,
    renderWarnings,
    emptyState,
    toBaseName,
    getTreeMap,
    getSelectedTree,
    findNodeByPath,
    pickNodePath,
    selectTreeInActivePane,
    activateTreePane,
    activateTreePaneByTreeId,
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
      if (message.payload?.dirtyState === "dirty") {
        runtime.state.hasUnsavedXmlChanges = true;
      } else if (message.payload?.dirtyState === "saved") {
        runtime.state.hasUnsavedXmlChanges = false;
      }
      updateSaveIndicator();
      runtime.overlays.handleEditResult?.(message.payload);
    }

    if (message?.type === "shortcutAction") {
      if (message.payload?.action === "undo") {
        vscode.postMessage({ type: "undoCurrentDocument" });
        return;
      }
      runtime.overlays.executeNodeShortcutAction?.(message.payload?.action);
      return;
    }

    if (message?.type === "playbackLog") {
      pausePlayback();
      runtime.state.playbackLog = message.payload || null;
      runtime.state.playbackFrameIndex = 0;
      runtime.state.editModeEnabled = false;
      runtime.state.playbackIsPlaying = false;
      runtime.state.selectedTreeId = message.payload?.preview ? pickTreeId(message.payload.preview) : null;
      runtime.state.selectedNodePath = "0";
      persistUiState();
      runtime.workspacePanels.apply();
      updateEditModeButton();
      renderPlaybackState();
      return;
    }

    if (message?.type === "playbackLogError") {
      pausePlayback();
      runtime.state.playbackLog = null;
      runtime.refs.treeContent.replaceChildren(emptyState(message.payload?.message || "Failed to load playback log."));
    }

  });

  window.addEventListener("keydown", (event) => {
    if (handleNodeShortcutChord(event)) {
      return;
    }

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

  function handleNodeShortcutChord(event) {
    if (!isNodeShortcutEvent(event)) {
      resetNodeShortcutChord();
      return false;
    }

    const key = String(event.key || "").toLowerCase();
    if (shortcutChord === "c" && key === "c") {
      event.preventDefault();
      resetNodeShortcutChord();
      runtime.overlays.executeNodeShortcutAction?.("copy");
      return true;
    }
    if (shortcutChord === "c" && key === "v") {
      event.preventDefault();
      resetNodeShortcutChord();
      runtime.overlays.executeNodeShortcutAction?.("pasteSmart");
      return true;
    }
    if (shortcutChord === "z" && key === "z") {
      event.preventDefault();
      resetNodeShortcutChord();
      vscode.postMessage({ type: "undoCurrentDocument" });
      return true;
    }
    if (key === "c" || key === "z") {
      event.preventDefault();
      shortcutChord = key;
      scheduleNodeShortcutChordReset();
      return true;
    }

    resetNodeShortcutChord();
    return false;
  }

  function isNodeShortcutEvent(event) {
    if (event.defaultPrevented || event.isComposing || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
      return false;
    }
    if (document.body.classList.contains("has-blocking-overlay")) {
      return false;
    }
    if (!runtime.modeRules?.isEditingEnabled?.()) {
      return false;
    }
    if (event.target instanceof HTMLElement) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) {
        return false;
      }
    }
    return ["c", "v", "z"].includes(String(event.key || "").toLowerCase());
  }

  function scheduleNodeShortcutChordReset() {
    if (shortcutChordResetHandle) {
      clearTimeout(shortcutChordResetHandle);
    }
    shortcutChordResetHandle = window.setTimeout(resetNodeShortcutChord, 900);
  }

  function resetNodeShortcutChord() {
    shortcutChord = null;
    if (shortcutChordResetHandle) {
      clearTimeout(shortcutChordResetHandle);
      shortcutChordResetHandle = 0;
    }
  }

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
  runtime.overlays.init();
  runtime.viewport.init();
  runtime.workspacePanels.enableResize(runtime.refs.catalogResizer, "catalog");

  runtime.refs.toggleCatalogButton?.addEventListener("click", () => {
    runtime.state.showCatalog = !runtime.state.showCatalog;
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
  runtime.refs.splitViewButton?.addEventListener("click", () => {
    runtime.state.splitViewEnabled = !runtime.state.splitViewEnabled;
    if (runtime.state.currentPreview) {
      ensureSplitPaneState(runtime.state.currentPreview);
      runtime.app.renderCurrentTree(runtime.state.currentPreview, { preserveViewport: true });
    } else {
      updateSplitViewButton();
    }
    persistUiState();
  });
  runtime.refs.addBehaviorTreeButton?.addEventListener("click", () => {
    if (!runtime.app.canPerformAction("createBehaviorTree", { hasPreview: Boolean(runtime.state.currentPreview) })) {
      return;
    }
    runtime.overlays.showBehaviorTreeDialog();
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
    runtime.state.latestPayload = payload;
    const hadDocumentBefore = runtime.state.currentHasDocument;
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

    if (runtime.modeRules.isPlaybackMode()) {
      renderPlaybackState();
      return;
    }

    if (runtime.state.currentHasDocument && !hadDocumentBefore) {
      runtime.state.showCatalog = true;
      persistUiState();
      runtime.workspacePanels.apply();
    }

    if (!payload.hasDocument) {
      renderNoDocumentState();
      return;
    }

    if (payload.parseError) {
      runtime.state.currentFileName = toBaseName(payload.fileName);
      runtime.state.currentPreview = null;
      runtime.state.currentCanvasState = null;
      runtime.state.canvasStatesByPane = {};
      runtime.state.currentHasBlockingIssues = true;
      runtime.refs.treeSwitcher.replaceChildren();
      renderWarnings([{ severity: "error", message: payload.parseError }]);
      runtime.refs.catalogList.replaceChildren();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.search.clearResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.parseFailed(payload.parseError)));
      runtime.mainTreeLocator.clear();
      updateSaveIndicator();
      updateSplitViewButton();
      runtime.search.updateUi();
      return;
    }

    const result = payload.preview;
    if (!result) {
      runtime.state.currentFileName = toBaseName(payload.fileName);
      runtime.state.currentPreview = null;
      runtime.state.currentCanvasState = null;
      runtime.state.canvasStatesByPane = {};
      runtime.state.currentCatalogGroups = [];
      runtime.state.currentHasBlockingIssues = false;
      runtime.refs.treeSwitcher.replaceChildren();
      runtime.refs.catalogList.replaceChildren();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.search.clearResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.noPreview));
      runtime.mainTreeLocator.clear();
      updateSaveIndicator();
      updateSplitViewButton();
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
      runtime.state.canvasStatesByPane = {};
      runtime.state.currentZoom = 1;
      runtime.viewport.updateZoomLabel();
      runtime.refs.treeSwitcher.replaceChildren();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.search.clearResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.emptyFileOutline));
      runtime.mainTreeLocator.clear();
      updateSaveIndicator();
      updateSplitViewButton();
      runtime.search.updateUi();
      return;
    }

    if (result.behaviorTrees.length === 0) {
      runtime.state.currentCanvasState = null;
      runtime.state.canvasStatesByPane = {};
      runtime.state.currentZoom = 1;
      runtime.viewport.updateZoomLabel();
      runtime.refs.treeSwitcher.replaceChildren();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.search.clearResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.noBehaviorTreeOutline));
      runtime.mainTreeLocator.clear();
      updateSaveIndicator();
      updateSplitViewButton();
      runtime.search.updateUi();
      return;
    }

    runtime.state.selectedTreeId = pickTreeId(result);
    if (runtime.state.splitViewEnabled) {
      ensureSplitPaneState(result);
    }
    runtime.search.refreshResults({ renderTree: false, focusActive: false });
    renderCurrentTree(result, { preserveViewport: hadViewport });
    updateSaveIndicator();
    runtime.search.updateUi();
  }

  function applyUserSettings() {
    const chromeCopy = runtime.i18n.getChromeCopy();
    const catalogCopy = runtime.i18n.getCatalogCopy();
    const themePreset = runtime.state.currentSettings?.themePreset || "midnight";
    document.documentElement.dataset.btreeTheme = themePreset;
    document.documentElement.lang = runtime.state.currentSettings?.language || "en-US";
    document.documentElement.dataset.nodeAttributeLayout =
      runtime.state.currentSettings?.nodeAttributeLayout === "stacked" ? "stacked" : "inline";
    runtime.refs.toggleCatalogButton.title = chromeCopy.toggleCatalogTitle;
    runtime.refs.toggleCatalogButton.setAttribute("aria-label", chromeCopy.toggleCatalogTitle);
    runtime.refs.openSettingsButton.title = chromeCopy.openSettingsTitle;
    runtime.refs.openSettingsButton.setAttribute("aria-label", chromeCopy.openSettingsTitle);
    runtime.refs.addBehaviorTreeButton.title = chromeCopy.addBehaviorTreeTitle;
    runtime.refs.addBehaviorTreeButton.setAttribute("aria-label", chromeCopy.addBehaviorTreeTitle);
    runtime.refs.splitViewButton.title = chromeCopy.splitViewTitle;
    runtime.refs.splitViewButton.setAttribute("aria-label", chromeCopy.splitViewTitle);
    updateBehaviorTreeCreateButton();
    updateSplitViewButton();
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

  function updateBehaviorTreeCreateButton() {
    const button = runtime.refs.addBehaviorTreeButton;
    if (!button) {
      return;
    }

    button.hidden = !runtime.state.currentHasDocument || runtime.modeRules.isPlaybackMode();
    button.disabled = !runtime.app.canPerformAction("createBehaviorTree", {
      hasPreview: Boolean(runtime.state.currentPreview)
    });
  }

  function updateSplitViewButton() {
    const button = runtime.refs.splitViewButton;
    if (!button) {
      return;
    }

    button.hidden = !runtime.state.currentHasDocument || runtime.modeRules.isPlaybackMode();
    button.disabled = !runtime.state.currentPreview || runtime.state.currentHasBlockingIssues;
    button.classList.toggle("is-active", runtime.state.splitViewEnabled === true);
  }

  function updateSaveIndicator() {
    updateBehaviorTreeCreateButton();
    updateSplitViewButton();
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
    button.disabled = !runtime.state.currentHasDocument || runtime.modeRules.isPlaybackMode() || indicatorState === "error";
    button.hidden = !runtime.state.currentHasDocument || runtime.modeRules.isPlaybackMode();
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
    document.body.classList.toggle("is-playback-mode", isPlaybackMode);
    editButton.title = chromeCopy.editModeTitle;
    editButton.setAttribute("aria-label", chromeCopy.editModeTitle);
    playbackButton.title = chromeCopy.playbackModeTitle;
    playbackButton.setAttribute("aria-label", chromeCopy.playbackModeTitle);

    runtime.overlays.hideAll?.();
    runtime.overlays.hideNodeContextMenu?.();
    runtime.overlays.hideCanvasContextMenu?.();
    runtime.canvas.clearDragState?.();

    updateBehaviorTreeCreateButton();
  }

  function setPreviewMode(mode) {
    const nextEditModeEnabled = mode !== "playback";
    if (runtime.state.editModeEnabled === nextEditModeEnabled) {
      return;
    }

    runtime.state.editModeEnabled = nextEditModeEnabled;
    if (nextEditModeEnabled) {
      pausePlayback();
    }
    persistUiState();
    runtime.workspacePanels.apply();
    updateEditModeButton();
    if (runtime.modeRules.isPlaybackMode()) {
      renderPlaybackState();
      return;
    }
    if (runtime.state.latestPayload) {
      render(runtime.state.latestPayload);
      return;
    }
    renderNoDocumentState();
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

  function renderNoDocumentState() {
    const appCopy = runtime.i18n.getAppCopy();

    runtime.state.currentFileName = appCopy.noActiveDocument;
    runtime.state.currentPreview = null;
    runtime.state.currentCanvasState = null;
    runtime.state.canvasStatesByPane = {};
    runtime.state.currentCatalogGroups = [];
    runtime.state.currentZoom = 1;
    runtime.state.currentHasBlockingIssues = false;
    runtime.viewport.updateZoomLabel();
    runtime.workspacePanels.apply();
    updateSplitViewButton();
    runtime.refs.treeSwitcher.replaceChildren();
    runtime.refs.catalogList.replaceChildren();
    runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
    runtime.search.clearResults();
    runtime.refs.treeContent.replaceChildren(buildStartupState());
    runtime.mainTreeLocator.clear();
    updateSaveIndicator();
    runtime.search.updateUi();

    function buildStartupState() {
      const shell = document.createElement("div");
      shell.className = "startup-state";

      const title = document.createElement("strong");
      title.className = "startup-state-title";
      title.textContent = appCopy.startupTitle;

      const summary = document.createElement("p");
      summary.className = "startup-state-summary";
      summary.textContent = appCopy.startupSummary;

      shell.appendChild(title);
      shell.appendChild(summary);

      const actions = document.createElement("div");
      actions.className = "startup-state-actions";

      const createButton = document.createElement("button");
      createButton.className = "canvas-btn accent";
      createButton.type = "button";
      createButton.textContent = appCopy.createNewXml;
      createButton.addEventListener("click", () => {
        vscode.postMessage({ type: "createNewBehaviorTreeDocument" });
      });

      const openButton = document.createElement("button");
      openButton.className = "canvas-btn";
      openButton.type = "button";
      openButton.textContent = appCopy.openExistingXml;
      openButton.addEventListener("click", () => {
        vscode.postMessage({ type: "openExistingBehaviorTreeDocument" });
      });

      actions.appendChild(createButton);
      actions.appendChild(openButton);
      shell.appendChild(actions);

      return shell;
    }
  }

  function renderPlaybackState() {
    const appCopy = runtime.i18n.getAppCopy();
    const log = runtime.state.playbackLog;
    if (!log?.preview) {
      pausePlayback();
    }

    runtime.state.currentFileName = log?.fileName || appCopy.noActiveDocument;
    runtime.state.currentPreview = log?.preview || null;
    runtime.state.currentCanvasState = null;
    runtime.state.canvasStatesByPane = {};
    runtime.state.currentCatalogGroups = [];
    runtime.state.currentZoom = 1;
    runtime.state.currentHasBlockingIssues = false;
    runtime.state.currentHasDocument = false;
    runtime.viewport.updateZoomLabel();
    runtime.workspacePanels.apply();
    updateSplitViewButton();
    if (log?.preview) {
      runtime.state.selectedTreeId = getTreeMap(log.preview).has(runtime.state.selectedTreeId)
        ? runtime.state.selectedTreeId
        : log.preview.defaultTreeId;
      runtime.treeSwitcher.render(log.preview);
    } else {
      runtime.refs.treeSwitcher.replaceChildren();
    }
    runtime.refs.catalogList.replaceChildren();
    runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
    runtime.search.clearResults();
    if (log?.preview) {
      renderPlaybackLog();
    } else {
      runtime.refs.treeContent.replaceChildren(buildPlaybackImportState());
      runtime.mainTreeLocator.clear();
    }
    updateSaveIndicator();
    runtime.search.updateUi();

    function buildPlaybackImportState() {
      const shell = document.createElement("div");
      shell.className = "startup-state";

      const title = document.createElement("strong");
      title.className = "startup-state-title";
      title.textContent = appCopy.importPlaybackLog;

      const summary = document.createElement("p");
      summary.className = "startup-state-summary";
      summary.textContent = appCopy.importPlaybackSummary;

      const importButton = document.createElement("button");
      importButton.className = "canvas-btn accent";
      importButton.type = "button";
      importButton.textContent = appCopy.importPlaybackLog;
      importButton.addEventListener("click", () => {
        vscode.postMessage({ type: "choosePlaybackLogFile" });
      });

      shell.appendChild(title);
      shell.appendChild(summary);
      shell.appendChild(importButton);
      return shell;
    }
  }

  function renderPlaybackLog(options = {}) {
    const log = runtime.state.playbackLog;
    if (!log?.preview) {
      renderPlaybackState();
      return;
    }
    const viewportState = options.preserveViewport && runtime.state.currentCanvasState
      ? getCanvasViewportState(runtime.state.currentCanvasState)
      : null;

    const frameCount = log.frames?.length || 0;
    runtime.state.playbackFrameIndex = clampInteger(runtime.state.playbackFrameIndex, 0, Math.max(0, frameCount - 1));
    runtime.state.playbackPlaybackSpeed = normalizePlaybackSpeed(runtime.state.playbackPlaybackSpeed);
    const cache = getPlaybackCache(log);
    const playbackSnapshot = buildPlaybackSnapshot(log, runtime.state.playbackFrameIndex);
    runtime.state.playbackStatusByUid = playbackSnapshot.statusByUid;
    runtime.state.playbackLatestTransitionByUid = playbackSnapshot.latestTransitionByUid;
    runtime.state.playbackLastTerminalStatusByUid = playbackSnapshot.lastTerminalStatusByUid;
    runtime.state.playbackCurrentFrameTransitionKeys = playbackSnapshot.currentFrameTransitionKeys;
    const nodeIndex = cache.nodeIndex;
    runtime.state.playbackUidByTreePath = nodeIndex.uidByTreePath;
    runtime.state.playbackNodeLocationsByUid = nodeIndex.locationsByUid;
    runtime.state.playbackChildrenByUid = nodeIndex.childrenByUid;
    runtime.state.playbackDepthByUid = nodeIndex.depthByUid;
    runtime.state.currentPreview = log.preview;
    runtime.state.currentFileName = log.fileName || runtime.i18n.getAppCopy().noActiveDocument;
    runtime.refs.fileLabel.textContent = runtime.state.currentFileName;

    if (!getTreeMap(log.preview).has(runtime.state.selectedTreeId)) {
      runtime.state.selectedTreeId = log.preview.defaultTreeId;
      runtime.state.selectedNodePath = "0";
    }

    runtime.treeSwitcher.render(log.preview, { ensureActiveVisible: options.ensureActiveTreeVisible === true });
    const selectedTree = getSelectedTree(log.preview);
    const shell = document.createElement("div");
    shell.className = "playback-shell";
    shell.style.setProperty("--playback-left-width", `${runtime.state.playbackLeftWidth}px`);
    shell.style.setProperty("--playback-right-width", `${runtime.state.playbackRightWidth}px`);
    shell.classList.toggle("hide-left", runtime.state.playbackLeftVisible === false);
    shell.classList.toggle("hide-right", runtime.state.playbackRightVisible === false);

    const leftToggle = createPlaybackPanelToggle("left");
    const rightToggle = createPlaybackPanelToggle("right");
    shell.appendChild(leftToggle);
    shell.appendChild(rightToggle);

    const leftPanel = renderPlaybackTransitionPanel(log);
    const leftResizer = createPlaybackResizer("left");
    const center = document.createElement("div");
    center.className = "playback-canvas-pane";
    if (selectedTree) {
      runtime.state.selectedNodePath = pickNodePath(selectedTree, runtime.state.selectedNodePath);
      center.appendChild(runtime.canvas.renderTree(selectedTree, log.preview, viewportState, { playback: true }));
      runtime.mainTreeLocator.render(log.preview, selectedTree);
    } else {
      center.appendChild(emptyState(runtime.i18n.getAppCopy().selectedTreeNotFound));
      runtime.mainTreeLocator.clear();
    }
    const rightResizer = createPlaybackResizer("right");
    const rightPanel = renderPlaybackBlackboardPanel(log, playbackSnapshot);

    shell.appendChild(leftPanel);
    shell.appendChild(leftResizer);
    shell.appendChild(center);
    shell.appendChild(rightResizer);
    shell.appendChild(rightPanel);

    const layout = document.createElement("div");
    layout.className = "playback-layout";
    layout.appendChild(shell);
    layout.appendChild(renderPlaybackTimeline(log));
    playbackDomCache = null;
    runtime.refs.treeContent.replaceChildren(layout);
    runtime.canvas.clearDragState();
    persistUiState();
    requestAnimationFrame(() => {
      syncPlaybackFrameUi(log, { scrollList: true, focusNode: false });
      if (runtime.state.playbackIsPlaying) {
        reschedulePlaybackAutoAdvance(log);
      }
      if (options.focusActiveNode === true) {
        schedulePlaybackFocus();
      }
    });
  }

  function renderPlaybackTransitionPanel(log) {
    const panel = document.createElement("aside");
    panel.className = "playback-side-panel playback-transition-panel";

    const header = document.createElement("div");
    header.className = "playback-panel-header";
    const title = document.createElement("strong");
    title.textContent = "Transitions";
    const count = document.createElement("span");
    count.className = "playback-transition-count";
    count.textContent = formatTransitionCount(log);
    header.appendChild(title);
    header.appendChild(count);

    const filterRow = document.createElement("div");
    filterRow.className = "playback-transition-filter-row";
    const filterInput = document.createElement("input");
    filterInput.className = "playback-transition-filter";
    filterInput.type = "search";
    filterInput.placeholder = "Filter by Node Name";
    filterInput.spellcheck = false;
    filterInput.value = runtime.state.playbackTransitionFilter || "";
    filterInput.addEventListener("input", () => {
      runtime.state.playbackTransitionFilter = filterInput.value;
      updatePlaybackTransitionRows(log);
      updatePlaybackTransitionCount(log);
      updatePlaybackActiveTransition(log, true);
      persistUiState();
    });
    const menuIcon = document.createElement("span");
    menuIcon.className = "playback-transition-menu-icon";
    menuIcon.textContent = "≡";
    filterRow.appendChild(filterInput);
    filterRow.appendChild(menuIcon);

    const table = document.createElement("div");
    table.className = "playback-transition-table";
    const tableHeader = document.createElement("div");
    tableHeader.className = "playback-transition-table-header";
    ["Time", "Node Name", "Prev", "Status"].forEach((label) => {
      const cell = document.createElement("span");
      cell.textContent = label;
      tableHeader.appendChild(cell);
    });
    const list = document.createElement("div");
    list.className = "playback-transition-list";
    table.appendChild(tableHeader);
    table.appendChild(list);

    panel.appendChild(header);
    panel.appendChild(filterRow);
    panel.appendChild(table);
    updatePlaybackTransitionRows(log, list);
    return panel;
  }

  function updatePlaybackTransitionRows(log, targetList = null) {
    const list = targetList || document.querySelector(".playback-transition-list");
    if (!list) {
      return;
    }

    const previousScrollTop = list.scrollTop || runtime.state.playbackTransitionScrollTop || 0;
    list._playbackTransitionLog = log;
    ensurePlaybackTransitionScrollHandler(list);
    renderPlaybackTransitionWindow(log, list, previousScrollTop);
  }

  function ensurePlaybackTransitionScrollHandler(list) {
    if (list._playbackTransitionScrollHandler) {
      return;
    }

    list._playbackTransitionScrollHandler = () => {
      runtime.state.playbackTransitionScrollTop = list.scrollTop;
      if (list._playbackTransitionRenderHandle) {
        return;
      }
      list._playbackTransitionRenderHandle = requestAnimationFrame(() => {
        list._playbackTransitionRenderHandle = 0;
        if (list._playbackTransitionLog) {
          renderPlaybackTransitionWindow(list._playbackTransitionLog, list);
        }
      });
    };
    list.addEventListener("scroll", list._playbackTransitionScrollHandler, { passive: true });
  }

  function renderPlaybackTransitionWindow(log, list, requestedScrollTop = null) {
    const filter = normalizeFilter(runtime.state.playbackTransitionFilter);
    const activeTransitionIndex = getActiveTransitionIndex(log, runtime.state.playbackFrameIndex);
    const model = getPlaybackTransitionListModel(log, filter);
    const rowHeight = PLAYBACK_TRANSITION_ROW_HEIGHT;
    const viewportHeight = list.clientHeight || rowHeight * 40;
    const maxScrollTop = Math.max(0, model.visibleCount * rowHeight - viewportHeight);
    const nextScrollTop = clampNumber(
      requestedScrollTop ?? list.scrollTop ?? runtime.state.playbackTransitionScrollTop ?? 0,
      0,
      maxScrollTop
    );
    const firstVisibleRow = Math.floor(nextScrollTop / rowHeight);
    const startPosition = Math.max(0, firstVisibleRow - PLAYBACK_TRANSITION_OVERSCAN_ROWS);
    const visibleRows = Math.ceil(viewportHeight / rowHeight) + PLAYBACK_TRANSITION_OVERSCAN_ROWS * 2;
    const endPosition = Math.min(model.visibleCount, startPosition + visibleRows);
    const fragment = document.createDocumentFragment();

    fragment.appendChild(createPlaybackTransitionSpacer(startPosition * rowHeight));
    for (let position = startPosition; position < endPosition; position += 1) {
      const index = getPlaybackTransitionIndexAtPosition(model, position);
      const transition = log.transitions?.[index];
      if (!transition) {
        continue;
      }
      const row = createPlaybackTransitionRow(log, transition, index, activeTransitionIndex);
      fragment.appendChild(row);
    }
    fragment.appendChild(createPlaybackTransitionSpacer((model.visibleCount - endPosition) * rowHeight));

    list.replaceChildren(fragment);
    playbackDomCache = null;
    list.scrollTop = nextScrollTop;
    runtime.state.playbackTransitionScrollTop = list.scrollTop;
  }

  function createPlaybackTransitionSpacer(height) {
    const spacer = document.createElement("div");
    spacer.className = "playback-transition-spacer";
    spacer.style.height = `${Math.max(0, height)}px`;
    return spacer;
  }

  function createPlaybackTransitionRow(log, transition, index, activeTransitionIndex) {
    const nodeName = resolvePlaybackNodeName(log, transition);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "playback-transition-row";
    row.dataset.transitionIndex = String(index);
    row.dataset.frameIndex = String(transition.frameIndex);
    row.classList.toggle("is-active", index === activeTransitionIndex);
    row.addEventListener("click", (event) => {
      if (event.detail > 1) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      jumpToPlaybackTransition(log, transition.frameIndex);
    });
    row.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    row.appendChild(createTransitionCell("time", formatTransitionTime(log, transition.tUs)));
    row.appendChild(createTransitionCell("node", nodeName));
    row.appendChild(createStatusCell("prev", transition.prevStatus));
    row.appendChild(createStatusCell("status", transition.status));
    return row;
  }

  function jumpToPlaybackTransition(log, frameIndex) {
    setPlaybackFrame(log, frameIndex, {
      navigateToActiveNode: shouldAutoNavigatePlayback(),
      scrollList: true,
      focusNode: shouldAutoNavigatePlayback(),
      persist: true
    });
  }

  function createTransitionCell(kind, text) {
    const cell = document.createElement("span");
    cell.className = `playback-transition-cell playback-transition-${kind}`;
    cell.textContent = text;
    return cell;
  }

  function createStatusCell(kind, status) {
    const cell = createTransitionCell(kind, status);
    cell.classList.add(`status-${normalizeStatusClass(status)}`);
    return cell;
  }

  function updatePlaybackTransitionCount(log) {
    const count = document.querySelector(".playback-transition-count");
    if (count) {
      count.textContent = formatTransitionCount(log);
    }
  }

  function formatTransitionCount(log) {
    const filter = normalizeFilter(runtime.state.playbackTransitionFilter);
    const model = getPlaybackTransitionListModel(log, filter);
    const total = model.total;
    if (!filter) {
      return String(total);
    }
    return `${model.visibleCount}/${total}`;
  }

  function renderPlaybackBlackboardPanel(log, snapshot) {
    const panel = document.createElement("aside");
    panel.className = "playback-side-panel playback-blackboard-panel";

    const header = document.createElement("div");
    header.className = "playback-panel-header";
    const title = document.createElement("strong");
    title.textContent = "Blackboard";
    const count = document.createElement("span");
    count.className = "playback-blackboard-count";
    count.textContent = formatBlackboardCount(snapshot);
    header.appendChild(title);
    header.appendChild(count);

    const filterRow = document.createElement("div");
    filterRow.className = "playback-blackboard-filter-row";
    const filterInput = document.createElement("input");
    filterInput.className = "playback-blackboard-filter";
    filterInput.type = "search";
    filterInput.placeholder = "Filter blackboard";
    filterInput.spellcheck = false;
    filterInput.value = runtime.state.playbackBlackboardFilter || "";
    filterInput.addEventListener("input", () => {
      runtime.state.playbackBlackboardFilter = filterInput.value;
      updatePlaybackBlackboardPanel(log, buildPlaybackSnapshot(log, runtime.state.playbackFrameIndex));
      persistUiState();
    });
    filterRow.appendChild(filterInput);

    panel.appendChild(header);
    panel.appendChild(filterRow);
    panel.appendChild(renderPlaybackBlackboardBody(log, snapshot));
    panel.dataset.blackboardRenderKey = getPlaybackBlackboardRenderKey(snapshot);
    return panel;
  }

  function renderPlaybackBlackboardBody(log, snapshot) {
    const table = document.createElement("div");
    table.className = "playback-blackboard-table";

    const tableHeader = document.createElement("div");
    tableHeader.className = "playback-blackboard-table-header";
    ["Key", "Value"].forEach((label) => {
      const cell = document.createElement("span");
      cell.textContent = label;
      tableHeader.appendChild(cell);
    });

    const list = document.createElement("div");
    list.className = "playback-blackboard-list";
    const rows = getFilteredBlackboardRows(snapshot);
    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "playback-blackboard-empty";
      empty.textContent = snapshot.latestBlackboardEvent ? "No matching blackboard values." : "No blackboard values before this frame.";
      list.appendChild(empty);
    } else {
      const fragment = document.createDocumentFragment();
      rows.forEach((row) => {
        const item = document.createElement("div");
        item.className = "playback-blackboard-row";
        item.dataset.blackboardKey = row.key;
        item.classList.toggle("is-expanded", row.expanded === true);
        item.appendChild(createBlackboardCell("key", row.key, row.keyTitle));
        item.appendChild(createBlackboardValueCell(row, log, snapshot));
        fragment.appendChild(item);
      });
      list.appendChild(fragment);
    }

    if (runtime.state.playbackBlackboardScrollTop > 0) {
      requestAnimationFrame(() => {
        list.scrollTop = runtime.state.playbackBlackboardScrollTop;
      });
    }
    list.addEventListener("scroll", () => {
      runtime.state.playbackBlackboardScrollTop = list.scrollTop;
    }, { passive: true });

    table.appendChild(tableHeader);
    table.appendChild(list);
    return table;
  }

  function createBlackboardCell(kind, text, title = "") {
    const cell = document.createElement("span");
    cell.className = `playback-blackboard-cell playback-blackboard-${kind}`;
    cell.textContent = text;
    cell.title = title || text;
    return cell;
  }

  function createBlackboardValueCell(row, log, snapshot) {
    const cell = document.createElement("div");
    cell.className = "playback-blackboard-cell playback-blackboard-value";
    cell.title = row.valueTitle || row.valueText;

    if (row.expandable) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "playback-blackboard-expand";
      button.textContent = row.expanded ? "▾" : "▸";
      button.title = row.expanded ? "Collapse value" : "Expand value";
      button.setAttribute("aria-label", button.title);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (runtime.state.playbackExpandedBlackboardKeys.has(row.key)) {
          runtime.state.playbackExpandedBlackboardKeys.delete(row.key);
        } else {
          runtime.state.playbackExpandedBlackboardKeys.add(row.key);
        }
        updatePlaybackBlackboardPanel(log, snapshot);
        persistUiState();
      });
      cell.appendChild(button);
    }

    if (row.expanded) {
      const value = document.createElement("pre");
      value.className = "playback-blackboard-value-full";
      value.textContent = row.valueFullText;
      cell.appendChild(value);
    } else {
      const value = document.createElement("span");
      value.className = "playback-blackboard-value-preview";
      value.textContent = row.valueText;
      cell.appendChild(value);
    }

    return cell;
  }

  function renderPlaybackTimeline(log) {
    const footer = document.createElement("div");
    footer.className = "playback-timeline";

    const leftControls = document.createElement("div");
    leftControls.className = "playback-timeline-group playback-timeline-group-left";

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.className = "canvas-btn icon-btn playback-play-btn";
    playButton.addEventListener("click", () => {
      togglePlayback(log);
    });
    leftControls.appendChild(playButton);

    const speedSelect = document.createElement("select");
    speedSelect.className = "playback-speed-select";
    speedSelect.setAttribute("aria-label", "Playback speed");
    speedSelect.title = "Playback speed";
    PLAYBACK_SPEED_OPTIONS.forEach((option) => {
      const item = document.createElement("option");
      item.value = String(option.value);
      item.textContent = option.label;
      speedSelect.appendChild(item);
    });
    speedSelect.value = String(runtime.state.playbackPlaybackSpeed);
    speedSelect.addEventListener("change", () => {
      runtime.state.playbackPlaybackSpeed = normalizePlaybackSpeed(speedSelect.value);
      persistUiState();
      updatePlaybackTimelineControls(log);
      if (runtime.state.playbackIsPlaying) {
        reschedulePlaybackAutoAdvance(log);
      }
    });
    leftControls.appendChild(speedSelect);

    const rightControls = document.createElement("div");
    rightControls.className = "playback-timeline-group playback-timeline-group-right";

    const prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.className = "canvas-btn icon-btn playback-step-btn";
    prevButton.textContent = "<";
    prevButton.title = "Previous node status change";
    prevButton.addEventListener("click", () => {
      stepPlaybackTransition(log, -1);
    });

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "canvas-btn icon-btn playback-step-btn";
    nextButton.textContent = ">";
    nextButton.title = "Next node status change";
    nextButton.addEventListener("click", () => {
      stepPlaybackTransition(log, 1);
    });

    const slider = document.createElement("input");
    slider.className = "playback-slider";
    slider.type = "range";
    slider.min = "0";
    slider.max = String(Math.max(0, (log.frames?.length || 1) - 1));
    slider.step = "1";
    slider.value = String(runtime.state.playbackFrameIndex);
    slider.addEventListener("input", () => {
      requestPlaybackFrame(log, Number(slider.value), {
        navigateToActiveNode: shouldAutoNavigatePlayback(),
        scrollList: false,
        focusNode: false,
        persist: false,
        updateBlackboard: true
      });
    });
    slider.addEventListener("change", () => {
      setPlaybackFrame(log, Number(slider.value), {
        navigateToActiveNode: shouldAutoNavigatePlayback(),
        scrollList: true,
        focusNode: shouldAutoNavigatePlayback(),
        persist: true,
        updateBlackboard: true
      });
    });

    const time = document.createElement("div");
    time.className = "playback-current-time";
    const frame = log.frames?.[runtime.state.playbackFrameIndex] || null;
    time.textContent = frame ? `${formatRelativeTime(log, frame.tUs)}  ${formatWallTime(frame.wallUs)}` : "No frames";

    rightControls.appendChild(prevButton);
    rightControls.appendChild(nextButton);
    rightControls.appendChild(time);

    footer.appendChild(leftControls);
    footer.appendChild(slider);
    footer.appendChild(rightControls);
    updatePlaybackTimelineControls(log);
    return footer;
  }

  function togglePlayback(log) {
    if (runtime.state.playbackIsPlaying) {
      pausePlayback();
      return;
    }
    startPlayback(log);
  }

  function startPlayback(log) {
    if (!log?.frames || log.frames.length < 2) {
      return;
    }
    if (runtime.state.playbackFrameIndex >= log.frames.length - 1) {
      runtime.state.playbackFrameIndex = 0;
      syncPlaybackFrameUi(log, { scrollList: true, focusNode: false });
    }
    runtime.state.playbackIsPlaying = true;
    updatePlaybackTimelineControls(log);
    reschedulePlaybackAutoAdvance(log);
  }

  function pausePlayback() {
    runtime.state.playbackIsPlaying = false;
    if (playbackAutoAdvanceHandle) {
      clearTimeout(playbackAutoAdvanceHandle);
      playbackAutoAdvanceHandle = 0;
    }
    updatePlaybackTimelineControls(runtime.state.playbackLog);
  }

  function reschedulePlaybackAutoAdvance(log) {
    if (playbackAutoAdvanceHandle) {
      clearTimeout(playbackAutoAdvanceHandle);
      playbackAutoAdvanceHandle = 0;
    }
    if (!runtime.state.playbackIsPlaying || runtime.state.playbackLog !== log) {
      return;
    }

    const currentFrameIndex = runtime.state.playbackFrameIndex;
    const nextFrameIndex = currentFrameIndex + 1;
    if (!log.frames || nextFrameIndex >= log.frames.length) {
      pausePlayback();
      return;
    }

    const delayMs = getPlaybackAdvanceDelayMs(log, currentFrameIndex, nextFrameIndex);
    playbackAutoAdvanceHandle = window.setTimeout(() => {
      playbackAutoAdvanceHandle = 0;
      if (!runtime.state.playbackIsPlaying || runtime.state.playbackLog !== log) {
        return;
      }
      if (runtime.state.playbackFrameIndex !== currentFrameIndex) {
        reschedulePlaybackAutoAdvance(log);
        return;
      }
      setPlaybackFrame(log, nextFrameIndex, {
        navigateToActiveNode: shouldAutoNavigatePlayback(),
        scrollList: true,
        focusNode: false,
        persist: true
      });
    }, delayMs);
  }

  function getPlaybackAdvanceDelayMs(log, currentFrameIndex, nextFrameIndex) {
    const currentFrame = log.frames?.[currentFrameIndex] || null;
    const nextFrame = log.frames?.[nextFrameIndex] || null;
    const speed = normalizePlaybackSpeed(runtime.state.playbackPlaybackSpeed);
    const deltaUs = Number(nextFrame?.tUs) - Number(currentFrame?.tUs);
    const deltaMs = Number.isFinite(deltaUs) && deltaUs > 0 ? deltaUs / 1000 : 100;
    return Math.max(16, Math.round(deltaMs / Math.max(0.1, speed)));
  }

  function updatePlaybackTimelineControls(log) {
    const playButton = document.querySelector(".playback-play-btn");
    if (playButton) {
      const isPlaying = runtime.state.playbackIsPlaying === true;
      const nextIconKind = isPlaying ? "pause" : "play";
      playButton.classList.toggle("is-active", isPlaying);
      playButton.setAttribute("aria-pressed", isPlaying ? "true" : "false");
      playButton.title = isPlaying ? "Pause playback" : "Play playback";
      playButton.setAttribute("aria-label", playButton.title);
      if (playButton.dataset.playbackIcon !== nextIconKind) {
        playButton.replaceChildren(createPlaybackTransportIcon(nextIconKind));
        playButton.dataset.playbackIcon = nextIconKind;
      }
    }

    const speedSelect = document.querySelector(".playback-speed-select");
    if (speedSelect) {
      const nextValue = String(normalizePlaybackSpeed(runtime.state.playbackPlaybackSpeed));
      if (speedSelect.value !== nextValue) {
        speedSelect.value = nextValue;
      }
      speedSelect.disabled = !log?.frames || log.frames.length < 2;
    }
  }

  function createPlaybackTransportIcon(kind) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", kind === "pause"
      ? "M7 5h3v14H7zm7 0h3v14h-3z"
      : "M8 5.5v13l10-6.5z");
    svg.appendChild(path);
    return svg;
  }

  function createPlaybackPanelToggle(side) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `panel-edge-toggle playback-edge-toggle playback-edge-toggle-${side}`;
    const isLeft = side === "left";
    const visibleKey = isLeft ? "playbackLeftVisible" : "playbackRightVisible";
    button.title = isLeft ? "Show or hide transitions" : "Show or hide blackboard";
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", () => {
      runtime.state[visibleKey] = runtime.state[visibleKey] === false;
      renderPlaybackLog();
    });
    return button;
  }

  function createPlaybackResizer(side) {
    const handle = document.createElement("div");
    handle.className = `panel-resizer playback-resizer playback-resizer-${side}`;
    handle.hidden = side === "left" ? runtime.state.playbackLeftVisible === false : runtime.state.playbackRightVisible === false;
    handle.addEventListener("pointerdown", (event) => {
      const widthKey = side === "left" ? "playbackLeftWidth" : "playbackRightWidth";
      const startX = event.clientX;
      const startWidth = runtime.state[widthKey];
      const pointerId = event.pointerId;
      handle.setPointerCapture(pointerId);
      document.body.classList.add("is-resizing-panels");

      const onPointerMove = (moveEvent) => {
        const deltaX = side === "left" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
        runtime.state[widthKey] = runtime.viewport.clampNumber(startWidth + deltaX, 220, side === "left" ? 520 : 560, startWidth);
        persistUiState();
        const shell = handle.closest(".playback-shell");
        shell?.style.setProperty(side === "left" ? "--playback-left-width" : "--playback-right-width", `${runtime.state[widthKey]}px`);
        runtime.viewport.refreshViewport();
      };

      const finish = () => {
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
      const onPointerUp = () => finish();
      const onPointerCancel = () => finish();

      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
      handle.addEventListener("pointercancel", onPointerCancel);
    });
    return handle;
  }

  function stepPlaybackTransition(log, direction) {
    const transitions = log.transitions || [];
    if (transitions.length === 0) {
      return;
    }
    const currentFrameIndex = runtime.state.playbackFrameIndex;
    const nextIndex = direction < 0
      ? findLastTransitionIndexBeforeFrame(transitions, currentFrameIndex)
      : findFirstTransitionIndexAfterFrame(transitions, currentFrameIndex);
    const next = nextIndex === null ? null : transitions[nextIndex];
    if (!next) {
      return;
    }
    setPlaybackFrame(log, next.frameIndex, {
      navigateToActiveNode: shouldAutoNavigatePlayback(),
      scrollList: true,
      focusNode: shouldAutoNavigatePlayback(),
      persist: true
    });
  }

  function requestPlaybackFrame(log, frameIndex, options = {}) {
    pendingPlaybackFrameUpdate = { log, frameIndex, options };
    if (playbackFrameUpdateHandle) {
      return;
    }
    playbackFrameUpdateHandle = requestAnimationFrame(() => {
      playbackFrameUpdateHandle = 0;
      const update = pendingPlaybackFrameUpdate;
      pendingPlaybackFrameUpdate = null;
      if (update) {
        setPlaybackFrame(update.log, update.frameIndex, update.options);
      }
    });
  }

  function setPlaybackFrame(log, frameIndex, options = {}) {
    if (!log?.preview) {
      return;
    }
    const maxFrameIndex = Math.max(0, (log.frames?.length || 1) - 1);
    runtime.state.playbackFrameIndex = clampInteger(frameIndex, 0, maxFrameIndex);

    if (options.navigateToActiveNode) {
      const activeTransition = getActiveTransition(log, runtime.state.playbackFrameIndex);
      const location = activeTransition ? findPlaybackNodeLocation(activeTransition.uid) : null;
      if (location) {
        const treeChanged = runtime.state.selectedTreeId !== location.treeId;
        runtime.state.selectedTreeId = location.treeId;
        runtime.state.selectedNodePath = location.nodePath;
        if (treeChanged) {
          renderPlaybackLog({
            ensureActiveTreeVisible: true,
            focusActiveNode: options.focusNode === true,
            preserveViewport: true
          });
          return;
        }
      }
    }

    syncPlaybackFrameUi(log, options);
    if (runtime.state.playbackIsPlaying) {
      reschedulePlaybackAutoAdvance(log);
    }
    if (options.persist) {
      persistUiState();
    }
  }

  function shouldAutoNavigatePlayback() {
    return runtime.state.currentSettings?.playbackAutoNavigateToTree !== false;
  }

  function syncPlaybackFrameUi(log, options = {}) {
    const playbackSnapshot = buildPlaybackSnapshot(log, runtime.state.playbackFrameIndex, {
      includeBlackboard: options.updateBlackboard !== false
    });
    runtime.state.playbackStatusByUid = playbackSnapshot.statusByUid;
    runtime.state.playbackLatestTransitionByUid = playbackSnapshot.latestTransitionByUid;
    runtime.state.playbackLastTerminalStatusByUid = playbackSnapshot.lastTerminalStatusByUid;
    runtime.state.playbackCurrentFrameTransitionKeys = playbackSnapshot.currentFrameTransitionKeys;
    updatePlaybackCanvasStatuses();
    updatePlaybackCanvasSelection();
    updatePlaybackTimeline(log);
    updatePlaybackActiveTransition(log, options.scrollList === true);
    if (options.updateBlackboard !== false) {
      updatePlaybackBlackboardPanel(log, playbackSnapshot);
    }
    if (options.focusNode) {
      schedulePlaybackFocus();
    }
  }

  function schedulePlaybackFocus(frame = 0) {
    requestAnimationFrame(() => {
      const canvasState = runtime.state.currentCanvasState;
      if (!canvasState?.shell || !runtime.state.selectedNodePath) {
        return;
      }
      if ((canvasState.shell.clientWidth <= 0 || canvasState.shell.clientHeight <= 0) && frame < 8) {
        schedulePlaybackFocus(frame + 1);
        return;
      }
      runtime.viewport.focusNodePath(runtime.state.selectedNodePath);
      if (frame < 8) {
        schedulePlaybackFocus(frame + 1);
      }
    });
  }

  function updatePlaybackCanvasStatuses() {
    const domCache = getPlaybackDomCache();
    domCache.nodeCardsByUid.forEach((card, uid) => {
      syncPlaybackStatusClass(card, getPlaybackStatusClassForUid(uid, false), "playback-status", true);
    });

    domCache.edgePathsByUid.forEach((edge, uid) => {
      syncPlaybackStatusClass(edge, getPlaybackStatusClassForUid(uid, true), "playback-edge-status", false);
    });
  }

  function updatePlaybackCanvasSelection() {
    const domCache = getPlaybackDomCache();
    domCache.selectedCard?.classList.remove("is-selected");
    const key = `${runtime.state.selectedTreeId || ""}::${runtime.state.selectedNodePath || ""}`;
    const selected = domCache.nodeCardsByTreePath.get(key) || null;
    selected?.classList.add("is-selected");
    domCache.selectedCard = selected;
    runtime.treeSwitcher.updateActive?.();
  }

  function updatePlaybackTimeline(log) {
    const slider = document.querySelector(".playback-slider");
    if (slider) {
      slider.value = String(runtime.state.playbackFrameIndex);
    }
    const time = document.querySelector(".playback-current-time");
    if (time) {
      const frame = log.frames?.[runtime.state.playbackFrameIndex] || null;
      time.textContent = frame ? `${formatRelativeTime(log, frame.tUs)}  ${formatWallTime(frame.wallUs)}` : "No frames";
    }
    updatePlaybackTimelineControls(log);
  }

  function updatePlaybackActiveTransition(log, scrollList) {
    const activeTransitionIndex = getActiveTransitionIndex(log, runtime.state.playbackFrameIndex);
    if (scrollList && activeTransitionIndex !== null) {
      const list = document.querySelector(".playback-transition-list");
      if (list && scrollPlaybackTransitionListToIndex(log, list, activeTransitionIndex)) {
        const domCache = getPlaybackDomCache();
        domCache.activeTransitionRow = domCache.transitionRowsByIndex.get(String(activeTransitionIndex)) || null;
        return;
      }
    }

    const domCache = getPlaybackDomCache();
    domCache.activeTransitionRow?.classList.remove("is-active");
    domCache.activeTransitionRow = null;
    if (activeTransitionIndex === null) {
      return;
    }
    const activeRow = domCache.transitionRowsByIndex.get(String(activeTransitionIndex)) || null;
    activeRow?.classList.add("is-active");
    domCache.activeTransitionRow = activeRow;
    if (scrollList && activeRow) {
      activeRow.scrollIntoView({ block: "nearest" });
    }
  }

  function scrollPlaybackTransitionListToIndex(log, list, transitionIndex) {
    const model = getPlaybackTransitionListModel(log);
    const position = getPlaybackTransitionPosition(model, transitionIndex);
    if (position < 0) {
      return false;
    }

    const rowHeight = PLAYBACK_TRANSITION_ROW_HEIGHT;
    const viewportHeight = list.clientHeight || rowHeight * 40;
    const rowTop = position * rowHeight;
    const rowBottom = rowTop + rowHeight;
    const currentScrollTop = list.scrollTop || runtime.state.playbackTransitionScrollTop || 0;
    let nextScrollTop = currentScrollTop;

    if (rowTop < currentScrollTop) {
      nextScrollTop = rowTop;
    } else if (rowBottom > currentScrollTop + viewportHeight) {
      nextScrollTop = rowBottom - viewportHeight;
    }

    renderPlaybackTransitionWindow(log, list, nextScrollTop);
    return true;
  }

  function updatePlaybackBlackboardPanel(log, snapshot) {
    const panel = document.querySelector(".playback-blackboard-panel");
    if (!panel) {
      return;
    }
    const nextRenderKey = getPlaybackBlackboardRenderKey(snapshot);
    if (panel.dataset.blackboardRenderKey === nextRenderKey) {
      return;
    }

    const previousPanelScrollTop = panel.scrollTop || 0;
    const oldList = panel.querySelector(".playback-blackboard-list");
    const scrollSnapshot = captureBlackboardScrollSnapshot(oldList);
    const count = panel.querySelector(".playback-blackboard-count");
    if (count) {
      count.textContent = formatBlackboardCount(snapshot);
    }
    panel.dataset.blackboardRenderKey = nextRenderKey;
    const oldBody = panel.querySelector(".playback-blackboard-table");
    oldBody?.replaceWith(renderPlaybackBlackboardBody(log, snapshot));
    const nextList = panel.querySelector(".playback-blackboard-list");
    if (nextList) {
      restoreBlackboardScrollSnapshot(nextList, scrollSnapshot);
    }
    panel.scrollTop = previousPanelScrollTop;
  }

  function getPlaybackBlackboardRenderKey(snapshot) {
    const event = snapshot?.latestBlackboardEvent || null;
    const eventKey = event
      ? `${event.frameIndex}:${event.kind}:${event.seq}:${event.tUs}`
      : "none";
    const expandedKey = Array.from(runtime.state.playbackExpandedBlackboardKeys || []).sort().join("\u0000");
    return `${eventKey}|${normalizeFilter(runtime.state.playbackBlackboardFilter)}|${expandedKey}`;
  }

  function captureBlackboardScrollSnapshot(list) {
    if (!list) {
      return {
        scrollTop: runtime.state.playbackBlackboardScrollTop || 0,
        anchorKey: "",
        anchorOffset: 0
      };
    }

    const listTop = list.getBoundingClientRect().top;
    const rows = Array.from(list.querySelectorAll(".playback-blackboard-row[data-blackboard-key]"));
    const anchor = rows.find((row) => row.getBoundingClientRect().bottom >= listTop) || rows[0] || null;
    return {
      scrollTop: list.scrollTop,
      anchorKey: anchor?.dataset.blackboardKey || "",
      anchorOffset: anchor ? anchor.getBoundingClientRect().top - listTop : 0
    };
  }

  function restoreBlackboardScrollSnapshot(list, snapshot) {
    if (!list) {
      return;
    }
    const fallbackScrollTop = snapshot?.scrollTop ?? runtime.state.playbackBlackboardScrollTop ?? 0;
    const restore = () => {
      const anchorKey = snapshot?.anchorKey || "";
      const anchor = anchorKey
        ? list.querySelector(`.playback-blackboard-row[data-blackboard-key="${CSS.escape(anchorKey)}"]`)
        : null;
      if (anchor) {
        list.scrollTop += anchor.getBoundingClientRect().top - list.getBoundingClientRect().top - (snapshot.anchorOffset || 0);
      } else {
        list.scrollTop = fallbackScrollTop;
      }
      runtime.state.playbackBlackboardScrollTop = list.scrollTop;
    };

    list.scrollTop = fallbackScrollTop;
    restore();
    requestAnimationFrame(restore);
  }

  function formatBlackboardCount(snapshot) {
    const total = flattenBlackboardRows(snapshot.blackboardValues).length;
    const visible = getFilteredBlackboardRows(snapshot).length;
    if (visible === total) {
      return String(total);
    }
    return `${visible}/${total}`;
  }

  function getFilteredBlackboardRows(snapshot) {
    const filter = normalizeFilter(runtime.state.playbackBlackboardFilter);
    const rows = flattenBlackboardRows(snapshot.blackboardValues);
    if (!filter) {
      return rows;
    }
    return rows.filter((row) =>
      `${row.key} ${row.valueText}`.toLowerCase().includes(filter)
    );
  }

  function flattenBlackboardRows(values) {
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      return [];
    }

    const rowsByKey = new Map();
    Object.entries(values).forEach(([scope, scopedValues]) => {
      if (scopedValues && typeof scopedValues === "object" && !Array.isArray(scopedValues)) {
        Object.entries(scopedValues).forEach(([key, value]) => {
          const displayKey = toBlackboardDisplayKey(key);
          rowsByKey.set(displayKey, toBlackboardRow(displayKey, value, toBlackboardSourceKey(scope, key)));
        });
        return;
      }
      const displayKey = toBlackboardDisplayKey(scope);
      rowsByKey.set(displayKey, toBlackboardRow(displayKey, scopedValues, scope));
    });

    const rows = Array.from(rowsByKey.values());
    rows.sort((left, right) =>
      left.key.localeCompare(right.key)
    );
    return rows;
  }

  function toBlackboardDisplayKey(key) {
    const text = String(key || "");
    const parts = text.split("/").filter(Boolean);
    return parts[parts.length - 1] || text || "(value)";
  }

  function toBlackboardSourceKey(scope, key) {
    if (!scope) {
      return key || "(value)";
    }
    if (!key) {
      return scope;
    }
    return `${scope}/${key}`;
  }

  function toBlackboardRow(key, value, sourceKey) {
    const valueInfo = formatBlackboardValueInfo(value);
    return {
      key,
      keyTitle: sourceKey || key,
      valueText: valueInfo.preview,
      valueFullText: valueInfo.full,
      valueTitle: valueInfo.preview,
      expandable: valueInfo.expandable,
      expanded: runtime.state.playbackExpandedBlackboardKeys.has(key)
    };
  }

  function formatBlackboardValue(value) {
    return formatBlackboardValueInfo(value).preview;
  }

  function formatBlackboardValueInfo(value) {
    if (value === null) {
      return { preview: "null", full: "null", expandable: false };
    }
    if (value === undefined) {
      return { preview: "", full: "", expandable: false };
    }
    if (typeof value === "string") {
      const parsed = parseJsonLikeValue(value);
      if (parsed.ok) {
        return {
          preview: value,
          full: JSON.stringify(parsed.value, null, 2),
          expandable: true
        };
      }
      return { preview: value, full: value, expandable: false };
    }
    if (typeof value === "number" || typeof value === "boolean") {
      const text = String(value);
      return { preview: text, full: text, expandable: false };
    }
    try {
      return {
        preview: JSON.stringify(value),
        full: JSON.stringify(value, null, 2),
        expandable: true
      };
    } catch (_error) {
      const text = String(value);
      return { preview: text, full: text, expandable: false };
    }
  }

  function parseJsonLikeValue(value) {
    const text = String(value || "").trim();
    if (!text || !["{", "["].includes(text[0])) {
      return { ok: false, value: null };
    }
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (_error) {
      return { ok: false, value: null };
    }
  }

  function clearPlaybackStatusClasses(element, prefix) {
    Array.from(element.classList).forEach((className) => {
      if (className.startsWith(`${prefix}-`)) {
        element.classList.remove(className);
      }
    });
  }

  function syncPlaybackStatusClass(element, nextClass, prefix, includeBaseClass) {
    if (!element) {
      return;
    }

    if (includeBaseClass) {
      element.classList.add("is-playback-status");
    }

    if (element.dataset.playbackStatusClass === nextClass) {
      return;
    }

    clearPlaybackStatusClasses(element, prefix);
    if (nextClass) {
      element.classList.add(nextClass);
    }
    element.dataset.playbackStatusClass = nextClass || "";
  }

  function getPlaybackDomCache() {
    const root = runtime.refs.treeContent;
    if (playbackDomCache?.root === root) {
      return playbackDomCache;
    }

    const nodeCardsByUid = new Map();
    const nodeCardsByTreePath = new Map();
    const edgePathsByUid = new Map();
    const transitionRowsByIndex = new Map();

    root.querySelectorAll(".canvas-node[data-playback-uid]").forEach((node) => {
      const card = node.querySelector(".flow-card");
      if (!card) {
        return;
      }

      const uid = String(node.dataset.playbackUid || "");
      if (uid) {
        nodeCardsByUid.set(uid, card);
      }

      const treeId = node.dataset.treeId || "";
      const nodePath = node.dataset.nodePath || "";
      if (treeId && nodePath) {
        nodeCardsByTreePath.set(`${treeId}::${nodePath}`, card);
      }
    });

    root.querySelectorAll(".canvas-edge-path-base[data-playback-uid]").forEach((edge) => {
      const uid = String(edge.dataset.playbackUid || "");
      if (uid) {
        edgePathsByUid.set(uid, edge);
      }
    });

    root.querySelectorAll(".playback-transition-row[data-transition-index]").forEach((row) => {
      transitionRowsByIndex.set(String(row.dataset.transitionIndex), row);
    });

    playbackDomCache = {
      root,
      nodeCardsByUid,
      nodeCardsByTreePath,
      edgePathsByUid,
      transitionRowsByIndex,
      selectedCard: root.querySelector(".flow-card.is-selected"),
      activeTransitionRow: root.querySelector(".playback-transition-row.is-active")
    };
    return playbackDomCache;
  }

  function getPlaybackStatusClassForUid(uid, edge) {
    return runtime.playbackData.getPlaybackStatusClassForUid(uid, edge);
  }

  function getActiveTransition(log, frameIndex) {
    return runtime.playbackData.getActiveTransition(log, frameIndex);
  }

  function getActiveTransitionIndex(log, frameIndex) {
    return runtime.playbackData.getActiveTransitionIndex(log, frameIndex);
  }

  function findLastTransitionIndexAtOrBeforeFrame(transitions, frameIndex) {
    return runtime.playbackData.findLastTransitionIndexAtOrBeforeFrame(transitions, frameIndex);
  }

  function findLastTransitionIndexBeforeFrame(transitions, frameIndex) {
    return runtime.playbackData.findLastTransitionIndexBeforeFrame(transitions, frameIndex);
  }

  function findFirstTransitionIndexAfterFrame(transitions, frameIndex) {
    return runtime.playbackData.findFirstTransitionIndexAfterFrame(transitions, frameIndex);
  }

  function getPlaybackTransitionListModel(log, filter = normalizeFilter(runtime.state.playbackTransitionFilter)) {
    return runtime.playbackData.getPlaybackTransitionListModel(log, filter);
  }

  function getPlaybackTransitionIndexAtPosition(model, position) {
    return runtime.playbackData.getPlaybackTransitionIndexAtPosition(model, position);
  }

  function getPlaybackTransitionPosition(model, transitionIndex) {
    return runtime.playbackData.getPlaybackTransitionPosition(model, transitionIndex);
  }

  function findPlaybackNodeLocation(uid) {
    return runtime.playbackData.findPlaybackNodeLocation(uid);
  }

  function buildPlaybackSnapshot(log, frameIndex, options = {}) {
    return runtime.playbackData.buildPlaybackSnapshot(log, frameIndex, options);
  }

  function getPlaybackCache(log) {
    return runtime.playbackData.getPlaybackCache(log);
  }

  function resolvePlaybackNodeName(log, transition) {
    return runtime.playbackData.resolvePlaybackNodeName(log, transition);
  }

  function formatRelativeTime(log, tUs) {
    const start = log.frames?.[0]?.tUs ?? 0;
    const elapsed = Math.max(0, Number(tUs) - Number(start));
    return `+${(elapsed / 1000000).toFixed(3)}s`;
  }

  function formatTransitionTime(log, tUs) {
    const start = log.frames?.[0]?.tUs ?? 0;
    const elapsed = Math.max(0, Number(tUs) - Number(start));
    return (elapsed / 1000000).toFixed(3);
  }

  function formatWallTime(wallUs) {
    const numeric = Number(wallUs);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "";
    }
    const date = new Date(Math.floor(numeric / 1000));
    return date.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function normalizeStatusClass(status) {
    return String(status || "unknown").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  }

  function normalizeFilter(value) {
    return String(value || "").trim().toLowerCase();
  }

  function clampInteger(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return min;
    }
    return Math.min(max, Math.max(min, Math.round(numeric)));
  }

  function normalizePlaybackSpeed(value) {
    const numeric = Number(value);
    return PLAYBACK_SPEED_OPTIONS.some((option) => option.value === numeric) ? numeric : 1;
  }

  function clampNumber(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return min;
    }
    return Math.min(max, Math.max(min, numeric));
  }

  function renderCurrentTree(result, options = {}) {
    const preserveViewport = Boolean(options.preserveViewport && runtime.state.currentCanvasState);
    const viewportState = !runtime.state.splitViewEnabled && preserveViewport
      ? getCanvasViewportState(runtime.state.currentCanvasState)
      : null;
    const splitViewportStates = runtime.state.splitViewEnabled && preserveViewport
      ? getSplitViewportStates()
      : {};

    if (runtime.state.splitViewEnabled) {
      ensureSplitPaneState(result);
    }
    runtime.treeSwitcher.render(result, { ensureActiveVisible: options.ensureActiveTreeVisible === true });

    if (runtime.state.splitViewEnabled) {
      renderSplitTreeView(result, splitViewportStates);
      return;
    }

    const selectedTree = getSelectedTree(result);
    if (!selectedTree) {
      const appCopy = runtime.i18n.getAppCopy();
      runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
      runtime.search.clearResults();
      runtime.refs.treeContent.replaceChildren(emptyState(appCopy.selectedTreeNotFound));
      runtime.mainTreeLocator.clear();
      runtime.search.updateUi();
      return;
    }

    runtime.state.canvasStatesByPane = {};
    runtime.state.selectedNodePath = pickNodePath(selectedTree);
    persistUiState();
    runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
    runtime.refs.treeContent.replaceChildren(runtime.canvas.renderTree(selectedTree, result, viewportState));
    runtime.mainTreeLocator.render(result, selectedTree);
    runtime.canvas.clearDragState();
  }

  function renderSplitTreeView(result, viewportStates = {}) {
    ensureSplitPaneState(result);
    runtime.treeSwitcher.updateActive?.();
    runtime.state.canvasStatesByPane = {};

    const treeMap = getTreeMap(result);
    const container = document.createElement("div");
    container.className = "tree-split-view";

    ["left", "right"].forEach((paneId) => {
      container.appendChild(renderTreePane(result, treeMap, paneId, viewportStates[paneId] || null));
    });

    runtime.refs.fileLabel.textContent = runtime.state.currentFileName;
    runtime.refs.treeContent.replaceChildren(container);
    persistUiState();

    const activeTree = getSelectedTree(result);
    runtime.mainTreeLocator.render(result, activeTree);
    runtime.canvas.clearDragState();
    updateSplitPaneActiveState();
    requestAnimationFrame(() => {
      const activeCanvasState = runtime.state.canvasStatesByPane?.[runtime.state.activeTreePane];
      if (activeCanvasState) {
        runtime.viewport.activateCanvasState(activeCanvasState);
      }
    });
  }

  function renderTreePane(result, treeMap, paneId, viewportState) {
    const treeId = runtime.state.splitPaneTreeIds?.[paneId];
    const tree = treeMap.get(treeId) || null;
    const isActive = runtime.state.activeTreePane === paneId;
    const pane = document.createElement("section");
    pane.className = isActive ? "tree-split-pane is-active" : "tree-split-pane";
    pane.dataset.paneId = paneId;
    if (treeId) {
      pane.dataset.treeId = treeId;
    }

    const header = document.createElement("div");
    header.className = "tree-split-pane-header";

    const title = document.createElement("span");
    title.className = "tree-split-pane-title";
    const isChinese = runtime.state.currentSettings?.language === "zh-CN";
    title.textContent = paneId === "left" ? (isChinese ? "左" : "Left") : (isChinese ? "右" : "Right");

    const select = document.createElement("select");
    select.className = "tree-split-pane-select";
    result.behaviorTrees.forEach((entry) => {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.id;
      select.appendChild(option);
    });
    if (treeId) {
      select.value = treeId;
    }
    select.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      activateTreePane(paneId, select.value, null);
    });
    select.addEventListener("change", () => {
      selectTreeInPane(paneId, select.value, result);
    });

    header.appendChild(title);
    header.appendChild(select);
    pane.appendChild(header);

    pane.addEventListener("pointerdown", () => {
      activateTreePane(paneId, treeId, null);
    });
    pane.addEventListener("focusin", () => {
      activateTreePane(paneId, treeId, null);
    });
    pane.addEventListener("dragenter", () => {
      activateTreePane(paneId, treeId, null);
    });

    if (!tree) {
      pane.appendChild(emptyState(runtime.i18n.getAppCopy().selectedTreeNotFound));
      return pane;
    }

    const selectedNodePath = pickNodePath(tree, runtime.state.splitPaneNodePaths?.[paneId] || "0");
    runtime.state.splitPaneNodePaths = {
      ...(runtime.state.splitPaneNodePaths || {}),
      [paneId]: selectedNodePath
    };
    if (isActive) {
      runtime.state.selectedTreeId = tree.id;
      runtime.state.selectedNodePath = selectedNodePath;
    }

    pane.appendChild(
      runtime.canvas.renderTree(tree, result, viewportState, {
        paneId,
        active: isActive,
        selectedNodePath
      })
    );
    return pane;
  }

  function getCanvasViewportState(canvasState) {
    if (!canvasState) {
      return null;
    }

    return {
      zoom: canvasState.zoom || runtime.state.currentZoom || 1,
      panX: canvasState.panX || 0,
      panY: canvasState.panY || 0
    };
  }

  function getSplitViewportStates() {
    const states = {};
    Object.entries(runtime.state.canvasStatesByPane || {}).forEach(([paneId, canvasState]) => {
      const viewportState = getCanvasViewportState(canvasState);
      if (viewportState) {
        states[paneId] = viewportState;
      }
    });
    return states;
  }

  function ensureSplitPaneState(result) {
    if (!result || !result.behaviorTrees?.length) {
      return;
    }

    const treeMap = getTreeMap(result);
    const currentTreeId = treeMap.has(runtime.state.selectedTreeId) ? runtime.state.selectedTreeId : result.defaultTreeId;
    const paneTreeIds = {
      ...(runtime.state.splitPaneTreeIds || {})
    };

    if (!treeMap.has(paneTreeIds.left)) {
      paneTreeIds.left = currentTreeId;
    }
    if (!treeMap.has(paneTreeIds.right)) {
      paneTreeIds.right = pickNeighborTreeId(result, paneTreeIds.left);
    }

    runtime.state.splitPaneTreeIds = paneTreeIds;
    if (runtime.state.activeTreePane !== "right") {
      runtime.state.activeTreePane = "left";
    }

    const activeTreeId = paneTreeIds[runtime.state.activeTreePane] || paneTreeIds.left || result.defaultTreeId;
    runtime.state.selectedTreeId = treeMap.has(activeTreeId) ? activeTreeId : result.defaultTreeId;
    runtime.state.selectedNodePath = runtime.state.splitPaneNodePaths?.[runtime.state.activeTreePane] || runtime.state.selectedNodePath || "0";
  }

  function pickNeighborTreeId(result, treeId) {
    const treeIds = result.behaviorTrees.map((tree) => tree.id);
    if (treeIds.length === 0) {
      return null;
    }
    const currentIndex = Math.max(0, treeIds.indexOf(treeId));
    return treeIds.find((candidate) => candidate !== treeId) || treeIds[currentIndex] || treeIds[0];
  }

  function selectTreeInActivePane(treeId, result) {
    if (!runtime.state.splitViewEnabled) {
      runtime.state.selectedTreeId = treeId;
      runtime.state.selectedNodePath = "0";
      runtime.app.persistUiState();
      if (runtime.modeRules.isPlaybackMode()) {
        renderPlaybackLog({ ensureActiveTreeVisible: true, focusActiveNode: true, preserveViewport: true });
        return;
      }
      runtime.app.renderCurrentTree(result, { ensureActiveTreeVisible: true });
      return;
    }

    selectTreeInPane(runtime.state.activeTreePane, treeId, result);
  }

  function selectTreeInPane(paneId, treeId, result) {
    if (!result || !getTreeMap(result).has(treeId)) {
      return;
    }

    runtime.state.activeTreePane = paneId === "right" ? "right" : "left";
    runtime.state.splitPaneTreeIds = {
      ...(runtime.state.splitPaneTreeIds || {}),
      [runtime.state.activeTreePane]: treeId
    };
    runtime.state.splitPaneNodePaths = {
      ...(runtime.state.splitPaneNodePaths || {}),
      [runtime.state.activeTreePane]: "0"
    };
    runtime.state.selectedTreeId = treeId;
    runtime.state.selectedNodePath = "0";
    runtime.app.persistUiState();
    if (runtime.modeRules.isPlaybackMode()) {
      renderPlaybackLog({ ensureActiveTreeVisible: true, focusActiveNode: true, preserveViewport: true });
      return;
    }
    runtime.app.renderCurrentTree(result, { ensureActiveTreeVisible: true, preserveViewport: true });
  }

  function activateTreePane(paneId, treeId, nodePath) {
    if (!runtime.state.splitViewEnabled || !paneId) {
      if (treeId) {
        runtime.state.selectedTreeId = treeId;
      }
      if (nodePath) {
        runtime.state.selectedNodePath = nodePath;
      }
      return;
    }

    const normalizedPaneId = paneId === "right" ? "right" : "left";
    runtime.state.activeTreePane = normalizedPaneId;
    if (treeId) {
      runtime.state.splitPaneTreeIds = {
        ...(runtime.state.splitPaneTreeIds || {}),
        [normalizedPaneId]: treeId
      };
      runtime.state.selectedTreeId = treeId;
    }
    if (nodePath) {
      runtime.state.splitPaneNodePaths = {
        ...(runtime.state.splitPaneNodePaths || {}),
        [normalizedPaneId]: nodePath
      };
      runtime.state.selectedNodePath = nodePath;
    } else {
      runtime.state.selectedNodePath = runtime.state.splitPaneNodePaths?.[normalizedPaneId] || runtime.state.selectedNodePath || "0";
    }

    updateSplitPaneActiveState();
    runtime.treeSwitcher.updateActive?.();
    const activeCanvasState = runtime.state.canvasStatesByPane?.[normalizedPaneId];
    if (activeCanvasState) {
      runtime.viewport.activateCanvasState(activeCanvasState);
    }
  }

  function activateTreePaneByTreeId(treeId, nodePath) {
    if (!runtime.state.splitViewEnabled || !treeId) {
      if (treeId) {
        runtime.state.selectedTreeId = treeId;
      }
      if (nodePath) {
        runtime.state.selectedNodePath = nodePath;
      }
      return;
    }

    const paneEntry = Object.entries(runtime.state.splitPaneTreeIds || {}).find(([, paneTreeId]) => paneTreeId === treeId);
    const paneId = paneEntry?.[0] || runtime.state.activeTreePane || "left";
    activateTreePane(paneId, treeId, nodePath);
  }

  function updateSplitPaneActiveState() {
    document.querySelectorAll(".tree-split-pane").forEach((pane) => {
      const isActive = pane.dataset.paneId === runtime.state.activeTreePane;
      pane.classList.toggle("is-active", isActive);
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
      editModeEnabled: runtime.state.editModeEnabled,
      collapsedCatalogGroups: runtime.state.collapsedCatalogGroups,
      collapsedNodePickerGroups: runtime.state.collapsedNodePickerGroups,
      catalogWidth: runtime.state.catalogWidth,
      treeSwitcherScrollLeft: runtime.state.treeSwitcherScrollLeft,
      treeNavigationParents: runtime.state.treeNavigationParents,
      splitViewEnabled: runtime.state.splitViewEnabled,
      activeTreePane: runtime.state.activeTreePane,
      splitPaneTreeIds: runtime.state.splitPaneTreeIds,
      splitPaneNodePaths: runtime.state.splitPaneNodePaths,
      playbackFrameIndex: runtime.state.playbackFrameIndex,
      playbackLeftVisible: runtime.state.playbackLeftVisible,
      playbackRightVisible: runtime.state.playbackRightVisible,
      playbackLeftWidth: runtime.state.playbackLeftWidth,
      playbackRightWidth: runtime.state.playbackRightWidth,
      playbackTransitionFilter: runtime.state.playbackTransitionFilter,
      playbackTransitionScrollTop: runtime.state.playbackTransitionScrollTop || 0,
      playbackPlaybackSpeed: runtime.state.playbackPlaybackSpeed,
      playbackBlackboardFilter: runtime.state.playbackBlackboardFilter,
      playbackExpandedBlackboardKeys: Array.from(runtime.state.playbackExpandedBlackboardKeys || []),
      playbackBlackboardScrollTop: runtime.state.playbackBlackboardScrollTop || 0
    });
  }

  function getSelectedTree(result) {
    return getTreeMap(result).get(runtime.state.selectedTreeId) || null;
  }

  function pickNodePath(tree, preferredNodePath = runtime.state.selectedNodePath) {
    if (!tree?.node) {
      return runtime.state.currentSettings?.showBehaviorTreeRoot === false ? "0" : "__btree_root__";
    }
    if (preferredNodePath && findNodeByPath(tree.node, preferredNodePath)) {
      return preferredNodePath;
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
