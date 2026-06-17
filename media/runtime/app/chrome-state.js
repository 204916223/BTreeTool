(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function applyUserSettings() {
    const chromeCopy = runtime.i18n.getChromeCopy();
    const catalogCopy = runtime.i18n.getCatalogCopy();
    const themePreset = runtime.state.currentSettings?.themePreset || "midnight";
    document.documentElement.dataset.btreeTheme = themePreset;
    applyCustomThemeColors(runtime.state.currentSettings?.customTheme);
    document.documentElement.lang = runtime.state.currentSettings?.language || "en-US";
    document.documentElement.dataset.nodeAttributeLayout =
      runtime.state.currentSettings?.nodeAttributeLayout === "stacked" ? "stacked" : "inline";
    document.documentElement.dataset.nodeSectionTitleMode =
      normalizeNodeSectionTitleMode(runtime.state.currentSettings?.nodeSectionTitleMode);
    applyPlaybackPanelOpacity(runtime.state.currentSettings?.playbackPanelOpacity);
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

  function applyPlaybackPanelOpacity(value) {
    const numeric = Number(value);
    const opacity = Number.isFinite(numeric) ? Math.min(0.8, Math.max(0.2, numeric)) : 0.6;
    document.documentElement.style.setProperty("--playback-panel-opacity", `${Math.round(opacity * 100)}%`);
  }

  function applyCustomThemeColors(customTheme = {}) {
    const primaryColor = normalizeHexColor(customTheme.primaryColor, "#5e8de6");
    const secondaryColor = normalizeHexColor(customTheme.secondaryColor, "#df78cf");
    const averageColor = mixHexColors(primaryColor, secondaryColor, 0.5);
    const averageLuminance = relativeLuminance(averageColor);
    const isDarkTheme = averageLuminance < 0.48;
    const surfaceMixColor = isDarkTheme ? "#111827" : "#ffffff";
    const surfaceTextColor = isDarkTheme ? "#ffffff" : "#111827";
    const gradientTextColor = readableTextColor(averageColor);
    document.documentElement.style.setProperty("--custom-theme-color-a", primaryColor);
    document.documentElement.style.setProperty("--custom-theme-color-b", secondaryColor);
    document.documentElement.style.setProperty("--custom-theme-color-scheme", isDarkTheme ? "dark" : "light");
    document.documentElement.style.setProperty("--custom-theme-mix-color", surfaceMixColor);
    document.documentElement.style.setProperty("--custom-theme-on-surface", surfaceTextColor);
    document.documentElement.style.setProperty("--custom-theme-on-gradient", gradientTextColor);
  }

  function normalizeHexColor(value, fallback) {
    if (typeof value !== "string") {
      return fallback;
    }
    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    const shorthand = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
    if (!shorthand) {
      return fallback;
    }
    return `#${shorthand[1]
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
      .toLowerCase()}`;
  }

  function normalizeNodeSectionTitleMode(value) {
    return value === "hidden" || value === "emphasis" ? value : "regular";
  }

  function mixHexColors(left, right, rightWeight = 0.5) {
    const leftRgb = hexToRgb(left);
    const rightRgb = hexToRgb(right);
    const leftWeight = 1 - rightWeight;
    return rgbToHex({
      r: Math.round(leftRgb.r * leftWeight + rightRgb.r * rightWeight),
      g: Math.round(leftRgb.g * leftWeight + rightRgb.g * rightWeight),
      b: Math.round(leftRgb.b * leftWeight + rightRgb.b * rightWeight)
    });
  }

  function relativeLuminance(hex) {
    const rgb = hexToRgb(hex);
    const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function readableTextColor(backgroundHex) {
    const backgroundLuminance = relativeLuminance(backgroundHex);
    const blackContrast = contrastRatio(backgroundLuminance, relativeLuminance("#111827"));
    const whiteContrast = contrastRatio(backgroundLuminance, relativeLuminance("#ffffff"));
    return blackContrast >= whiteContrast ? "#111827" : "#ffffff";
  }

  function contrastRatio(leftLuminance, rightLuminance) {
    const lighter = Math.max(leftLuminance, rightLuminance);
    const darker = Math.min(leftLuminance, rightLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function hexToRgb(hex) {
    const normalized = normalizeHexColor(hex, "#000000").slice(1);
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16)
    };
  }

  function rgbToHex(rgb) {
    const toHex = (value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
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
