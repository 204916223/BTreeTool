(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  const DEFAULT_USER_SETTINGS = {
    language: "en-US",
    themePreset: "midnight",
    showMainTreeLocator: false,
    showBehaviorTreeRoot: true,
    requireNodeDeleteConfirmation: false,
    copyNodeWithDescendants: false,
    playbackAutoNavigateToTree: false,
    allowUnclosedPlaybackLog: true,
    traceLearningEnabled: false,
    nodeAttributeLayout: "inline",
    editTreeRenderMode: "paged",
    playbackTreeRenderMode: "paged",
    playbackPanelLayout: "classic",
    simplifyHiddenSections: [],
    presetNodes: []
  };

  function createInitialState(persistedState = {}, initialMode = "edit", initialSettings = {}) {
    const clampNumber = runtime.viewport?.clampNumber || ((_value, _min, _max, fallback) => fallback);
    const normalizedInitialSettings = normalizeInitialSettings(initialSettings, persistedState);

    return {
      selectedTreeId: persistedState.selectedTreeId || null,
      selectedNodePath: persistedState.selectedNodePath || "0",
      showCatalog: persistedState.showCatalog || false,
      editModeEnabled: initialMode === "playback" ? false : persistedState.editModeEnabled !== false,
      collapsedCatalogGroups: persistedState.collapsedCatalogGroups || {},
      collapsedNodePickerGroups: persistedState.collapsedNodePickerGroups || {},
      catalogWidth: clampNumber(persistedState.catalogWidth, 220, 460, 280),
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
      playbackRightTab:
        persistedState.playbackRightTab === "trace" || persistedState.playbackRightTab === "ai" ? "trace" : "blackboard",
      playbackLeftWidth: clampNumber(persistedState.playbackLeftWidth, 220, 520, 300),
      playbackRightWidth: clampNumber(persistedState.playbackRightWidth, 220, 560, 320),
      playbackDashboardBottomVisible: persistedState.playbackDashboardBottomVisible !== false,
      playbackDashboardBottomHeight: clampNumber(persistedState.playbackDashboardBottomHeight, 180, 720, 320),
      playbackDashboardLeftWidth: clampNumber(persistedState.playbackDashboardLeftWidth, 240, 960, 520),
      playbackDurationLaneHeight: clampNumber(persistedState.playbackDurationLaneHeight, 18, 72, 42),
      playbackDurationTimeScale: clampNumber(persistedState.playbackDurationTimeScale, 0.5, 12, 1),
      playbackDurationTaskPanelVisible: persistedState.playbackDurationTaskPanelVisible === true,
      playbackDurationScrollLeft: clampNumber(persistedState.playbackDurationScrollLeft, 0, 1000000, 0),
      playbackDurationScrollTop: clampNumber(persistedState.playbackDurationScrollTop, 0, 1000000, 0),
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
      tracePendingQuestion: "",
      tracePendingContext: "",
      tracePendingFrameIndex: null,
      tracePendingFocusFrameIndex: null,
      tracePendingShouldNavigate: false,
      tracePendingAnswer: "",
      playbackIsPlaying: false,
      playbackPlaybackSpeed: Number.isFinite(persistedState.playbackPlaybackSpeed)
        ? persistedState.playbackPlaybackSpeed
        : 1,
      currentSettings: normalizedInitialSettings,
      copiedNodeTemplate: null,
      forceHideNodeDetails: false,
      settingsFilePath: "",
      currentZoom: 1,
      treeNavigationParents: persistedState.treeNavigationParents || {},
      suppressNodeClickUntil: 0,
      isSpacePressed: false,
      currentDragState: null,
      MIN_ZOOM: 0.1,
      MAX_ZOOM: 1.8
    };
  }

  function normalizeThemePreset(value) {
    return [
      "midnight",
      "graphite",
      "ocean",
      "forest",
      "paper",
      "sand",
      "mist",
      "rose"
    ].includes(value)
      ? value
      : DEFAULT_USER_SETTINGS.themePreset;
  }

  function normalizeInitialSettings(initialSettings, persistedState) {
    const input = initialSettings && typeof initialSettings === "object" ? initialSettings : {};
    const themePreset = normalizeThemePreset(input.themePreset || persistedState.uiPreferences?.themePreset);
    const rawLanguage = input.language || persistedState.uiPreferences?.language;
    const language = rawLanguage === "zh-CN" ? "zh-CN" : "en-US";

    return {
      language,
      themePreset,
      showMainTreeLocator: input.showMainTreeLocator === true,
      showBehaviorTreeRoot: true,
      requireNodeDeleteConfirmation: input.requireNodeDeleteConfirmation === true,
      copyNodeWithDescendants: input.copyNodeWithDescendants === true,
      playbackAutoNavigateToTree: input.playbackAutoNavigateToTree === true,
      allowUnclosedPlaybackLog: true,
      traceLearningEnabled: input.traceLearningEnabled === true,
      nodeAttributeLayout: input.nodeAttributeLayout === "stacked" ? "stacked" : "inline",
      editTreeRenderMode: input.editTreeRenderMode === "expanded" ? "expanded" : "paged",
      playbackTreeRenderMode: input.playbackTreeRenderMode === "expanded" ? "expanded" : "paged",
      playbackPanelLayout: input.playbackPanelLayout === "dashboard" ? "dashboard" : "classic",
      simplifyHiddenSections: Array.isArray(input.simplifyHiddenSections) ? [...input.simplifyHiddenSections] : [],
      presetNodes: Array.isArray(input.presetNodes) ? input.presetNodes.map(clonePresetNodeSettings) : []
    };
  }

  function clonePresetNodeSettings(node) {
    if (!node || typeof node !== "object") {
      return node;
    }

    return {
      ...node,
      fields: Array.isArray(node.fields) ? node.fields.map((field) => ({ ...field })) : []
    };
  }

  runtime.appState = {
    DEFAULT_USER_SETTINGS,
    createInitialState
  };
})();
