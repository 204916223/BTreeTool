(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const overlayRuntime = (runtime.overlayRuntime = runtime.overlayRuntime || {});
  const overlayState = (overlayRuntime.state = overlayRuntime.state || {});
  const shared = overlayRuntime.shared;

  function createSettingsDialog() {
    const element = document.createElement("div");
    element.className = "node-picker settings-dialog";
    element.hidden = true;

    const backdrop = document.createElement("div");
    backdrop.className = "node-picker-backdrop";
    backdrop.addEventListener("click", hideSettingsDialog);

    const dialog = document.createElement("div");
    dialog.className = "node-picker-dialog settings-dialog-panel";

    const header = document.createElement("div");
    header.className = "node-picker-header";

    const title = document.createElement("strong");
    title.className = "node-picker-title";
    title.textContent = "Settings";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "settings-close-button";
    closeButton.textContent = "X";
    closeButton.addEventListener("click", hideSettingsDialog);

    const form = document.createElement("div");
    form.className = "settings-form";

    const commonSection = createSettingsSection("General Mode");
    const languageRow = createInlineField("Language");
    const languageSelect = document.createElement("select");
    languageSelect.className = "attribute-input";
    languageRow.control.appendChild(languageSelect);
    const themeRow = createInlineField("Theme");
    const themeSelect = document.createElement("select");
    themeSelect.className = "attribute-input";
    themeRow.control.appendChild(themeSelect);
    commonSection.body.appendChild(languageRow.element);
    commonSection.body.appendChild(themeRow.element);

    const nodeLayoutRow = createInlineField("Node Layout");
    nodeLayoutRow.element.classList.add("settings-inline-field-horizontal");
    const nodeLayoutControl = createSegmentedControl([
      { value: "stacked", label: "上下布局" },
      { value: "inline", label: "左右布局" }
    ]);
    nodeLayoutRow.control.appendChild(nodeLayoutControl.element);
    commonSection.body.appendChild(nodeLayoutRow.element);

    const detailTitle = document.createElement("div");
    detailTitle.className = "settings-detail-title";
    detailTitle.textContent = "Node Display";
    const detailGrid = document.createElement("div");
    detailGrid.className = "settings-detail-grid";
    const detailSwitches = createDetailSwitches();
    detailSwitches.forEach((entry) => {
      detailGrid.appendChild(entry.switchControl.element);
    });
    commonSection.body.appendChild(detailTitle);
    commonSection.body.appendChild(detailGrid);

    const editSection = createSettingsSection("Edit Mode");
    editSection.element.classList.add("settings-section-edit");
    const editTreeRenderModeRow = createInlineField("Tree Render");
    editTreeRenderModeRow.element.classList.add("settings-inline-field-horizontal");
    const editTreeRenderModeControl = createSegmentedControl([
      { value: "paged", label: "Tree tabs" },
      { value: "expanded", label: "Full tree" }
    ]);
    editTreeRenderModeRow.control.appendChild(editTreeRenderModeControl.element);
    editSection.body.appendChild(editTreeRenderModeRow.element);

    const editRow = document.createElement("div");
    editRow.className = "settings-toggle-row";

    const mainTreeLocatorSwitch = createSettingsSwitch("MainTree Locator");
    const mainTreeLocatorInput = mainTreeLocatorSwitch.input;
    const mainTreeLocatorText = mainTreeLocatorSwitch.text;
    editRow.appendChild(mainTreeLocatorSwitch.element);

    const behaviorTreeRootSwitch = createSettingsSwitch("ROOT");
    const behaviorTreeRootInput = behaviorTreeRootSwitch.input;
    const behaviorTreeRootText = behaviorTreeRootSwitch.text;
    editRow.appendChild(behaviorTreeRootSwitch.element);

    const deleteConfirmSwitch = createSettingsSwitch("Delete Confirm");
    const deleteConfirmInput = deleteConfirmSwitch.input;
    const deleteConfirmText = deleteConfirmSwitch.text;
    editRow.appendChild(deleteConfirmSwitch.element);

    const copyDescendantsSwitch = createSettingsSwitch("Copy Descendants");
    const copyDescendantsInput = copyDescendantsSwitch.input;
    const copyDescendantsText = copyDescendantsSwitch.text;
    editRow.appendChild(copyDescendantsSwitch.element);
    editSection.body.appendChild(editRow);

    const playbackSection = createSettingsSection("Playback Mode");
    playbackSection.element.classList.add("settings-section-playback");
    const playbackTreeRenderModeRow = createInlineField("Tree Render");
    playbackTreeRenderModeRow.element.classList.add("settings-inline-field-horizontal");
    const playbackTreeRenderModeControl = createSegmentedControl([
      { value: "paged", label: "Tree tabs" },
      { value: "expanded", label: "Full tree" }
    ]);
    playbackTreeRenderModeRow.control.appendChild(playbackTreeRenderModeControl.element);
    playbackSection.body.appendChild(playbackTreeRenderModeRow.element);

    const playbackPanelLayoutRow = createInlineField("Playback Layout");
    playbackPanelLayoutRow.element.classList.add("settings-inline-field-horizontal");
    const playbackPanelLayoutControl = createSegmentedControl([
      { value: "classic", label: "Panels" },
      { value: "dashboard", label: "Timeline" }
    ]);
    playbackPanelLayoutRow.control.appendChild(playbackPanelLayoutControl.element);
    playbackSection.body.appendChild(playbackPanelLayoutRow.element);

    const playbackRow = document.createElement("div");
    playbackRow.className = "settings-toggle-row";

    const playbackAutoNavigateSwitch = createSettingsSwitch("Auto Jump Tree");
    const playbackAutoNavigateInput = playbackAutoNavigateSwitch.input;
    const playbackAutoNavigateText = playbackAutoNavigateSwitch.text;
    playbackRow.appendChild(playbackAutoNavigateSwitch.element);

    const playbackAllowUnclosedLogSwitch = createSettingsSwitch("Allow Unclosed Log");
    const playbackAllowUnclosedLogInput = playbackAllowUnclosedLogSwitch.input;
    const playbackAllowUnclosedLogText = playbackAllowUnclosedLogSwitch.text;
    playbackRow.appendChild(playbackAllowUnclosedLogSwitch.element);
    playbackSection.body.appendChild(playbackRow);

    const traceSection = createSettingsSection("Trace Mode");
    traceSection.element.classList.add("settings-section-trace");
    const traceField = document.createElement("div");
    traceField.className = "settings-field";
    const traceFieldLabel = document.createElement("div");
    traceFieldLabel.className = "settings-field-label";
    traceFieldLabel.textContent = "Trace Config";
    const traceFieldControl = document.createElement("div");
    traceFieldControl.className = "settings-field-control settings-trace-control";
    const traceDirectoryValue = document.createElement("div");
    traceDirectoryValue.className = "settings-trace-directory";
    const traceOpenButton = document.createElement("button");
    traceOpenButton.type = "button";
    traceOpenButton.className = "canvas-btn";
    traceOpenButton.addEventListener("click", () => {
      runtime.vscode.postMessage({ type: "openTraceConfigFile" });
      hideSettingsDialog();
    });
    traceFieldControl.appendChild(traceDirectoryValue);
    traceFieldControl.appendChild(traceOpenButton);
    traceField.appendChild(traceFieldLabel);
    traceField.appendChild(traceFieldControl);
    traceSection.body.appendChild(traceField);

    const actions = document.createElement("div");
    actions.className = "settings-actions";

    const clearImportedNodesButton = document.createElement("button");
    clearImportedNodesButton.type = "button";
    clearImportedNodesButton.className = "canvas-btn";
    clearImportedNodesButton.textContent = "Clear Imported";
    clearImportedNodesButton.addEventListener("click", () => {
      runtime.vscode.postMessage({ type: "clearImportedNodes" });
      hideSettingsDialog();
    });

    const importNodesButton = document.createElement("button");
    importNodesButton.type = "button";
    importNodesButton.className = "canvas-btn";
    importNodesButton.textContent = "Import Nodes";
    importNodesButton.addEventListener("click", () => {
      runtime.vscode.postMessage({ type: "importCustomNodes" });
      hideSettingsDialog();
    });

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "canvas-btn accent";
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", () => {
      const currentSettings = runtime.state.currentSettings || {};
      const nextSettings = {
        ...currentSettings,
        language: languageSelect.value,
        themePreset: themeSelect.value,
        nodeAttributeLayout: nodeLayoutControl.getValue(),
        editTreeRenderMode: editTreeRenderModeControl.getValue(),
        playbackTreeRenderMode: playbackTreeRenderModeControl.getValue(),
        playbackPanelLayout: playbackPanelLayoutControl.getValue(),
        showMainTreeLocator: mainTreeLocatorInput.checked,
        showBehaviorTreeRoot: behaviorTreeRootInput.checked,
        requireNodeDeleteConfirmation: deleteConfirmInput.checked,
        copyNodeWithDescendants: copyDescendantsInput.checked,
        playbackAutoNavigateToTree: playbackAutoNavigateInput.checked,
        allowUnclosedPlaybackLog: playbackAllowUnclosedLogInput.checked,
        simplifyHiddenSections: detailSwitches.filter((entry) => !entry.switchControl.input.checked).map((entry) => entry.key)
      };
      const preserveViewport =
        currentSettings.nodeAttributeLayout === nextSettings.nodeAttributeLayout &&
        currentSettings.editTreeRenderMode === nextSettings.editTreeRenderMode &&
        currentSettings.playbackTreeRenderMode === nextSettings.playbackTreeRenderMode &&
        currentSettings.playbackPanelLayout === nextSettings.playbackPanelLayout &&
        currentSettings.showBehaviorTreeRoot === nextSettings.showBehaviorTreeRoot &&
        JSON.stringify(currentSettings.simplifyHiddenSections || []) ===
          JSON.stringify(nextSettings.simplifyHiddenSections || []);
      runtime.state.currentSettings = nextSettings;
      runtime.app.applyUserSettings();
      if (runtime.modeRules?.isPlaybackMode?.() && runtime.state.playbackLog) {
        runtime.app.renderPlaybackLog({ preserveViewport });
      } else if (runtime.state.currentPreview) {
        runtime.app.renderCurrentTree(runtime.state.currentPreview, { preserveViewport });
      }
      runtime.vscode.postMessage({
        type: "saveUserSettings",
        payload: nextSettings
      });
      hideSettingsDialog();
    });
    actions.appendChild(clearImportedNodesButton);
    actions.appendChild(importNodesButton);
    actions.appendChild(saveButton);

    header.appendChild(title);
    header.appendChild(closeButton);
    form.appendChild(commonSection.element);
    form.appendChild(editSection.element);
    form.appendChild(playbackSection.element);
    form.appendChild(traceSection.element);
    dialog.appendChild(header);
    dialog.appendChild(form);
    dialog.appendChild(actions);
    element.appendChild(backdrop);
    element.appendChild(dialog);

    return {
      element,
      title,
      closeButton,
      commonSectionTitle: commonSection.title,
      languageRow,
      languageSelect,
      themeRow,
      themeSelect,
      nodeLayoutRow,
      nodeLayoutControl,
      editSectionTitle: editSection.title,
      editTreeRenderModeRow,
      editTreeRenderModeControl,
      mainTreeLocatorInput,
      mainTreeLocatorText,
      behaviorTreeRootInput,
      behaviorTreeRootText,
      deleteConfirmInput,
      deleteConfirmText,
      copyDescendantsInput,
      copyDescendantsText,
      detailTitle,
      detailSwitches,
      playbackSectionTitle: playbackSection.title,
      playbackTreeRenderModeRow,
      playbackTreeRenderModeControl,
      playbackPanelLayoutRow,
      playbackPanelLayoutControl,
      playbackAutoNavigateInput,
      playbackAutoNavigateText,
      playbackAllowUnclosedLogInput,
      playbackAllowUnclosedLogText,
      traceSectionTitle: traceSection.title,
      traceFieldLabel,
      traceDirectoryValue,
      traceOpenButton,
      clearImportedNodesButton,
      importNodesButton,
      saveButton
    };
  }

  function createSettingsSection(titleText) {
    const element = document.createElement("section");
    element.className = "settings-section";
    const title = document.createElement("div");
    title.className = "settings-section-title";
    title.textContent = titleText;
    const body = document.createElement("div");
    body.className = "settings-section-body";
    element.appendChild(title);
    element.appendChild(body);
    return { element, title, body };
  }

  function createInlineField(labelText) {
    const element = document.createElement("label");
    element.className = "settings-inline-field";
    const text = document.createElement("span");
    text.className = "settings-inline-label";
    text.textContent = labelText;
    const control = document.createElement("div");
    control.className = "settings-inline-control";
    element.appendChild(text);
    element.appendChild(control);
    return { element, control, text };
  }

  function createSettingsSwitch(labelText) {
    const element = document.createElement("label");
    element.className = "settings-toggle-item";
    const text = document.createElement("span");
    text.className = "settings-toggle-label";
    text.textContent = labelText;
    const control = document.createElement("div");
    control.className = "settings-switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    const track = document.createElement("span");
    track.className = "settings-switch-track";
    control.appendChild(input);
    control.appendChild(track);
    element.appendChild(text);
    element.appendChild(control);
    return { element, input, text };
  }

  function createDetailSwitches() {
    return ["description", "code", "inputs", "outputs", "params", "subtreeJump"].map((key) => ({
      key,
      switchControl: createSettingsSwitch(key)
    }));
  }

  function createSegmentedControl(options) {
    const element = document.createElement("div");
    element.className = "settings-segmented";
    const buttons = new Map();
    const indicator = document.createElement("span");
    indicator.className = "settings-segmented-indicator";
    let currentValue = options[0]?.value || "";
    let syncHandle = 0;

    function syncIndicator() {
      syncHandle = 0;
      const activeButton = buttons.get(currentValue);
      if (!activeButton) {
        indicator.style.width = "0px";
        indicator.style.transform = "translateX(0px)";
        return;
      }

      const left = activeButton.offsetLeft || 0;
      const width = activeButton.offsetWidth || 0;
      indicator.style.width = `${width}px`;
      indicator.style.transform = `translateX(${left}px)`;
    }

    function scheduleSyncIndicator() {
      if (syncHandle) {
        return;
      }
      syncHandle = requestAnimationFrame(syncIndicator);
    }

    element.appendChild(indicator);

    options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-segmented-button";
      button.textContent = option.label;
      button.addEventListener("click", () => {
        setValue(option.value);
      });
      buttons.set(option.value, button);
      element.appendChild(button);
    });

    function setValue(value) {
      currentValue = value;
      buttons.forEach((button, buttonValue) => {
        const active = buttonValue === value;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      scheduleSyncIndicator();
    }

    setValue(currentValue);

    return {
      element,
      buttons,
      getValue: () => currentValue,
      setValue,
      setLabels(labelsByValue) {
        buttons.forEach((button, value) => {
          if (labelsByValue?.[value]) {
            button.textContent = labelsByValue[value];
          }
        });
        scheduleSyncIndicator();
      }
    };
  }

  function showSettingsDialog() {
    if (!overlayState.settingsDialog) {
      return;
    }

    const copy = runtime.i18n.getSettingsCopy();
    overlayState.settingsDialog.title.textContent = copy.title;
    overlayState.settingsDialog.closeButton.textContent = "X";
    overlayState.settingsDialog.closeButton.title = copy.close;
    overlayState.settingsDialog.closeButton.setAttribute("aria-label", copy.close);
    overlayState.settingsDialog.commonSectionTitle.textContent = copy.generalMode;
    overlayState.settingsDialog.languageRow.text.textContent = copy.language;
    overlayState.settingsDialog.themeRow.text.textContent = copy.theme;
    overlayState.settingsDialog.editSectionTitle.textContent = copy.editMode;
    overlayState.settingsDialog.editTreeRenderModeRow.text.textContent = copy.treeRenderMode;
    overlayState.settingsDialog.editTreeRenderModeControl.setLabels({
      paged: copy.treeRenderModeOptions.paged,
      expanded: copy.treeRenderModeOptions.expanded
    });
    overlayState.settingsDialog.mainTreeLocatorText.textContent = copy.locatorShort;
    overlayState.settingsDialog.behaviorTreeRootText.textContent = copy.rootShort;
    overlayState.settingsDialog.deleteConfirmText.textContent = copy.deleteConfirmShort;
    overlayState.settingsDialog.copyDescendantsText.textContent = copy.copyDescendantsShort;
    overlayState.settingsDialog.detailTitle.textContent = copy.nodeDisplay;
    overlayState.settingsDialog.detailSwitches.forEach((entry) => {
      entry.switchControl.text.textContent = copy.nodeDetailOptions[entry.key];
    });
    overlayState.settingsDialog.playbackSectionTitle.textContent = copy.playbackMode;
    overlayState.settingsDialog.playbackTreeRenderModeRow.text.textContent = copy.treeRenderMode;
    overlayState.settingsDialog.playbackTreeRenderModeControl.setLabels({
      paged: copy.treeRenderModeOptions.paged,
      expanded: copy.treeRenderModeOptions.expanded
    });
    overlayState.settingsDialog.playbackPanelLayoutRow.text.textContent = copy.playbackPanelLayout;
    overlayState.settingsDialog.playbackPanelLayoutControl.setLabels({
      classic: copy.playbackPanelLayoutOptions.classic,
      dashboard: copy.playbackPanelLayoutOptions.dashboard
    });
    overlayState.settingsDialog.playbackAutoNavigateText.textContent = copy.playbackAutoNavigateShort;
    overlayState.settingsDialog.playbackAllowUnclosedLogText.textContent = copy.playbackAllowUnclosedLogShort;
    overlayState.settingsDialog.traceSectionTitle.textContent = copy.traceMode;
    overlayState.settingsDialog.traceFieldLabel.textContent = copy.traceConfigDirectory;
    overlayState.settingsDialog.traceOpenButton.textContent = copy.traceOpenConfig;
    overlayState.settingsDialog.traceOpenButton.title = copy.traceOpenConfig;
    overlayState.settingsDialog.traceOpenButton.setAttribute("aria-label", copy.traceOpenConfig);
    const traceConfig = runtime.state.traceConfig;
    const traceDirectory = traceConfig?.configDirectoryPath || "";
    overlayState.settingsDialog.traceDirectoryValue.textContent = traceDirectory || copy.traceConfigDirectoryUnavailable;
    overlayState.settingsDialog.traceDirectoryValue.title = traceDirectory || copy.traceConfigDirectoryUnavailable;
    overlayState.settingsDialog.clearImportedNodesButton.textContent = copy.clearImportedNodes;
    overlayState.settingsDialog.importNodesButton.textContent = copy.importNodes;
    overlayState.settingsDialog.saveButton.textContent = copy.save;
    overlayState.settingsDialog.languageSelect.replaceChildren();
    [
      ["en-US", copy.languageOptions.english],
      ["zh-CN", copy.languageOptions.chinese]
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      overlayState.settingsDialog.languageSelect.appendChild(option);
    });
    overlayState.settingsDialog.languageSelect.value = runtime.state.currentSettings?.language || "en-US";
    overlayState.settingsDialog.themeSelect.replaceChildren(...runtime.i18n.getThemeOptions());
    overlayState.settingsDialog.themeSelect.value = runtime.state.currentSettings?.themePreset || "midnight";
    overlayState.settingsDialog.nodeLayoutRow.text.textContent = copy.nodeAttributeLayout;
    overlayState.settingsDialog.nodeLayoutControl.setLabels({
      inline: copy.nodeAttributeLayoutOptions.inline,
      stacked: copy.nodeAttributeLayoutOptions.stacked
    });
    overlayState.settingsDialog.mainTreeLocatorInput.checked = runtime.state.currentSettings?.showMainTreeLocator === true;
    overlayState.settingsDialog.behaviorTreeRootInput.checked = runtime.state.currentSettings?.showBehaviorTreeRoot !== false;
    overlayState.settingsDialog.deleteConfirmInput.checked =
      runtime.state.currentSettings?.requireNodeDeleteConfirmation === true;
    overlayState.settingsDialog.copyDescendantsInput.checked =
      runtime.state.currentSettings?.copyNodeWithDescendants === true;
    overlayState.settingsDialog.playbackAutoNavigateInput.checked =
      runtime.state.currentSettings?.playbackAutoNavigateToTree === true;
    overlayState.settingsDialog.playbackAllowUnclosedLogInput.checked =
      runtime.state.currentSettings?.allowUnclosedPlaybackLog === true;
    const hiddenSections = new Set(runtime.state.currentSettings?.simplifyHiddenSections || []);
    overlayState.settingsDialog.detailSwitches.forEach((entry) => {
      entry.switchControl.input.checked = !hiddenSections.has(entry.key);
    });
    overlayState.settingsDialog.element.hidden = false;
    overlayState.settingsDialog.nodeLayoutControl.setValue(
      runtime.state.currentSettings?.nodeAttributeLayout === "stacked" ? "stacked" : "inline"
    );
    overlayState.settingsDialog.editTreeRenderModeControl.setValue(
      runtime.state.currentSettings?.editTreeRenderMode === "expanded" ? "expanded" : "paged"
    );
    overlayState.settingsDialog.playbackTreeRenderModeControl.setValue(
      runtime.state.currentSettings?.playbackTreeRenderMode === "expanded" ? "expanded" : "paged"
    );
    overlayState.settingsDialog.playbackPanelLayoutControl.setValue(
      runtime.state.currentSettings?.playbackPanelLayout === "dashboard" ? "dashboard" : "classic"
    );
    shared.syncBlockingOverlay();
  }

  function hideSettingsDialog() {
    if (!overlayState.settingsDialog) {
      return;
    }

    overlayState.settingsDialog.element.hidden = true;
    shared.syncBlockingOverlay();
  }

  overlayRuntime.parts.settingsDialog = {
    createSettingsDialog,
    showSettingsDialog,
    hideSettingsDialog
  };
})();
