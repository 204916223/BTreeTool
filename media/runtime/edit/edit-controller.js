(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function start({ vscode, persistedState, initialMode, initialSettings }) {
    runtime.vscode = vscode;
    runtime.setNeutralDragImage = runtime.dragImage.setNeutralDragImage;
    runtime.state = runtime.appState.createInitialState(persistedState, initialMode, initialSettings);

    runtime.refs = runtime.domRefs.createRefs(document);
    const getTreeRenderContext = (result, scope) => runtime.treeRender.getTreeRenderContext(result, scope, getTreeMap);
    const ensureRenderSelection = runtime.treeRender.ensureRenderSelection;
    const applyUserSettings = runtime.chromeState.applyUserSettings;
    const updateSplitViewButton = runtime.chromeState.updateSplitViewButton;
    const updateSaveIndicator = runtime.chromeState.updateSaveIndicator;
    const updateEditModeButton = runtime.chromeState.updateEditModeButton;
    const editSplitView = runtime.editSplitView.create({
      getTreeMap,
      getSelectedTree,
      pickNodePath,
      emptyState,
      persistUiState,
      selectTreeInPane,
      activateTreePane,
      updateSplitPaneActiveState
    });
    const renderSplitTreeView = editSplitView.renderSplitTreeView;
    const getCanvasViewportState = editSplitView.getCanvasViewportState;
    const getSplitViewportStates = editSplitView.getSplitViewportStates;
    const ensureSplitPaneState = editSplitView.ensureSplitPaneState;
    const playbackController = runtime.playbackController.create({
      vscode,
      getTreeMap,
      getSelectedTree,
      renderCurrentTree,
      updateSplitViewButton,
      updateSaveIndicator,
      persistUiState,
      emptyState,
      getCanvasViewportState,
      pickNodePath
    });
    const renderPlaybackState = playbackController.renderPlaybackState;
    const renderPlaybackLog = playbackController.renderPlaybackLog;
    const togglePlayback = playbackController.togglePlayback;
    const pausePlayback = playbackController.pausePlayback;
    const stagePlaybackTransitionUidFilter = playbackController.stagePlaybackTransitionUidFilter;
    const updatePlaybackTracePanel = playbackController.updatePlaybackTracePanel;
    const handleTraceAnswerChunk = playbackController.handleTraceAnswerChunk;
    const handleTraceAnswer = playbackController.handleTraceAnswer;
    const clearTraceMessages = playbackController.clearTraceMessages;
    const getPlaybackFrameTimeUs = playbackController.getPlaybackFrameTimeUs;
    const buildCurrentPlaybackSnapshot = playbackController.buildCurrentPlaybackSnapshot;

    runtime.app = {
      render,
      renderCurrentTree,
      renderPlaybackState,
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

    runtime.mainEvents.bindWebviewMessages({
      render,
      updateSaveIndicator,
      pausePlayback,
      clearTraceMessages,
      getPlaybackFrameTimeUs,
      pickTreeId,
      persistUiState,
      updateEditModeButton,
      renderPlaybackState,
      emptyState,
      buildCurrentPlaybackSnapshot,
      updatePlaybackTracePanel,
      handleTraceAnswer,
      handleTraceAnswerChunk
    });
    runtime.mainEvents.bindGlobalKeys({
      togglePlayback
    });

    runtime.catalog.init();
    runtime.overlays.init();
    runtime.viewport.init();
    runtime.workspacePanels.enableResize(runtime.refs.catalogResizer, "catalog");
    runtime.mainEvents.bindChromeControls({
      persistUiState,
      setPreviewMode,
      ensureSplitPaneState,
      updateSplitViewButton
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
      const useLightAttributeRefresh = canUseLightAttributeRefresh(payload, result);
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
      if (useLightAttributeRefresh) {
        updateSaveIndicator();
        runtime.search.updateUi();
        return;
      }
      renderCurrentTree(result, { preserveViewport: hadViewport });
      updateSaveIndicator();
      runtime.search.updateUi();
    }

    function canUseLightAttributeRefresh(payload, result) {
      const pending = runtime.state.pendingAttributeEdit;
      const previous = runtime.state.currentPreview;
      if (!pending || !previous || !payload?.hasDocument || payload.parseError || !result || runtime.modeRules.isPlaybackMode()) {
        return false;
      }

      const incomingDocumentPath = payload.fileName || "";
      if (incomingDocumentPath !== runtime.state.currentDocumentPath) {
        return false;
      }

      if (Boolean(previous.hasBlockingIssues) !== Boolean(result.hasBlockingIssues)) {
        return false;
      }

      if (JSON.stringify(previous.warnings || []) !== JSON.stringify(result.warnings || [])) {
        return false;
      }

      const nextNode = getNodeFromResult(result, pending.treeId, pending.nodePath);
      if (!nextNode || !attributesEqual(nextNode.attributes || {}, pending.attributes || {})) {
        return false;
      }

      return samePreviewShapeAndVisuals(previous, result, pending);
    }

    function samePreviewShapeAndVisuals(previous, next, pending) {
      const previousTrees = previous.behaviorTrees || [];
      const nextTrees = next.behaviorTrees || [];
      if (previousTrees.length !== nextTrees.length) {
        return false;
      }

      for (let index = 0; index < previousTrees.length; index += 1) {
        const previousTree = previousTrees[index];
        const nextTree = nextTrees[index];
        if (previousTree.id !== nextTree.id) {
          return false;
        }
        if (!sameNodeShapeAndVisuals(previousTree.node, nextTree.node, previousTree.id, pending)) {
          return false;
        }
      }

      return JSON.stringify(previous.catalog || []) === JSON.stringify(next.catalog || []);
    }

    function sameNodeShapeAndVisuals(previousNode, nextNode, treeId, pending) {
      if (!previousNode || !nextNode) {
        return previousNode === nextNode;
      }
      if (previousNode.nodePath !== nextNode.nodePath || previousNode.kind !== nextNode.kind) {
        return false;
      }

      const isPendingNode = treeId === pending.treeId && previousNode.nodePath === pending.nodePath;
      if (!sameNodeVisualSignature(previousNode, nextNode, isPendingNode ? pending.attributeKey : "")) {
        return false;
      }

      const previousChildren = previousNode.children || [];
      const nextChildren = nextNode.children || [];
      if (previousChildren.length !== nextChildren.length) {
        return false;
      }

      for (let index = 0; index < previousChildren.length; index += 1) {
        if (!sameNodeShapeAndVisuals(previousChildren[index], nextChildren[index], treeId, pending)) {
          return false;
        }
      }

      return true;
    }

    function sameNodeVisualSignature(previousNode, nextNode, changingAttributeKey) {
      const previousSignature = toNodeVisualSignature(previousNode, changingAttributeKey);
      const nextSignature = toNodeVisualSignature(nextNode, changingAttributeKey);
      return JSON.stringify(previousSignature) === JSON.stringify(nextSignature);
    }

    function toNodeVisualSignature(node, changingAttributeKey) {
      return {
        title: node.title,
        instanceName: node.instanceName,
        kind: node.kind,
        category: node.category,
        targetTreeId: node.targetTreeId,
        description: node.description,
        code: node.code,
        summary: node.summary,
        modelKind: node.modelKind,
        warningCount: node.warningCount,
        hasError: node.hasError,
        warnings: node.warnings || [],
        ioGroups: normalizeAttributeGroups(node.ioGroups, changingAttributeKey),
        attributeFields: normalizeAttributeFields(node.attributeFields, changingAttributeKey),
        editorFields: normalizeAttributeFields(node.editorFields, changingAttributeKey)
      };
    }

    function normalizeAttributeGroups(groups, changingAttributeKey) {
      const normalize = (items) =>
        (items || []).map((item) => ({
          ...item,
          value: item.key === changingAttributeKey ? "" : item.value
        }));
      return {
        inputs: normalize(groups?.inputs),
        outputs: normalize(groups?.outputs),
        params: normalize(groups?.params)
      };
    }

    function normalizeAttributeFields(fields, changingAttributeKey) {
      return (fields || []).map((field) => ({
        ...field,
        value: field.key === changingAttributeKey ? "" : field.value
      }));
    }

    function attributesEqual(left, right) {
      return JSON.stringify(left || {}) === JSON.stringify(right || {});
    }

    function getNodeFromResult(result, treeId, nodePath) {
      const tree = (result.behaviorTrees || []).find((entry) => entry.id === treeId);
      return tree ? findNodeByPath(tree.node, nodePath) : null;
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
      runtime.refs.treeContent.replaceChildren(runtime.startupState.buildNoDocumentState(appCopy));
      runtime.mainTreeLocator.clear();
      updateSaveIndicator();
      runtime.search.updateUi();
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
          customTheme: runtime.state.currentSettings?.customTheme || null,
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
        playbackDurationScrollLeft: runtime.state.playbackDurationScrollLeft || 0,
        playbackDurationScrollTop: runtime.state.playbackDurationScrollTop || 0,
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

  }

  runtime.editController = {
    start
  };
})();
