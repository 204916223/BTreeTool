(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const overlayRuntime = (runtime.overlayRuntime = runtime.overlayRuntime || {});
  const overlayState = (overlayRuntime.state = overlayRuntime.state || {});
  const shared = overlayRuntime.shared;
  const THEME_GROUPS = [
    { key: "dark", values: ["default", "midnight", "graphite", "ocean", "forest"] },
    { key: "light", values: ["paper", "sand", "mist", "rose"] },
    { key: "custom", values: ["custom"] }
  ];
  const THEME_SWATCHES = {
    default: ["#070807", "#8f7846"],
    midnight: ["#070b10", "#4f8bd8"],
    graphite: ["#15181d", "#8db2ff"],
    ocean: ["#0b1824", "#62b0ff"],
    forest: ["#122015", "#88d498"],
    paper: ["#f6f8fb", "#2d6cdf"],
    sand: ["#f7f1e7", "#c06a2c"],
    mist: ["#eef3f7", "#3f7ac8"],
    rose: ["#fbf5f7", "#b85c7b"],
    custom: ["var(--custom-theme-color-a)", "var(--custom-theme-color-b)"]
  };

  function createSettingsDialog() {
    const shell = shared.createModalShell({
      rootClass: "settings-dialog",
      dialogClass: "settings-dialog-panel",
      title: "Settings",
      onClose: hideSettingsDialog
    });
    const { element, dialog, header, title } = shell;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "settings-close-button";
    closeButton.setAttribute("aria-label", "Close");
    closeButton.innerHTML = runtime.icons.iconHtml("close");
    closeButton.addEventListener("click", hideSettingsDialog);

    const form = document.createElement("div");
    form.className = "settings-form";

    const commonSection = createSettingsSection("General Mode");
    const languageRow = createInlineField("Language");
    const languageSelect = shared.createChoiceControl({
      className: "settings-language-choice",
      options: []
    });
    languageRow.control.appendChild(languageSelect.element);
    const themeRow = createInlineField("Theme");
    const themePicker = createThemePicker();
    const customThemePicker = createCustomThemePicker();
    themeRow.control.classList.add("settings-theme-control");
    themeRow.control.appendChild(themePicker.element);
    themeRow.control.appendChild(customThemePicker.element);
    commonSection.body.appendChild(languageRow.element);
    commonSection.body.appendChild(themeRow.element);
    themePicker.element.addEventListener("themechange", () => {
      customThemePicker.element.hidden = themePicker.getValue() !== "custom";
    });

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
    const nodeSectionTitleRow = createInlineField("Titles");
    nodeSectionTitleRow.element.classList.add("settings-inline-field-horizontal");
    const nodeSectionTitleControl = createSegmentedControl([
      { value: "hidden", label: "隐藏" },
      { value: "regular", label: "常规" },
      { value: "emphasis", label: "强调" }
    ]);
    nodeSectionTitleRow.control.appendChild(nodeSectionTitleControl.element);
    const detailGrid = document.createElement("div");
    detailGrid.className = "settings-detail-grid";
    const detailSwitches = createDetailSwitches();
    detailSwitches.forEach((entry) => {
      detailGrid.appendChild(entry.switchControl.element);
    });
    commonSection.body.appendChild(detailTitle);
    commonSection.body.appendChild(nodeSectionTitleRow.element);
    commonSection.body.appendChild(detailGrid);

    const editSection = createSettingsSection("Edit Mode");
    editSection.element.classList.add("settings-section-edit");
    const editNodeModeRow = createInlineField("Edit Mode");
    editNodeModeRow.element.classList.add("settings-inline-field-horizontal");
    const editNodeModeControl = createSegmentedControl([
      { value: "tree", label: "Tree structure" },
      { value: "free", label: "Free nodes" }
    ]);
    editNodeModeRow.control.appendChild(editNodeModeControl.element);
    editSection.body.appendChild(editNodeModeRow.element);

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

    const playbackPanelOpacityRow = createRangeField("Panel Opacity", {
      min: 20,
      max: 80,
      step: 1,
      value: 60,
      suffix: "%"
    });
    playbackPanelOpacityRow.element.classList.add("settings-inline-field-horizontal");
    playbackSection.body.appendChild(playbackPanelOpacityRow.element);

    const playbackRow = document.createElement("div");
    playbackRow.className = "settings-toggle-row";

    const playbackAutoNavigateSwitch = createSettingsSwitch("Auto Jump Tree");
    const playbackAutoNavigateInput = playbackAutoNavigateSwitch.input;
    const playbackAutoNavigateText = playbackAutoNavigateSwitch.text;
    playbackRow.appendChild(playbackAutoNavigateSwitch.element);

    playbackSection.body.appendChild(playbackRow);

    const traceSection = createSettingsSection("AI Assistant");
    traceSection.element.classList.add("settings-section-trace");
    const traceLearningRow = document.createElement("div");
    traceLearningRow.className = "settings-toggle-row";
    const traceLearningSwitch = createSettingsSwitch("Learning");
    const traceLearningInput = traceLearningSwitch.input;
    const traceLearningText = traceLearningSwitch.text;
    traceLearningRow.appendChild(traceLearningSwitch.element);
    traceSection.body.appendChild(traceLearningRow);

    const traceLearningEnhancementRow = document.createElement("div");
    traceLearningEnhancementRow.className = "settings-toggle-row";
    const traceLearningEnhancementSwitch = createSettingsSwitch("Learning Enhancement");
    const traceLearningEnhancementInput = traceLearningEnhancementSwitch.input;
    const traceLearningEnhancementText = traceLearningEnhancementSwitch.text;
    traceLearningEnhancementRow.appendChild(traceLearningEnhancementSwitch.element);
    traceSection.body.appendChild(traceLearningEnhancementRow);
    traceLearningEnhancementInput.addEventListener("change", () => {
      if (traceLearningEnhancementInput.checked) {
        traceLearningInput.checked = true;
      }
    });
    traceLearningInput.addEventListener("change", () => {
      if (!traceLearningInput.checked) {
        traceLearningEnhancementInput.checked = false;
      }
    });

    const traceField = document.createElement("div");
    traceField.className = "settings-field";
    const traceFieldLabel = document.createElement("div");
    traceFieldLabel.className = "settings-field-label";
    traceFieldLabel.textContent = "AI Assistant Config";
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
        language: languageSelect.getValue(),
        themePreset: themePicker.getValue(),
        customTheme: {
          primaryColor: normalizeColorInputValue(customThemePicker.primaryInput.value, "#5e8de6"),
          secondaryColor: normalizeColorInputValue(customThemePicker.secondaryInput.value, "#df78cf")
        },
        nodeAttributeLayout: nodeLayoutControl.getValue(),
        editNodeMode: editNodeModeControl.getValue(),
        editTreeRenderMode: editTreeRenderModeControl.getValue(),
        playbackTreeRenderMode: playbackTreeRenderModeControl.getValue(),
        playbackPanelLayout: playbackPanelLayoutControl.getValue(),
        playbackPanelOpacity: Number(playbackPanelOpacityRow.input.value) / 100,
        showMainTreeLocator: mainTreeLocatorInput.checked,
        showBehaviorTreeRoot: true,
        requireNodeDeleteConfirmation: deleteConfirmInput.checked,
        copyNodeWithDescendants: copyDescendantsInput.checked,
        playbackAutoNavigateToTree: playbackAutoNavigateInput.checked,
        allowUnclosedPlaybackLog: true,
        traceLearningEnabled: traceLearningInput.checked || traceLearningEnhancementInput.checked,
        traceLearningEnhancementEnabled: traceLearningEnhancementInput.checked,
        nodeSectionTitleMode: nodeSectionTitleControl.getValue(),
        simplifyHiddenSections: detailSwitches.filter((entry) => !entry.switchControl.input.checked).map((entry) => entry.key)
      };
      const preserveViewport =
        currentSettings.nodeAttributeLayout === nextSettings.nodeAttributeLayout &&
        currentSettings.nodeSectionTitleMode === nextSettings.nodeSectionTitleMode &&
        currentSettings.editNodeMode === nextSettings.editNodeMode &&
        currentSettings.editTreeRenderMode === nextSettings.editTreeRenderMode &&
        currentSettings.playbackTreeRenderMode === nextSettings.playbackTreeRenderMode &&
        currentSettings.playbackPanelLayout === nextSettings.playbackPanelLayout &&
        JSON.stringify(currentSettings.simplifyHiddenSections || []) ===
          JSON.stringify(nextSettings.simplifyHiddenSections || []);
      runtime.state.currentSettings = nextSettings;
      runtime.app.applyUserSettings();
      runtime.editAssistant?.render?.();
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

    header.appendChild(closeButton);
    form.appendChild(commonSection.element);
    form.appendChild(editSection.element);
    form.appendChild(playbackSection.element);
    form.appendChild(traceSection.element);
    dialog.appendChild(form);
    dialog.appendChild(actions);
    return {
      element,
      title,
      closeButton,
      commonSectionTitle: commonSection.title,
      languageRow,
      languageSelect,
      themeRow,
      themePicker,
      customThemePicker,
      nodeLayoutRow,
      nodeLayoutControl,
      editSectionTitle: editSection.title,
      editNodeModeRow,
      editNodeModeControl,
      editTreeRenderModeRow,
      editTreeRenderModeControl,
      mainTreeLocatorInput,
      mainTreeLocatorText,
      deleteConfirmInput,
      deleteConfirmText,
      copyDescendantsInput,
      copyDescendantsText,
      detailTitle,
      nodeSectionTitleRow,
      nodeSectionTitleControl,
      detailSwitches,
      playbackSectionTitle: playbackSection.title,
      playbackTreeRenderModeRow,
      playbackTreeRenderModeControl,
      playbackPanelLayoutRow,
      playbackPanelLayoutControl,
      playbackPanelOpacityRow,
      playbackAutoNavigateInput,
      playbackAutoNavigateText,
      traceSectionTitle: traceSection.title,
      traceFieldLabel,
      traceDirectoryValue,
      traceOpenButton,
      traceLearningInput,
      traceLearningText,
      traceLearningEnhancementInput,
      traceLearningEnhancementText,
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

  function createCustomThemePicker() {
    const element = document.createElement("div");
    element.className = "settings-color-pair";
    const primaryInput = createColorInput("#5e8de6");
    const secondaryInput = createColorInput("#df78cf");
    element.appendChild(primaryInput);
    element.appendChild(secondaryInput);
    return { element, primaryInput, secondaryInput };
  }

  function createThemePicker() {
    const element = document.createElement("div");
    element.className = "settings-theme-picker";
    element.setAttribute("role", "radiogroup");
    const buttons = new Map();
    let currentValue = "default";

    function setValue(value, notify = false) {
      currentValue = buttons.has(value) ? value : "default";
      buttons.forEach((button, buttonValue) => {
        const selected = buttonValue === currentValue;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-checked", selected ? "true" : "false");
      });
      if (notify) {
        element.dispatchEvent(new CustomEvent("themechange", { detail: { value: currentValue } }));
      }
    }

    function render(themeOptions, groupLabels = {}) {
      const optionByValue = new Map(themeOptions.map((option) => [option.value, option]));
      buttons.clear();
      element.replaceChildren();
      THEME_GROUPS.forEach((group) => {
        const options = group.values.map((value) => optionByValue.get(value)).filter(Boolean);
        if (!options.length) {
          return;
        }
        const groupElement = document.createElement("section");
        groupElement.className = `settings-theme-group settings-theme-group-${group.key}`;
        const title = document.createElement("div");
        title.className = "settings-theme-group-title";
        title.textContent = groupLabels[group.key] || group.key;
        const list = document.createElement("div");
        list.className = "settings-theme-options";
        options.forEach((option) => {
          const button = document.createElement("button");
          const swatchColors = THEME_SWATCHES[option.value] || THEME_SWATCHES.default;
          button.type = "button";
          button.className = `settings-theme-option settings-theme-option-${group.key}`;
          button.setAttribute("role", "radio");
          button.dataset.themeValue = option.value;
          button.style.setProperty("--theme-option-bg", swatchColors[0]);
          button.style.setProperty("--theme-option-accent", swatchColors[1]);
          button.addEventListener("click", () => setValue(option.value, true));
          const swatch = document.createElement("span");
          swatch.className = "settings-theme-swatch";
          const label = document.createElement("span");
          label.className = "settings-theme-label";
          label.textContent = option.label;
          button.appendChild(swatch);
          button.appendChild(label);
          buttons.set(option.value, button);
          list.appendChild(button);
        });
        groupElement.appendChild(title);
        groupElement.appendChild(list);
        element.appendChild(groupElement);
      });
      setValue(currentValue);
    }

    return {
      element,
      render,
      getValue() {
        return currentValue;
      },
      setValue
    };
  }

  function createColorInput(value) {
    const input = document.createElement("input");
    input.type = "color";
    input.className = "settings-color-input";
    input.value = value;
    return input;
  }

  function createRangeField(labelText, options = {}) {
    const row = createInlineField(labelText);
    row.control.classList.add("settings-range-control");
    const input = document.createElement("input");
    input.type = "range";
    input.className = "settings-range-input";
    input.min = String(options.min ?? 0);
    input.max = String(options.max ?? 100);
    input.step = String(options.step ?? 1);
    input.value = String(options.value ?? options.max ?? 100);
    const value = document.createElement("span");
    value.className = "settings-range-value";
    const suffix = options.suffix || "";

    function syncValue() {
      value.textContent = `${input.value}${suffix}`;
    }

    input.addEventListener("input", syncValue);
    syncValue();
    row.control.appendChild(input);
    row.control.appendChild(value);
    return {
      ...row,
      input,
      value,
      setValue(nextValue) {
        input.value = String(nextValue);
        syncValue();
      }
    };
  }

  function normalizeColorInputValue(value, fallback) {
    return /^#[0-9a-fA-F]{6}$/.test(value || "") ? value.toLowerCase() : fallback;
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
    overlayState.settingsDialog.closeButton.innerHTML = runtime.icons.iconHtml("close");
    overlayState.settingsDialog.closeButton.title = copy.close;
    overlayState.settingsDialog.closeButton.setAttribute("aria-label", copy.close);
    overlayState.settingsDialog.commonSectionTitle.textContent = copy.generalMode;
    overlayState.settingsDialog.languageRow.text.textContent = copy.language;
    overlayState.settingsDialog.themeRow.text.textContent = copy.theme;
    overlayState.settingsDialog.editSectionTitle.textContent = copy.editMode;
    overlayState.settingsDialog.editNodeModeRow.text.textContent = copy.editNodeMode;
    overlayState.settingsDialog.editNodeModeControl.setLabels({
      tree: copy.editNodeModeOptions.tree,
      free: copy.editNodeModeOptions.free
    });
    overlayState.settingsDialog.editTreeRenderModeRow.text.textContent = copy.treeRenderMode;
    overlayState.settingsDialog.editTreeRenderModeControl.setLabels({
      paged: copy.treeRenderModeOptions.paged,
      expanded: copy.treeRenderModeOptions.expanded
    });
    overlayState.settingsDialog.mainTreeLocatorText.textContent = copy.locatorShort;
    overlayState.settingsDialog.deleteConfirmText.textContent = copy.deleteConfirmShort;
    overlayState.settingsDialog.copyDescendantsText.textContent = copy.copyDescendantsShort;
    overlayState.settingsDialog.detailTitle.textContent = copy.nodeDisplay;
    overlayState.settingsDialog.nodeSectionTitleRow.text.textContent = copy.nodeSectionTitle;
    overlayState.settingsDialog.nodeSectionTitleControl.setLabels({
      hidden: copy.nodeSectionTitleOptions.hidden,
      regular: copy.nodeSectionTitleOptions.regular,
      emphasis: copy.nodeSectionTitleOptions.emphasis
    });
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
    overlayState.settingsDialog.playbackPanelOpacityRow.text.textContent = copy.playbackPanelOpacity;
    overlayState.settingsDialog.playbackAutoNavigateText.textContent = copy.playbackAutoNavigateShort;
    overlayState.settingsDialog.traceSectionTitle.textContent = copy.traceMode;
    overlayState.settingsDialog.traceFieldLabel.textContent = copy.traceConfigDirectory;
    overlayState.settingsDialog.traceLearningText.textContent = copy.traceLearningShort;
    overlayState.settingsDialog.traceLearningEnhancementText.textContent = copy.traceLearningEnhancementShort;
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
    overlayState.settingsDialog.languageSelect.setOptions(
      [
        { value: "en-US", label: copy.languageOptions.english },
        { value: "zh-CN", label: copy.languageOptions.chinese }
      ],
      runtime.state.currentSettings?.language || "en-US"
    );
    overlayState.settingsDialog.themePicker.render(
      runtime.i18n.getThemeOptions().map((option) => ({
        value: option.value,
        label: option.label || option.value
      })),
      copy.themeGroups
    );
    overlayState.settingsDialog.themePicker.setValue(runtime.state.currentSettings?.themePreset || "default");
    overlayState.settingsDialog.customThemePicker.primaryInput.value = normalizeColorInputValue(
      runtime.state.currentSettings?.customTheme?.primaryColor,
      "#5e8de6"
    );
    overlayState.settingsDialog.customThemePicker.secondaryInput.value = normalizeColorInputValue(
      runtime.state.currentSettings?.customTheme?.secondaryColor,
      "#df78cf"
    );
    overlayState.settingsDialog.customThemePicker.element.hidden =
      overlayState.settingsDialog.themePicker.getValue() !== "custom";
    overlayState.settingsDialog.nodeLayoutRow.text.textContent = copy.nodeAttributeLayout;
    overlayState.settingsDialog.nodeLayoutControl.setLabels({
      inline: copy.nodeAttributeLayoutOptions.inline,
      stacked: copy.nodeAttributeLayoutOptions.stacked
    });
    overlayState.settingsDialog.mainTreeLocatorInput.checked = runtime.state.currentSettings?.showMainTreeLocator === true;
    overlayState.settingsDialog.deleteConfirmInput.checked =
      runtime.state.currentSettings?.requireNodeDeleteConfirmation === true;
    overlayState.settingsDialog.copyDescendantsInput.checked =
      runtime.state.currentSettings?.copyNodeWithDescendants === true;
    overlayState.settingsDialog.playbackAutoNavigateInput.checked =
      runtime.state.currentSettings?.playbackAutoNavigateToTree === true;
    const traceLearningEnhancementEnabled = runtime.state.currentSettings?.traceLearningEnhancementEnabled === true;
    overlayState.settingsDialog.traceLearningInput.checked =
      runtime.state.currentSettings?.traceLearningEnabled === true || traceLearningEnhancementEnabled;
    overlayState.settingsDialog.traceLearningEnhancementInput.checked = traceLearningEnhancementEnabled;
    const hiddenSections = new Set(runtime.state.currentSettings?.simplifyHiddenSections || []);
    overlayState.settingsDialog.detailSwitches.forEach((entry) => {
      entry.switchControl.input.checked = !hiddenSections.has(entry.key);
    });
    overlayState.settingsDialog.element.hidden = false;
    overlayState.settingsDialog.nodeLayoutControl.setValue(
      runtime.state.currentSettings?.nodeAttributeLayout === "stacked" ? "stacked" : "inline"
    );
    overlayState.settingsDialog.nodeSectionTitleControl.setValue(
      normalizeNodeSectionTitleMode(runtime.state.currentSettings?.nodeSectionTitleMode)
    );
    overlayState.settingsDialog.editNodeModeControl.setValue(
      runtime.state.currentSettings?.editNodeMode === "free" ? "free" : "tree"
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
    overlayState.settingsDialog.playbackPanelOpacityRow.setValue(
      Math.round(normalizePlaybackPanelOpacity(runtime.state.currentSettings?.playbackPanelOpacity) * 100)
    );
    shared.syncBlockingOverlay();
  }

  function normalizePlaybackPanelOpacity(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0.6;
    }
    return Math.min(0.8, Math.max(0.2, numeric));
  }

  function normalizeNodeSectionTitleMode(value) {
    return value === "hidden" || value === "emphasis" ? value : "regular";
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
