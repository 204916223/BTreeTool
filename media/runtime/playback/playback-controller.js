(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function create(handlers) {
    const {
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
    } = handlers;

    let playbackFrameUpdateHandle = 0;
    let pendingPlaybackFrameUpdate = null;
    let playbackAutoAdvanceHandle = 0;
    let playbackClockAnchor = null;
    const PLAYBACK_AUTO_ADVANCE_BASE_DELAY_MS = runtime.playbackConfig.autoAdvanceBaseDelayMs;
    const PLAYBACK_SPEED_OPTIONS = runtime.playbackConfig.speedOptions;
    let playbackDomCache = null;

    const { clampInteger, clampNumber } = runtime.math;
    const getTreeRenderMode = runtime.treeRender.getTreeRenderMode;
    const isExpandedTreeRenderMode = runtime.treeRender.isExpandedTreeRenderMode;
    const isPlaybackTimeBasedMode = runtime.treeRender.isPlaybackTimeBasedMode;
    const getPlaybackPanelLayout = runtime.treeRender.getPlaybackPanelLayout;
    const getTreeRenderContext = (result, scope) => runtime.treeRender.getTreeRenderContext(result, scope, getTreeMap);
    const ensureRenderSelection = runtime.treeRender.ensureRenderSelection;
    const findPlaybackFrameIndexAtTime = (log, tUs) =>
      runtime.playbackTime.findFrameIndexAtTime(log, tUs, runtime.state.playbackFrameIndex);
    const findPlaybackFrameIndexAtOrBeforeTime = (log, tUs) =>
      runtime.playbackTime.findFrameIndexAtOrBeforeTime(log, tUs, runtime.state.playbackFrameIndex);
    const getPlaybackFrameTimeUs = runtime.playbackTime.getFrameTimeUs;
    const getPlaybackFirstTimeUs = runtime.playbackTime.getFirstTimeUs;
    const getPlaybackLastTimeUs = runtime.playbackTime.getLastTimeUs;
    const clampPlaybackTimeUs = runtime.playbackTime.clampTimeUs;
    const getPlaybackStatusClassForUid = runtime.playbackData.getPlaybackStatusClassForUid;
    const getActiveTransition = runtime.playbackData.getActiveTransition;
    const getActiveTransitionAtTime = runtime.playbackData.getActiveTransitionAtTime;
    const getActiveTransitionIndex = runtime.playbackData.getActiveTransitionIndex;
    const getActiveTransitionIndexAtTime = runtime.playbackData.getActiveTransitionIndexAtTime;
    const findLastTransitionIndexAtOrBeforeFrame = runtime.playbackData.findLastTransitionIndexAtOrBeforeFrame;
    const findLastTransitionIndexBeforeFrame = runtime.playbackData.findLastTransitionIndexBeforeFrame;
    const findFirstTransitionIndexAfterFrame = runtime.playbackData.findFirstTransitionIndexAfterFrame;
    const findLastTransitionIndexAtOrBeforeTime = runtime.playbackData.findLastTransitionIndexAtOrBeforeTime;
    const findLastTransitionIndexBeforeTime = runtime.playbackData.findLastTransitionIndexBeforeTime;
    const findFirstTransitionIndexAfterTime = runtime.playbackData.findFirstTransitionIndexAfterTime;
    const getPlaybackTransitionIndexAtPosition = runtime.playbackData.getPlaybackTransitionIndexAtPosition;
    const getPlaybackTransitionPosition = runtime.playbackData.getPlaybackTransitionPosition;
    const findPlaybackNodeLocation = runtime.playbackData.findPlaybackNodeLocation;
    const buildPlaybackSnapshot = runtime.playbackData.buildPlaybackSnapshot;
    const buildPlaybackSnapshotAtTime = runtime.playbackData.buildPlaybackSnapshotAtTime;
    const getPlaybackCache = runtime.playbackData.getPlaybackCache;
    const resolvePlaybackNodeName = runtime.playbackData.resolvePlaybackNodeName;
    const playbackTransitions = runtime.playbackTransitions.create({
      persistUiState,
      isPlaybackTimeBasedMode,
      setPlaybackTime,
      setPlaybackFrame,
      shouldAutoNavigatePlayback,
      normalizeFilter,
      clampNumber,
      normalizeStatusClass,
      formatTransitionTime,
      resolvePlaybackNodeName,
      getCurrentPlaybackTimeUs,
      getPlaybackDomCache,
      invalidatePlaybackDomCache,
      getActiveTransitionIndexAtTime,
      getActiveTransitionIndex,
      getPlaybackTransitionIndexAtPosition,
      getPlaybackTransitionPosition,
      getPlaybackTransitionListModel
    });
    const renderPlaybackTransitionPanel = playbackTransitions.renderPanel;
    const stagePlaybackTransitionUidFilter = playbackTransitions.stageUidFilter;
    const updatePlaybackActiveTransition = playbackTransitions.updateActive;
    const playbackTransport = runtime.playbackTransport.create({
      persistUiState,
      togglePlayback,
      normalizePlaybackSpeed,
      reschedulePlaybackAutoAdvance,
      stepPlaybackTransition,
      requestPlaybackFrame,
      setPlaybackFrame,
      shouldAutoNavigatePlayback,
      formatRelativeTime,
      formatWallTime
    });
    const renderPlaybackTimeline = playbackTransport.renderTimeline;
    const updatePlaybackTimelineControls = playbackTransport.updateControls;
    const bindPlaybackRepeatButton = playbackTransport.bindRepeatButton;
    const createPlaybackTransportIcon = playbackTransport.createTransportIcon;
    const playbackDurationTimeline = runtime.playbackDurationTimeline.create({
      persistUiState,
      togglePlayback,
      normalizePlaybackSpeed,
      updatePlaybackTimelineControls,
      reschedulePlaybackAutoAdvance,
      bindPlaybackRepeatButton,
      stepPlaybackTransition,
      createPlaybackTransportIcon,
      clampPlaybackTimeUs,
      setPlaybackTime,
      requestPlaybackTime,
      formatTransitionTime,
      formatPlaybackTimelineClock,
      normalizeStatusClass,
      clampNumber
    });
    const renderPlaybackDurationTimeline = playbackDurationTimeline.renderTimeline;
    const syncPlaybackDurationTimeline = playbackDurationTimeline.syncTimeline;
    const playbackBlackboard = runtime.playbackBlackboard.create({
      buildCurrentPlaybackSnapshot,
      persistUiState,
      normalizeFilter
    });
    const renderPlaybackBlackboardPanel = playbackBlackboard.renderPanel;
    const updatePlaybackBlackboardPanel = playbackBlackboard.updatePanel;
    const flattenBlackboardRows = playbackBlackboard.flattenRows;
    const playbackTrace = runtime.playbackTrace.create({
      vscode,
      buildCurrentPlaybackSnapshot,
      getCurrentPlaybackTimeUs,
      isPlaybackTimeBasedMode,
      getActiveTransitionAtTime,
      getActiveTransition,
      resolvePlaybackNodeName,
      getSelectedTree,
      formatRelativeTime,
      formatPlaybackTimelineClock,
      flattenBlackboardRows
    });
    const renderPlaybackTracePanel = playbackTrace.renderPanel;
    const updatePlaybackTracePanel = playbackTrace.updatePanel;
    const handleTraceAnswerChunk = playbackTrace.handleAnswerChunk;
    const handleTraceAnswer = playbackTrace.handleAnswer;
    const clearTraceMessages = playbackTrace.clearMessages;
    const playbackRightPanel = runtime.playbackRightPanel.create({
      renderBlackboardPanel: renderPlaybackBlackboardPanel,
      renderTracePanel: renderPlaybackTracePanel,
      persistUiState
    });
    const renderPlaybackRightPanel = playbackRightPanel.renderPanel;
    const getPlaybackTraceLabel = playbackRightPanel.getTraceLabel;
    const playbackDashboard = runtime.playbackDashboard.create({
      renderPlaybackDurationTimeline,
      renderPlaybackBlackboardPanel,
      renderPlaybackTracePanel,
      getPlaybackTraceLabel,
      renderPlaybackLog,
      syncPlaybackFrameUi,
      reschedulePlaybackAutoAdvance,
      invalidatePlaybackDomCache,
      persistUiState
    });
    const renderPlaybackDashboardLog = playbackDashboard.renderLog;

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
        runtime.refs.treeContent.replaceChildren(runtime.startupState.buildPlaybackImportState(appCopy));
        runtime.mainTreeLocator.clear();
      }
      updateSaveIndicator();
      runtime.search.updateUi();
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
      invalidatePlaybackDomCache();
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
      resetPlaybackClockAnchor(log);
      updatePlaybackTimelineControls(log);
      reschedulePlaybackAutoAdvance(log);
    }

    function pausePlayback() {
      runtime.state.playbackIsPlaying = false;
      playbackClockAnchor = null;
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

      reschedulePlaybackFrameAutoAdvance(log);
    }

    function reschedulePlaybackFrameAutoAdvance(log) {
      if (!log.frames || runtime.state.playbackFrameIndex >= log.frames.length - 1) {
        pausePlayback();
        return;
      }

      playbackAutoAdvanceHandle = window.setTimeout(() => {
        playbackAutoAdvanceHandle = 0;
        if (!runtime.state.playbackIsPlaying || runtime.state.playbackLog !== log) {
          return;
        }

        const anchor = ensurePlaybackClockAnchor(log, "frame");
        const elapsedMs = Math.max(0, performance.now() - anchor.realMs);
        const targetFrameIndex = Math.min(
          log.frames.length - 1,
          anchor.frameIndex + Math.floor((elapsedMs * anchor.speed) / PLAYBACK_AUTO_ADVANCE_BASE_DELAY_MS)
        );

        if (targetFrameIndex <= runtime.state.playbackFrameIndex) {
          reschedulePlaybackAutoAdvance(log);
          return;
        }

        setPlaybackFrame(log, targetFrameIndex, {
          navigateToActiveNode: shouldAutoNavigatePlayback(),
          scrollList: true,
          focusNode: false,
          persist: true,
          fromAutoAdvance: true
        });
        if (targetFrameIndex >= log.frames.length - 1) {
          pausePlayback();
          return;
        }
        reschedulePlaybackAutoAdvance(log);
      }, PLAYBACK_AUTO_ADVANCE_BASE_DELAY_MS);
    }

    function reschedulePlaybackTimeAutoAdvance(log) {
      const lastTimeUs = getPlaybackLastTimeUs(log);
      if (getCurrentPlaybackTimeUs(log, null) >= lastTimeUs) {
        pausePlayback();
        return;
      }

      playbackAutoAdvanceHandle = window.setTimeout(() => {
        playbackAutoAdvanceHandle = 0;
        if (!runtime.state.playbackIsPlaying || runtime.state.playbackLog !== log) {
          return;
        }

        const anchor = ensurePlaybackClockAnchor(log, "time");
        const elapsedMs = Math.max(0, performance.now() - anchor.realMs);
        const nextTimeUs = Math.min(lastTimeUs, anchor.timeUs + elapsedMs * 1000 * anchor.speed);
        setPlaybackTime(log, nextTimeUs, {
          navigateToActiveNode: shouldAutoNavigatePlayback(),
          scrollList: true,
          focusNode: false,
          persist: true,
          updateBlackboard: true,
          fromAutoAdvance: true
        });
        if (nextTimeUs >= lastTimeUs) {
          pausePlayback();
          return;
        }
        reschedulePlaybackAutoAdvance(log);
      }, PLAYBACK_AUTO_ADVANCE_BASE_DELAY_MS);
    }

    function resetPlaybackClockAnchor(log) {
      const mode = isPlaybackTimeBasedMode() ? "time" : "frame";
      playbackClockAnchor = {
        log,
        mode,
        realMs: performance.now(),
        speed: normalizePlaybackSpeed(runtime.state.playbackPlaybackSpeed),
        frameIndex: runtime.state.playbackFrameIndex,
        timeUs: getCurrentPlaybackTimeUs(log, null)
      };
    }

    function ensurePlaybackClockAnchor(log, mode) {
      const speed = normalizePlaybackSpeed(runtime.state.playbackPlaybackSpeed);
      if (
        !playbackClockAnchor ||
        playbackClockAnchor.log !== log ||
        playbackClockAnchor.mode !== mode ||
        playbackClockAnchor.speed !== speed
      ) {
        resetPlaybackClockAnchor(log);
      }
      return playbackClockAnchor;
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
      if (runtime.state.playbackIsPlaying && options.fromAutoAdvance !== true) {
        resetPlaybackClockAnchor(log);
      }

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
      if (runtime.state.playbackIsPlaying && options.fromAutoAdvance !== true) {
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
      if (runtime.state.playbackIsPlaying && options.fromAutoAdvance !== true) {
        resetPlaybackClockAnchor(log);
      }

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
      if (runtime.state.playbackIsPlaying && options.fromAutoAdvance !== true) {
        reschedulePlaybackAutoAdvance(log);
      }
      if (options.persist) {
        persistUiState();
      }
    }

    function shouldAutoNavigatePlayback() {
      return runtime.state.currentSettings?.playbackAutoNavigateToTree === true;
    }

    function getCurrentPlaybackTimeUs(log, model) {
      return clampPlaybackTimeUs(log, runtime.state.playbackTimeUs ?? model?.firstTime ?? 0);
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

    function invalidatePlaybackDomCache() {
      playbackDomCache = null;
    }

    function appendDomCacheEntry(map, key, element) {
      const entries = map.get(key) || [];
      entries.push(element);
      map.set(key, entries);
    }

    function getPlaybackTransitionListModel(log, filter = normalizeFilter(runtime.state.playbackTransitionFilter)) {
      return runtime.playbackData.getPlaybackTransitionListModel(log, filter);
    }

    function buildCurrentPlaybackSnapshot(log, options = {}) {
      if (isPlaybackTimeBasedMode()) {
        return buildPlaybackSnapshotAtTime(log, getCurrentPlaybackTimeUs(log, null), options);
      }
      return buildPlaybackSnapshot(log, runtime.state.playbackFrameIndex, options);
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

    function normalizePlaybackSpeed(value) {
      const numeric = Number(value);
      return PLAYBACK_SPEED_OPTIONS.some((option) => option.value === numeric) ? numeric : 1;
    }

    return {
      renderPlaybackState,
      renderPlaybackLog,
      togglePlayback,
      pausePlayback,
      stagePlaybackTransitionUidFilter,
      updatePlaybackTracePanel,
      handleTraceAnswerChunk,
      handleTraceAnswer,
      clearTraceMessages,
      getPlaybackFrameTimeUs,
      buildCurrentPlaybackSnapshot
    };
  }

  runtime.playbackController = {
    create
  };
})();
