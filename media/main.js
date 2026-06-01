(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const vscode = acquireVsCodeApi();
  const persistedState = vscode.getState() || {};
  const initialMode = window.BTreeToolInitialMode === "playback" ? "playback" : "edit";
  runtime.vscode = vscode;
  runtime.setNeutralDragImage = (event) => {
    const transfer = event?.dataTransfer;
    if (!transfer || typeof transfer.setDragImage !== "function") {
      return;
    }

    let dragImage = document.getElementById("btree-neutral-drag-image");
    if (!dragImage) {
      dragImage = document.createElement("div");
      dragImage.id = "btree-neutral-drag-image";
      dragImage.style.position = "fixed";
      dragImage.style.left = "-1000px";
      dragImage.style.top = "-1000px";
      dragImage.style.width = "1px";
      dragImage.style.height = "1px";
      dragImage.style.opacity = "0";
      dragImage.style.pointerEvents = "none";
      document.body.appendChild(dragImage);
    }

    transfer.setDragImage(dragImage, 0, 0);
  };
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
    playbackTimeUs: Number.isFinite(persistedState.playbackTimeUs) ? persistedState.playbackTimeUs : null,
    playbackLeftVisible: persistedState.playbackLeftVisible !== false,
    playbackRightVisible: persistedState.playbackRightVisible !== false,
    playbackRightTab: persistedState.playbackRightTab === "trace" || persistedState.playbackRightTab === "ai" ? "trace" : "blackboard",
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
    playbackDashboardBottomVisible: persistedState.playbackDashboardBottomVisible !== false,
    playbackDashboardBottomHeight: (runtime.viewport?.clampNumber || ((v, _min, _max, fallback) => fallback))(
      persistedState.playbackDashboardBottomHeight,
      180,
      720,
      320
    ),
    playbackDashboardLeftWidth: (runtime.viewport?.clampNumber || ((v, _min, _max, fallback) => fallback))(
      persistedState.playbackDashboardLeftWidth,
      240,
      960,
      520
    ),
    playbackDurationLaneHeight: (runtime.viewport?.clampNumber || ((v, _min, _max, fallback) => fallback))(
      persistedState.playbackDurationLaneHeight,
      18,
      72,
      42
    ),
    playbackDurationTimeScale: (runtime.viewport?.clampNumber || ((v, _min, _max, fallback) => fallback))(
      persistedState.playbackDurationTimeScale,
      0.5,
      12,
      1
    ),
    playbackDurationTaskPanelVisible: persistedState.playbackDurationTaskPanelVisible === true,
    playbackStatusByUid: {},
    playbackLatestTransitionByUid: {},
    playbackLastTerminalStatusByUid: {},
    playbackCurrentFrameTransitionKeys: new Set(),
    playbackUidByTreePath: {},
    playbackNodeLocationsByUid: {},
    playbackChildrenByUid: {},
    playbackDepthByUid: {},
    playbackTransitionFilter: persistedState.playbackTransitionFilter || "",
    playbackTransitionFilterDraft: persistedState.playbackTransitionFilterDraft || persistedState.playbackTransitionFilter || "",
    playbackTransitionScrollTop: Number.isFinite(persistedState.playbackTransitionScrollTop)
      ? persistedState.playbackTransitionScrollTop
      : 0,
    playbackBlackboardFilter: persistedState.playbackBlackboardFilter || "",
    playbackExpandedBlackboardKeys: new Set(persistedState.playbackExpandedBlackboardKeys || []),
    playbackBlackboardScrollTop: Number.isFinite(persistedState.playbackBlackboardScrollTop)
      ? persistedState.playbackBlackboardScrollTop
      : 0,
    traceConfig: null,
    traceMessages: [],
    tracePendingRequestId: "",
    tracePendingAnswer: "",
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
      allowUnclosedPlaybackLog: false,
      nodeAttributeLayout: "inline",
      editTreeRenderMode: "paged",
      playbackTreeRenderMode: "paged",
      playbackPanelLayout: "classic",
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
  const PLAYBACK_AUTO_ADVANCE_BASE_DELAY_MS = 20;
  const PLAYBACK_DURATION_MIN_VISIBLE_US = 1_000_000;
  const PLAYBACK_DURATION_MAX_VISIBLE_US = 30_000_000;
  const PLAYBACK_SPEED_OPTIONS = [
    { value: 0.1, label: "0.1x" },
    { value: 0.5, label: "0.5x" },
    { value: 1, label: "1.0x" },
    { value: 1.5, label: "1.5x" },
    { value: 2, label: "2.0x" },
    { value: 3, label: "3.0x" },
    { value: 5, label: "5.0x" },
    { value: 10, label: "10.0x" }
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
    catalogSearchButton: document.getElementById("catalog-search-button"),
    catalogList: document.getElementById("catalog-list"),
    catalogSearchInput: document.getElementById("catalog-search"),
    addNodeModelButton: document.getElementById("add-node-model"),
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
    stagePlaybackTransitionUidFilter,
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
      const previousLogPath = runtime.state.playbackLog?.filePath || "";
      runtime.state.playbackLog = message.payload || null;
      const nextLogPath = runtime.state.playbackLog?.filePath || "";
      if (previousLogPath !== nextLogPath) {
        clearTraceMessages();
      }
      runtime.state.playbackFrameIndex = 0;
      runtime.state.playbackTimeUs = getPlaybackFrameTimeUs(runtime.state.playbackLog, 0);
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
      clearTraceMessages();
      runtime.refs.treeContent.replaceChildren(emptyState(message.payload?.message || "Failed to load playback log."));
    }

    if (message?.type === "traceConfigState") {
      runtime.state.traceConfig = message.payload || null;
      const log = runtime.state.playbackLog;
      const snapshot = log ? buildCurrentPlaybackSnapshot(log) : null;
      updatePlaybackTracePanel(log, snapshot);
      return;
    }

    if (message?.type === "traceAnswer") {
      handleTraceAnswer(message.payload);
      return;
    }

    if (message?.type === "traceAnswerChunk") {
      handleTraceAnswerChunk(message.payload);
      return;
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
  runtime.refs.fileLabel?.addEventListener("click", () => {
    if (runtime.modeRules.isPlaybackMode()) {
      vscode.postMessage({ type: "choosePlaybackLogFile" });
    }
  });
  runtime.refs.fileLabel?.addEventListener("keydown", (event) => {
    if (!runtime.modeRules.isPlaybackMode() || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }
    event.preventDefault();
    vscode.postMessage({ type: "choosePlaybackLogFile" });
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
    updateFileLabelAction();

    runtime.overlays.hideAll?.();
    runtime.overlays.hideNodeContextMenu?.();
    runtime.overlays.hideCanvasContextMenu?.();
    runtime.canvas.clearDragState?.();

    updateBehaviorTreeCreateButton();
  }

  function updateFileLabelAction() {
    const label = runtime.refs.fileLabel;
    if (!label) {
      return;
    }

    const isPlaybackMode = runtime.modeRules.isPlaybackMode();
    label.classList.toggle("is-actionable", isPlaybackMode);
    if (isPlaybackMode) {
      label.tabIndex = 0;
      label.setAttribute("role", "button");
      label.title = runtime.i18n.getAppCopy().importPlaybackLog;
      label.setAttribute("aria-label", runtime.i18n.getAppCopy().importPlaybackLog);
    } else {
      label.removeAttribute("tabindex");
      label.removeAttribute("role");
      label.removeAttribute("title");
      label.removeAttribute("aria-label");
    }
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

  function getTreeRenderMode(scope) {
    const settings = runtime.state.currentSettings || {};
    if (scope === "playback") {
      return settings.playbackTreeRenderMode === "expanded" ? "expanded" : "paged";
    }
    return settings.editTreeRenderMode === "expanded" ? "expanded" : "paged";
  }

  function isExpandedTreeRenderMode(scope) {
    return getTreeRenderMode(scope) === "expanded";
  }

  function getPlaybackPanelLayout() {
    return runtime.state.currentSettings?.playbackPanelLayout === "dashboard" ? "dashboard" : "classic";
  }

  function isPlaybackTimeBasedMode() {
    return runtime.modeRules.isPlaybackMode() && getPlaybackPanelLayout() === "dashboard";
  }

  function getTreeRenderContext(result, scope) {
    if (!result || !isExpandedTreeRenderMode(scope)) {
      return {
        expanded: false,
        tree: result ? getSelectedTree(result) : null,
        renderResult: result,
        switcherResult: result,
        rootTreeId: runtime.state.selectedTreeId || result?.defaultTreeId || null
      };
    }

    const treeMap = getTreeMap(result);
    const rootTreeId = pickExpandedRenderRootTreeId(result, treeMap);
    const rootTree = rootTreeId ? treeMap.get(rootTreeId) || null : null;
    const expandedTree = rootTree ? buildExpandedRenderTree(rootTree, result, treeMap) : null;
    const switcherResult = expandedTree
      ? {
        ...result,
        defaultTreeId: expandedTree.id,
        mainTreeToExecute: expandedTree.id,
        behaviorTrees: [expandedTree]
      }
      : {
        ...result,
        behaviorTrees: []
      };

    return {
      expanded: true,
      tree: expandedTree,
      renderResult: result,
      switcherResult,
      rootTreeId
    };
  }

  function pickExpandedRenderRootTreeId(result, treeMap = getTreeMap(result)) {
    if (result?.defaultTreeId && treeMap.has(result.defaultTreeId)) {
      return result.defaultTreeId;
    }
    if (result?.mainTreeToExecute && treeMap.has(result.mainTreeToExecute)) {
      return result.mainTreeToExecute;
    }
    if (treeMap.has("MainTree")) {
      return "MainTree";
    }
    return result?.behaviorTrees?.[0]?.id || null;
  }

  function buildExpandedRenderTree(rootTree, result, treeMap = getTreeMap(result)) {
    return {
      ...rootTree,
      sourceTreeId: rootTree.id,
      expandedRenderTree: true,
      node: rootTree.node
        ? cloneExpandedRenderNode(rootTree.node, rootTree.id, treeMap, new Set([rootTree.id]), `${rootTree.id}::`)
        : null
    };
  }

  function cloneExpandedRenderNode(node, sourceTreeId, treeMap, treeStack, renderPrefix) {
    const renderPath = `${renderPrefix}${sourceTreeId}:${node.nodePath}`;
    const children = (node.children || []).map((child) =>
      cloneExpandedRenderNode(child, sourceTreeId, treeMap, treeStack, `${renderPath}/`)
    );
    const clone = {
      ...node,
      sourceTreeId,
      renderPath,
      children
    };

    if (node.kind !== "SubTree" || !node.targetTreeId) {
      return clone;
    }

    const targetTree = treeMap.get(node.targetTreeId);
    if (!targetTree?.node || treeStack.has(node.targetTreeId)) {
      return clone;
    }

    const nextStack = new Set(treeStack);
    nextStack.add(node.targetTreeId);
    const expandedChild = cloneExpandedRenderNode(targetTree.node, targetTree.id, treeMap, nextStack, `${renderPath}=>`);
    expandedChild.expandedSubtreeInjection = true;
    clone.children = [...children, expandedChild];
    return clone;
  }

  function ensureRenderSelection(renderContext) {
    if (!renderContext?.expanded || !renderContext.tree?.node) {
      return;
    }

    if (findRenderNodeByTreePath(renderContext.tree.node, runtime.state.selectedTreeId, runtime.state.selectedNodePath)) {
      return;
    }

    runtime.state.selectedTreeId = renderContext.rootTreeId;
    runtime.state.selectedNodePath = "0";
  }

  function findRenderNodeByTreePath(node, treeId, nodePath) {
    if (!node || !treeId || !nodePath) {
      return null;
    }
    if ((node.sourceTreeId || "") === treeId && node.nodePath === nodePath) {
      return node;
    }
    for (const child of node.children || []) {
      const match = findRenderNodeByTreePath(child, treeId, nodePath);
      if (match) {
        return match;
      }
    }
    return null;
  }

  function renderPlaybackLog(options = {}) {
    const log = runtime.state.playbackLog;
    if (!log?.preview) {
      renderPlaybackState();
      return;
    }
    const playbackCopy = runtime.i18n.getPlaybackCopy();
    const viewportState = options.preserveViewport && runtime.state.currentCanvasState
      ? getCanvasViewportState(runtime.state.currentCanvasState)
      : null;

    const frameCount = log.frames?.length || 0;
    runtime.state.playbackFrameIndex = clampInteger(runtime.state.playbackFrameIndex, 0, Math.max(0, frameCount - 1));
    runtime.state.playbackTimeUs = clampPlaybackTimeUs(
      log,
      runtime.state.playbackTimeUs ?? getPlaybackFrameTimeUs(log, runtime.state.playbackFrameIndex)
    );
    runtime.state.playbackPlaybackSpeed = normalizePlaybackSpeed(runtime.state.playbackPlaybackSpeed);
    const cache = getPlaybackCache(log);
    const playbackSnapshot = buildCurrentPlaybackSnapshot(log);
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

    if (getPlaybackPanelLayout() === "dashboard") {
      renderPlaybackDashboardLog(log, playbackSnapshot, playbackCopy);
      return;
    }

    const renderContext = getTreeRenderContext(log.preview, "playback");
    ensureRenderSelection(renderContext);
    runtime.treeSwitcher.render(renderContext.switcherResult, {
      ensureActiveVisible: options.ensureActiveTreeVisible === true,
      activeTreeId: renderContext.expanded ? renderContext.rootTreeId : undefined,
      selectResult: log.preview
    });
    const selectedTree = renderContext.tree;
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

    const leftPanel = renderPlaybackTransitionPanel(log, playbackCopy);
    const leftResizer = createPlaybackResizer("left");
    const center = document.createElement("div");
    center.className = "playback-canvas-pane";
    if (selectedTree) {
      if (!renderContext.expanded) {
        runtime.state.selectedNodePath = pickNodePath(selectedTree, runtime.state.selectedNodePath);
      }
      center.appendChild(runtime.canvas.renderTree(selectedTree, log.preview, viewportState, { playback: true }));
      runtime.mainTreeLocator.render(log.preview, selectedTree);
    } else {
      center.appendChild(emptyState(runtime.i18n.getAppCopy().selectedTreeNotFound));
      runtime.mainTreeLocator.clear();
    }
    const rightResizer = createPlaybackResizer("right");
    const rightPanel = renderPlaybackRightPanel(log, playbackSnapshot, playbackCopy);

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

  function renderPlaybackDashboardLog(log, playbackSnapshot, playbackCopy = runtime.i18n.getPlaybackCopy()) {
    runtime.refs.treeSwitcher.replaceChildren();
    runtime.mainTreeLocator.clear();
    runtime.state.currentCanvasState = null;

    const layout = document.createElement("div");
    layout.className = "playback-dashboard-layout";
    layout.style.setProperty("--playback-dashboard-bottom-height", `${runtime.state.playbackDashboardBottomHeight}px`);
    layout.style.setProperty("--playback-dashboard-left-width", `${runtime.state.playbackDashboardLeftWidth}px`);
    layout.classList.toggle("hide-bottom", runtime.state.playbackDashboardBottomVisible === false);

    const top = document.createElement("section");
    top.className = "playback-dashboard-top";
    top.appendChild(renderPlaybackDurationTimeline(log, playbackCopy));
    layout.appendChild(top);
    layout.appendChild(createPlaybackDashboardBottomToggle());

    if (runtime.state.playbackDashboardBottomVisible !== false) {
      layout.appendChild(createPlaybackDashboardResizer("bottom"));

      const blackboardPanel = document.createElement("section");
      blackboardPanel.className = "playback-dashboard-panel playback-dashboard-blackboard";
      blackboardPanel.appendChild(createPlaybackDashboardPanelHeader(playbackCopy.blackboard));
      blackboardPanel.appendChild(renderPlaybackBlackboardPanel(log, playbackSnapshot, playbackCopy));

      const tracePanel = document.createElement("section");
      tracePanel.className = "playback-dashboard-panel playback-dashboard-trace";
      tracePanel.appendChild(createPlaybackDashboardPanelHeader(getPlaybackTraceLabel(playbackCopy)));
      tracePanel.appendChild(renderPlaybackTracePanel(log, playbackSnapshot, playbackCopy));

      layout.appendChild(blackboardPanel);
      layout.appendChild(createPlaybackDashboardResizer("split"));
      layout.appendChild(tracePanel);
    }

    playbackDomCache = null;
    runtime.refs.treeContent.replaceChildren(layout);
    runtime.canvas.clearDragState();
    persistUiState();
    requestAnimationFrame(() => {
      syncPlaybackFrameUi(log, { scrollList: true, focusNode: false });
      if (runtime.state.playbackIsPlaying) {
        reschedulePlaybackAutoAdvance(log);
      }
    });
  }

  function createPlaybackDashboardPanelHeader(titleText) {
    const header = document.createElement("div");
    header.className = "playback-dashboard-panel-header";
    const title = document.createElement("strong");
    title.textContent = titleText;
    header.appendChild(title);
    return header;
  }

  function createPlaybackDashboardBottomToggle() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "playback-dashboard-bottom-toggle";
    const hidden = runtime.state.playbackDashboardBottomVisible === false;
    button.title = hidden ? "Show lower panels" : "Hide lower panels";
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", () => {
      runtime.state.playbackDashboardBottomVisible = runtime.state.playbackDashboardBottomVisible === false;
      renderPlaybackLog();
    });
    return button;
  }

  function createPlaybackDashboardResizer(kind) {
    const handle = document.createElement("div");
    handle.className = `panel-resizer playback-dashboard-resizer playback-dashboard-resizer-${kind}`;
    handle.addEventListener("pointerdown", (event) => {
      const layout = handle.closest(".playback-dashboard-layout");
      if (!layout) {
        return;
      }

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      const startBottomHeight = runtime.state.playbackDashboardBottomHeight;
      const startLeftWidth = runtime.state.playbackDashboardLeftWidth;
      const maxBottomHeight = Math.max(220, layout.clientHeight - 160);
      const maxLeftWidth = Math.max(260, layout.clientWidth - 260);
      let pendingClientX = startX;
      let pendingClientY = startY;
      let resizeFrame = 0;
      const resizeCursorClass = kind === "bottom" ? "is-resizing-rows" : "is-resizing-columns";

      const applyResize = () => {
        resizeFrame = 0;
        if (kind === "bottom") {
          const deltaY = startY - pendingClientY;
          runtime.state.playbackDashboardBottomHeight = runtime.viewport.clampNumber(
            startBottomHeight + deltaY,
            180,
            maxBottomHeight,
            startBottomHeight
          );
          layout.style.setProperty("--playback-dashboard-bottom-height", `${runtime.state.playbackDashboardBottomHeight}px`);
        } else {
          const deltaX = pendingClientX - startX;
          runtime.state.playbackDashboardLeftWidth = runtime.viewport.clampNumber(
            startLeftWidth + deltaX,
            240,
            maxLeftWidth,
            startLeftWidth
          );
          layout.style.setProperty("--playback-dashboard-left-width", `${runtime.state.playbackDashboardLeftWidth}px`);
        }
      };

      const scheduleResize = () => {
        if (resizeFrame) {
          return;
        }
        resizeFrame = requestAnimationFrame(applyResize);
      };

      handle.setPointerCapture(pointerId);
      document.body.classList.add("is-resizing-panels", resizeCursorClass);

      const onPointerMove = (moveEvent) => {
        pendingClientX = moveEvent.clientX;
        pendingClientY = moveEvent.clientY;
        scheduleResize();
      };

      const finish = () => {
        document.body.classList.remove("is-resizing-panels", resizeCursorClass);
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", finish);
        handle.removeEventListener("pointercancel", finish);
        if (resizeFrame) {
          cancelAnimationFrame(resizeFrame);
          applyResize();
        }
        persistUiState();
        try {
          handle.releasePointerCapture(pointerId);
        } catch (_error) {
          // Ignore stale pointer capture state.
        }
      };

      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    });
    return handle;
  }

  function renderPlaybackTransitionPanel(log, playbackCopy = runtime.i18n.getPlaybackCopy()) {
    const panel = document.createElement("aside");
    panel.className = "playback-side-panel playback-transition-panel";

    const header = document.createElement("div");
    header.className = "playback-panel-header";
    const title = document.createElement("strong");
    title.textContent = playbackCopy.transitions;
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
    filterInput.placeholder = playbackCopy.filterByNodeName;
    filterInput.spellcheck = false;
    filterInput.value = runtime.state.playbackTransitionFilterDraft || runtime.state.playbackTransitionFilter || "";
    filterInput.addEventListener("input", () => {
      runtime.state.playbackTransitionFilterDraft = filterInput.value;
      updatePlaybackTransitionFilterButtonState();
      persistUiState();
    });
    filterInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyPlaybackTransitionFilter(log);
      }
    });
    const menuIcon = document.createElement("button");
    menuIcon.type = "button";
    menuIcon.className = "canvas-btn icon-btn playback-transition-filter-button";
    menuIcon.title = playbackCopy.applyTransitionFilter || playbackCopy.filterByNodeName;
    menuIcon.setAttribute("aria-label", menuIcon.title);
    menuIcon.appendChild(createPlaybackTransitionFilterIcon());
    menuIcon.addEventListener("click", () => {
      applyPlaybackTransitionFilter(log);
    });
    filterRow.appendChild(filterInput);
    filterRow.appendChild(menuIcon);

    const table = document.createElement("div");
    table.className = "playback-transition-table";
    const tableHeader = document.createElement("div");
    tableHeader.className = "playback-transition-table-header";
    [
      playbackCopy.transitionColumns.time,
      playbackCopy.transitionColumns.nodeName,
      playbackCopy.transitionColumns.prev,
      playbackCopy.transitionColumns.status
    ].forEach((label) => {
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
    updatePlaybackTransitionFilterButtonState(panel);
    return panel;
  }

  function createPlaybackTransitionFilterIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M4 6h16v2H4V6Zm3 5h10v2H7v-2Zm3 5h4v2h-4v-2Z");
    svg.appendChild(path);
    return svg;
  }

  function applyPlaybackTransitionFilter(log) {
    runtime.state.playbackTransitionFilter = runtime.state.playbackTransitionFilterDraft || "";
    runtime.state.playbackTransitionScrollTop = 0;
    updatePlaybackTransitionRows(log);
    updatePlaybackTransitionCount(log);
    updatePlaybackActiveTransition(log, true);
    updatePlaybackTransitionFilterButtonState();
    persistUiState();
  }

  function stagePlaybackTransitionUidFilter(uid) {
    if (!runtime.modeRules.isPlaybackMode() || !uid) {
      return;
    }
    runtime.state.playbackTransitionFilterDraft = String(uid);
    const filterInput = document.querySelector(".playback-transition-filter");
    if (filterInput) {
      filterInput.value = runtime.state.playbackTransitionFilterDraft;
    }
    updatePlaybackTransitionFilterButtonState();
    persistUiState();
  }

  function updatePlaybackTransitionFilterButtonState(scope = document) {
    const input = scope.querySelector?.(".playback-transition-filter");
    const button = scope.querySelector?.(".playback-transition-filter-button");
    if (!input || !button) {
      return;
    }
    const draft = input.value || "";
    const active = runtime.state.playbackTransitionFilter || "";
    button.classList.toggle("is-pending", draft !== active);
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
    const activeTransitionIndex = getCurrentPlaybackActiveTransitionIndex(log);
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
      jumpToPlaybackTransition(log, transition);
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

  function jumpToPlaybackTransition(log, transition) {
    const options = {
      navigateToActiveNode: shouldAutoNavigatePlayback(),
      scrollList: true,
      focusNode: shouldAutoNavigatePlayback(),
      persist: true
    };
    if (isPlaybackTimeBasedMode()) {
      setPlaybackTime(log, transition.tUs, { ...options, updateBlackboard: true });
      return;
    }
    setPlaybackFrame(log, transition.frameIndex, options);
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

  function renderPlaybackRightPanel(log, snapshot, playbackCopy = runtime.i18n.getPlaybackCopy()) {
    const panel = document.createElement("aside");
    panel.className = "playback-side-panel playback-right-panel";
    panel.dataset.activeTab = normalizePlaybackRightTab(runtime.state.playbackRightTab);

    const header = document.createElement("div");
    header.className = "playback-panel-header playback-right-panel-header";

    const tabs = document.createElement("div");
    tabs.className = "playback-right-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.appendChild(createPlaybackRightTabButton("blackboard", playbackCopy.blackboard, panel));
    tabs.appendChild(createPlaybackRightTabButton("trace", getPlaybackTraceLabel(playbackCopy), panel));
    header.appendChild(tabs);

    const panels = document.createElement("div");
    panels.className = "playback-right-panels";

    const blackboardPanel = renderPlaybackBlackboardPanel(log, snapshot, playbackCopy);
    const tracePanel = renderPlaybackTracePanel(log, snapshot, playbackCopy);
    panels.appendChild(blackboardPanel);
    panels.appendChild(tracePanel);

    panel.appendChild(header);
    panel.appendChild(panels);
    updatePlaybackRightPanelTabs(panel);
    return panel;
  }

  function createPlaybackRightTabButton(tabId, label, panel) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "playback-right-tab-button";
    button.dataset.tabId = tabId;
    button.setAttribute("role", "tab");
    button.textContent = label;
    button.addEventListener("click", () => {
      setPlaybackRightTab(tabId, panel);
    });
    return button;
  }

  function renderPlaybackBlackboardPanel(log, snapshot, playbackCopy = runtime.i18n.getPlaybackCopy()) {
    const panel = document.createElement("section");
    panel.className = "playback-right-tab-panel playback-blackboard-panel";
    panel.dataset.playbackTab = "blackboard";

    const filterInputRow = document.createElement("div");
    filterInputRow.className = "playback-blackboard-filter-row";
    const filterInput = document.createElement("input");
    filterInput.className = "playback-blackboard-filter";
    filterInput.type = "search";
    filterInput.placeholder = playbackCopy.filterBlackboard;
    filterInput.spellcheck = false;
    filterInput.value = runtime.state.playbackBlackboardFilter || "";
    filterInput.addEventListener("input", () => {
      runtime.state.playbackBlackboardFilter = filterInput.value;
      updatePlaybackBlackboardPanel(log, buildCurrentPlaybackSnapshot(log));
      persistUiState();
    });
    const count = document.createElement("span");
    count.className = "playback-blackboard-count";
    count.textContent = formatBlackboardCount(snapshot);
    filterInputRow.appendChild(filterInput);
    filterInputRow.appendChild(count);

    panel.appendChild(filterInputRow);
    panel.appendChild(renderPlaybackBlackboardBody(log, snapshot, playbackCopy));
    panel.dataset.blackboardRenderKey = getPlaybackBlackboardRenderKey(snapshot);
    return panel;
  }

  function renderPlaybackBlackboardBody(log, snapshot, playbackCopy = runtime.i18n.getPlaybackCopy()) {
    const table = document.createElement("div");
    table.className = "playback-blackboard-table";

    const tableHeader = document.createElement("div");
    tableHeader.className = "playback-blackboard-table-header";
    [
      playbackCopy.blackboardColumns.key,
      playbackCopy.blackboardColumns.value
    ].forEach((label) => {
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
      empty.textContent = snapshot.latestBlackboardEvent
        ? playbackCopy.noMatchingBlackboardValues
        : playbackCopy.noBlackboardValuesBeforeFrame;
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

    function renderPlaybackTracePanel(log, snapshot, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      const panel = document.createElement("section");
      panel.className = "playback-right-tab-panel playback-trace-panel";
      panel.dataset.playbackTab = "trace";
      updatePlaybackTracePanel(log, snapshot, panel);
      return panel;
    }

  function updatePlaybackRightPanelTabs(panel = document.querySelector(".playback-right-panel")) {
    if (!panel) {
      return;
    }

    const activeTab = normalizePlaybackRightTab(runtime.state.playbackRightTab);
    runtime.state.playbackRightTab = activeTab;
    panel.dataset.activeTab = activeTab;

    panel.querySelectorAll(".playback-right-tab-button").forEach((button) => {
      const isActive = button.dataset.tabId === activeTab;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.setAttribute("tabindex", isActive ? "0" : "-1");
    });

    panel.querySelectorAll(".playback-right-tab-panel").forEach((tabPanel) => {
      const isActive = tabPanel.dataset.playbackTab === activeTab;
      tabPanel.hidden = !isActive;
    });
  }

  function setPlaybackRightTab(tabId, panel = null) {
    const nextTab = normalizePlaybackRightTab(tabId);
    if (runtime.state.playbackRightTab === nextTab) {
      updatePlaybackRightPanelTabs(panel || document.querySelector(".playback-right-panel"));
      return;
    }

    runtime.state.playbackRightTab = nextTab;
    updatePlaybackRightPanelTabs(panel || document.querySelector(".playback-right-panel"));
    persistUiState();
  }

  function normalizePlaybackRightTab(value) {
    return value === "trace" || value === "ai" ? "trace" : "blackboard";
  }

  function getPlaybackTraceLabel(playbackCopy = runtime.i18n.getPlaybackCopy()) {
    return playbackCopy.trace;
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

  function renderPlaybackDurationTimeline(log, playbackCopy = runtime.i18n.getPlaybackCopy()) {
    const panel = document.createElement("div");
    panel.className = "playback-duration-panel";
    panel.classList.toggle("hide-current-task-panel", runtime.state.playbackDurationTaskPanelVisible !== true);
    const main = document.createElement("div");
    main.className = "playback-duration-main";

    const controls = document.createElement("div");
    controls.className = "playback-duration-controls";

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.className = "canvas-btn icon-btn playback-play-btn";
    const iconKind = runtime.state.playbackIsPlaying ? "pause" : "play";
    playButton.replaceChildren(createPlaybackTransportIcon(iconKind));
    playButton.dataset.playbackIcon = iconKind;
    playButton.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      playButton.dataset.pointerActivated = "1";
      togglePlayback(log);
      window.setTimeout(() => {
        delete playButton.dataset.pointerActivated;
      }, 0);
    });
    playButton.addEventListener("click", (event) => {
      if (playButton.dataset.pointerActivated === "1") {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    const speedSelect = document.createElement("select");
    speedSelect.className = "playback-speed-select";
    speedSelect.setAttribute("aria-label", playbackCopy.playbackSpeed);
    speedSelect.title = playbackCopy.playbackSpeed;
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

    const prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.className = "canvas-btn icon-btn playback-step-btn";
    prevButton.textContent = "<";
    prevButton.title = playbackCopy.previousNodeStatusChange;
    bindPlaybackRepeatButton(prevButton, () => {
      stepPlaybackTransition(log, -1);
    });

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "canvas-btn icon-btn playback-step-btn";
    nextButton.textContent = ">";
    nextButton.title = playbackCopy.nextNodeStatusChange;
    bindPlaybackRepeatButton(nextButton, () => {
      stepPlaybackTransition(log, 1);
    });

    const heightControls = document.createElement("div");
    heightControls.className = "playback-duration-height-controls";
    const shrinkButton = document.createElement("button");
    shrinkButton.type = "button";
    shrinkButton.className = "canvas-btn icon-btn playback-duration-height-btn";
    shrinkButton.textContent = "-";
    shrinkButton.title = "Decrease track height";
    const growButton = document.createElement("button");
    growButton.type = "button";
    growButton.className = "canvas-btn icon-btn playback-duration-height-btn";
    growButton.textContent = "+";
    growButton.title = "Increase track height";
    heightControls.appendChild(shrinkButton);
    heightControls.appendChild(growButton);

    controls.appendChild(playButton);
    controls.appendChild(speedSelect);
    controls.appendChild(prevButton);
    controls.appendChild(nextButton);
    controls.appendChild(heightControls);

    const ruler = document.createElement("div");
    ruler.className = "playback-duration-ruler";
    const totalStart = document.createElement("span");
    totalStart.className = "playback-duration-total-start";
    const cursorTime = document.createElement("span");
    cursorTime.className = "playback-duration-cursor-time";
    const totalEnd = document.createElement("span");
    totalEnd.className = "playback-duration-total-end";
    ruler.appendChild(totalStart);
    ruler.appendChild(cursorTime);
    ruler.appendChild(totalEnd);

    const overview = document.createElement("div");
    overview.className = "playback-duration-overview";
    const overviewWindow = document.createElement("div");
    overviewWindow.className = "playback-duration-overview-window";
    const overviewCursor = document.createElement("div");
    overviewCursor.className = "playback-duration-overview-cursor";
    overviewCursor.title = playbackCopy.frame || "Frame";
    overviewCursor.setAttribute("role", "slider");
    overviewCursor.setAttribute("aria-label", overviewCursor.title);
    overview.appendChild(overviewWindow);
    overview.appendChild(overviewCursor);

    const axis = document.createElement("div");
    axis.className = "playback-duration-axis";
    const viewport = document.createElement("div");
    viewport.className = "playback-duration-viewport";
    const track = document.createElement("div");
    track.className = "playback-duration-track";

    const model = buildPlaybackDurationModel(log);
    bindPlaybackDurationOverviewCursor(overviewCursor, overview, log, model);
    track.style.width = `${model.trackWidth}px`;
    track.style.height = `${model.trackHeight}px`;
    track.style.setProperty("--playback-duration-lane-height", `${model.laneHeight}px`);
    track.style.setProperty("--playback-duration-block-height", `${model.blockHeight}px`);
    model.segments.forEach((segment) => {
      const item = document.createElement("div");
      item.className = `playback-duration-segment status-${normalizeStatusClass(segment.status)}`;
      item.dataset.playbackTreeId = segment.treeId ? String(segment.treeId) : "";
      item.dataset.playbackTaskId = segment.id ? String(segment.id) : "";
      item.dataset.playbackTaskSource = segment.source ? String(segment.source) : "";
      item.dataset.frameIndex = String(segment.frameIndex);
      item.dataset.playbackLane = String(segment.lane);
      item.dataset.segmentStart = String(segment.start);
      item.dataset.segmentEnd = String(segment.end);
      item.style.left = `${segment.leftPercent}%`;
      item.style.width = `${segment.widthPercent}%`;
      item.style.top = `${segment.laneTop}px`;
      item.title = segment.title;
      const label = document.createElement("span");
      label.className = "playback-duration-segment-label";
      label.textContent = segment.label;
      item.appendChild(label);
      track.appendChild(item);
    });

    const playhead = document.createElement("div");
    playhead.className = "playback-duration-playhead";
    playhead.title = playbackCopy.frame || "Frame";
    playhead.setAttribute("role", "slider");
    playhead.setAttribute("aria-label", playhead.title);
    bindPlaybackDurationPlayhead(playhead, viewport, log, model);
    track.appendChild(playhead);

    viewport.appendChild(track);
    viewport.addEventListener("scroll", () => {
      updatePlaybackDurationRangeLabels(log, model);
    }, { passive: true });
    bindPlaybackDurationOverviewWindow(overviewWindow, overview, viewport, log, model);
    shrinkButton.addEventListener("click", () => {
      adjustPlaybackDurationLaneHeight(viewport, log, model, -4);
    });
    growButton.addEventListener("click", () => {
      adjustPlaybackDurationLaneHeight(viewport, log, model, 4);
    });
    bindPlaybackDurationViewportInteractions(viewport, log, model);
    axis.appendChild(viewport);
    const windowRuler = document.createElement("div");
    windowRuler.className = "playback-duration-window-ruler";
    const windowStart = document.createElement("span");
    windowStart.className = "playback-duration-window-start";
    const windowEnd = document.createElement("span");
    windowEnd.className = "playback-duration-window-end";
    windowRuler.appendChild(windowStart);
    windowRuler.appendChild(windowEnd);
    main.appendChild(controls);
    main.appendChild(ruler);
    main.appendChild(overview);
    main.appendChild(axis);
    main.appendChild(windowRuler);
    panel.appendChild(main);
    panel.appendChild(renderPlaybackCurrentTaskPanel(log, model, playbackCopy));
    requestAnimationFrame(() => {
      applyPlaybackDurationTrackWidth(viewport, log, model, getClampedPlaybackDurationTrackWidth(viewport, model, model.trackWidth));
    });
    syncPlaybackDurationTimeline(log, model);
    return panel;
  }

  function renderPlaybackCurrentTaskPanel(log, model, playbackCopy = runtime.i18n.getPlaybackCopy()) {
    const panel = document.createElement("aside");
    panel.className = "playback-duration-task-panel";
    const header = document.createElement("div");
    header.className = "playback-duration-task-header";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "canvas-btn icon-btn playback-duration-task-toggle";
    toggle.textContent = runtime.state.playbackDurationTaskPanelVisible === true ? ">" : "<";
    toggle.title = runtime.state.playbackDurationTaskPanelVisible === true
      ? playbackCopy.hideCurrentTasks
      : playbackCopy.showCurrentTasks;
    toggle.setAttribute("aria-label", toggle.title);
    toggle.addEventListener("click", () => {
      runtime.state.playbackDurationTaskPanelVisible = runtime.state.playbackDurationTaskPanelVisible !== true;
      document.querySelector(".playback-duration-panel")?.classList.toggle(
        "hide-current-task-panel",
        runtime.state.playbackDurationTaskPanelVisible !== true
      );
      toggle.textContent = runtime.state.playbackDurationTaskPanelVisible === true ? ">" : "<";
      toggle.title = runtime.state.playbackDurationTaskPanelVisible === true
        ? playbackCopy.hideCurrentTasks
        : playbackCopy.showCurrentTasks;
      toggle.setAttribute("aria-label", toggle.title);
      updatePlaybackCurrentTaskPanel(log, model);
      persistUiState();
    });
    const title = document.createElement("strong");
    title.textContent = playbackCopy.currentTasks;
    const count = document.createElement("span");
    count.className = "playback-duration-task-count";
    header.appendChild(toggle);
    header.appendChild(title);
    header.appendChild(count);
    const list = document.createElement("div");
    list.className = "playback-duration-task-list";
    panel.appendChild(header);
    panel.appendChild(list);
    return panel;
  }

  function buildPlaybackDurationModel(log) {
    const laneHeight = getPlaybackDurationLaneHeight();
    const blockHeight = getPlaybackDurationBlockHeight(laneHeight);
    const model = runtime.playbackTimelineTasks.buildPlaybackDurationModel(log, { laneHeight, blockHeight });
    return {
      ...model,
      trackWidth: getPlaybackDurationTrackWidth(model.total)
    };
  }

  function getPlaybackDurationLaneHeight() {
    return runtime.viewport.clampNumber(runtime.state.playbackDurationLaneHeight, 18, 72, 42);
  }

  function getPlaybackDurationBlockHeight(laneHeight = getPlaybackDurationLaneHeight()) {
    return runtime.viewport.clampNumber(laneHeight - 10, 10, 64, 32);
  }

  function getPlaybackDurationTimeScale() {
    return runtime.viewport.clampNumber(runtime.state.playbackDurationTimeScale, 0.5, 12, 1);
  }

  function getPlaybackDurationTrackWidth(total) {
    const baseWidth = Math.max(960, Math.ceil((Math.max(1, total) / 1000) * 0.12));
    return Math.max(480, Math.min(40000, Math.round(baseWidth * getPlaybackDurationTimeScale())));
  }

  function getPlaybackDurationTrackWidthBounds(viewport, model) {
    const viewportWidth = Math.max(1, viewport?.clientWidth || 960);
    const total = Math.max(1, model.total);
    const maxVisible = Math.min(total, PLAYBACK_DURATION_MAX_VISIBLE_US);
    const minVisible = Math.min(total, PLAYBACK_DURATION_MIN_VISIBLE_US);
    const minWidth = Math.max(viewportWidth, Math.ceil((viewportWidth * total) / Math.max(1, maxVisible)));
    const maxWidth = Math.max(minWidth, Math.ceil((viewportWidth * total) / Math.max(1, minVisible)));
    return { minWidth, maxWidth };
  }

  function getClampedPlaybackDurationTrackWidth(viewport, model, width) {
    const { minWidth, maxWidth } = getPlaybackDurationTrackWidthBounds(viewport, model);
    return runtime.viewport.clampNumber(width, minWidth, maxWidth, minWidth);
  }

  function syncPlaybackDurationTimeline(log, model = null) {
    const track = document.querySelector(".playback-duration-track");
    const playhead = document.querySelector(".playback-duration-playhead");
    if (!track && !playhead) {
      return;
    }

    const durationModel = model || buildPlaybackDurationModel(log);
    const tUs = getCurrentPlaybackTimeUs(log, durationModel);
    const progress = clampNumber(((tUs - durationModel.firstTime) / durationModel.total) * 100, 0, 100);
    track?.style.setProperty("--playback-duration-progress", `${progress}%`);
    if (playhead) {
      playhead.setAttribute("aria-valuemin", formatTransitionTime(log, durationModel.firstTime));
      playhead.setAttribute("aria-valuemax", formatTransitionTime(log, durationModel.firstTime + durationModel.total));
      playhead.setAttribute("aria-valuenow", formatTransitionTime(log, tUs));
    }

    updatePlaybackCurrentTaskPanel(log, durationModel, tUs);
    updatePlaybackDurationRangeLabels(log, durationModel);
    syncPlaybackDurationSegmentLabels(durationModel);
  }

  function updatePlaybackCurrentTaskPanel(log, model, currentTime = getCurrentPlaybackTimeUs(log, model)) {
    const taskPanel = document.querySelector(".playback-duration-task-panel");
    const list = taskPanel?.querySelector(".playback-duration-task-list");
    const count = taskPanel?.querySelector(".playback-duration-task-count");
    if (!taskPanel || !list || !count) {
      return;
    }

    const activeTasks = (model.segments || []).filter((segment) =>
      isPlaybackDurationSegmentAtTime(model, segment, currentTime)
    );
    count.textContent = String(activeTasks.length);
    if (runtime.state.playbackDurationTaskPanelVisible !== true) {
      list.replaceChildren();
      return;
    }

    if (activeTasks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "playback-duration-task-empty";
      empty.textContent = runtime.i18n.getPlaybackCopy().noCurrentTasks;
      list.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    activeTasks.forEach((task) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "playback-duration-task-item";
      item.title = task.title || task.label;
      item.addEventListener("click", () => {
        centerPlaybackDurationViewportOnTime(log, model, task.start);
      });
      const name = document.createElement("strong");
      name.textContent = task.label;
      const time = document.createElement("span");
      time.textContent = `${formatPlaybackTimelineClock(log, task.start)} - ${formatPlaybackTimelineClock(log, task.end)}`;
      item.appendChild(name);
      item.appendChild(time);
      fragment.appendChild(item);
    });
    list.replaceChildren(fragment);
  }

  function isPlaybackDurationSegmentAtTime(model, segment, currentTime) {
    const start = Number(segment.start);
    const end = Number(segment.end);
    const time = Number(currentTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(time)) {
      return false;
    }
    if (time >= start && time <= end) {
      return true;
    }

    const visualStartPercent = Number(segment.leftPercent);
    const visualWidthPercent = Number(segment.widthPercent);
    if (!Number.isFinite(visualStartPercent) || !Number.isFinite(visualWidthPercent) || visualWidthPercent <= 0) {
      return false;
    }
    const visualStart = model.firstTime + (visualStartPercent / 100) * model.total;
    const visualEnd = model.firstTime + ((visualStartPercent + visualWidthPercent) / 100) * model.total;
    return time >= visualStart && time <= visualEnd;
  }

  function bindPlaybackDurationPlayhead(playhead, viewport, log, model) {
    let activePointerId = null;
    let latestClientX = 0;
    let dragFrame = 0;

    const timeFromClientX = (clientX) => {
      const track = viewport.querySelector(".playback-duration-track");
      const rect = track?.getBoundingClientRect();
      if (!rect || rect.width <= 0) {
        return getCurrentPlaybackTimeUs(log, model);
      }
      const offsetX = clampNumber(clientX - rect.left, 0, rect.width);
      return clampPlaybackTimeUs(log, model.firstTime + (offsetX / rect.width) * model.total);
    };

    const applyDrag = (persist) => {
      dragFrame = 0;
      scrollPlaybackDurationViewportNearEdge(viewport, latestClientX);
      const tUs = timeFromClientX(latestClientX);
      const options = {
        navigateToActiveNode: false,
        scrollList: false,
        focusNode: false,
        persist,
        updateBlackboard: true
      };
      if (persist) {
        setPlaybackTime(log, tUs, options);
      } else {
        requestPlaybackTime(log, tUs, options);
      }
    };

    const scheduleDrag = () => {
      if (dragFrame) {
        return;
      }
      dragFrame = requestAnimationFrame(() => applyDrag(false));
    };

    const finish = (commit = true) => {
      if (activePointerId === null) {
        return;
      }
      if (dragFrame) {
        cancelAnimationFrame(dragFrame);
        dragFrame = 0;
      }
      if (commit) {
        applyDrag(true);
      }
      document.body.classList.remove("is-dragging-playback-playhead");
      try {
        playhead.releasePointerCapture(activePointerId);
      } catch (_error) {
        // Ignore stale pointer capture state.
      }
      activePointerId = null;
    };

    playhead.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      latestClientX = event.clientX;
      activePointerId = event.pointerId;
      document.body.classList.add("is-dragging-playback-playhead");
      try {
        playhead.setPointerCapture(event.pointerId);
      } catch (_error) {
        // Dragging still works in hosts without pointer capture.
      }
      applyDrag(false);
    });

    playhead.addEventListener("pointermove", (event) => {
      if (activePointerId === null || event.pointerId !== activePointerId) {
        return;
      }
      if ((event.buttons & 1) !== 1) {
        finish(false);
        return;
      }
      latestClientX = event.clientX;
      scheduleDrag();
    });
    playhead.addEventListener("pointerup", (event) => {
      if (activePointerId !== null && event.pointerId !== activePointerId) {
        return;
      }
      finish();
    });
    playhead.addEventListener("pointercancel", () => finish(false));
    playhead.addEventListener("lostpointercapture", () => finish(false));
  }

  function scrollPlaybackDurationViewportNearEdge(viewport, clientX) {
    const rect = viewport.getBoundingClientRect();
    const edgeSize = 28;
    const maxStep = 56;
    if (clientX > rect.right - edgeSize) {
      viewport.scrollLeft += Math.min(maxStep, Math.max(1, clientX - rect.right + edgeSize));
    } else if (clientX < rect.left + edgeSize) {
      viewport.scrollLeft -= Math.min(maxStep, Math.max(1, rect.left + edgeSize - clientX));
    }
  }

  function bindPlaybackDurationOverviewCursor(cursor, overview, log, model) {
    let activePointerId = null;
    let startClientX = 0;
    let latestClientX = 0;
    let dragFrame = 0;
    let didDrag = false;
    const dragThreshold = 3;

    const timeFromClientX = (clientX) => {
      const rect = overview.getBoundingClientRect();
      if (!rect || rect.width <= 0) {
        return getCurrentPlaybackTimeUs(log, model);
      }
      const ratio = clampNumber((clientX - rect.left) / rect.width, 0, 1);
      return clampPlaybackTimeUs(log, model.firstTime + ratio * model.total);
    };

    const applyDrag = (persist) => {
      dragFrame = 0;
      const tUs = timeFromClientX(latestClientX);
      const options = {
        navigateToActiveNode: false,
        scrollList: false,
        focusNode: false,
        persist,
        updateBlackboard: true
      };
      if (persist) {
        setPlaybackTime(log, tUs, options);
      } else {
        requestPlaybackTime(log, tUs, options);
      }
    };

    const scheduleDrag = () => {
      if (dragFrame) {
        return;
      }
      dragFrame = requestAnimationFrame(() => applyDrag(false));
    };

    const finish = (commit = true) => {
      if (activePointerId === null) {
        return;
      }
      if (dragFrame) {
        cancelAnimationFrame(dragFrame);
        dragFrame = 0;
      }
      if (commit && didDrag) {
        applyDrag(true);
      } else if (commit) {
        centerPlaybackDurationViewportOnTime(log, model, getCurrentPlaybackTimeUs(log, model));
      }
      document.body.classList.remove("is-dragging-playback-playhead");
      try {
        cursor.releasePointerCapture(activePointerId);
      } catch (_error) {
        // Ignore stale pointer capture state.
      }
      activePointerId = null;
      didDrag = false;
    };

    cursor.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      startClientX = event.clientX;
      latestClientX = event.clientX;
      activePointerId = event.pointerId;
      try {
        cursor.setPointerCapture(event.pointerId);
      } catch (_error) {
        // Dragging still works in hosts without pointer capture.
      }
    });

    cursor.addEventListener("pointermove", (event) => {
      if (activePointerId === null || event.pointerId !== activePointerId) {
        return;
      }
      if ((event.buttons & 1) !== 1) {
        finish(false);
        return;
      }
      latestClientX = event.clientX;
      if (!didDrag) {
        if (Math.abs(latestClientX - startClientX) < dragThreshold) {
          return;
        }
        didDrag = true;
        document.body.classList.add("is-dragging-playback-playhead");
      }
      scheduleDrag();
    });
    cursor.addEventListener("pointerup", (event) => {
      if (activePointerId !== null && event.pointerId !== activePointerId) {
        return;
      }
      finish();
    });
    cursor.addEventListener("pointercancel", () => finish(false));
    cursor.addEventListener("lostpointercapture", () => finish(false));
  }

  function bindPlaybackDurationOverviewWindow(windowEl, overview, viewport, log, model) {
    let activePointerId = null;
    let startClientX = 0;
    let startScrollLeft = 0;
    let latestClientX = 0;
    let panFrame = 0;

    const applyPan = () => {
      panFrame = 0;
      const rect = overview.getBoundingClientRect();
      const track = viewport.querySelector(".playback-duration-track");
      const trackWidth = Math.max(1, track?.scrollWidth || model.trackWidth || 1);
      if (!rect || rect.width <= 0) {
        return;
      }
      viewport.scrollLeft = startScrollLeft + ((latestClientX - startClientX) / rect.width) * trackWidth;
      updatePlaybackDurationRangeLabels(log, model);
      syncPlaybackDurationSegmentLabels(model);
    };

    const schedulePan = () => {
      if (panFrame) {
        return;
      }
      panFrame = requestAnimationFrame(applyPan);
    };

    const finish = () => {
      if (activePointerId === null) {
        return;
      }
      if (panFrame) {
        cancelAnimationFrame(panFrame);
        applyPan();
      }
      document.body.classList.remove("is-panning-playback-duration");
      try {
        windowEl.releasePointerCapture(activePointerId);
      } catch (_error) {
        // Ignore stale pointer capture state.
      }
      activePointerId = null;
    };

    windowEl.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      activePointerId = event.pointerId;
      startClientX = event.clientX;
      latestClientX = event.clientX;
      startScrollLeft = viewport.scrollLeft;
      document.body.classList.add("is-panning-playback-duration");
      try {
        windowEl.setPointerCapture(event.pointerId);
      } catch (_error) {
        // Dragging still works in hosts without pointer capture.
      }
    });

    windowEl.addEventListener("pointermove", (event) => {
      if (activePointerId === null || event.pointerId !== activePointerId) {
        return;
      }
      if ((event.buttons & 1) !== 1) {
        finish();
        return;
      }
      latestClientX = event.clientX;
      schedulePan();
    });
    windowEl.addEventListener("pointerup", (event) => {
      if (activePointerId !== null && event.pointerId !== activePointerId) {
        return;
      }
      finish();
    });
    windowEl.addEventListener("pointercancel", finish);
    windowEl.addEventListener("lostpointercapture", finish);
  }

  function getCurrentPlaybackTimeUs(log, model) {
    return clampPlaybackTimeUs(log, runtime.state.playbackTimeUs ?? model?.firstTime ?? 0);
  }

  function centerPlaybackDurationViewportOnTime(log, model, tUs) {
    const viewport = document.querySelector(".playback-duration-viewport");
    const track = document.querySelector(".playback-duration-track");
    if (!viewport || !track) {
      return;
    }
    const trackWidth = Math.max(1, track.scrollWidth || model.trackWidth || 1);
    const ratio = clampNumber((Number(tUs) - model.firstTime) / model.total, 0, 1);
    viewport.scrollLeft = Math.max(0, ratio * trackWidth - viewport.clientWidth / 2);
    updatePlaybackDurationRangeLabels(log, model);
    syncPlaybackDurationSegmentLabels(model);
  }

  function bindPlaybackDurationViewportInteractions(viewport, log, model) {
    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;
    let panFrame = 0;
    let latestClientX = 0;
    let latestClientY = 0;

    const applyPan = () => {
      panFrame = 0;
      viewport.scrollLeft = startScrollLeft - (latestClientX - startX);
      viewport.scrollTop = startScrollTop - (latestClientY - startY);
      updatePlaybackDurationRangeLabels(log, model);
      syncPlaybackDurationSegmentLabels(model);
    };

    const schedulePan = () => {
      if (panFrame) {
        return;
      }
      panFrame = requestAnimationFrame(applyPan);
    };

    const finishPan = () => {
      if (activePointerId === null) {
        return;
      }
      if (panFrame) {
        cancelAnimationFrame(panFrame);
        applyPan();
      }
      document.body.classList.remove("is-panning-playback-duration");
      try {
        viewport.releasePointerCapture(activePointerId);
      } catch (_error) {
        // Ignore stale pointer capture state.
      }
      activePointerId = null;
    };

    viewport.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      if (event.target?.closest?.(".playback-duration-playhead")) {
        return;
      }
      event.preventDefault();
      activePointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      latestClientX = event.clientX;
      latestClientY = event.clientY;
      startScrollLeft = viewport.scrollLeft;
      startScrollTop = viewport.scrollTop;
      document.body.classList.add("is-panning-playback-duration");
      try {
        viewport.setPointerCapture(event.pointerId);
      } catch (_error) {
        // Dragging still works in hosts without pointer capture.
      }
    });

    viewport.addEventListener("pointermove", (event) => {
      if (activePointerId === null || event.pointerId !== activePointerId) {
        return;
      }
      if ((event.buttons & 1) !== 1) {
        finishPan();
        return;
      }
      latestClientX = event.clientX;
      latestClientY = event.clientY;
      schedulePan();
    });
    viewport.addEventListener("pointerup", (event) => {
      if (activePointerId !== null && event.pointerId !== activePointerId) {
        return;
      }
      finishPan();
    });
    viewport.addEventListener("pointercancel", finishPan);
    viewport.addEventListener("lostpointercapture", finishPan);
    viewport.addEventListener("wheel", (event) => {
      if (!event.deltaY) {
        return;
      }
      event.preventDefault();
      const current = getPlaybackDurationTimeScale();
      const rect = viewport.getBoundingClientRect();
      const anchorX = clampNumber(event.clientX - rect.left, 0, Math.max(1, rect.width));
      const oldTrackWidth = Math.max(1, model.trackWidth);
      const anchorRatio = clampNumber((viewport.scrollLeft + anchorX) / oldTrackWidth, 0, 1);
      const requestedWidth = oldTrackWidth * (event.deltaY > 0 ? 0.88 : 1.14);
      const nextWidth = getClampedPlaybackDurationTrackWidth(viewport, model, requestedWidth);
      if (Math.abs(nextWidth - oldTrackWidth) < 1) {
        return;
      }
      applyPlaybackDurationTrackWidth(viewport, log, model, nextWidth, anchorRatio, anchorX);
      persistUiState();
    }, { passive: false });
  }

  function adjustPlaybackDurationLaneHeight(viewport, log, model, delta) {
    const current = getPlaybackDurationLaneHeight();
    const next = runtime.viewport.clampNumber(current + delta, 18, 72, 42);
    if (next === current) {
      return;
    }
    runtime.state.playbackDurationLaneHeight = next;
    applyPlaybackDurationLaneHeight(viewport, log, model, next);
    persistUiState();
  }

  function applyPlaybackDurationLaneHeight(viewport, log, model, laneHeight) {
    const track = viewport.querySelector(".playback-duration-track");
    if (!track) {
      return;
    }
    const blockHeight = getPlaybackDurationBlockHeight(laneHeight);
    model.laneHeight = laneHeight;
    model.blockHeight = blockHeight;
    model.trackHeight = Math.max(96, model.laneCount * laneHeight);
    track.style.height = `${model.trackHeight}px`;
    track.style.setProperty("--playback-duration-lane-height", `${laneHeight}px`);
    track.style.setProperty("--playback-duration-block-height", `${blockHeight}px`);
    track.querySelectorAll(".playback-duration-segment").forEach((segment) => {
      const lane = Number(segment.dataset.playbackLane);
      if (Number.isFinite(lane)) {
        segment.style.top = `${lane * laneHeight}px`;
      }
    });
    updatePlaybackDurationRangeLabels(log, model);
    syncPlaybackDurationSegmentLabels(model);
  }

  function applyPlaybackDurationTrackWidth(viewport, log, model, width, anchorRatio = null, anchorX = null) {
    const track = viewport.querySelector(".playback-duration-track");
    if (!track) {
      return;
    }
    const previousTrackWidth = Math.max(1, model.trackWidth);
    const resolvedAnchorRatio = anchorRatio ?? clampNumber((viewport.scrollLeft + viewport.clientWidth / 2) / previousTrackWidth, 0, 1);
    const resolvedAnchorX = anchorX ?? viewport.clientWidth / 2;
    model.trackWidth = getClampedPlaybackDurationTrackWidth(viewport, model, width);
    track.style.width = `${model.trackWidth}px`;
    runtime.state.playbackDurationTimeScale = model.trackWidth / Math.max(1, model.baseTrackWidth || 1);
    viewport.scrollLeft = Math.max(0, resolvedAnchorRatio * model.trackWidth - resolvedAnchorX);
    updatePlaybackDurationRangeLabels(log, model);
    syncPlaybackDurationSegmentLabels(model);
  }

  function findPlaybackFrameIndexAtTime(log, tUs) {
    const frames = log.frames || [];
    if (frames.length === 0) {
      return 0;
    }
    const target = Number(tUs);
    if (!Number.isFinite(target)) {
      return runtime.state.playbackFrameIndex;
    }

    let left = 0;
    let right = frames.length - 1;
    let match = 0;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const time = Number(frames[mid]?.tUs);
      if (time <= target) {
        match = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    const next = Math.min(frames.length - 1, match + 1);
    const currentDelta = Math.abs(Number(frames[match]?.tUs) - target);
    const nextDelta = Math.abs(Number(frames[next]?.tUs) - target);
    return nextDelta < currentDelta ? next : match;
  }

  function findPlaybackFrameIndexAtOrBeforeTime(log, tUs) {
    const frames = log.frames || [];
    if (frames.length === 0) {
      return 0;
    }
    const target = Number(tUs);
    if (!Number.isFinite(target)) {
      return runtime.state.playbackFrameIndex;
    }
    let left = 0;
    let right = frames.length - 1;
    let match = 0;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const time = Number(frames[mid]?.tUs);
      if (!Number.isFinite(time) || time <= target) {
        match = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return match;
  }

  function getPlaybackFrameTimeUs(log, frameIndex) {
    const frames = log?.frames || [];
    const frame = frames[clampInteger(frameIndex, 0, Math.max(0, frames.length - 1))] || null;
    return Number.isFinite(Number(frame?.tUs)) ? Number(frame.tUs) : getPlaybackFirstTimeUs(log);
  }

  function getPlaybackFirstTimeUs(log) {
    const first = Number(log?.frames?.[0]?.tUs ?? log?.transitions?.[0]?.tUs ?? 0);
    return Number.isFinite(first) ? first : 0;
  }

  function getPlaybackLastTimeUs(log) {
    const frames = log?.frames || [];
    const transitions = log?.transitions || [];
    const last = Number(
      frames[frames.length - 1]?.tUs
      ?? transitions[transitions.length - 1]?.tUs
      ?? getPlaybackFirstTimeUs(log)
    );
    return Number.isFinite(last) ? last : getPlaybackFirstTimeUs(log);
  }

  function clampPlaybackTimeUs(log, tUs) {
    const first = getPlaybackFirstTimeUs(log);
    const last = Math.max(first, getPlaybackLastTimeUs(log));
    return clampNumber(Number(tUs), first, last);
  }

  function updatePlaybackDurationRangeLabels(log, model) {
    const viewport = document.querySelector(".playback-duration-viewport");
    const track = document.querySelector(".playback-duration-track");
    const totalStartLabel = document.querySelector(".playback-duration-total-start");
    const cursorLabel = document.querySelector(".playback-duration-cursor-time");
    const totalEndLabel = document.querySelector(".playback-duration-total-end");
    const windowStartLabel = document.querySelector(".playback-duration-window-start");
    const windowEndLabel = document.querySelector(".playback-duration-window-end");
    const overviewWindow = document.querySelector(".playback-duration-overview-window");
    const overviewCursor = document.querySelector(".playback-duration-overview-cursor");
    if (!viewport || !track || !totalStartLabel || !cursorLabel || !totalEndLabel || !windowStartLabel || !windowEndLabel) {
      return;
    }

    const trackWidth = Math.max(1, track.scrollWidth || model.trackWidth || 1);
    const visibleStart = model.firstTime + clampNumber(viewport.scrollLeft / trackWidth, 0, 1) * model.total;
    const visibleEnd = model.firstTime + clampNumber((viewport.scrollLeft + viewport.clientWidth) / trackWidth, 0, 1) * model.total;
    const currentTime = getCurrentPlaybackTimeUs(log, model);
    totalStartLabel.textContent = formatPlaybackTimelineClock(log, model.firstTime);
    cursorLabel.textContent = formatPlaybackTimelineClock(log, currentTime);
    totalEndLabel.textContent = formatPlaybackTimelineClock(log, model.firstTime + model.total);
    windowStartLabel.textContent = formatPlaybackTimelineClock(log, visibleStart);
    windowEndLabel.textContent = formatPlaybackTimelineClock(log, visibleEnd);
    if (overviewWindow) {
      overviewWindow.style.left = `${clampNumber((visibleStart - model.firstTime) / model.total, 0, 1) * 100}%`;
      overviewWindow.style.width = `${clampNumber((visibleEnd - visibleStart) / model.total, 0, 1) * 100}%`;
    }
    if (overviewCursor) {
      overviewCursor.style.left = `${clampNumber((currentTime - model.firstTime) / model.total, 0, 1) * 100}%`;
    }
    syncPlaybackDurationSegmentLabels(model);
  }

  function syncPlaybackDurationSegmentLabels(model) {
    const viewport = document.querySelector(".playback-duration-viewport");
    const track = document.querySelector(".playback-duration-track");
    if (!viewport || !track) {
      return;
    }

    const trackWidth = Math.max(1, track.scrollWidth || model.trackWidth || 1);
    track.querySelectorAll(".playback-duration-segment").forEach((segment) => {
      const label = segment.querySelector(".playback-duration-segment-label");
      if (!label) {
        return;
      }
      const segmentStart = Number(segment.dataset.segmentStart);
      const segmentEnd = Number(segment.dataset.segmentEnd);
      if (!Number.isFinite(segmentStart) || !Number.isFinite(segmentEnd)) {
        return;
      }
      const segmentLeft = Number.isFinite(segment.offsetLeft)
        ? segment.offsetLeft
        : ((segmentStart - model.firstTime) / model.total) * trackWidth;
      const segmentWidth = Math.max(
        0,
        segment.offsetWidth || ((segmentEnd - segmentStart) / model.total) * trackWidth
      );
      const padding = 6;
      const rawOffset = viewport.scrollLeft - segmentLeft + padding;
      const maxOffset = Math.max(0, segmentWidth - label.offsetWidth - padding * 2);
      const offset = clampNumber(rawOffset, 0, maxOffset);
      label.style.transform = `translateX(${offset}px)`;
    });
  }

  function renderPlaybackTimeline(log) {
    const playbackCopy = runtime.i18n.getPlaybackCopy();
    const footer = document.createElement("div");
    footer.className = "playback-timeline";

    const leftControls = document.createElement("div");
    leftControls.className = "playback-timeline-group playback-timeline-group-left";

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.className = "canvas-btn icon-btn playback-play-btn";
    playButton.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      playButton.dataset.pointerActivated = "1";
      togglePlayback(log);
      window.setTimeout(() => {
        delete playButton.dataset.pointerActivated;
      }, 0);
    });
    playButton.addEventListener("click", (event) => {
      if (playButton.dataset.pointerActivated === "1") {
        event.preventDefault();
        event.stopPropagation();
      }
    });
    leftControls.appendChild(playButton);

    const speedSelect = document.createElement("select");
    speedSelect.className = "playback-speed-select";
    speedSelect.setAttribute("aria-label", playbackCopy.playbackSpeed);
    speedSelect.title = playbackCopy.playbackSpeed;
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
    prevButton.title = playbackCopy.previousNodeStatusChange;
    bindPlaybackRepeatButton(prevButton, () => {
      stepPlaybackTransition(log, -1);
    });

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "canvas-btn icon-btn playback-step-btn";
    nextButton.textContent = ">";
    nextButton.title = playbackCopy.nextNodeStatusChange;
    bindPlaybackRepeatButton(nextButton, () => {
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
        navigateToActiveNode: false,
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
    time.textContent = frame ? `${formatRelativeTime(log, frame.tUs)}  ${formatWallTime(frame.wallUs)}` : playbackCopy.noFrames;

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
    if (isPlaybackTimeBasedMode()) {
      if (getCurrentPlaybackTimeUs(log, null) >= getPlaybackLastTimeUs(log)) {
        setPlaybackTime(log, getPlaybackFirstTimeUs(log), {
          scrollList: true,
          focusNode: false,
          persist: false,
          updateBlackboard: true
        });
      }
    } else if (runtime.state.playbackFrameIndex >= log.frames.length - 1) {
      setPlaybackFrame(log, 0, {
        scrollList: true,
        focusNode: false,
        persist: false,
        updateBlackboard: true
      });
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

    if (isPlaybackTimeBasedMode()) {
      reschedulePlaybackTimeAutoAdvance(log);
      return;
    }

    const currentFrameIndex = runtime.state.playbackFrameIndex;
    const nextFrameIndex = currentFrameIndex + 1;
    if (!log.frames || nextFrameIndex >= log.frames.length) {
      pausePlayback();
      return;
    }

    const delayMs = getPlaybackAdvanceDelayMs();
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

  function reschedulePlaybackTimeAutoAdvance(log) {
    const currentTimeUs = getCurrentPlaybackTimeUs(log, null);
    const lastTimeUs = getPlaybackLastTimeUs(log);
    if (currentTimeUs >= lastTimeUs) {
      pausePlayback();
      return;
    }

    const scheduledAt = performance.now();
    playbackAutoAdvanceHandle = window.setTimeout(() => {
      playbackAutoAdvanceHandle = 0;
      if (!runtime.state.playbackIsPlaying || runtime.state.playbackLog !== log) {
        return;
      }
      const elapsedMs = Math.max(PLAYBACK_AUTO_ADVANCE_BASE_DELAY_MS, performance.now() - scheduledAt);
      const speed = normalizePlaybackSpeed(runtime.state.playbackPlaybackSpeed);
      const nextTimeUs = Math.min(lastTimeUs, currentTimeUs + elapsedMs * 1000 * speed);
      setPlaybackTime(log, nextTimeUs, {
        navigateToActiveNode: shouldAutoNavigatePlayback(),
        scrollList: true,
        focusNode: false,
        persist: true,
        updateBlackboard: true
      });
    }, PLAYBACK_AUTO_ADVANCE_BASE_DELAY_MS);
  }

  function getPlaybackAdvanceDelayMs() {
    const speed = normalizePlaybackSpeed(runtime.state.playbackPlaybackSpeed);
    return Math.max(16, Math.round(PLAYBACK_AUTO_ADVANCE_BASE_DELAY_MS / Math.max(0.1, speed)));
  }

  function updatePlaybackTimelineControls(log) {
    const playbackCopy = runtime.i18n.getPlaybackCopy();
    const playButton = document.querySelector(".playback-play-btn");
    if (playButton) {
      const isPlaying = runtime.state.playbackIsPlaying === true;
      const nextIconKind = isPlaying ? "pause" : "play";
      playButton.classList.toggle("is-active", isPlaying);
      playButton.setAttribute("aria-pressed", isPlaying ? "true" : "false");
      playButton.title = isPlaying ? playbackCopy.pausePlayback : playbackCopy.playPlayback;
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

  function bindPlaybackRepeatButton(button, action) {
    let holdTimer = 0;
    let repeatTimer = 0;
    let activePointerId = null;
    let didRepeat = false;
    let suppressNextClick = false;
    let suppressClickResetTimer = 0;

    const clearTimers = () => {
      if (holdTimer) {
        window.clearTimeout(holdTimer);
        holdTimer = 0;
      }
      if (repeatTimer) {
        window.clearInterval(repeatTimer);
        repeatTimer = 0;
      }
    };

    const finishPress = () => {
      clearTimers();
      if (didRepeat) {
        suppressNextClick = true;
        if (suppressClickResetTimer) {
          window.clearTimeout(suppressClickResetTimer);
        }
        suppressClickResetTimer = window.setTimeout(() => {
          suppressNextClick = false;
          suppressClickResetTimer = 0;
        }, 80);
      }
      activePointerId = null;
      didRepeat = false;
    };

    button.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      if (button.disabled) {
        return;
      }

      clearTimers();
      didRepeat = false;
      activePointerId = event.pointerId;
      try {
        button.setPointerCapture(event.pointerId);
      } catch (_error) {
        // Some hosts may reject stale pointer capture; repeating still works without it.
      }

      holdTimer = window.setTimeout(() => {
        didRepeat = true;
        action();
        repeatTimer = window.setInterval(action, 200);
      }, 200);
    });

    button.addEventListener("pointerup", (event) => {
      if (activePointerId !== null && event.pointerId !== activePointerId) {
        return;
      }
      try {
        button.releasePointerCapture(event.pointerId);
      } catch (_error) {
        // Ignore stale pointer capture state.
      }
      finishPress();
    });
    button.addEventListener("pointercancel", finishPress);
    button.addEventListener("lostpointercapture", finishPress);
    button.addEventListener("contextmenu", (event) => {
      if (holdTimer || repeatTimer) {
        event.preventDefault();
      }
    });
    button.addEventListener("click", (event) => {
      if (suppressNextClick) {
        event.preventDefault();
        event.stopPropagation();
        suppressNextClick = false;
        if (suppressClickResetTimer) {
          window.clearTimeout(suppressClickResetTimer);
          suppressClickResetTimer = 0;
        }
        return;
      }
      action();
    });
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
    const playbackCopy = runtime.i18n.getPlaybackCopy();
    const button = document.createElement("button");
    button.type = "button";
    button.className = `panel-edge-toggle playback-edge-toggle playback-edge-toggle-${side}`;
    const isLeft = side === "left";
    const visibleKey = isLeft ? "playbackLeftVisible" : "playbackRightVisible";
    button.title = isLeft ? playbackCopy.showHideTransitions : playbackCopy.showHideRightPanel;
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
    if (isPlaybackTimeBasedMode()) {
      const currentTime = getCurrentPlaybackTimeUs(log, null);
      const nextIndex = direction < 0
        ? findLastTransitionIndexBeforeTime(transitions, currentTime)
        : findFirstTransitionIndexAfterTime(transitions, currentTime);
      const next = nextIndex === null ? null : transitions[nextIndex];
      if (!next) {
        return;
      }
      setPlaybackTime(log, next.tUs, {
        navigateToActiveNode: shouldAutoNavigatePlayback(),
        scrollList: true,
        focusNode: shouldAutoNavigatePlayback(),
        persist: true,
        updateBlackboard: true
      });
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
      if (!update) {
        return;
      }
      if (update.timeBased) {
        setPlaybackTime(update.log, update.tUs, update.options);
      } else {
        setPlaybackFrame(update.log, update.frameIndex, update.options);
      }
    });
  }

  function requestPlaybackTime(log, tUs, options = {}) {
    pendingPlaybackFrameUpdate = { log, tUs, options, timeBased: true };
    if (playbackFrameUpdateHandle) {
      return;
    }
    playbackFrameUpdateHandle = requestAnimationFrame(() => {
      playbackFrameUpdateHandle = 0;
      const update = pendingPlaybackFrameUpdate;
      pendingPlaybackFrameUpdate = null;
      if (!update) {
        return;
      }
      if (update.timeBased) {
        setPlaybackTime(update.log, update.tUs, update.options);
      } else {
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
    runtime.state.playbackTimeUs = getPlaybackFrameTimeUs(log, runtime.state.playbackFrameIndex);

    if (options.navigateToActiveNode) {
      const activeTransition = getActiveTransition(log, runtime.state.playbackFrameIndex);
      const location = activeTransition ? findPlaybackNodeLocation(activeTransition.uid) : null;
      if (location) {
        const treeChanged = runtime.state.selectedTreeId !== location.treeId;
        runtime.state.selectedTreeId = location.treeId;
        runtime.state.selectedNodePath = location.nodePath;
        if (treeChanged && !isExpandedTreeRenderMode("playback")) {
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

  function setPlaybackTime(log, tUs, options = {}) {
    if (!log?.preview) {
      return;
    }
    runtime.state.playbackTimeUs = clampPlaybackTimeUs(log, tUs);
    runtime.state.playbackFrameIndex = findPlaybackFrameIndexAtOrBeforeTime(log, runtime.state.playbackTimeUs);

    if (options.navigateToActiveNode) {
      const activeTransition = getActiveTransitionAtTime(log, runtime.state.playbackTimeUs);
      const location = activeTransition ? findPlaybackNodeLocation(activeTransition.uid) : null;
      if (location) {
        const treeChanged = runtime.state.selectedTreeId !== location.treeId;
        runtime.state.selectedTreeId = location.treeId;
        runtime.state.selectedNodePath = location.nodePath;
        if (treeChanged && !isExpandedTreeRenderMode("playback")) {
          renderPlaybackLog({
            ensureActiveTreeVisible: true,
            focusActiveNode: options.focusNode === true,
            preserveViewport: true
          });
          return;
        }
      }
    }

    syncPlaybackFrameUi(log, { ...options, timeBased: true });
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
    const playbackSnapshot = buildCurrentPlaybackSnapshot(log, {
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
    updatePlaybackTracePanel(log, playbackSnapshot, null, { refreshContent: false });
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
    domCache.nodeCardsByUid.forEach((cards, uid) => {
      cards.forEach((card) => {
        syncPlaybackStatusClass(card, getPlaybackStatusClassForUid(uid, false), "playback-status", true);
      });
    });

    domCache.edgePathsByUid.forEach((edges, uid) => {
      edges.forEach((edge) => {
        syncPlaybackStatusClass(edge, getPlaybackStatusClassForUid(uid, true), "playback-edge-status", false);
      });
    });
  }

  function updatePlaybackCanvasSelection() {
    const domCache = getPlaybackDomCache();
    (domCache.selectedCards || []).forEach((card) => card.classList.remove("is-selected"));
    const key = `${runtime.state.selectedTreeId || ""}::${runtime.state.selectedNodePath || ""}`;
    const selectedCards = domCache.nodeCardsByTreePath.get(key) || [];
    selectedCards.forEach((card) => card.classList.add("is-selected"));
    domCache.selectedCards = selectedCards;
    runtime.treeSwitcher.updateActive?.();
  }

  function updatePlaybackTimeline(log) {
    const playbackCopy = runtime.i18n.getPlaybackCopy();
    const slider = document.querySelector(".playback-slider");
    if (slider) {
      slider.value = String(runtime.state.playbackFrameIndex);
    }
    const durationSlider = document.querySelector(".playback-duration-slider");
    if (durationSlider) {
      durationSlider.value = String(runtime.state.playbackFrameIndex);
    }
    const time = document.querySelector(".playback-current-time");
    if (time) {
      const frame = log.frames?.[runtime.state.playbackFrameIndex] || null;
      const currentTime = getCurrentPlaybackTimeUs(log, null);
      time.textContent = frame
        ? (time.classList.contains("playback-duration-time")
          ? formatPlaybackTimelineClock(log, currentTime)
          : `${formatRelativeTime(log, frame.tUs)}  ${formatWallTime(frame.wallUs)}`)
        : playbackCopy.noFrames;
    }
    syncPlaybackDurationTimeline(log);
    updatePlaybackTimelineControls(log);
  }

  function updatePlaybackActiveTransition(log, scrollList) {
    const activeTransitionIndex = getCurrentPlaybackActiveTransitionIndex(log);
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

  function updatePlaybackTracePanel(log, snapshot, targetPanel = null, options = {}) {
    const panel = targetPanel || document.querySelector(".playback-trace-panel");
    if (!panel) {
      return;
    }

    if (options.refreshContent === false) {
      return;
    }

    const playbackCopy = runtime.i18n.getPlaybackCopy();
    const config = runtime.state.traceConfig;
    const nextMode = config?.ready ? "chat" : "setup";
    if (panel.dataset.traceMode !== nextMode) {
      panel.dataset.traceMode = nextMode;
      panel.replaceChildren(nextMode === "chat"
        ? renderPlaybackTraceChat(log, playbackCopy)
        : renderPlaybackTraceSetup(config, playbackCopy));
    }

    if (nextMode === "chat") {
      updatePlaybackTraceChat(panel, log, playbackCopy);
    } else {
      updatePlaybackTraceSetup(panel, config, playbackCopy);
    }
  }

  function renderPlaybackTraceSetup(config, playbackCopy = runtime.i18n.getPlaybackCopy()) {
    const wrapper = document.createElement("div");
    wrapper.className = "playback-trace-setup";

    const body = document.createElement("div");
    body.className = "playback-trace-setup-body";

    const title = document.createElement("strong");
    title.className = "playback-trace-setup-title";
    title.textContent = playbackCopy.traceConfigTitle;

    const description = document.createElement("p");
    description.className = "playback-trace-note";
    description.textContent = playbackCopy.traceConfigDescription;

    const missing = document.createElement("div");
    missing.className = "playback-trace-missing";
    missing.dataset.traceMissing = "true";
    const missingMessage = document.createElement("div");
    missingMessage.dataset.traceMissingMessage = "true";
    const addProviderButton = createTraceButton(playbackCopy.traceAddProvider, () => {
      vscode.postMessage({ type: "addTraceProvider" });
    }, "accent");
    missing.appendChild(missingMessage);
    missing.appendChild(addProviderButton);

    const providers = document.createElement("div");
    providers.className = "playback-trace-provider-list";
    providers.dataset.traceProviders = "true";

    body.appendChild(title);
    body.appendChild(description);
    body.appendChild(missing);
    body.appendChild(providers);

    wrapper.appendChild(body);
    updatePlaybackTraceSetup(wrapper, config, playbackCopy);
    return wrapper;
  }

  function updatePlaybackTraceSetup(panel, config, playbackCopy = runtime.i18n.getPlaybackCopy()) {
    const missingMessage = panel.querySelector("[data-trace-missing-message]");
    if (missingMessage) {
      missingMessage.textContent = config
        ? config.notice || playbackCopy.traceNoAvailableProviders
        : playbackCopy.traceConfigLoading;
    }

    const providerList = panel.querySelector("[data-trace-providers]");
    if (providerList) {
      providerList.replaceChildren();
      (config?.providers || []).forEach((provider) => {
        const item = document.createElement("div");
        item.className = "playback-trace-provider-row";
        item.classList.toggle("is-ready", provider.configured === true);
        item.classList.toggle("is-active", provider.id === config?.activeProvider);

        const name = document.createElement("strong");
        name.textContent = provider.label;
        const status = document.createElement("span");
        status.textContent = provider.configured
          ? playbackCopy.traceProviderReady(provider.model)
          : playbackCopy.traceProviderMissing(provider.missing.join(", "));
        item.appendChild(name);
        item.appendChild(status);
        providerList.appendChild(item);
      });
    }

  }

  function renderPlaybackTraceChat(log, playbackCopy = runtime.i18n.getPlaybackCopy()) {
    const wrapper = document.createElement("div");
    wrapper.className = "playback-trace-chat";

    const messages = document.createElement("div");
    messages.className = "playback-trace-messages";
    messages.dataset.traceMessages = "true";

    const form = document.createElement("form");
    form.className = "playback-trace-composer";
    const composerShell = document.createElement("div");
    composerShell.className = "playback-trace-composer-shell";

    const input = document.createElement("textarea");
    input.className = "playback-trace-input";
    input.rows = 2;
    input.placeholder = playbackCopy.traceAskPlaceholder;
    input.spellcheck = false;
    input.addEventListener("input", () => resizePlaybackTraceInput(input));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    const footer = document.createElement("div");
    footer.className = "playback-trace-composer-footer";

    const statusbar = document.createElement("div");
    statusbar.className = "playback-trace-statusbar";
    const provider = document.createElement("span");
    provider.dataset.traceProvider = "true";
    statusbar.appendChild(provider);

    const send = document.createElement("button");
    send.type = "submit";
    send.className = "canvas-btn accent icon-btn playback-trace-send";
    send.title = playbackCopy.traceSend;
    send.setAttribute("aria-label", playbackCopy.traceSend);
    send.appendChild(createPlaybackSendIcon());
    send.addEventListener("click", (event) => {
      if (!runtime.state.tracePendingRequestId) {
        return;
      }
      event.preventDefault();
      cancelTraceQuestion();
    });

    footer.appendChild(statusbar);
    footer.appendChild(send);
    composerShell.appendChild(input);
    composerShell.appendChild(footer);
    form.appendChild(composerShell);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      sendTraceQuestion(log, input);
    });

    wrapper.appendChild(messages);
    wrapper.appendChild(form);
    updatePlaybackTraceChat(wrapper, log, playbackCopy);
    resizePlaybackTraceInput(input);
    return wrapper;
  }

  function updatePlaybackTraceChat(panel, log, playbackCopy = runtime.i18n.getPlaybackCopy()) {
    const messages = panel.querySelector("[data-trace-messages]");
    if (messages) {
      renderTraceMessages(messages, playbackCopy);
    }

    const input = panel.querySelector(".playback-trace-input");
    const send = panel.querySelector(".playback-trace-send");
    const disabled = !log || Boolean(runtime.state.tracePendingRequestId);
    if (input) {
      input.disabled = disabled;
      input.placeholder = log ? playbackCopy.traceAskPlaceholder : playbackCopy.traceNoLog;
      resizePlaybackTraceInput(input);
    }
    if (send) {
      const isPending = Boolean(runtime.state.tracePendingRequestId);
      send.disabled = !log && !isPending;
      send.type = isPending ? "button" : "submit";
      const label = isPending ? playbackCopy.traceStop : playbackCopy.traceSend;
      send.title = label;
      send.setAttribute("aria-label", label);
      send.replaceChildren(isPending ? createPlaybackStopIcon() : createPlaybackSendIcon());
    }

    const provider = panel.querySelector("[data-trace-provider]");
    const config = runtime.state.traceConfig;
    if (provider) {
      provider.textContent = config?.ready
        ? playbackCopy.traceCurrentProvider(config.activeProviderLabel, config.activeModel)
        : playbackCopy.providerNotConfigured;
    }
  }

  function renderTraceMessages(container, playbackCopy = runtime.i18n.getPlaybackCopy()) {
    container.replaceChildren();
    if (runtime.state.traceMessages.length === 0 && !runtime.state.tracePendingRequestId) {
      const empty = document.createElement("div");
      empty.className = "playback-trace-empty";
      empty.textContent = playbackCopy.traceEmpty;
      container.appendChild(empty);
      return;
    }

    runtime.state.traceMessages.forEach((message) => {
      container.appendChild(createTraceMessage(message, playbackCopy));
    });

    if (runtime.state.tracePendingRequestId) {
      const pending = document.createElement("div");
      pending.className = "playback-trace-message assistant is-pending";
      pending.textContent = runtime.state.tracePendingAnswer || playbackCopy.traceThinking;
      container.appendChild(pending);
    }
    container.scrollTop = container.scrollHeight;
  }

  function createTraceMessage(message, playbackCopy = runtime.i18n.getPlaybackCopy()) {
    const item = document.createElement("article");
    item.className = `playback-trace-message ${message.role || "assistant"}`;
    const label = document.createElement("span");
    label.className = "playback-trace-message-role";
    label.textContent = message.role === "user" ? playbackCopy.traceQuestion : playbackCopy.traceAnswer;
    const content = document.createElement("div");
    content.className = "playback-trace-message-content";
    content.textContent = message.content || "";
    item.appendChild(label);
    item.appendChild(content);
    return item;
  }

  function sendTraceQuestion(log, input) {
    const question = input?.value?.trim() || "";
    const config = runtime.state.traceConfig;
    if (!question || !log || !config?.ready || runtime.state.tracePendingRequestId) {
      return;
    }

    const snapshot = buildCurrentPlaybackSnapshot(log);
    const context = buildPlaybackTraceContext(log, snapshot, runtime.i18n.getPlaybackCopy());
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    runtime.state.traceMessages.push({ role: "user", content: question });
    runtime.state.tracePendingRequestId = requestId;
    runtime.state.tracePendingAnswer = "";
    input.value = "";
    updatePlaybackTracePanel(log, snapshot);
    vscode.postMessage({
      type: "traceAsk",
      payload: {
        requestId,
        logFilePath: log.filePath || "",
        question,
        context: context.prompt
      }
    });
  }

  function handleTraceAnswerChunk(payload) {
    if (!payload?.requestId || payload.requestId !== runtime.state.tracePendingRequestId) {
      return;
    }
    const delta = typeof payload.delta === "string" ? payload.delta : "";
    if (!delta) {
      return;
    }
    runtime.state.tracePendingAnswer += delta;
    const log = runtime.state.playbackLog;
    const snapshot = log ? buildCurrentPlaybackSnapshot(log) : null;
    updatePlaybackTracePanel(log, snapshot);
  }

  function handleTraceAnswer(payload) {
    if (!payload?.requestId || payload.requestId !== runtime.state.tracePendingRequestId) {
      return;
    }

    const pendingAnswer = runtime.state.tracePendingAnswer.trim();
    const cancelled = payload.cancelled === true;
    const errorMessage = cancelled
      ? runtime.i18n.getPlaybackCopy().traceRequestCancelled
      : runtime.i18n.getPlaybackCopy().traceRequestFailed(payload.error || "");
    if (cancelled) {
      if (pendingAnswer) {
        runtime.state.traceMessages.push({
          role: "assistant",
          content: pendingAnswer
        });
      } else {
        runtime.state.traceMessages.push({
          role: "assistant",
          content: errorMessage
        });
      }
    } else if (payload.ok) {
      runtime.state.traceMessages.push({
        role: "assistant",
        content: payload.answer || pendingAnswer
      });
    } else {
      runtime.state.traceMessages.push({
        role: "assistant",
        content: errorMessage
      });
    }
    runtime.state.tracePendingRequestId = "";
    runtime.state.tracePendingAnswer = "";
    const log = runtime.state.playbackLog;
    const snapshot = log ? buildCurrentPlaybackSnapshot(log) : null;
    updatePlaybackTracePanel(log, snapshot);
  }

  function clearTraceMessages() {
    runtime.state.traceMessages = [];
    runtime.state.tracePendingRequestId = "";
    runtime.state.tracePendingAnswer = "";
  }

  function cancelTraceQuestion() {
    const requestId = runtime.state.tracePendingRequestId;
    if (!requestId) {
      return;
    }
    vscode.postMessage({
      type: "traceCancel",
      payload: { requestId }
    });
  }

  function resizePlaybackTraceInput(input) {
    if (!input) {
      return;
    }
    input.style.height = "auto";
    const nextHeight = Math.min(Math.max(input.scrollHeight, 44), 148);
    input.style.height = `${nextHeight}px`;
  }

  function createTraceButton(label, onClick, variant = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `canvas-btn playback-trace-action ${variant}`.trim();
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function createPlaybackSendIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M4 12.5 19.5 4l-4.1 16-4.4-5.4L4 12.5Zm6.4-.3 4 4.8 2.6-10.4-6.6 5.6Z");
    svg.appendChild(path);
    return svg;
  }

  function createPlaybackStopIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M7 7h10v10H7z");
    svg.appendChild(path);
    return svg;
  }

  function buildPlaybackTraceContext(log, snapshot, playbackCopy = runtime.i18n.getPlaybackCopy()) {
    const frame = log.frames?.[runtime.state.playbackFrameIndex] || null;
    const activeTransition = isPlaybackTimeBasedMode()
      ? getActiveTransitionAtTime(log, getCurrentPlaybackTimeUs(log, null))
      : getActiveTransition(log, runtime.state.playbackFrameIndex);
    const activeTransitionName = activeTransition ? resolvePlaybackNodeName(log, activeTransition) : playbackCopy.noActiveTransition;
    const selectedTree = getSelectedTree(log.preview);
    const treeLabel = selectedTree?.id || log.preview?.defaultTreeId || "MainTree";
    const currentTime = getCurrentPlaybackTimeUs(log, null);
    const frameLabel = frame
      ? `${formatRelativeTime(log, currentTime)}  ${formatPlaybackTimelineClock(log, currentTime)}`
      : playbackCopy.noFrames;
    const transitionLabel = activeTransition
      ? `${activeTransitionName} · ${activeTransition.prevStatus} → ${activeTransition.status}`
      : playbackCopy.noTransition;
    const blackboardRows = flattenBlackboardRows(snapshot.blackboardValues);
    const blackboardLabel = playbackCopy.blackboardEntries(blackboardRows.length);
    const prompt = [
      playbackCopy.promptIntro,
      `${playbackCopy.tree}: ${treeLabel}`,
      `${playbackCopy.frame}: ${frameLabel}`,
      `${playbackCopy.transition}: ${transitionLabel}`,
      playbackCopy.promptBlackboardEntries(blackboardRows.length),
      playbackCopy.promptSelectedNodePath(runtime.state.selectedNodePath || "0"),
      "",
      playbackCopy.promptFocus
    ].join("\n");

    return {
      treeLabel,
      frameLabel,
      transitionLabel,
      blackboardLabel,
      prompt
    };
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
        appendDomCacheEntry(nodeCardsByUid, uid, card);
      }

      const treeId = node.dataset.treeId || "";
      const nodePath = node.dataset.nodePath || "";
      if (treeId && nodePath) {
        appendDomCacheEntry(nodeCardsByTreePath, `${treeId}::${nodePath}`, card);
      }
    });

    root.querySelectorAll(".canvas-edge-path-base[data-playback-uid]").forEach((edge) => {
      const uid = String(edge.dataset.playbackUid || "");
      if (uid) {
        appendDomCacheEntry(edgePathsByUid, uid, edge);
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
      selectedCards: Array.from(root.querySelectorAll(".flow-card.is-selected")),
      activeTransitionRow: root.querySelector(".playback-transition-row.is-active")
    };
    return playbackDomCache;
  }

  function appendDomCacheEntry(map, key, element) {
    const entries = map.get(key) || [];
    entries.push(element);
    map.set(key, entries);
  }

  function getPlaybackStatusClassForUid(uid, edge) {
    return runtime.playbackData.getPlaybackStatusClassForUid(uid, edge);
  }

  function getActiveTransition(log, frameIndex) {
    return runtime.playbackData.getActiveTransition(log, frameIndex);
  }

  function getActiveTransitionAtTime(log, tUs) {
    return runtime.playbackData.getActiveTransitionAtTime(log, tUs);
  }

  function getActiveTransitionIndex(log, frameIndex) {
    return runtime.playbackData.getActiveTransitionIndex(log, frameIndex);
  }

  function getActiveTransitionIndexAtTime(log, tUs) {
    return runtime.playbackData.getActiveTransitionIndexAtTime(log, tUs);
  }

  function getCurrentPlaybackActiveTransitionIndex(log) {
    if (isPlaybackTimeBasedMode()) {
      return getActiveTransitionIndexAtTime(log, getCurrentPlaybackTimeUs(log, null));
    }
    return getActiveTransitionIndex(log, runtime.state.playbackFrameIndex);
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

  function findLastTransitionIndexAtOrBeforeTime(transitions, tUs) {
    return runtime.playbackData.findLastTransitionIndexAtOrBeforeTime(transitions, tUs);
  }

  function findLastTransitionIndexBeforeTime(transitions, tUs) {
    return runtime.playbackData.findLastTransitionIndexBeforeTime(transitions, tUs);
  }

  function findFirstTransitionIndexAfterTime(transitions, tUs) {
    return runtime.playbackData.findFirstTransitionIndexAfterTime(transitions, tUs);
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

  function buildPlaybackSnapshotAtTime(log, tUs, options = {}) {
    return runtime.playbackData.buildPlaybackSnapshotAtTime(log, tUs, options);
  }

  function buildCurrentPlaybackSnapshot(log, options = {}) {
    if (isPlaybackTimeBasedMode()) {
      return buildPlaybackSnapshotAtTime(log, getCurrentPlaybackTimeUs(log, null), options);
    }
    return buildPlaybackSnapshot(log, runtime.state.playbackFrameIndex, options);
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

  function formatPlaybackTimelineClock(log, tUs) {
    const frames = log?.frames || [];
    const firstFrame = frames[0] || null;
    const firstWallUs = Number(firstFrame?.wallUs);
    const firstTime = Number(firstFrame?.tUs);
    const currentTime = Number(tUs);
    if (Number.isFinite(firstWallUs) && firstWallUs > 0 && Number.isFinite(firstTime) && Number.isFinite(currentTime)) {
      const label = formatWallTime(firstWallUs + currentTime - firstTime);
      if (label) {
        return label;
      }
    }

    const nearestFrameIndex = findPlaybackFrameIndexAtTime(log, tUs);
    const nearestFrame = frames[nearestFrameIndex] || null;
    return formatWallTime(nearestFrame?.wallUs) || formatRelativeTime(log, tUs);
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
    const renderContext = getTreeRenderContext(result, "edit");
    ensureRenderSelection(renderContext);
    const useSplitView = runtime.state.splitViewEnabled && !renderContext.expanded;
    const viewportState = !useSplitView && preserveViewport
      ? getCanvasViewportState(runtime.state.currentCanvasState)
      : null;
    const splitViewportStates = useSplitView && preserveViewport
      ? getSplitViewportStates()
      : {};

    if (useSplitView) {
      ensureSplitPaneState(result);
    }
    runtime.treeSwitcher.render(renderContext.switcherResult, {
      ensureActiveVisible: options.ensureActiveTreeVisible === true,
      activeTreeId: renderContext.expanded ? renderContext.rootTreeId : undefined,
      selectResult: result
    });

    if (useSplitView) {
      renderSplitTreeView(result, splitViewportStates);
      return;
    }

    const selectedTree = renderContext.tree;
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
    if (!renderContext.expanded) {
      runtime.state.selectedNodePath = pickNodePath(selectedTree, runtime.state.selectedNodePath);
    }
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

    const paneSelectedNodePath = runtime.state.splitPaneNodePaths?.[paneId];
    const selectedNodePath = paneSelectedNodePath === null
      ? null
      : pickNodePath(tree, paneSelectedNodePath ?? runtime.state.selectedNodePath);
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
      panY: canvasState.panY || 0,
      anchor: captureCanvasViewportAnchor(canvasState)
    };
  }

  function captureCanvasViewportAnchor(canvasState) {
    if (!canvasState?.layout || !canvasState.shell) {
      return null;
    }

    const selectedTreeId = runtime.state.selectedTreeId || "";
    const selectedNodePath = runtime.state.selectedNodePath || "";
    const entry = canvasState.layout.nodes.find((item) => {
      const node = item.node;
      return (
        node?.nodePath === selectedNodePath &&
        (!selectedTreeId || !node?.sourceTreeId || node.sourceTreeId === selectedTreeId)
      );
    });
    if (!entry) {
      return null;
    }

    const zoom = canvasState.zoom || runtime.state.currentZoom || 1;
    return {
      treeId: entry.node?.sourceTreeId || selectedTreeId,
      nodePath: entry.node?.nodePath || selectedNodePath,
      renderPath: entry.node?.renderPath || "",
      screenX: entry.centerX * zoom + (canvasState.panX || 0),
      screenY: (entry.y + entry.height / 2) * zoom + (canvasState.panY || 0)
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
    const activePaneNodePath = runtime.state.splitPaneNodePaths?.[runtime.state.activeTreePane];
    runtime.state.selectedNodePath =
      activePaneNodePath === null ? null : activePaneNodePath ?? runtime.state.selectedNodePath ?? "0";
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
      const paneNodePath = runtime.state.splitPaneNodePaths?.[normalizedPaneId];
      runtime.state.selectedNodePath = paneNodePath === null ? null : paneNodePath ?? runtime.state.selectedNodePath ?? "0";
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
      uiPreferences: {
        themePreset: runtime.state.currentSettings?.themePreset || "midnight",
        language: runtime.state.currentSettings?.language || "en-US"
      },
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
      playbackTimeUs: runtime.state.playbackTimeUs,
      playbackLeftVisible: runtime.state.playbackLeftVisible,
      playbackRightVisible: runtime.state.playbackRightVisible,
      playbackRightTab: runtime.state.playbackRightTab,
      playbackLeftWidth: runtime.state.playbackLeftWidth,
      playbackRightWidth: runtime.state.playbackRightWidth,
      playbackDashboardBottomVisible: runtime.state.playbackDashboardBottomVisible,
      playbackDashboardBottomHeight: runtime.state.playbackDashboardBottomHeight,
      playbackDashboardLeftWidth: runtime.state.playbackDashboardLeftWidth,
      playbackDurationLaneHeight: runtime.state.playbackDurationLaneHeight,
      playbackDurationTimeScale: runtime.state.playbackDurationTimeScale,
      playbackDurationTaskPanelVisible: runtime.state.playbackDurationTaskPanelVisible,
      playbackTransitionFilter: runtime.state.playbackTransitionFilter,
      playbackTransitionFilterDraft: runtime.state.playbackTransitionFilterDraft,
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
    if (preferredNodePath === null) {
      return null;
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
