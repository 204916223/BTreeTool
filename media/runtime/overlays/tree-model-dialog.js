(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const overlayRuntime = (runtime.overlayRuntime = runtime.overlayRuntime || {});
  const overlayState = (overlayRuntime.state = overlayRuntime.state || {});
  const shared = overlayRuntime.shared;

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

    const typeField = shared.createSettingsField("Type");
    const typeSelect = document.createElement("select");
    typeSelect.className = "attribute-input tree-model-meta-select";
    ["Action", "Condition", "Decorator", "Control"].forEach((kind) => {
      const option = document.createElement("option");
      option.value = kind;
      option.textContent = kind;
      typeSelect.appendChild(option);
    });
    typeField.control.appendChild(typeSelect);

    const nameField = shared.createSettingsField("Name");
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
    addPortButton.innerHTML = runtime.icons.iconHtml("add");
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
    status.className = "editor-status";
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

  function showTreeNodesModelDialog(options = {}) {
    if (!runtime.app.canPerformAction("openNodeModelEditor", options)) {
      return;
    }

    if (!overlayState.treeNodesModelDialog) {
      return;
    }

    overlayState.treeNodesModelDialog.state = {
      focusModelId: options.focusModelId || null,
      createNew: options.createNew === true
    };

    const copy = runtime.i18n.getTreeNodesModelCopy();
    overlayState.treeNodesModelDialog.title.textContent = copy.title;
    overlayState.treeNodesModelDialog.summary.textContent = copy.summary;
    overlayState.treeNodesModelDialog.openXmlButton.textContent = copy.openXml;
    overlayState.treeNodesModelDialog.closeButton.textContent = copy.close;
    overlayState.treeNodesModelDialog.typeField.text.textContent = copy.modelKind;
    overlayState.treeNodesModelDialog.nameField.text.textContent = copy.modelId;
    Array.from(overlayState.treeNodesModelDialog.tableHead.querySelectorAll("th")).forEach((th) => {
      const key = th.dataset.columnKey;
      if (key && copy.tableColumns[key]) {
        th.textContent = copy.tableColumns[key];
      }
    });
    overlayState.treeNodesModelDialog.addPortButton.textContent = copy.addPort;
    overlayState.treeNodesModelDialog.deleteModelButton.textContent = copy.deleteModel;
    overlayState.treeNodesModelDialog.saveButton.textContent = copy.save;
    renderTreeNodesModelStatus("", "info");
    loadTreeNodesModelEditor();
    overlayState.treeNodesModelDialog.element.hidden = false;
    shared.syncBlockingOverlay();
  }

  function hideTreeNodesModelDialog() {
    if (!overlayState.treeNodesModelDialog) {
      return;
    }

    overlayState.treeNodesModelDialog.element.hidden = true;
    overlayState.treeNodesModelDialog.state = {
      focusModelId: null,
      createNew: false,
      originalModelId: null,
      modelExtraAttributes: {},
      pendingAction: null
    };
    renderTreeNodesModelStatus("", "info");
    shared.syncBlockingOverlay();
  }

  function renderTreeNodesModelStatus(message, tone) {
    if (!overlayState.treeNodesModelDialog) {
      return;
    }

    if (!message) {
      overlayState.treeNodesModelDialog.status.hidden = true;
      overlayState.treeNodesModelDialog.status.className = "editor-status";
      overlayState.treeNodesModelDialog.status.textContent = "";
      return;
    }

    overlayState.treeNodesModelDialog.status.hidden = false;
    overlayState.treeNodesModelDialog.status.className = `editor-status is-${tone || "info"}`;
    overlayState.treeNodesModelDialog.status.textContent = message;
  }

  function loadTreeNodesModelEditor() {
    if (!overlayState.treeNodesModelDialog) {
      return;
    }

    const preview = runtime.state.currentPreview;
    const copy = runtime.i18n.getTreeNodesModelCopy();
    const currentModels = preview?.nodeModels || [];
    const targetModel = overlayState.treeNodesModelDialog.state.focusModelId
      ? currentModels.find((model) => model.id === overlayState.treeNodesModelDialog.state.focusModelId) || null
      : null;

    const isCreateMode = overlayState.treeNodesModelDialog.state.createNew || !targetModel;
    const model = targetModel ? cloneNodeModelModel(targetModel) : createBlankTreeNodeModel();

    overlayState.treeNodesModelDialog.typeSelect.disabled = !preview;
    overlayState.treeNodesModelDialog.nameInput.disabled = !preview;
    overlayState.treeNodesModelDialog.addPortButton.disabled = !preview;
    overlayState.treeNodesModelDialog.deleteModelButton.disabled = !preview;
    overlayState.treeNodesModelDialog.saveButton.disabled = !preview;

    if (!preview) {
      overlayState.treeNodesModelDialog.nameInput.value = "";
      overlayState.treeNodesModelDialog.tableBody.replaceChildren();
      appendTreeNodePortEmptyState(copy.unavailable);
      overlayState.treeNodesModelDialog.deleteModelButton.hidden = true;
      return;
    }

    overlayState.treeNodesModelDialog.state.originalModelId = isCreateMode ? null : model.id;
    overlayState.treeNodesModelDialog.state.modelExtraAttributes = extractModelExtraAttributes(model);
    overlayState.treeNodesModelDialog.state.pendingAction = null;
    overlayState.treeNodesModelDialog.state.createNew = false;
    overlayState.treeNodesModelDialog.state.focusModelId = null;

    overlayState.treeNodesModelDialog.typeSelect.value = model.modelKind || "Action";
    overlayState.treeNodesModelDialog.nameInput.value = model.id || "";
    overlayState.treeNodesModelDialog.nameInput.placeholder = copy.modelNamePlaceholder;
    overlayState.treeNodesModelDialog.deleteModelButton.hidden = isCreateMode;

    renderTreeNodePortRows(model.ports.length > 0 ? model.ports : [createBlankPortModel()]);

    requestAnimationFrame(() => {
      overlayState.treeNodesModelDialog.nameInput.focus();
      overlayState.treeNodesModelDialog.nameInput.select();
    });
  }

  function renderTreeNodePortRows(ports) {
    overlayState.treeNodesModelDialog.tableBody.replaceChildren();
    ports.forEach((port) => appendTreeNodePortRow(port));
  }

  function appendTreeNodePortRow(port) {
    if (!overlayState.treeNodesModelDialog) {
      return;
    }

    overlayState.treeNodesModelDialog.tableBody.querySelector(".empty-state-row")?.remove();
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
    removeButton.innerHTML = runtime.icons.iconHtml("remove");
    removeButton.addEventListener("click", () => {
      row.remove();
      if (!overlayState.treeNodesModelDialog.tableBody.children.length) {
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
    overlayState.treeNodesModelDialog.tableBody.appendChild(row);
  }

  function appendTreeNodePortEmptyState(message) {
    const row = document.createElement("tr");
    row.className = "empty-state-row";
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = message;
    row.appendChild(cell);
    overlayState.treeNodesModelDialog.tableBody.appendChild(row);
  }

  function saveCurrentTreeNodeModel() {
    if (!runtime.app.canPerformAction("saveNodeModel", overlayState.treeNodesModelDialog?.state || {})) {
      return;
    }

    if (!overlayState.treeNodesModelDialog || !runtime.state.currentPreview) {
      return;
    }

    const result = collectCurrentTreeNodeModel();
    if (result.error) {
      renderTreeNodesModelStatus(result.error, "error");
      return;
    }

    const nextModels = runtime.state.currentPreview.nodeModels.map(cloneNodeModelModel);
    const originalModelId = overlayState.treeNodesModelDialog.state.originalModelId;
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

    overlayState.treeNodesModelDialog.state.pendingAction = "save";
    renderTreeNodesModelStatus(runtime.i18n.getTreeNodesModelCopy().saving, "info");
    runtime.vscode.postMessage({
      type: "saveTreeNodeModels",
      payload: nextModels
    });
  }

  function deleteCurrentTreeNodeModel() {
    if (!runtime.app.canPerformAction("deleteNodeModel", overlayState.treeNodesModelDialog?.state || {})) {
      return;
    }

    if (!overlayState.treeNodesModelDialog || !runtime.state.currentPreview) {
      return;
    }

    if (!overlayState.treeNodesModelDialog.state.originalModelId) {
      hideTreeNodesModelDialog();
      return;
    }

    const nextModels = runtime.state.currentPreview.nodeModels
      .filter((model) => model.id !== overlayState.treeNodesModelDialog.state.originalModelId)
      .map(cloneNodeModelModel);

    overlayState.treeNodesModelDialog.state.pendingAction = "delete";
    renderTreeNodesModelStatus(runtime.i18n.getTreeNodesModelCopy().deleting, "info");
    runtime.vscode.postMessage({
      type: "saveTreeNodeModels",
      payload: nextModels
    });
  }

  function collectCurrentTreeNodeModel() {
    if (!overlayState.treeNodesModelDialog) {
      return { error: runtime.i18n.getTreeNodesModelCopy().unavailableEditor, model: null };
    }

    const copy = runtime.i18n.getTreeNodesModelCopy();
    const id = overlayState.treeNodesModelDialog.nameInput.value.trim();
    if (!id) {
      return { error: copy.missingModelId, model: null };
    }

    const ports = [];
    const seenPortNames = new Set();
    const rows = Array.from(overlayState.treeNodesModelDialog.tableBody.querySelectorAll(".tree-model-port-row"));
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

      const extraAttributes = shared.safeParseJson(row.dataset.extraAttributes);
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
        modelKind: overlayState.treeNodesModelDialog.typeSelect.value || "Action",
        attributes: {
          ID: id,
          ...overlayState.treeNodesModelDialog.state.modelExtraAttributes
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

  overlayRuntime.parts.treeModelDialog = {
    createTreeNodesModelDialog,
    showTreeNodesModelDialog,
    hideTreeNodesModelDialog,
    renderStatus: renderTreeNodesModelStatus
  };
})();
