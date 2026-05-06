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
    closeButton.className = "canvas-btn subtle";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", hideSettingsDialog);

    const form = document.createElement("div");
    form.className = "settings-form";

    const languageRow = shared.createSettingsField("Language");
    const languageSelect = document.createElement("select");
    languageSelect.className = "attribute-input";
    languageRow.control.appendChild(languageSelect);

    const themeRow = shared.createSettingsField("Theme");
    const themeSelect = document.createElement("select");
    themeSelect.className = "attribute-input";
    themeRow.control.appendChild(themeSelect);

    const mainTreeLocatorRow = shared.createSettingsField("MainTree Locator");
    const mainTreeLocatorLabel = document.createElement("label");
    mainTreeLocatorLabel.className = "settings-checkbox";
    const mainTreeLocatorInput = document.createElement("input");
    mainTreeLocatorInput.type = "checkbox";
    const mainTreeLocatorText = document.createElement("span");
    mainTreeLocatorText.textContent = "Show locator";
    mainTreeLocatorLabel.appendChild(mainTreeLocatorInput);
    mainTreeLocatorLabel.appendChild(mainTreeLocatorText);
    mainTreeLocatorRow.control.appendChild(mainTreeLocatorLabel);

    const behaviorTreeRootRow = shared.createSettingsField("BehaviorTree Root");
    const behaviorTreeRootLabel = document.createElement("label");
    behaviorTreeRootLabel.className = "settings-checkbox";
    const behaviorTreeRootInput = document.createElement("input");
    behaviorTreeRootInput.type = "checkbox";
    const behaviorTreeRootText = document.createElement("span");
    behaviorTreeRootText.textContent = "Show virtual root";
    behaviorTreeRootLabel.appendChild(behaviorTreeRootInput);
    behaviorTreeRootLabel.appendChild(behaviorTreeRootText);
    behaviorTreeRootRow.control.appendChild(behaviorTreeRootLabel);

    const simplifyRow = shared.createSettingsField("Node Details");
    const simplifyHint = document.createElement("div");
    simplifyHint.className = "settings-section-hint";
    const simplifyOptions = document.createElement("div");
    simplifyOptions.className = "settings-checkbox-list";
    simplifyRow.control.appendChild(simplifyHint);
    simplifyRow.control.appendChild(simplifyOptions);

    const fileRow = shared.createSettingsField("Config File");
    const fileHint = document.createElement("div");
    fileHint.className = "settings-file-hint";
    fileRow.control.appendChild(fileHint);

    const actions = document.createElement("div");
    actions.className = "settings-actions";

    const importButton = document.createElement("button");
    importButton.type = "button";
    importButton.className = "canvas-btn subtle";
    importButton.textContent = "Import Presets";
    importButton.addEventListener("click", () => {
      runtime.vscode.postMessage({ type: "importRecommendedPresets" });
      hideSettingsDialog();
    });

    const openFileButton = document.createElement("button");
    openFileButton.type = "button";
    openFileButton.className = "canvas-btn subtle";
    openFileButton.textContent = "Open Config";
    openFileButton.addEventListener("click", () => {
      runtime.vscode.postMessage({ type: "openUserSettingsFile" });
    });

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "canvas-btn accent";
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", () => {
      runtime.vscode.postMessage({
        type: "saveUserSettings",
        payload: {
          ...runtime.state.currentSettings,
          language: languageSelect.value,
          themePreset: themeSelect.value,
          showMainTreeLocator: mainTreeLocatorInput.checked,
          showBehaviorTreeRoot: behaviorTreeRootInput.checked,
          simplifyHiddenSections: getHiddenNodeDetailSections(simplifyOptions)
        }
      });
      hideSettingsDialog();
    });

    actions.appendChild(importButton);
    actions.appendChild(openFileButton);
    actions.appendChild(saveButton);

    header.appendChild(title);
    header.appendChild(closeButton);
    form.appendChild(languageRow.element);
    form.appendChild(themeRow.element);
    form.appendChild(mainTreeLocatorRow.element);
    form.appendChild(behaviorTreeRootRow.element);
    form.appendChild(simplifyRow.element);
    form.appendChild(fileRow.element);
    dialog.appendChild(header);
    dialog.appendChild(form);
    dialog.appendChild(actions);
    element.appendChild(backdrop);
    element.appendChild(dialog);

    return {
      element,
      title,
      closeButton,
      languageRow,
      languageSelect,
      themeRow,
      themeSelect,
      mainTreeLocatorRow,
      mainTreeLocatorInput,
      mainTreeLocatorText,
      behaviorTreeRootRow,
      behaviorTreeRootInput,
      behaviorTreeRootText,
      simplifyRow,
      simplifyHint,
      simplifyOptions,
      fileRow,
      fileHint,
      importButton,
      openFileButton,
      saveButton
    };
  }

  function getHiddenNodeDetailSections(container) {
    const allSections = ["description", "code", "inputs", "outputs", "params", "subtreeJump"];
    const visibleSections = new Set(
      Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value)
    );
    return allSections.filter((sectionKey) => !visibleSections.has(sectionKey));
  }

  function showSettingsDialog() {
    if (!overlayState.settingsDialog) {
      return;
    }

    const copy = runtime.i18n.getSettingsCopy();
    overlayState.settingsDialog.title.textContent = copy.title;
    overlayState.settingsDialog.closeButton.textContent = copy.close;
    overlayState.settingsDialog.languageRow.text.textContent = copy.language;
    overlayState.settingsDialog.themeRow.text.textContent = copy.theme;
    overlayState.settingsDialog.mainTreeLocatorRow.text.textContent = copy.mainTreeLocator;
    overlayState.settingsDialog.mainTreeLocatorText.textContent = copy.showMainTreeLocator;
    overlayState.settingsDialog.behaviorTreeRootRow.text.textContent = copy.behaviorTreeRoot;
    overlayState.settingsDialog.behaviorTreeRootText.textContent = copy.showBehaviorTreeRoot;
    overlayState.settingsDialog.simplifyRow.text.textContent = copy.simplifyView;
    overlayState.settingsDialog.fileRow.text.textContent = copy.configFile;
    overlayState.settingsDialog.importButton.textContent = copy.importPresets;
    overlayState.settingsDialog.openFileButton.textContent = copy.openConfig;
    overlayState.settingsDialog.saveButton.textContent = copy.save;
    overlayState.settingsDialog.simplifyHint.textContent = copy.simplifyHint;
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
    overlayState.settingsDialog.mainTreeLocatorInput.checked = runtime.state.currentSettings?.showMainTreeLocator !== false;
    overlayState.settingsDialog.behaviorTreeRootInput.checked = runtime.state.currentSettings?.showBehaviorTreeRoot !== false;
    overlayState.settingsDialog.simplifyOptions.replaceChildren();
    const hiddenSections = new Set(runtime.state.currentSettings?.simplifyHiddenSections || []);
    ["description", "code", "inputs", "outputs", "params", "subtreeJump"].forEach((sectionKey) => {
      const label = document.createElement("label");
      label.className = "settings-checkbox";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = sectionKey;
      input.checked = !hiddenSections.has(sectionKey);

      const text = document.createElement("span");
      text.textContent = copy.simplifyOptions[sectionKey];

      label.appendChild(input);
      label.appendChild(text);
      overlayState.settingsDialog.simplifyOptions.appendChild(label);
    });
    overlayState.settingsDialog.fileHint.textContent = runtime.state.settingsFilePath || copy.settingsFileAutoHint;
    overlayState.settingsDialog.fileHint.title = runtime.state.settingsFilePath || copy.settingsFileAutoHint;
    overlayState.settingsDialog.element.hidden = false;
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
