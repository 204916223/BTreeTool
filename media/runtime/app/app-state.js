(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  const DEFAULT_USER_SETTINGS = {
    language: "en-US",
    themePreset: "default",
    customTheme: {
      primaryColor: "#5e8de6",
      secondaryColor: "#df78cf"
    },
    showMainTreeLocator: false,
    showBehaviorTreeRoot: true,
    requireNodeDeleteConfirmation: false,
    copyNodeWithDescendants: false,
    playbackAutoNavigateToTree: false,
    allowUnclosedPlaybackLog: true,
    traceLearningEnabled: false,
    traceLearningEnhancementEnabled: false,
    nodeAttributeLayout: "inline",
    nodeSectionTitleMode: "regular",
    editTreeRenderMode: "paged",
    playbackTreeRenderMode: "paged",
    playbackPanelLayout: "classic",
    playbackPanelOpacity: 0.6,
    simplifyHiddenSections: [],
    editAssistantWarningWhitelist: [],
    presetNodes: []
  };

  function createInitialState(persistedState = {}, initialMode = "edit", initialSettings = {}) {
    const clampNumber = runtime.viewport?.clampNumber || ((_value, _min, _max, fallback) => fallback);
    const normalizedInitialSettings = normalizeInitialSettings(initialSettings, persistedState);

    return {
      selectedTreeId: persistedState.selectedTreeId || null,
      selectedNodePath: persistedState.selectedNodePath || "0",
      showCatalog: persistedState.showCatalog || false,
      editAssistantVisible: persistedState.editAssistantVisible === true,
      editAssistantMessages: Array.isArray(persistedState.editAssistantMessages) ? persistedState.editAssistantMessages : [],
      editAssistantTreeQueue: Array.isArray(persistedState.editAssistantTreeQueue) ? persistedState.editAssistantTreeQueue : [],
      editModeEnabled: initialMode === "playback" ? false : persistedState.editModeEnabled !== false,
      collapsedCatalogGroups: persistedState.collapsedCatalogGroups || {},
      collapsedNodePickerGroups: persistedState.collapsedNodePickerGroups || {},
      catalogWidth: clampNumber(persistedState.catalogWidth, 220, 460, 280),
      editAssistantWidth: clampNumber(persistedState.editAssistantWidth, 260, 560, 320),
      currentDocumentPath: "",
      currentHasDocument: false,
      currentFileName: "No active document",
      openingXmlDocument: false,
      hasUnsavedXmlChanges: false,
      currentHasBlockingIssues: false,
      treeSwitcherScrollLeft: Number.isFinite(persistedState.treeSwitcherScrollLeft)
        ? persistedState.treeSwitcherScrollLeft
        : 0,
      searchVisible: false,
      searchQuery: "",
      searchAdvancedVisible: false,
      searchIncludeNode: true,
      searchIncludeDescription: true,
      searchIncludeAttributes: true,
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
      playbackLogImporting: false,
      playbackFrameIndex: Number.isInteger(persistedState.playbackFrameIndex) ? persistedState.playbackFrameIndex : 0,
      playbackTimeUs: Number.isFinite(persistedState.playbackTimeUs) ? persistedState.playbackTimeUs : null,
      playbackLeftVisible: persistedState.playbackLeftVisible !== false,
      playbackRightVisible: persistedState.playbackRightVisible !== false,
      playbackRightTab:
        persistedState.playbackRightTab === "trace" || persistedState.playbackRightTab === "ai" ? "trace" : "blackboard",
      playbackLeftWidth: clampNumber(persistedState.playbackLeftWidth, 220, 520, 300),
      playbackRightWidth: clampNumber(persistedState.playbackRightWidth, 360, 560, 360),
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
      playbackTransitionColumnWidths: normalizePlaybackColumnWidths(
        persistedState.playbackTransitionColumnWidths,
        { time: 52, node: 100, prev: 60, status: 68 },
        { time: 44, node: 90, prev: 54, status: 62 },
        { time: 140, node: 360, prev: 160, status: 180 }
      ),
      playbackBlackboardFilter: persistedState.playbackBlackboardFilter || "",
      playbackExpandedBlackboardKeys: new Set(persistedState.playbackExpandedBlackboardKeys || []),
      playbackBlackboardScrollTop: Number.isFinite(persistedState.playbackBlackboardScrollTop)
        ? persistedState.playbackBlackboardScrollTop
        : 0,
      playbackBlackboardColumnWidths: normalizePlaybackColumnWidths(
        persistedState.playbackBlackboardColumnWidths,
        { key: 150, value: 180 },
        { key: 120, value: 140 },
        { key: 360, value: 520 }
      ),
      traceConfig: null,
      traceMessages: [],
      tracePendingRequestId: "",
      tracePendingQuestion: "",
      tracePendingContext: "",
      tracePendingFrameIndex: null,
      tracePendingFocusFrameIndex: null,
      tracePendingShouldNavigate: false,
      tracePendingAnswer: "",
      traceContextFileState: null,
      traceContextFileReading: null,
      playbackIsPlaying: false,
      playbackPlaybackSpeed: Number.isFinite(persistedState.playbackPlaybackSpeed)
        ? persistedState.playbackPlaybackSpeed
        : 1,
      currentSettings: normalizedInitialSettings,
      copiedNodeTemplate: null,
      pendingAttributeEdit: null,
      pendingAttributeSnapshots: {},
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
      "rose",
      "default",
      "custom"
    ].includes(value)
      ? value
      : DEFAULT_USER_SETTINGS.themePreset;
  }

  function normalizeInitialSettings(initialSettings, persistedState) {
    const input = initialSettings && typeof initialSettings === "object" ? initialSettings : {};
    const themePreset = normalizeThemePreset(input.themePreset || persistedState.uiPreferences?.themePreset);
    const customTheme = normalizeCustomTheme(input.customTheme || persistedState.uiPreferences?.customTheme);
    const rawLanguage = input.language || persistedState.uiPreferences?.language;
    const language = rawLanguage === "zh-CN" ? "zh-CN" : "en-US";

    return {
      language,
      themePreset,
      customTheme,
      showMainTreeLocator: input.showMainTreeLocator === true,
      showBehaviorTreeRoot: true,
      requireNodeDeleteConfirmation: input.requireNodeDeleteConfirmation === true,
      copyNodeWithDescendants: input.copyNodeWithDescendants === true,
      playbackAutoNavigateToTree: input.playbackAutoNavigateToTree === true,
      allowUnclosedPlaybackLog: true,
      traceLearningEnabled:
        input.traceLearningEnabled === true ||
        input.traceLearningEnhancementEnabled === true ||
        input.traceLearningCollectionEnabled === true ||
        input.traceLearningRemoteEnabled === true,
      traceLearningEnhancementEnabled:
        input.traceLearningEnhancementEnabled === true ||
        input.traceLearningCollectionEnabled === true ||
        input.traceLearningRemoteEnabled === true,
      nodeAttributeLayout: input.nodeAttributeLayout === "stacked" ? "stacked" : "inline",
      nodeSectionTitleMode: normalizeNodeSectionTitleMode(input.nodeSectionTitleMode),
      editTreeRenderMode: input.editTreeRenderMode === "expanded" ? "expanded" : "paged",
      playbackTreeRenderMode: input.playbackTreeRenderMode === "expanded" ? "expanded" : "paged",
      playbackPanelLayout: input.playbackPanelLayout === "dashboard" ? "dashboard" : "classic",
      playbackPanelOpacity: normalizePlaybackPanelOpacity(input.playbackPanelOpacity),
      simplifyHiddenSections: Array.isArray(input.simplifyHiddenSections) ? [...input.simplifyHiddenSections] : [],
      editAssistantWarningWhitelist: normalizeStringList(input.editAssistantWarningWhitelist),
      presetNodes: Array.isArray(input.presetNodes) ? input.presetNodes.map(clonePresetNodeSettings) : []
    };
  }

  function normalizeStringList(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    const seen = new Set();
    const result = [];
    value.forEach((entry) => {
      const normalized = typeof entry === "string" ? entry.trim() : "";
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      result.push(normalized);
    });
    return result;
  }

  function normalizeNodeSectionTitleMode(value) {
    return value === "hidden" || value === "emphasis" ? value : "regular";
  }

  function normalizePlaybackColumnWidths(value, defaults, mins, maxes) {
    const input = value && typeof value === "object" ? value : {};
    return Object.fromEntries(
      Object.entries(defaults).map(([key, fallback]) => {
        const numeric = Number(input[key]);
        const min = Number(mins[key]);
        const max = Number(maxes[key]);
        const width = Number.isFinite(numeric) ? numeric : fallback;
        return [key, Math.min(max, Math.max(min, Math.round(width)))];
      })
    );
  }

  function normalizePlaybackPanelOpacity(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return DEFAULT_USER_SETTINGS.playbackPanelOpacity;
    }
    return Math.min(0.8, Math.max(0.2, numeric));
  }

  function normalizeCustomTheme(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      primaryColor: normalizeHexColor(input.primaryColor, DEFAULT_USER_SETTINGS.customTheme.primaryColor),
      secondaryColor: normalizeHexColor(input.secondaryColor, DEFAULT_USER_SETTINGS.customTheme.secondaryColor)
    };
  }

  function normalizeHexColor(value, fallback) {
    if (typeof value !== "string") {
      return fallback;
    }
    const trimmed = value.trim();
    const shorthand = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
    if (shorthand) {
      return `#${shorthand[1]
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
        .toLowerCase()}`;
    }
    return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
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
