(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

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

  function renderInspector() {
    const { state, app, refs } = runtime;
    const copy = runtime.i18n.getInspectorCopy();

    if (runtime.modeRules.isPlaybackMode()) {
      runtime.playback?.renderPlaybackInspector();
      return;
    }

    if (refs.inspectorActions) {
      refs.inspectorActions.hidden = false;
    }

    if (!state.currentPreview) {
      renderInspectorEmpty(copy.emptyTitle, copy.emptySummary);
      return;
    }

    const selectedTree = app.getSelectedTree(state.currentPreview);
    const selectedNode = selectedTree ? app.findNodeByPath(selectedTree.node, state.selectedNodePath) : null;

    if (!selectedTree || !selectedNode) {
      renderInspectorEmpty(copy.unavailableTitle, copy.unresolvedNode);
      return;
    }

    refs.inspectorTitle.textContent = selectedNode.title;
    refs.inspectorKind.textContent = selectedNode.kind;
    refs.inspectorSummary.textContent =
      selectedNode.kind === "SubTree"
        ? copy.subtreeSummary(selectedNode.targetTreeId)
        : selectedNode.description
          ? selectedNode.description
          : selectedNode.summary
            ? selectedNode.summary
            : copy.defaultSummary;

    renderInspectorStatus("", "info");
    renderInspectorWarnings(selectedNode.warnings);
    renderAttributeRowsFromNode(selectedNode);
    setInspectorButtonsDisabled(
      !app.canPerformAction("applyInspectorAttributes", {
        node: selectedNode,
        hasEditableFields: hasEditableInspectorFields(selectedNode)
      })
    );
  }

  function renderInspectorEmpty(title, summary) {
    const { refs } = runtime;
    if (refs.inspectorActions) {
      refs.inspectorActions.hidden = false;
    }
    refs.inspectorTitle.textContent = title;
    refs.inspectorKind.textContent = "none";
    refs.inspectorSummary.textContent = summary;
    renderInspectorStatus("", "info");
    renderInspectorWarnings([]);
    refs.attributeList.replaceChildren();
    setInspectorButtonsDisabled(true);
  }

  function renderInspectorWarnings(warnings) {
    const { refs } = runtime;
    if (!warnings || warnings.length === 0) {
      refs.inspectorWarnings.replaceChildren();
      return;
    }

    const fragment = document.createDocumentFragment();
    warnings.forEach((warning) => {
      const item = document.createElement("div");
      item.className = `inspector-warning inspector-warning-${warning.severity || "warning"}`;
      item.textContent = warning.message;
      fragment.appendChild(item);
    });
    refs.inspectorWarnings.replaceChildren(fragment);
  }

  function renderInspectorStatus(message, tone) {
    const { refs } = runtime;
    if (!message) {
      refs.inspectorStatus.hidden = true;
      refs.inspectorStatus.className = "inspector-status";
      refs.inspectorStatus.textContent = "";
      return;
    }

    refs.inspectorStatus.hidden = false;
    refs.inspectorStatus.className = `inspector-status is-${tone || "info"}`;
    refs.inspectorStatus.textContent = message;
  }

  function setInspectorButtonsDisabled(disabled) {
    runtime.refs.applyAttributesButton.disabled = disabled;
  }

  function hasEditableInspectorFields(node) {
    return (node?.inspectorFields || []).some((field) => field.editableKey || field.editableValue);
  }

  function renderAttributeRowsFromNode(node) {
    runtime.refs.attributeList.replaceChildren();
    node.inspectorFields.forEach((field) => {
      appendAttributeRow(field);
    });
  }

  function appendAttributeRow(field) {
    const copy = runtime.i18n.getInspectorCopy();
    const editModeEnabled = runtime.app.canPerformAction("applyInspectorAttributes", {
      hasEditableFields: true
    });
    const isMultilineValue = field.key === "code";
    const row = document.createElement("div");
    row.className = isMultilineValue ? "attribute-row attribute-row-multiline" : "attribute-row";
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
    keyInput.readOnly = !editModeEnabled || !field.editableKey;
    keyInput.disabled = !editModeEnabled || !field.editableKey;

    const valueInput = isMultilineValue ? document.createElement("textarea") : document.createElement("input");
    valueInput.className = isMultilineValue
      ? "attribute-input attribute-value attribute-value-multiline"
      : "attribute-input attribute-value";
    if (valueInput instanceof HTMLInputElement) {
      valueInput.type = "text";
    } else {
      valueInput.rows = 6;
      valueInput.spellcheck = false;
      valueInput.wrap = "soft";
    }
    valueInput.placeholder = copy.valuePlaceholder;
    valueInput.value = field.value || "";
    valueInput.readOnly = !editModeEnabled || !field.editableValue;
    valueInput.disabled = !editModeEnabled || !field.editableValue;

    row.appendChild(roleBadge);
    row.appendChild(keyInput);
    row.appendChild(valueInput);
    runtime.refs.attributeList.appendChild(row);
  }

  function applyAttributeChanges() {
    const { state, app, refs, vscode } = runtime;
    const copy = runtime.i18n.getInspectorCopy();
    if (!state.currentPreview) {
      return;
    }

    const selectedTree = app.getSelectedTree(state.currentPreview);
    const selectedNode = selectedTree ? app.findNodeByPath(selectedTree.node, state.selectedNodePath) : null;
    if (!selectedTree) {
      renderInspectorStatus(copy.selectedTreeUnavailable, "error");
      return;
    }

    if (!selectedNode || !hasEditableInspectorFields(selectedNode)) {
      renderInspectorStatus(copy.readOnlyNode, "info");
      return;
    }

    if (
      !app.canPerformAction("applyInspectorAttributes", {
        node: selectedNode,
        hasEditableFields: hasEditableInspectorFields(selectedNode)
      })
    ) {
      renderInspectorStatus(copy.readOnlyNode, "info");
      return;
    }

    const rows = Array.from(refs.attributeList.querySelectorAll(".attribute-row"));
    const attributes = {};

    for (const row of rows) {
      const keyInput = row.querySelector(".attribute-key");
      const valueInput = row.querySelector(".attribute-value");
      const key = keyInput?.value.trim() || "";
      const value = valueInput?.value || "";
      const required = row.dataset.required === "true";

      if (!key) {
        if (value) {
          renderInspectorStatus(copy.missingAttributeKey, "error");
          return;
        }
        continue;
      }

      if (required && !value) {
        renderInspectorStatus(copy.requiredAttributeValue(key), "error");
        return;
      }

      if (Object.prototype.hasOwnProperty.call(attributes, key)) {
        renderInspectorStatus(copy.duplicateAttribute(key), "error");
        return;
      }

      if (!value && !required) {
        continue;
      }

      attributes[key] = value;
    }

    renderInspectorStatus(copy.applying, "info");
    vscode.postMessage({
      type: "updateNodeAttributes",
      payload: {
        treeId: selectedTree.id,
        nodePath: state.selectedNodePath,
        attributes
      }
    });
  }

  function init() {
    runtime.refs.applyAttributesButton.textContent = runtime.i18n.getInspectorCopy().apply;
    runtime.refs.applyAttributesButton?.addEventListener("click", () => {
      applyAttributeChanges();
    });
  }

  runtime.inspector = {
    init,
    renderInspector,
    renderInspectorEmpty,
    renderInspectorWarnings,
    renderInspectorStatus,
    hasEditableInspectorFields,
    applyAttributeChanges
  };
})();
