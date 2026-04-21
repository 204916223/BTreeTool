(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  let nodeContextMenu = null;
  let deleteConfirmBar = null;
  let nodePicker = null;
  let settingsDialog = null;
  let treeNodesModelDialog = null;
  let nodeEditorDialog = null;

  function setBlockingOverlay(active) {
    document.body.classList.toggle("has-blocking-overlay", active);
  }

  function syncBlockingOverlay() {
    const active = [
      deleteConfirmBar?.element,
      nodePicker?.element,
      settingsDialog?.element,
      treeNodesModelDialog?.element,
      nodeEditorDialog?.element
    ].some((element) => element && !element.hidden);
    setBlockingOverlay(active);
  }

  function init() {
    nodeContextMenu = createNodeContextMenu();
    deleteConfirmBar = createDeleteConfirmBar();
    nodePicker = createNodePicker();
    settingsDialog = createSettingsDialog();
    treeNodesModelDialog = createTreeNodesModelDialog();
    nodeEditorDialog = createNodeEditorDialog();

    document.body.appendChild(nodeContextMenu.element);
    document.body.appendChild(deleteConfirmBar.element);
    document.body.appendChild(nodePicker.element);
    document.body.appendChild(settingsDialog.element);
    document.body.appendChild(treeNodesModelDialog.element);
    document.body.appendChild(nodeEditorDialog.element);
  }

  function createNodeContextMenu() {
    const element = document.createElement("div");
    element.className = "node-context-menu";
    element.hidden = true;
    const overlayCopy = runtime.i18n.getOverlayCopy();

    const addBeforeButton = createMenuButton(overlayCopy.addBefore, () => {
      const state = nodeContextMenu.state;
      if (!state || !state.parentPath || !Number.isInteger(state.siblingIndex)) {
        return;
      }

      showNodePicker({
        treeId: state.treeId,
        targetParentPath: state.parentPath,
        targetIndex: state.siblingIndex,
        title: runtime.i18n.getOverlayCopy().addNodeBeforeTitle(state.nodeTitle)
      });
      hideNodeContextMenu();
    });

    const addAfterButton = createMenuButton(overlayCopy.addAfter, () => {
      const state = nodeContextMenu.state;
      if (!state || !state.parentPath || !Number.isInteger(state.siblingIndex)) {
        return;
      }

      showNodePicker({
        treeId: state.treeId,
        targetParentPath: state.parentPath,
        targetIndex: state.siblingIndex + 1,
        title: runtime.i18n.getOverlayCopy().addNodeAfterTitle(state.nodeTitle)
      });
      hideNodeContextMenu();
    });

    const addChildButton = createMenuButton(overlayCopy.addChild, () => {
      const state = nodeContextMenu.state;
      if (!state || !state.allowAppendChild) {
        return;
      }

      showNodePicker({
        treeId: state.treeId,
        targetParentPath: state.nodePath,
        targetIndex: state.childCount || 0,
        title: runtime.i18n.getOverlayCopy().addChildTitle(state.nodeTitle)
      });
      hideNodeContextMenu();
    });

    const deleteButton = createMenuButton(overlayCopy.deleteNode, () => {
      const state = nodeContextMenu.state;
      if (!state) {
        return;
      }

      requestDeleteConfirmation(state);
      hideNodeContextMenu();
    }, "danger");

    element.appendChild(addBeforeButton);
    element.appendChild(addAfterButton);
    element.appendChild(addChildButton);
    element.appendChild(deleteButton);

    return {
      element,
      state: null,
      addBeforeButton,
      addAfterButton,
      addChildButton,
      deleteButton
    };
  }

  function createMenuButton(label, onClick, tone = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = tone ? `node-context-menu-item ${tone}` : "node-context-menu-item";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function showNodeContextMenu(x, y, state) {
    if (!runtime.app.canPerformAction("openNodeContextMenu", state || {})) {
      return;
    }

    const overlayCopy = runtime.i18n.getOverlayCopy();
    nodeContextMenu.state = state;
    nodeContextMenu.addBeforeButton.textContent = overlayCopy.addBefore;
    nodeContextMenu.addAfterButton.textContent = overlayCopy.addAfter;
    nodeContextMenu.addChildButton.textContent = overlayCopy.addChild;
    nodeContextMenu.deleteButton.textContent = overlayCopy.deleteNode;
    nodeContextMenu.addBeforeButton.hidden = !state?.parentPath || !Number.isInteger(state?.siblingIndex);
    nodeContextMenu.addAfterButton.hidden = !state?.parentPath || !Number.isInteger(state?.siblingIndex);
    nodeContextMenu.addChildButton.hidden = !state?.allowAppendChild;
    nodeContextMenu.deleteButton.hidden = !state?.allowDelete;

    const hasVisibleAction =
      !nodeContextMenu.addBeforeButton.hidden ||
      !nodeContextMenu.addAfterButton.hidden ||
      !nodeContextMenu.addChildButton.hidden ||
      !nodeContextMenu.deleteButton.hidden;

    if (!hasVisibleAction) {
      hideNodeContextMenu();
      return;
    }

    nodeContextMenu.element.hidden = false;
    nodeContextMenu.element.style.left = `${x}px`;
    nodeContextMenu.element.style.top = `${y}px`;
  }

  function hideNodeContextMenu() {
    if (!nodeContextMenu) {
      return;
    }

    nodeContextMenu.state = null;
    nodeContextMenu.element.hidden = true;
  }

  function createDeleteConfirmBar() {
    const element = document.createElement("div");
    element.className = "delete-confirm";
    element.hidden = true;
    const overlayCopy = runtime.i18n.getOverlayCopy();

    const text = document.createElement("div");
    text.className = "delete-confirm-text";

    const actions = document.createElement("div");
    actions.className = "delete-confirm-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "canvas-btn subtle";
    cancelButton.textContent = overlayCopy.cancel;
    cancelButton.addEventListener("click", hideDeleteConfirm);

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "canvas-btn danger";
    confirmButton.textContent = overlayCopy.delete;
    confirmButton.addEventListener("click", () => {
      const pending = deleteConfirmBar.state;
      if (!pending) {
        return;
      }

      runtime.vscode.postMessage({
        type: "deleteNode",
        payload: {
          treeId: pending.treeId,
          nodePath: pending.nodePath
        }
      });
      hideDeleteConfirm();
    });

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);
    element.appendChild(text);
    element.appendChild(actions);

    return {
      element,
      text,
      cancelButton,
      confirmButton,
      state: null
    };
  }

  function requestDeleteConfirmation(state) {
    if (!runtime.app.canPerformAction("requestNodeDelete", state || {})) {
      return;
    }

    if (!state?.treeId || !state.nodePath) {
      return;
    }

    runtime.state.selectedNodePath = state.parentPath || "0";
    runtime.app.persistUiState();
    showDeleteConfirm(state);
  }

  function showDeleteConfirm(state) {
    const title = state.nodeTitle || "this node";
    const overlayCopy = runtime.i18n.getOverlayCopy();
    deleteConfirmBar.state = state;
    deleteConfirmBar.cancelButton.textContent = overlayCopy.cancel;
    deleteConfirmBar.confirmButton.textContent = overlayCopy.delete;
    deleteConfirmBar.text.textContent = overlayCopy.deleteConfirm(title);
    deleteConfirmBar.element.hidden = false;
    syncBlockingOverlay();
  }

  function hideDeleteConfirm() {
    if (!deleteConfirmBar) {
      return;
    }

    deleteConfirmBar.state = null;
    deleteConfirmBar.element.hidden = true;
    syncBlockingOverlay();
  }

  function createNodePicker() {
    const element = document.createElement("div");
    element.className = "node-picker";
    element.hidden = true;
    const overlayCopy = runtime.i18n.getOverlayCopy();

    const backdrop = document.createElement("div");
    backdrop.className = "node-picker-backdrop";
    backdrop.addEventListener("click", hideNodePicker);

    const dialog = document.createElement("div");
    dialog.className = "node-picker-dialog";

    const header = document.createElement("div");
    header.className = "node-picker-header";

    const title = document.createElement("strong");
    title.className = "node-picker-title";
    title.textContent = overlayCopy.nodePickerTitle;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "canvas-btn subtle";
    closeButton.textContent = overlayCopy.close;
    closeButton.addEventListener("click", hideNodePicker);

    const search = document.createElement("input");
    search.className = "panel-search node-picker-search";
    search.type = "text";
    search.placeholder = overlayCopy.nodePickerSearchPlaceholder;
    search.spellcheck = false;
    search.addEventListener("input", renderNodePickerList);

    const list = document.createElement("div");
    list.className = "node-picker-list";

    header.appendChild(title);
    header.appendChild(closeButton);
    dialog.appendChild(header);
    dialog.appendChild(search);
    dialog.appendChild(list);
    element.appendChild(backdrop);
    element.appendChild(dialog);

    return {
      element,
      title,
      closeButton,
      search,
      list,
      state: null
    };
  }

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

    const languageRow = createSettingsField("Language");
    const languageSelect = document.createElement("select");
    languageSelect.className = "attribute-input";
    languageRow.control.appendChild(languageSelect);

    const themeRow = createSettingsField("Theme");
    const themeSelect = document.createElement("select");
    themeSelect.className = "attribute-input";
    themeRow.control.appendChild(themeSelect);

    const simplifyRow = createSettingsField("Simplify View");
    const simplifyHint = document.createElement("div");
    simplifyHint.className = "settings-section-hint";
    const simplifyOptions = document.createElement("div");
    simplifyOptions.className = "settings-checkbox-list";
    simplifyRow.control.appendChild(simplifyHint);
    simplifyRow.control.appendChild(simplifyOptions);

    const fileRow = createSettingsField("Config File");
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
          simplifyHiddenSections: Array.from(simplifyOptions.querySelectorAll('input[type="checkbox"]:checked')).map(
            (input) => input.value
          )
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

  function createSettingsField(label) {
    const element = document.createElement("label");
    element.className = "settings-field";
    const text = document.createElement("span");
    text.className = "settings-field-label";
    text.textContent = label;
    const control = document.createElement("div");
    control.className = "settings-field-control";
    element.appendChild(text);
    element.appendChild(control);
    return { element, control, text };
  }

  function createTreeNodesModelDialog() {
    const element = document.createElement("div");
    element.className = "node-picker tree-model-dialog";
    element.hidden = true;

    const backdrop = document.createElement("div");
    backdrop.className = "node-picker-backdrop";
    backdrop.addEventListener("click", hideTreeNodesModelDialog);

    const dialog = document.createElement("div");
    dialog.className = "node-picker-dialog tree-model-dialog-panel";

    const header = document.createElement("div");
    header.className = "node-picker-header";

    const title = document.createElement("strong");
    title.className = "node-picker-title";
    title.textContent = "TreeNodesModel";

    const headerActions = document.createElement("div");
    headerActions.className = "tree-model-header-actions";

    const openXmlButton = document.createElement("button");
    openXmlButton.type = "button";
    openXmlButton.className = "canvas-btn subtle";
    openXmlButton.textContent = "Open XML";
    openXmlButton.addEventListener("click", () => {
      runtime.vscode.postMessage({ type: "revealTreeNodesModel" });
    });

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "canvas-btn subtle";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", hideTreeNodesModelDialog);

    headerActions.appendChild(openXmlButton);
    headerActions.appendChild(closeButton);
    header.appendChild(title);
    header.appendChild(headerActions);

    const summary = document.createElement("p");
    summary.className = "tree-model-summary";

    const meta = document.createElement("div");
    meta.className = "tree-model-meta";

    const typeField = createSettingsField("Type");
    const typeSelect = document.createElement("select");
    typeSelect.className = "attribute-input tree-model-meta-select";
    ["Action", "Condition", "Decorator", "Control"].forEach((kind) => {
      const option = document.createElement("option");
      option.value = kind;
      option.textContent = kind;
      typeSelect.appendChild(option);
    });
    typeField.control.appendChild(typeSelect);

    const nameField = createSettingsField("Name");
    const nameInput = document.createElement("input");
    nameInput.className = "attribute-input tree-model-name-input";
    nameInput.type = "text";
    nameInput.spellcheck = false;
    nameField.control.appendChild(nameInput);

    meta.appendChild(typeField.element);
    meta.appendChild(nameField.element);

    const toolbar = document.createElement("div");
    toolbar.className = "tree-model-toolbar";

    const addPortButton = document.createElement("button");
    addPortButton.type = "button";
    addPortButton.className = "canvas-btn subtle";
    addPortButton.textContent = "+";
    addPortButton.addEventListener("click", () => {
      appendTreeNodePortRow(createBlankPortModel());
    });

    const deleteModelButton = document.createElement("button");
    deleteModelButton.type = "button";
    deleteModelButton.className = "canvas-btn subtle";
    deleteModelButton.textContent = "Delete";
    deleteModelButton.addEventListener("click", () => {
      deleteCurrentTreeNodeModel();
    });

    toolbar.appendChild(addPortButton);
    toolbar.appendChild(deleteModelButton);

    const status = document.createElement("div");
    status.className = "inspector-status";
    status.hidden = true;

    const tableWrap = document.createElement("div");
    tableWrap.className = "tree-model-table-wrap";

    const table = document.createElement("table");
    table.className = "tree-model-table";

    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const columns = [
      "Port Name",
      "Type",
      "Direction",
      "Default Value",
      "Description",
      ""
    ];
    const columnKeys = [
      "portName",
      "portType",
      "portDirection",
      "portDefaultValue",
      "portDescription",
      "actions"
    ];
    columns.forEach((label, index) => {
      const th = document.createElement("th");
      th.textContent = label;
      th.dataset.columnKey = columnKeys[index];
      headRow.appendChild(th);
    });
    head.appendChild(headRow);

    const body = document.createElement("tbody");
    body.className = "tree-model-table-body";
    table.appendChild(head);
    table.appendChild(body);
    tableWrap.appendChild(table);

    const actions = document.createElement("div");
    actions.className = "settings-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "canvas-btn accent";
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", () => {
      saveCurrentTreeNodeModel();
    });

    actions.appendChild(saveButton);
    dialog.appendChild(header);
    dialog.appendChild(summary);
    dialog.appendChild(meta);
    dialog.appendChild(toolbar);
    dialog.appendChild(status);
    dialog.appendChild(tableWrap);
    dialog.appendChild(actions);
    element.appendChild(backdrop);
    element.appendChild(dialog);

    return {
      element,
      title,
      summary,
      openXmlButton,
      closeButton,
      typeField,
      typeSelect,
      nameField,
      nameInput,
      addPortButton,
      deleteModelButton,
      status,
      table,
      tableHead: head,
      tableBody: body,
      saveButton,
      state: {
        focusModelId: null,
        createNew: false,
        originalModelId: null,
        modelExtraAttributes: {},
        pendingAction: null
      }
    };
  }

  function createNodeEditorDialog() {
    const element = document.createElement("div");
    element.className = "node-picker node-editor-dialog";
    element.hidden = true;

    const backdrop = document.createElement("div");
    backdrop.className = "node-picker-backdrop";
    backdrop.addEventListener("click", hideNodeEditorDialog);

    const dialog = document.createElement("div");
    dialog.className = "node-picker-dialog node-editor-dialog-panel";

    const header = document.createElement("div");
    header.className = "node-picker-header";

    const title = document.createElement("strong");
    title.className = "node-picker-title";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "canvas-btn subtle";
    closeButton.addEventListener("click", hideNodeEditorDialog);

    header.appendChild(title);
    header.appendChild(closeButton);

    const meta = document.createElement("div");
    meta.className = "node-editor-meta";

    const nodeTypeField = createSettingsField("Node Type");
    const nodeTypeValue = document.createElement("div");
    nodeTypeValue.className = "node-editor-static";
    nodeTypeField.control.appendChild(nodeTypeValue);

    const modelNameField = createSettingsField("Model Name");
    const modelNameValue = document.createElement("div");
    modelNameValue.className = "node-editor-static";
    modelNameField.control.appendChild(modelNameValue);

    const instanceNameField = createSettingsField("Instance Name");
    const instanceNameInput = document.createElement("input");
    instanceNameInput.className = "attribute-input";
    instanceNameInput.type = "text";
    instanceNameInput.spellcheck = false;
    instanceNameField.control.appendChild(instanceNameInput);

    meta.appendChild(nodeTypeField.element);
    meta.appendChild(modelNameField.element);
    meta.appendChild(instanceNameField.element);

    const tabs = document.createElement("div");
    tabs.className = "node-editor-tabs";

    const preConditionsTab = createNodeEditorTabButton("Pre Conditions", "pre");
    const postConditionsTab = createNodeEditorTabButton("Post Conditions", "post");
    const descriptionTab = createNodeEditorTabButton("Description", "description");
    tabs.appendChild(preConditionsTab.button);
    tabs.appendChild(postConditionsTab.button);
    tabs.appendChild(descriptionTab.button);

    const status = document.createElement("div");
    status.className = "inspector-status";
    status.hidden = true;

    const panels = document.createElement("div");
    panels.className = "node-editor-panels";

    const preConditionsPanel = document.createElement("div");
    preConditionsPanel.className = "node-editor-panel";
    const preConditionsList = document.createElement("div");
    preConditionsList.className = "attribute-list";
    preConditionsPanel.appendChild(preConditionsList);

    const postConditionsPanel = document.createElement("div");
    postConditionsPanel.className = "node-editor-panel";
    const postConditionsList = document.createElement("div");
    postConditionsList.className = "attribute-list";
    postConditionsPanel.appendChild(postConditionsList);

    const descriptionPanel = document.createElement("div");
    descriptionPanel.className = "node-editor-panel";
    const descriptionInput = document.createElement("textarea");
    descriptionInput.className = "attribute-input node-editor-description";
    descriptionInput.spellcheck = false;
    descriptionPanel.appendChild(descriptionInput);

    panels.appendChild(preConditionsPanel);
    panels.appendChild(postConditionsPanel);
    panels.appendChild(descriptionPanel);

    const actions = document.createElement("div");
    actions.className = "settings-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "canvas-btn accent";
    saveButton.addEventListener("click", saveCurrentNodeEditorState);
    actions.appendChild(saveButton);

    dialog.appendChild(header);
    dialog.appendChild(meta);
    dialog.appendChild(tabs);
    dialog.appendChild(status);
    dialog.appendChild(panels);
    dialog.appendChild(actions);
    element.appendChild(backdrop);
    element.appendChild(dialog);

    return {
      element,
      title,
      closeButton,
      nodeTypeField,
      nodeTypeValue,
      modelNameField,
      modelNameValue,
      instanceNameField,
      instanceNameInput,
      preConditionsTab: preConditionsTab.button,
      postConditionsTab: postConditionsTab.button,
      descriptionTab: descriptionTab.button,
      preConditionsPanel,
      preConditionsList,
      postConditionsPanel,
      postConditionsList,
      descriptionPanel,
      descriptionInput,
      status,
      saveButton,
      state: {
        treeId: null,
        nodePath: null,
        activeTab: "pre",
        pendingAction: null
      }
    };
  }

  function createNodeEditorTabButton(label, tabId) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "canvas-btn subtle node-editor-tab";
    button.dataset.tabId = tabId;
    button.textContent = label;
    button.addEventListener("click", () => {
      if (!nodeEditorDialog) {
        return;
      }

      nodeEditorDialog.state.activeTab = tabId;
      syncNodeEditorTabs();
    });
    return { button };
  }

  function showNodePicker(state) {
    if (!runtime.app.canPerformAction("openNodePicker", state || {})) {
      return;
    }

    if (!state?.treeId || !state.targetParentPath || !Number.isInteger(state.targetIndex)) {
      return;
    }

    nodePicker.state = state;
    const overlayCopy = runtime.i18n.getOverlayCopy();
    nodePicker.title.textContent = state.title || overlayCopy.nodePickerTitle;
    nodePicker.closeButton.textContent = overlayCopy.close;
    nodePicker.search.placeholder = overlayCopy.nodePickerSearchPlaceholder;
    nodePicker.search.value = "";
    renderNodePickerList();
    nodePicker.element.hidden = false;
    syncBlockingOverlay();
    requestAnimationFrame(() => {
      nodePicker.search.focus();
      nodePicker.search.select();
    });
  }

  function hideNodePicker() {
    if (!nodePicker) {
      return;
    }

    nodePicker.state = null;
    nodePicker.element.hidden = true;
    syncBlockingOverlay();
  }

  function showSettingsDialog() {
    if (!settingsDialog) {
      return;
    }

    const copy = runtime.i18n.getSettingsCopy();
    settingsDialog.title.textContent = copy.title;
    settingsDialog.closeButton.textContent = copy.close;
    settingsDialog.languageRow.text.textContent = copy.language;
    settingsDialog.themeRow.text.textContent = copy.theme;
    settingsDialog.simplifyRow.text.textContent = copy.simplifyView;
    settingsDialog.fileRow.text.textContent = copy.configFile;
    settingsDialog.importButton.textContent = copy.importPresets;
    settingsDialog.openFileButton.textContent = copy.openConfig;
    settingsDialog.saveButton.textContent = copy.save;
    settingsDialog.simplifyHint.textContent = copy.simplifyHint;
    settingsDialog.languageSelect.replaceChildren();
    [
      ["en-US", copy.languageOptions.english],
      ["zh-CN", copy.languageOptions.chinese]
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      settingsDialog.languageSelect.appendChild(option);
    });
    settingsDialog.languageSelect.value = runtime.state.currentSettings?.language || "en-US";
    settingsDialog.themeSelect.replaceChildren(...runtime.i18n.getThemeOptions());
    settingsDialog.themeSelect.value = runtime.state.currentSettings?.themePreset || "midnight";
    settingsDialog.simplifyOptions.replaceChildren();
    const selectedSections = new Set(runtime.state.currentSettings?.simplifyHiddenSections || []);
    ["description", "code", "inputs", "outputs", "params", "subtreeJump"].forEach((sectionKey) => {
      const label = document.createElement("label");
      label.className = "settings-checkbox";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = sectionKey;
      input.checked = selectedSections.has(sectionKey);

      const text = document.createElement("span");
      text.textContent = copy.simplifyOptions[sectionKey];

      label.appendChild(input);
      label.appendChild(text);
      settingsDialog.simplifyOptions.appendChild(label);
    });
    settingsDialog.fileHint.textContent = runtime.state.settingsFilePath || copy.settingsFileAutoHint;
    settingsDialog.element.hidden = false;
    syncBlockingOverlay();
  }

  function hideSettingsDialog() {
    if (!settingsDialog) {
      return;
    }

    settingsDialog.element.hidden = true;
    syncBlockingOverlay();
  }

  function showTreeNodesModelDialog(options = {}) {
    if (!runtime.app.canPerformAction("openNodeModelEditor", options)) {
      return;
    }

    if (!treeNodesModelDialog) {
      return;
    }

    treeNodesModelDialog.state = {
      focusModelId: options.focusModelId || null,
      createNew: options.createNew === true
    };

    const copy = runtime.i18n.getTreeNodesModelCopy();
    treeNodesModelDialog.title.textContent = copy.title;
    treeNodesModelDialog.summary.textContent = copy.summary;
    treeNodesModelDialog.openXmlButton.textContent = copy.openXml;
    treeNodesModelDialog.closeButton.textContent = copy.close;
    treeNodesModelDialog.typeField.text.textContent = copy.modelKind;
    treeNodesModelDialog.nameField.text.textContent = copy.modelId;
    Array.from(treeNodesModelDialog.tableHead.querySelectorAll("th")).forEach((th) => {
      const key = th.dataset.columnKey;
      if (key && copy.tableColumns[key]) {
        th.textContent = copy.tableColumns[key];
      }
    });
    treeNodesModelDialog.addPortButton.textContent = copy.addPort;
    treeNodesModelDialog.deleteModelButton.textContent = copy.deleteModel;
    treeNodesModelDialog.saveButton.textContent = copy.save;
    renderTreeNodesModelStatus("", "info");
    loadTreeNodesModelEditor();
    treeNodesModelDialog.element.hidden = false;
    syncBlockingOverlay();
  }

  function showNodeEditorDialog(options = {}) {
    if (!runtime.app.canPerformAction("openNodeEditor", options)) {
      return;
    }

    if (!nodeEditorDialog || !runtime.state.currentPreview) {
      return;
    }

    const selectedTree = runtime.app.getSelectedTree(runtime.state.currentPreview);
    const selectedNode = selectedTree
      ? runtime.app.findNodeByPath(selectedTree.node, options.nodePath || runtime.state.selectedNodePath)
      : null;

    if (!selectedTree || !selectedNode) {
      return;
    }

    const copy = runtime.i18n.getNodeEditorCopy();
    nodeEditorDialog.state = {
      treeId: selectedTree.id,
      nodePath: selectedNode.nodePath,
      activeTab: options.activeTab || "pre",
      pendingAction: null
    };

    nodeEditorDialog.title.textContent = copy.title;
    nodeEditorDialog.closeButton.textContent = copy.close;
    nodeEditorDialog.nodeTypeField.text.textContent = copy.nodeType;
    nodeEditorDialog.modelNameField.text.textContent = copy.modelName;
    nodeEditorDialog.instanceNameField.text.textContent = copy.instanceName;
    nodeEditorDialog.preConditionsTab.textContent = copy.preConditions;
    nodeEditorDialog.postConditionsTab.textContent = copy.postConditions;
    nodeEditorDialog.descriptionTab.textContent = copy.description;
    nodeEditorDialog.nodeTypeValue.textContent = selectedNode.category;
    nodeEditorDialog.modelNameValue.textContent = selectedNode.kind;
    nodeEditorDialog.instanceNameInput.value = selectedNode.instanceName || "";
    nodeEditorDialog.instanceNameInput.disabled = selectedNode.category === "SubTree";
    nodeEditorDialog.descriptionInput.placeholder = copy.descriptionPlaceholder;
    nodeEditorDialog.saveButton.textContent = copy.save;

    renderNodeEditorStatus("", "info");
    renderNodeEditorFields(selectedNode);
    syncNodeEditorTabs();
    nodeEditorDialog.element.hidden = false;
    syncBlockingOverlay();

    requestAnimationFrame(() => {
      nodeEditorDialog.instanceNameInput.focus();
      nodeEditorDialog.instanceNameInput.select();
    });
  }

  function hideNodeEditorDialog() {
    if (!nodeEditorDialog) {
      return;
    }

    nodeEditorDialog.element.hidden = true;
    nodeEditorDialog.state = {
      treeId: null,
      nodePath: null,
      activeTab: "pre",
      pendingAction: null
    };
    renderNodeEditorStatus("", "info");
    syncBlockingOverlay();
  }

  function renderNodeEditorStatus(message, tone) {
    if (!nodeEditorDialog) {
      return;
    }

    if (!message) {
      nodeEditorDialog.status.hidden = true;
      nodeEditorDialog.status.className = "inspector-status";
      nodeEditorDialog.status.textContent = "";
      return;
    }

    nodeEditorDialog.status.hidden = false;
    nodeEditorDialog.status.className = `inspector-status is-${tone || "info"}`;
    nodeEditorDialog.status.textContent = message;
  }

  function renderNodeEditorFields(node) {
    const fields = Array.isArray(node?.editorFields) ? node.editorFields : [];
    const preConditions = fields.filter((field) => isPreConditionField(field.key));
    const postConditions = fields.filter((field) => isPostConditionField(field.key));
    const descriptionField = fields.find((field) => field.key === "_description");

    renderNodeEditorFieldList(nodeEditorDialog.preConditionsList, preConditions);
    renderNodeEditorFieldList(nodeEditorDialog.postConditionsList, postConditions);
    nodeEditorDialog.descriptionInput.value = descriptionField?.value || "";
    nodeEditorDialog.descriptionInput.disabled = !descriptionField?.editableValue;
  }

  function renderNodeEditorFieldList(container, fields, emptyMessage = "") {
    container.replaceChildren();

    if (!fields || fields.length === 0) {
      if (emptyMessage) {
        container.appendChild(runtime.app.emptyState(emptyMessage));
      }
      return;
    }

    fields.forEach((field) => {
      container.appendChild(createNodeEditorFieldRow(field));
    });
  }

  function createNodeEditorFieldRow(field) {
    const copy = runtime.i18n.getInspectorCopy();
    const row = document.createElement("div");
    row.className = "attribute-row";
    row.dataset.role = field.role || "param";
    row.dataset.required = field.required ? "true" : "false";

    const roleBadge = document.createElement("span");
    roleBadge.className = `attribute-role attribute-role-${field.role || "param"}`;
    roleBadge.textContent = formatRoleLabel(field.role || "param");

    const keyInput = document.createElement("input");
    keyInput.className = "attribute-input attribute-key";
    keyInput.type = "text";
    keyInput.placeholder = copy.attributePlaceholder;
    keyInput.value = field.key || "";
    keyInput.readOnly = !field.editableKey;
    keyInput.disabled = !field.editableKey;

    const valueInput = document.createElement("input");
    valueInput.className = "attribute-input attribute-value";
    valueInput.type = "text";
    valueInput.placeholder = copy.valuePlaceholder;
    valueInput.value = field.value || "";
    valueInput.readOnly = !field.editableValue;
    valueInput.disabled = !field.editableValue;

    row.appendChild(roleBadge);
    row.appendChild(keyInput);
    row.appendChild(valueInput);
    return row;
  }

  function formatRoleLabel(role) {
    if (role === "input") {
      return "IN";
    }
    if (role === "output") {
      return "OUT";
    }
    if (role === "inout") {
      return "IO";
    }
    return "PARAM";
  }

  function syncNodeEditorTabs() {
    if (!nodeEditorDialog) {
      return;
    }

    const activeTab = nodeEditorDialog.state.activeTab || "pre";
    [
      [nodeEditorDialog.preConditionsTab, nodeEditorDialog.preConditionsPanel, "pre"],
      [nodeEditorDialog.postConditionsTab, nodeEditorDialog.postConditionsPanel, "post"],
      [nodeEditorDialog.descriptionTab, nodeEditorDialog.descriptionPanel, "description"]
    ].forEach(([button, panel, tabId]) => {
      button.classList.toggle("is-active", activeTab === tabId);
      panel.hidden = activeTab !== tabId;
    });
  }

  function saveCurrentNodeEditorState() {
    if (!nodeEditorDialog || !runtime.state.currentPreview) {
      return;
    }

    if (!runtime.app.canPerformAction("saveNodeEditor", nodeEditorDialog.state || {})) {
      return;
    }

    const copy = runtime.i18n.getInspectorCopy();
    const treeId = nodeEditorDialog.state.treeId;
    const nodePath = nodeEditorDialog.state.nodePath;
    if (!treeId || !nodePath) {
      renderNodeEditorStatus(copy.selectedTreeUnavailable, "error");
      return;
    }

    const selectedTree = runtime.app.getSelectedTree(runtime.state.currentPreview);
    const selectedNode = selectedTree ? runtime.app.findNodeByPath(selectedTree.node, nodePath) : null;
    if (!selectedNode) {
      renderNodeEditorStatus(copy.unresolvedNode, "error");
      return;
    }

    const attributes = {
      ...selectedNode.attributes
    };
    const instanceName = nodeEditorDialog.instanceNameInput.value.trim();
    if (instanceName) {
      attributes.name = instanceName;
    } else {
      delete attributes.name;
    }

    const rows = Array.from(
      [
        ...nodeEditorDialog.preConditionsList.querySelectorAll(".attribute-row"),
        ...nodeEditorDialog.postConditionsList.querySelectorAll(".attribute-row")
      ]
    );

    for (const row of rows) {
      const keyInput = row.querySelector(".attribute-key");
      const valueInput = row.querySelector(".attribute-value");
      const key = keyInput?.value.trim() || "";
      const value = valueInput?.value || "";
      const required = row.dataset.required === "true";

      if (!key) {
        if (value) {
          renderNodeEditorStatus(copy.missingAttributeKey, "error");
          return;
        }
        continue;
      }

      if (required && !value) {
        renderNodeEditorStatus(copy.requiredAttributeValue(key), "error");
        return;
      }

      if (Object.prototype.hasOwnProperty.call(attributes, key)) {
        delete attributes[key];
      }

      if (!value && !required) {
        delete attributes[key];
        continue;
      }

      attributes[key] = value;
    }

    const description = nodeEditorDialog.descriptionInput.value || "";
    if (description) {
      attributes._description = description;
    } else {
      delete attributes._description;
    }

    nodeEditorDialog.state.pendingAction = "save";
    renderNodeEditorStatus(runtime.i18n.getNodeEditorCopy().saving, "info");
    runtime.vscode.postMessage({
      type: "updateNodeAttributes",
      payload: {
        treeId,
        nodePath,
        attributes
      }
    });
  }

  function isPreConditionField(key) {
    return key === "_skipIf" || key === "_successIf" || key === "_failureIf" || key === "_while";
  }

  function isPostConditionField(key) {
    return key === "_onSuccess" || key === "_onFailure" || key === "_onHalted" || key === "_post";
  }

  function hideTreeNodesModelDialog() {
    if (!treeNodesModelDialog) {
      return;
    }

    treeNodesModelDialog.element.hidden = true;
    treeNodesModelDialog.state = {
      focusModelId: null,
      createNew: false,
      originalModelId: null,
      modelExtraAttributes: {},
      pendingAction: null
    };
    renderTreeNodesModelStatus("", "info");
    syncBlockingOverlay();
  }

  function renderTreeNodesModelStatus(message, tone) {
    if (!treeNodesModelDialog) {
      return;
    }

    if (!message) {
      treeNodesModelDialog.status.hidden = true;
      treeNodesModelDialog.status.className = "inspector-status";
      treeNodesModelDialog.status.textContent = "";
      return;
    }

    treeNodesModelDialog.status.hidden = false;
    treeNodesModelDialog.status.className = `inspector-status is-${tone || "info"}`;
    treeNodesModelDialog.status.textContent = message;
  }

  function loadTreeNodesModelEditor() {
    if (!treeNodesModelDialog) {
      return;
    }

    const preview = runtime.state.currentPreview;
    const copy = runtime.i18n.getTreeNodesModelCopy();
    const currentModels = preview?.nodeModels || [];
    const targetModel = treeNodesModelDialog.state.focusModelId
      ? currentModels.find((model) => model.id === treeNodesModelDialog.state.focusModelId) || null
      : null;

    const isCreateMode = treeNodesModelDialog.state.createNew || !targetModel;
    const model = targetModel ? cloneNodeModelModel(targetModel) : createBlankTreeNodeModel();

    treeNodesModelDialog.typeSelect.disabled = !preview;
    treeNodesModelDialog.nameInput.disabled = !preview;
    treeNodesModelDialog.addPortButton.disabled = !preview;
    treeNodesModelDialog.deleteModelButton.disabled = !preview;
    treeNodesModelDialog.saveButton.disabled = !preview;

    if (!preview) {
      treeNodesModelDialog.nameInput.value = "";
      treeNodesModelDialog.tableBody.replaceChildren();
      appendTreeNodePortEmptyState(copy.unavailable);
      treeNodesModelDialog.deleteModelButton.hidden = true;
      return;
    }

    treeNodesModelDialog.state.originalModelId = isCreateMode ? null : model.id;
    treeNodesModelDialog.state.modelExtraAttributes = extractModelExtraAttributes(model);
    treeNodesModelDialog.state.pendingAction = null;
    treeNodesModelDialog.state.createNew = false;
    treeNodesModelDialog.state.focusModelId = null;

    treeNodesModelDialog.typeSelect.value = model.modelKind || "Action";
    treeNodesModelDialog.nameInput.value = model.id || "";
    treeNodesModelDialog.nameInput.placeholder = copy.modelNamePlaceholder;
    treeNodesModelDialog.deleteModelButton.hidden = isCreateMode;

    renderTreeNodePortRows(model.ports.length > 0 ? model.ports : [createBlankPortModel()]);

    requestAnimationFrame(() => {
      treeNodesModelDialog.nameInput.focus();
      treeNodesModelDialog.nameInput.select();
    });
  }

  function renderTreeNodePortRows(ports) {
    treeNodesModelDialog.tableBody.replaceChildren();
    ports.forEach((port) => appendTreeNodePortRow(port));
  }

  function appendTreeNodePortRow(port) {
    if (!treeNodesModelDialog) {
      return;
    }

    treeNodesModelDialog.tableBody.querySelector(".empty-state-row")?.remove();
    const row = document.createElement("tr");
    row.className = "tree-model-port-row";
    row.dataset.extraAttributes = JSON.stringify(extractPortExtraAttributes(port));

    const nameCell = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.className = "attribute-input tree-model-port-name";
    nameInput.type = "text";
    nameInput.value = port.attributes?.name || "";
    nameInput.spellcheck = false;
    nameInput.placeholder = runtime.i18n.getTreeNodesModelCopy().portNamePlaceholder;
    nameCell.appendChild(nameInput);

    const typeCell = document.createElement("td");
    const typeInput = document.createElement("input");
    typeInput.className = "attribute-input tree-model-port-type";
    typeInput.type = "text";
    typeInput.value = port.attributes?.type || "";
    typeInput.spellcheck = false;
    typeCell.appendChild(typeInput);

    const directionCell = document.createElement("td");
    const directionSelect = document.createElement("select");
    directionSelect.className = "attribute-input tree-model-port-direction";
    [
      ["input_port", runtime.i18n.getTreeNodesModelCopy().inputPort],
      ["output_port", runtime.i18n.getTreeNodesModelCopy().outputPort],
      ["inout_port", runtime.i18n.getTreeNodesModelCopy().inoutPort]
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      directionSelect.appendChild(option);
    });
    directionSelect.value = port.tagName || "input_port";
    directionCell.appendChild(directionSelect);

    const defaultCell = document.createElement("td");
    const defaultInput = document.createElement("input");
    defaultInput.className = "attribute-input tree-model-port-default";
    defaultInput.type = "text";
    defaultInput.value = port.attributes?.default || "";
    defaultInput.spellcheck = false;
    defaultCell.appendChild(defaultInput);

    const descriptionCell = document.createElement("td");
    const descriptionInput = document.createElement("input");
    descriptionInput.className = "attribute-input tree-model-port-description";
    descriptionInput.type = "text";
    descriptionInput.value = port.attributes?.description || "";
    descriptionInput.spellcheck = false;
    descriptionCell.appendChild(descriptionInput);

    const actionCell = document.createElement("td");
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "canvas-btn subtle tree-model-port-remove";
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => {
      row.remove();
      if (!treeNodesModelDialog.tableBody.children.length) {
        appendTreeNodePortRow(createBlankPortModel());
      }
    });
    actionCell.appendChild(removeButton);

    row.appendChild(nameCell);
    row.appendChild(typeCell);
    row.appendChild(directionCell);
    row.appendChild(defaultCell);
    row.appendChild(descriptionCell);
    row.appendChild(actionCell);
    treeNodesModelDialog.tableBody.appendChild(row);
  }

  function appendTreeNodePortEmptyState(message) {
    const row = document.createElement("tr");
    row.className = "empty-state-row";
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = message;
    row.appendChild(cell);
    treeNodesModelDialog.tableBody.appendChild(row);
  }

  function saveCurrentTreeNodeModel() {
    if (!runtime.app.canPerformAction("saveNodeModel", treeNodesModelDialog?.state || {})) {
      return;
    }

    if (!treeNodesModelDialog || !runtime.state.currentPreview) {
      return;
    }

    const result = collectCurrentTreeNodeModel();
    if (result.error) {
      renderTreeNodesModelStatus(result.error, "error");
      return;
    }

    const nextModels = runtime.state.currentPreview.nodeModels.map(cloneNodeModelModel);
    const originalModelId = treeNodesModelDialog.state.originalModelId;
    const nextModel = result.model;

    const duplicate = nextModels.some((model) => model.id === nextModel.id && model.id !== originalModelId);
    if (duplicate) {
      renderTreeNodesModelStatus(runtime.i18n.getTreeNodesModelCopy().duplicateModelId(nextModel.id), "error");
      return;
    }

    if (originalModelId) {
      const index = nextModels.findIndex((model) => model.id === originalModelId);
      if (index >= 0) {
        nextModels[index] = nextModel;
      } else {
        nextModels.push(nextModel);
      }
    } else {
      nextModels.push(nextModel);
    }

    treeNodesModelDialog.state.pendingAction = "save";
    renderTreeNodesModelStatus(runtime.i18n.getTreeNodesModelCopy().saving, "info");
    runtime.vscode.postMessage({
      type: "saveTreeNodeModels",
      payload: nextModels
    });
  }

  function deleteCurrentTreeNodeModel() {
    if (!runtime.app.canPerformAction("deleteNodeModel", treeNodesModelDialog?.state || {})) {
      return;
    }

    if (!treeNodesModelDialog || !runtime.state.currentPreview) {
      return;
    }

    if (!treeNodesModelDialog.state.originalModelId) {
      hideTreeNodesModelDialog();
      return;
    }

    const nextModels = runtime.state.currentPreview.nodeModels
      .filter((model) => model.id !== treeNodesModelDialog.state.originalModelId)
      .map(cloneNodeModelModel);

    treeNodesModelDialog.state.pendingAction = "delete";
    renderTreeNodesModelStatus(runtime.i18n.getTreeNodesModelCopy().deleting, "info");
    runtime.vscode.postMessage({
      type: "saveTreeNodeModels",
      payload: nextModels
    });
  }

  function collectCurrentTreeNodeModel() {
    if (!treeNodesModelDialog) {
      return { error: runtime.i18n.getTreeNodesModelCopy().unavailableEditor, model: null };
    }

    const copy = runtime.i18n.getTreeNodesModelCopy();
    const id = treeNodesModelDialog.nameInput.value.trim();
    if (!id) {
      return { error: copy.missingModelId, model: null };
    }

    const ports = [];
    const seenPortNames = new Set();
    const rows = Array.from(treeNodesModelDialog.tableBody.querySelectorAll(".tree-model-port-row"));
    for (const row of rows) {
      const name = row.querySelector(".tree-model-port-name")?.value.trim() || "";
      const type = row.querySelector(".tree-model-port-type")?.value.trim() || "";
      const tagName = row.querySelector(".tree-model-port-direction")?.value || "input_port";
      const defaultValue = row.querySelector(".tree-model-port-default")?.value || "";
      const description = row.querySelector(".tree-model-port-description")?.value || "";

      if (!name && !type && !defaultValue && !description) {
        continue;
      }

      if (!name) {
        return { error: copy.missingPortName(id), model: null };
      }

      if (seenPortNames.has(name)) {
        return { error: copy.duplicatePortName(id, name), model: null };
      }
      seenPortNames.add(name);

      const extraAttributes = safeParseJson(row.dataset.extraAttributes);
      const attributes = {
        name,
        ...extraAttributes
      };
      if (type) {
        attributes.type = type;
      }
      if (defaultValue) {
        attributes.default = defaultValue;
      }
      if (description) {
        attributes.description = description;
      }

      ports.push({
        tagName,
        attributes
      });
    }

    return {
      error: null,
      model: {
        id,
        modelKind: treeNodesModelDialog.typeSelect.value || "Action",
        attributes: {
          ID: id,
          ...treeNodesModelDialog.state.modelExtraAttributes
        },
        ports
      }
    };
  }

  function createBlankTreeNodeModel() {
    return {
      id: "",
      modelKind: "Action",
      attributes: { ID: "" },
      ports: [createBlankPortModel()]
    };
  }

  function createBlankPortModel() {
    return {
      tagName: "input_port",
      attributes: {
        name: ""
      }
    };
  }

  function extractModelExtraAttributes(model) {
    const attributes = {};
    Object.entries(model.attributes || {}).forEach(([key, value]) => {
      if (key !== "ID") {
        attributes[key] = value;
      }
    });
    return attributes;
  }

  function extractPortExtraAttributes(port) {
    const attributes = {};
    Object.entries(port.attributes || {}).forEach(([key, value]) => {
      if (key !== "name" && key !== "type" && key !== "default" && key !== "description") {
        attributes[key] = value;
      }
    });
    return attributes;
  }

  function cloneNodeModelModel(model) {
    return {
      id: model.id,
      modelKind: model.modelKind,
      attributes: { ...model.attributes },
      ports: (model.ports || []).map((port) => ({
        tagName: port.tagName,
        attributes: { ...port.attributes }
      }))
    };
  }

  function safeParseJson(value) {
    try {
      return value ? JSON.parse(value) : {};
    } catch (_error) {
      return {};
    }
  }

  function renderNodePickerList() {
    const overlayCopy = runtime.i18n.getOverlayCopy();
    const query = nodePicker.search.value || "";
    const groups = runtime.catalog.filterCatalogGroups(
      runtime.state.currentCatalogGroups,
      query
    );

    if (groups.length === 0) {
      nodePicker.list.replaceChildren(runtime.app.emptyState(overlayCopy.nodePickerEmpty));
      return;
    }

    const fragment = document.createDocumentFragment();

    groups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "catalog-group";

      const isCollapsed = query
        ? false
        : Boolean(runtime.state.collapsedNodePickerGroups?.[group.category]);

      const header = document.createElement("button");
      header.type = "button";
      header.className = "catalog-group-header";
      header.setAttribute("aria-expanded", isCollapsed ? "false" : "true");

      const arrow = document.createElement("span");
      arrow.className = isCollapsed ? "catalog-group-arrow is-collapsed" : "catalog-group-arrow";
      arrow.textContent = "▾";

      const title = document.createElement("span");
      title.className = "catalog-group-title";
      title.textContent = group.category;

      header.appendChild(arrow);
      header.appendChild(title);
      header.addEventListener("click", () => {
        runtime.state.collapsedNodePickerGroups = {
          ...(runtime.state.collapsedNodePickerGroups || {}),
          [group.category]: !runtime.state.collapsedNodePickerGroups?.[group.category]
        };
        runtime.app.persistUiState();
        renderNodePickerList();
      });
      section.appendChild(header);

      const list = document.createElement("div");
      list.className = isCollapsed ? "catalog-items is-collapsed" : "catalog-items";

      group.items.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "catalog-item node-picker-item";
        button.textContent = item.title;
        button.title = `${item.category}: ${item.title}`;
        button.disabled = !runtime.app.canPerformAction("openNodePicker", nodePicker.state || {});
        button.addEventListener("click", () => {
          if (!runtime.app.canPerformAction("openNodePicker", nodePicker.state || {})) {
            return;
          }

          const state = nodePicker.state;
          if (!state) {
            return;
          }

          runtime.state.selectedNodePath = `${state.targetParentPath}.${state.targetIndex}`;
          runtime.app.persistUiState();
          runtime.vscode.postMessage({
            type: "createNode",
            payload: {
              treeId: state.treeId,
              targetParentPath: state.targetParentPath,
              targetIndex: state.targetIndex,
              nodeKey: item.key,
              nodeCategory: item.category
            }
          });
          hideNodePicker();
        });
        list.appendChild(button);
      });

      section.appendChild(list);
      fragment.appendChild(section);
    });

    nodePicker.list.replaceChildren(fragment);
  }

  function hideAll() {
    hideNodeContextMenu();
    hideDeleteConfirm();
    hideNodePicker();
    hideSettingsDialog();
    hideTreeNodesModelDialog();
    hideNodeEditorDialog();
  }

  function handleEditResult(payload) {
    if (nodeEditorDialog && !nodeEditorDialog.element.hidden) {
      if (payload?.ok && nodeEditorDialog.state.pendingAction) {
        hideNodeEditorDialog();
        return;
      }

      if (nodeEditorDialog.state.pendingAction) {
        nodeEditorDialog.state.pendingAction = null;
      }
      renderNodeEditorStatus(
        payload?.message || runtime.i18n.getNodeEditorCopy().saveFinished,
        payload?.ok ? "success" : "error"
      );
      return;
    }

    if (!treeNodesModelDialog || treeNodesModelDialog.element.hidden) {
      return;
    }

    if (payload?.ok && treeNodesModelDialog.state.pendingAction) {
      hideTreeNodesModelDialog();
      return;
    }

    renderTreeNodesModelStatus(
      payload?.message || runtime.i18n.getTreeNodesModelCopy().saveFinished,
      payload?.ok ? "success" : "error"
    );
  }

  runtime.overlays = {
    init,
    hideAll,
    showNodeContextMenu,
    hideNodeContextMenu,
    requestDeleteConfirmation,
    showNodePicker,
    hideNodePicker,
    showSettingsDialog,
    hideSettingsDialog,
    showTreeNodesModelDialog,
    hideTreeNodesModelDialog,
    showNodeEditorDialog,
    hideNodeEditorDialog,
    handleEditResult
  };

})();
