(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const overlayRuntime = (runtime.overlayRuntime = runtime.overlayRuntime || {});
  const overlayState = (overlayRuntime.state = overlayRuntime.state || {});
  const shared = overlayRuntime.shared;

  function createNodeEditorDialog() {
    const shell = shared.createModalShell({
      rootClass: "node-editor-dialog",
      dialogClass: "node-editor-dialog-panel",
      onClose: hideNodeEditorDialog
    });
    const { element, dialog, header, title } = shell;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "canvas-btn subtle";
    closeButton.addEventListener("click", hideNodeEditorDialog);

    header.appendChild(closeButton);

    const meta = document.createElement("div");
    meta.className = "node-editor-meta";

    const nodeTypeField = shared.createSettingsField("Node Type");
    const nodeTypeValue = document.createElement("div");
    nodeTypeValue.className = "node-editor-static";
    nodeTypeField.control.appendChild(nodeTypeValue);

    const modelNameField = shared.createSettingsField("Model Name");
    const modelNameValue = document.createElement("div");
    modelNameValue.className = "node-editor-static";
    modelNameField.control.appendChild(modelNameValue);

    const instanceNameField = shared.createSettingsField("Instance Name");
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
    status.className = "editor-status";
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

    dialog.appendChild(meta);
    dialog.appendChild(tabs);
    dialog.appendChild(status);
    dialog.appendChild(panels);
    dialog.appendChild(actions);
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
      if (!overlayState.nodeEditorDialog) {
        return;
      }

      overlayState.nodeEditorDialog.state.activeTab = tabId;
      syncNodeEditorTabs();
    });
    return { button };
  }

  function showNodeEditorDialog(options = {}) {
    if (!runtime.app.canPerformAction("openNodeEditor", options)) {
      return;
    }

    if (!overlayState.nodeEditorDialog || !runtime.state.currentPreview) {
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
    overlayState.nodeEditorDialog.state = {
      treeId: selectedTree.id,
      nodePath: selectedNode.nodePath,
      activeTab: options.activeTab || "pre",
      pendingAction: null
    };

    overlayState.nodeEditorDialog.title.textContent = copy.title;
    overlayState.nodeEditorDialog.closeButton.textContent = copy.close;
    overlayState.nodeEditorDialog.nodeTypeField.text.textContent = copy.nodeType;
    overlayState.nodeEditorDialog.modelNameField.text.textContent = copy.modelName;
    overlayState.nodeEditorDialog.instanceNameField.text.textContent = copy.instanceName;
    overlayState.nodeEditorDialog.preConditionsTab.textContent = copy.preConditions;
    overlayState.nodeEditorDialog.postConditionsTab.textContent = copy.postConditions;
    overlayState.nodeEditorDialog.descriptionTab.textContent = copy.description;
    overlayState.nodeEditorDialog.nodeTypeValue.textContent = selectedNode.category;
    overlayState.nodeEditorDialog.modelNameValue.textContent = selectedNode.kind;
    overlayState.nodeEditorDialog.instanceNameInput.value = selectedNode.instanceName || "";
    overlayState.nodeEditorDialog.instanceNameInput.disabled = selectedNode.category === "SubTree";
    overlayState.nodeEditorDialog.descriptionInput.placeholder = copy.descriptionPlaceholder;
    overlayState.nodeEditorDialog.saveButton.textContent = copy.save;

    renderNodeEditorStatus("", "info");
    renderNodeEditorFields(selectedNode);
    syncNodeEditorTabs();
    overlayState.nodeEditorDialog.element.hidden = false;
    shared.syncBlockingOverlay();

    requestAnimationFrame(() => {
      overlayState.nodeEditorDialog.instanceNameInput.focus();
      overlayState.nodeEditorDialog.instanceNameInput.select();
    });
  }

  function hideNodeEditorDialog() {
    if (!overlayState.nodeEditorDialog) {
      return;
    }

    overlayState.nodeEditorDialog.element.hidden = true;
    overlayState.nodeEditorDialog.state = {
      treeId: null,
      nodePath: null,
      activeTab: "pre",
      pendingAction: null
    };
    renderNodeEditorStatus("", "info");
    shared.syncBlockingOverlay();
  }

  function renderNodeEditorStatus(message, tone) {
    if (!overlayState.nodeEditorDialog) {
      return;
    }

    if (!message) {
      overlayState.nodeEditorDialog.status.hidden = true;
      overlayState.nodeEditorDialog.status.className = "editor-status";
      overlayState.nodeEditorDialog.status.textContent = "";
      return;
    }

    overlayState.nodeEditorDialog.status.hidden = false;
    overlayState.nodeEditorDialog.status.className = `editor-status is-${tone || "info"}`;
    overlayState.nodeEditorDialog.status.textContent = message;
  }

  function renderNodeEditorFields(node) {
    const fields = Array.isArray(node?.editorFields) ? node.editorFields : [];
    const preConditions = fields.filter((field) => isPreConditionField(field.key));
    const postConditions = fields.filter((field) => isPostConditionField(field.key));
    const descriptionField = fields.find((field) => field.key === "_description");

    renderNodeEditorFieldList(overlayState.nodeEditorDialog.preConditionsList, preConditions);
    renderNodeEditorFieldList(overlayState.nodeEditorDialog.postConditionsList, postConditions);
    overlayState.nodeEditorDialog.descriptionInput.value = descriptionField?.value || "";
    overlayState.nodeEditorDialog.descriptionInput.disabled = !descriptionField?.editableValue;
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
    const copy = runtime.i18n.getAttributeCopy();
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
    if (!overlayState.nodeEditorDialog) {
      return;
    }

    const activeTab = overlayState.nodeEditorDialog.state.activeTab || "pre";
    [
      [overlayState.nodeEditorDialog.preConditionsTab, overlayState.nodeEditorDialog.preConditionsPanel, "pre"],
      [overlayState.nodeEditorDialog.postConditionsTab, overlayState.nodeEditorDialog.postConditionsPanel, "post"],
      [overlayState.nodeEditorDialog.descriptionTab, overlayState.nodeEditorDialog.descriptionPanel, "description"]
    ].forEach(([button, panel, tabId]) => {
      button.classList.toggle("is-active", activeTab === tabId);
      panel.hidden = activeTab !== tabId;
    });
  }

  function saveCurrentNodeEditorState() {
    if (!overlayState.nodeEditorDialog || !runtime.state.currentPreview) {
      return;
    }

    if (!runtime.app.canPerformAction("saveNodeEditor", overlayState.nodeEditorDialog.state || {})) {
      return;
    }

    const copy = runtime.i18n.getAttributeCopy();
    const treeId = overlayState.nodeEditorDialog.state.treeId;
    const nodePath = overlayState.nodeEditorDialog.state.nodePath;
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
    const instanceName = overlayState.nodeEditorDialog.instanceNameInput.value.trim();
    if (instanceName) {
      attributes.name = instanceName;
    } else {
      delete attributes.name;
    }

    const rows = Array.from(
      [
        ...overlayState.nodeEditorDialog.preConditionsList.querySelectorAll(".attribute-row"),
        ...overlayState.nodeEditorDialog.postConditionsList.querySelectorAll(".attribute-row")
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

    const description = overlayState.nodeEditorDialog.descriptionInput.value || "";
    if (description) {
      attributes._description = description;
    } else {
      delete attributes._description;
    }

    overlayState.nodeEditorDialog.state.pendingAction = "save";
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

  overlayRuntime.parts.nodeEditorDialog = {
    createNodeEditorDialog,
    showNodeEditorDialog,
    hideNodeEditorDialog,
    renderStatus: renderNodeEditorStatus
  };
})();
