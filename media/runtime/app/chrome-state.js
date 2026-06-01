(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

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

  runtime.chromeState = {
    applyUserSettings,
    updateSplitViewButton,
    updateSaveIndicator,
    updateEditModeButton
  };
})();
