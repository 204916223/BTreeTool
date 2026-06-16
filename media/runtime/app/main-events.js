(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function bindWebviewMessages(handlers) {
    window.addEventListener("message", (event) => {
      const message = event.data;

      if (message?.type === "btreeDocument") {
        handlers.render(message.payload);
        return;
      }

      if (message?.type === "editResult") {
        if (message.payload?.dirtyState === "dirty") {
          runtime.state.hasUnsavedXmlChanges = true;
        } else if (message.payload?.dirtyState === "saved") {
          runtime.state.hasUnsavedXmlChanges = false;
        }
        handlers.updateSaveIndicator();
        runtime.overlays.handleEditResult?.(message.payload);
        runtime.canvas.finishPendingAttributeEdit?.(message.payload?.ok !== false);
      }

      if (message?.type === "nodeClipboardState") {
        runtime.state.hasSharedNodeTemplate = message.payload?.hasNodeTemplate === true;
        runtime.overlays.syncNodeContextMenu?.();
        return;
      }

      if (message?.type === "shortcutAction") {
        if (message.payload?.action === "undo") {
          runtime.vscode.postMessage({ type: "undoCurrentDocument" });
          return;
        }
        runtime.overlays.executeNodeShortcutAction?.(message.payload?.action);
        return;
      }

      if (message?.type === "settingsUpdated") {
        runtime.state.currentSettings = message.payload?.settings || runtime.state.currentSettings;
        runtime.state.settingsFilePath = message.payload?.settingsFilePath || runtime.state.settingsFilePath || "";
        runtime.app.applyUserSettings?.();
        return;
      }

      if (message?.type === "playbackLog") {
        handlers.pausePlayback();
        runtime.state.playbackLogImporting = false;
        const previousLogPath = runtime.state.playbackLog?.filePath || "";
        runtime.state.playbackLog = message.payload || null;
        const nextLogPath = runtime.state.playbackLog?.filePath || "";
        if (previousLogPath !== nextLogPath) {
          handlers.clearTraceMessages();
        }
        runtime.state.playbackFrameIndex = 0;
        runtime.state.playbackTimeUs = handlers.getPlaybackFrameTimeUs(runtime.state.playbackLog, 0);
        runtime.state.editModeEnabled = false;
        runtime.state.playbackIsPlaying = false;
        runtime.state.selectedTreeId = message.payload?.preview ? handlers.pickTreeId(message.payload.preview) : null;
        runtime.state.selectedNodePath = "0";
        handlers.persistUiState();
        runtime.workspacePanels.apply();
        handlers.updateEditModeButton();
        handlers.renderPlaybackState();
        return;
      }

      if (message?.type === "playbackLogError") {
        handlers.pausePlayback();
        runtime.state.playbackLogImporting = false;
        runtime.state.playbackLog = null;
        handlers.clearTraceMessages();
        runtime.refs.treeContent.replaceChildren(
          handlers.emptyState(message.payload?.message || "Failed to load playback log.")
        );
      }

      if (message?.type === "playbackLogImportFinished") {
        runtime.state.playbackLogImporting = false;
        if (runtime.modeRules?.isPlaybackMode?.() && !runtime.state.playbackLog) {
          handlers.renderPlaybackState();
        }
        return;
      }

      if (message?.type === "traceConfigState") {
        runtime.state.traceConfig = message.payload || null;
        const log = runtime.state.playbackLog;
        const snapshot = log ? handlers.buildCurrentPlaybackSnapshot(log) : null;
        handlers.updatePlaybackTracePanel(log, snapshot);
        return;
      }

      if (message?.type === "traceAnswer") {
        handlers.handleTraceAnswer(message.payload);
        return;
      }

      if (message?.type === "traceAnswerChunk") {
        handlers.handleTraceAnswerChunk(message.payload);
        return;
      }

      if (message?.type === "traceContextFileState") {
        runtime.state.traceContextFileState = message.payload || null;
        runtime.state.traceContextFileReading = null;
        const log = runtime.state.playbackLog;
        const snapshot = log ? handlers.buildCurrentPlaybackSnapshot(log) : null;
        handlers.updatePlaybackTracePanel(log, snapshot);
        return;
      }

      if (message?.type === "editAssistantAnswer") {
        runtime.editAssistant?.handleAnswer?.(message.payload);
        return;
      }

      if (message?.type === "panelVisibility") {
        if (message.payload?.visible === false) {
          handlers.pausePlayback();
        }
        return;
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        handlers.pausePlayback();
      }
    });

    window.addEventListener("pagehide", () => {
      handlers.pausePlayback();
    });
  }

  function bindGlobalKeys(handlers = {}) {
    const shortcutState = {
      chord: null,
      resetHandle: 0
    };

    window.addEventListener("keydown", (event) => {
      if (handleNodeShortcutChord(event, shortcutState)) {
        return;
      }

      if (event.code === "Space") {
        if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) {
          return;
        }

        if (event.target instanceof HTMLElement && event.target.isContentEditable) {
          return;
        }

        if (runtime.modeRules.isPlaybackMode()) {
          event.preventDefault();
          if (!event.repeat && runtime.state.playbackLog && typeof handlers.togglePlayback === "function") {
            handlers.togglePlayback(runtime.state.playbackLog);
          }
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
  }

  function bindChromeControls(handlers) {
    runtime.refs.toggleCatalogButton?.addEventListener("click", () => {
      runtime.state.showCatalog = !runtime.state.showCatalog;
      handlers.persistUiState();
      runtime.workspacePanels.apply();
    });
    runtime.refs.toggleEditAssistantButton?.addEventListener("click", () => {
      runtime.editAssistant?.setVisible?.(!runtime.state.editAssistantVisible);
    });

    runtime.refs.editModeButton?.addEventListener("click", () => {
      handlers.setPreviewMode("edit");
    });
    runtime.refs.playbackModeButton?.addEventListener("click", () => {
      handlers.setPreviewMode("playback");
    });
    runtime.refs.fileLabel?.addEventListener("click", () => {
      if (runtime.modeRules.isPlaybackMode()) {
        requestPlaybackLogImport();
      }
    });
    runtime.refs.fileLabel?.addEventListener("keydown", (event) => {
      if (!runtime.modeRules.isPlaybackMode() || (event.key !== "Enter" && event.key !== " ")) {
        return;
      }
      event.preventDefault();
      requestPlaybackLogImport();
    });
    runtime.refs.openSettingsButton?.addEventListener("click", () => {
      runtime.overlays.showSettingsDialog();
    });
    runtime.refs.splitViewButton?.addEventListener("click", () => {
      runtime.state.splitViewEnabled = !runtime.state.splitViewEnabled;
      if (runtime.state.currentPreview) {
        handlers.ensureSplitPaneState(runtime.state.currentPreview);
        runtime.app.renderCurrentTree(runtime.state.currentPreview, { preserveViewport: true });
      } else {
        handlers.updateSplitViewButton();
      }
      handlers.persistUiState();
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

      runtime.vscode.postMessage({ type: "saveCurrentDocument" });
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
  }

  function handleNodeShortcutChord(event, shortcutState) {
    if (!isNodeShortcutEvent(event)) {
      resetNodeShortcutChord(shortcutState);
      return false;
    }

    const key = String(event.key || "").toLowerCase();
    if (shortcutState.chord === "c" && key === "c") {
      event.preventDefault();
      resetNodeShortcutChord(shortcutState);
      runtime.overlays.executeNodeShortcutAction?.("copy");
      return true;
    }
    if (shortcutState.chord === "c" && key === "v") {
      event.preventDefault();
      resetNodeShortcutChord(shortcutState);
      runtime.overlays.executeNodeShortcutAction?.("pasteSmart");
      return true;
    }
    if (shortcutState.chord === "z" && key === "z") {
      event.preventDefault();
      resetNodeShortcutChord(shortcutState);
      runtime.vscode.postMessage({ type: "undoCurrentDocument" });
      return true;
    }
    if (key === "c" || key === "z") {
      event.preventDefault();
      shortcutState.chord = key;
      scheduleNodeShortcutChordReset(shortcutState);
      return true;
    }

    resetNodeShortcutChord(shortcutState);
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

  function scheduleNodeShortcutChordReset(shortcutState) {
    if (shortcutState.resetHandle) {
      clearTimeout(shortcutState.resetHandle);
    }
    shortcutState.resetHandle = window.setTimeout(() => resetNodeShortcutChord(shortcutState), 900);
  }

  function resetNodeShortcutChord(shortcutState) {
    shortcutState.chord = null;
    if (shortcutState.resetHandle) {
      clearTimeout(shortcutState.resetHandle);
      shortcutState.resetHandle = 0;
    }
  }

  function requestPlaybackLogImport() {
    if (runtime.state.playbackLogImporting) {
      return;
    }
    runtime.state.playbackLogImporting = true;
    if (runtime.modeRules?.isPlaybackMode?.()) {
      runtime.app.renderPlaybackState?.();
    }
    runtime.vscode.postMessage({ type: "choosePlaybackLogFile" });
  }

  runtime.mainEvents = {
    bindWebviewMessages,
    bindGlobalKeys,
    bindChromeControls,
    requestPlaybackLogImport
  };
})();
