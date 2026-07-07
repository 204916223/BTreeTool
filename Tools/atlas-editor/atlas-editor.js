(function () {
  const EDIT_PANE_WIDTH_KEY = "btree-atlas-editor.editPaneWidth";
  const EDIT_PANE_MIN_WIDTH = 460;
  const PREVIEW_MIN_WIDTH = 360;

  const state = {
    view: "nodes",
    nodes: {},
    variables: {},
    selectedNodeKey: "",
    selectedVariableKey: "",
    nodeQuery: "",
    variableQuery: "",
    nodeFilter: "all",
    previewMode: "node",
    selectedParamName: "",
    isElectron: Boolean(window.atlasEditorBridge),
    dirty: {
      nodes: false,
      variables: false
    },
    lastLoaded: {
      nodes: "",
      variables: ""
    }
  };

  const refs = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindRefs();
    document.body.classList.toggle("is-electron", state.isElectron);
    applyStoredEditPaneWidth();
    bindEvents();
    render();
    if (state.isElectron) {
      loadElectronAtlasFiles();
    }
  }

  function bindRefs() {
    for (const element of document.querySelectorAll("[id]")) {
      refs[toCamelCase(element.id)] = element;
    }
  }

  function bindEvents() {
    refs.nodesFile.addEventListener("change", (event) => loadJsonFile(event, "nodes"));
    refs.variablesFile.addEventListener("change", (event) => loadJsonFile(event, "variables"));

    document.querySelectorAll(".tab").forEach((button) => {
      button.addEventListener("click", () => {
        state.view = button.dataset.view || "nodes";
        render();
      });
    });

    refs.nodeSearch.addEventListener("input", () => {
      state.nodeQuery = refs.nodeSearch.value || "";
      renderList();
    });
    refs.variableSearch.addEventListener("input", () => {
      state.variableQuery = refs.variableSearch.value || "";
      renderList();
    });
    refs.nodeFilter.addEventListener("change", () => {
      state.nodeFilter = refs.nodeFilter.value || "all";
      renderList();
    });

    refs.addNode.addEventListener("click", addNode);
    refs.renameNode.addEventListener("click", saveSelectedNode);
    refs.deleteNode.addEventListener("click", deleteSelectedNode);
    refs.addParam.addEventListener("click", addParam);

    refs.addVariable.addEventListener("click", addVariable);
    refs.renameVariable.addEventListener("click", saveSelectedVariable);
    refs.deleteVariable.addEventListener("click", deleteSelectedVariable);

    bindNodeForm();
    bindVariableForm();
    refs.exportNodes.addEventListener("click", () => exportJson("nodes"));
    refs.exportVariables.addEventListener("click", () => exportJson("variables"));
    refs.exportAll.addEventListener("click", () => {
      exportJson("nodes");
      window.setTimeout(() => exportJson("variables"), 120);
    });
    refs.reloadFiles.addEventListener("click", loadElectronAtlasFiles);
    refs.saveAllFiles.addEventListener("click", saveAllElectronAtlasFiles);
    refs.openAtlasDir.addEventListener("click", () => window.atlasEditorBridge?.openAtlasDir());
    refs.previewModeNode.addEventListener("click", () => {
      state.previewMode = "node";
      renderNodePreview();
    });
    refs.previewModeUsage.addEventListener("click", () => {
      state.previewMode = "usage";
      renderNodePreview();
    });
    refs.addUsageFlowRoot.addEventListener("click", () => {
      state.previewMode = "usage";
      ensureSelectedUsageFlow();
      render();
    });
    bindEditPaneResizer();
  }

  function applyStoredEditPaneWidth() {
    const width = Number(window.localStorage?.getItem(EDIT_PANE_WIDTH_KEY));
    if (Number.isFinite(width) && width >= EDIT_PANE_MIN_WIDTH) {
      setEditPaneWidth(width);
    }
  }

  function bindEditPaneResizer() {
    if (!refs.editPaneResizer) {
      return;
    }
    refs.editPaneResizer.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      refs.editPaneResizer.setPointerCapture?.(event.pointerId);
      document.body.classList.add("is-resizing-edit-pane");
      resizeEditPaneFromPointer(event);

      const onPointerMove = (moveEvent) => resizeEditPaneFromPointer(moveEvent);
      const onPointerUp = (upEvent) => {
        resizeEditPaneFromPointer(upEvent);
        document.body.classList.remove("is-resizing-edit-pane");
        refs.editPaneResizer.releasePointerCapture?.(upEvent.pointerId);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    });
    refs.editPaneResizer.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      const current = refs.editPane?.getBoundingClientRect().width || EDIT_PANE_MIN_WIDTH;
      const delta = event.key === "ArrowLeft" ? 24 : -24;
      setEditPaneWidth(current + delta);
    });
  }

  function resizeEditPaneFromPointer(event) {
    const workspace = refs.editPaneResizer?.parentElement;
    if (!workspace) {
      return;
    }
    const rect = workspace.getBoundingClientRect();
    setEditPaneWidth(rect.right - event.clientX);
  }

  function setEditPaneWidth(width) {
    const workspace = refs.editPaneResizer?.parentElement;
    const rect = workspace?.getBoundingClientRect();
    const maxWidth = rect
      ? Math.max(EDIT_PANE_MIN_WIDTH, rect.width - 310 - PREVIEW_MIN_WIDTH - refs.editPaneResizer.offsetWidth)
      : width;
    const nextWidth = Math.round(Math.min(Math.max(width, EDIT_PANE_MIN_WIDTH), maxWidth));
    document.documentElement.style.setProperty("--edit-pane-width", `${nextWidth}px`);
    window.localStorage?.setItem(EDIT_PANE_WIDTH_KEY, String(nextWidth));
  }

  function bindNodeForm() {
    const fields = [
      refs.nodeTitle,
      refs.nodeCategory,
      refs.nodeDepartment,
      refs.nodeMaintainer,
      refs.nodeDescription,
      refs.nodeStatus,
      refs.nodeRules,
      refs.nodeExamples,
      refs.nodeSourceNotes
    ];
    fields.forEach((field) => field.addEventListener("input", updateSelectedNodeFromForm));
    refs.nodeUsageFlows.addEventListener("change", updateSelectedNodeUsageFlows);
    refs.nodeUsageFlows.addEventListener("blur", updateSelectedNodeUsageFlows);
  }

  function bindVariableForm() {
    const fields = [
      refs.variableTitle,
      refs.variableType,
      refs.variableUnit,
      refs.variableSource,
      refs.variableDescription,
      refs.variableCommonNodes,
      refs.variableExamples
    ];
    fields.forEach((field) => field.addEventListener("input", updateSelectedVariableFromForm));
  }

  async function loadElectronAtlasFiles() {
    if (!state.isElectron) {
      return;
    }
    try {
      refs.statusLine.textContent = "正在读取 node-library/atlas...";
      const payload = await window.atlasEditorBridge.loadAtlas();
      state.nodes = isRecord(payload.files?.nodes) ? payload.files.nodes : {};
      state.variables = isRecord(payload.files?.variables) ? payload.files.variables : {};
      state.selectedNodeKey = Object.keys(state.nodes).sort(compareText)[0] || "";
      state.selectedVariableKey = Object.keys(state.variables).sort(compareText)[0] || "";
      state.dirty.nodes = false;
      state.dirty.variables = false;
      state.lastLoaded.nodes = "node-library/atlas/nodes.json";
      state.lastLoaded.variables = "node-library/atlas/variables.json";
      render();
    } catch (error) {
      refs.statusLine.textContent = `读取失败：${formatError(error)}`;
    }
  }

  async function loadJsonFile(event, kind) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (kind === "nodes") {
        state.nodes = isRecord(parsed) ? parsed : {};
        state.selectedNodeKey = Object.keys(state.nodes).sort(compareText)[0] || "";
        state.view = "nodes";
      } else if (kind === "variables") {
        state.variables = isRecord(parsed) ? parsed : {};
        state.selectedVariableKey = Object.keys(state.variables).sort(compareText)[0] || "";
        state.view = "variables";
      }
      state.dirty[kind] = false;
      state.lastLoaded[kind] = file.name;
      render();
    } catch (error) {
      alert(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      event.target.value = "";
    }
  }

  function flushCurrentEditor() {
    if (state.view === "nodes" && state.selectedNodeKey) {
      updateSelectedNodeFromForm();
      updateParamsFromCards();
      return updateSelectedNodeUsageFlows();
    }
    if (state.view === "variables" && state.selectedVariableKey) {
      updateSelectedVariableFromForm();
    }
    return true;
  }

  function render() {
    document.body.dataset.view = state.view;
    renderVariableSuggestions();
    renderTabs();
    renderTools();
    renderList();
    renderEditor();
    renderInspector();
    renderStatus();
  }

  function renderTabs() {
    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === state.view);
    });
  }

  function renderTools() {
    refs.nodeTools.classList.toggle("hidden", state.view !== "nodes");
    refs.variableTools.classList.toggle("hidden", state.view !== "variables");
    refs.auditTools.classList.toggle("hidden", state.view !== "audit");
  }

  function renderList() {
    refs.itemList.replaceChildren();
    if (state.view === "nodes") {
      renderNodeList();
    } else if (state.view === "variables") {
      renderVariableList();
    } else {
      renderAuditList();
    }
    renderInspector();
  }

  function renderNodeList() {
    const keys = getFilteredNodeKeys();
    if (!state.selectedNodeKey || !state.nodes[state.selectedNodeKey]) {
      state.selectedNodeKey = keys[0] || Object.keys(state.nodes).sort(compareText)[0] || "";
    }

    keys.forEach((key) => {
      const entry = normalizeNodeEntry(state.nodes[key], key);
      const button = document.createElement("button");
      button.type = "button";
      button.className = key === state.selectedNodeKey ? "item-button is-active" : "item-button";
      button.addEventListener("click", () => {
        state.selectedNodeKey = key;
        render();
      });

      const title = document.createElement("div");
      title.className = "item-title";
      title.textContent = `${key}${entry.title ? ` - ${entry.title}` : ""}`;

      const meta = document.createElement("div");
      meta.className = "item-meta";
      meta.textContent = [entry.category, entry.department, entry.maintainer].filter(Boolean).join(" / ") || "未补充信息";

      const badges = document.createElement("div");
      badges.className = "item-badges";
      if (hasMissingNodeInfo(entry)) {
        badges.appendChild(createBadge("缺字段", "warn"));
      }
      if (hasUnknownType(entry)) {
        badges.appendChild(createBadge("类型未知", "warn"));
      }
      if (collectNodeVariables(entry).length > 0) {
        badges.appendChild(createBadge("引用变量"));
      }

      button.append(title, meta, badges);
      refs.itemList.appendChild(button);
    });
  }

  function renderVariableList() {
    const keys = Object.keys(state.variables)
      .filter((key) => matchesQuery([key, state.variables[key]?.title, state.variables[key]?.description], state.variableQuery))
      .sort(compareText);
    if (!state.selectedVariableKey || !state.variables[state.selectedVariableKey]) {
      state.selectedVariableKey = keys[0] || Object.keys(state.variables).sort(compareText)[0] || "";
    }

    keys.forEach((key) => {
      const entry = normalizeVariableEntry(state.variables[key]);
      const button = document.createElement("button");
      button.type = "button";
      button.className = key === state.selectedVariableKey ? "item-button is-active" : "item-button";
      button.addEventListener("click", () => {
        state.selectedVariableKey = key;
        render();
      });

      const title = document.createElement("div");
      title.className = "item-title";
      title.textContent = `${key}${entry.title ? ` - ${entry.title}` : ""}`;

      const meta = document.createElement("div");
      meta.className = "item-meta";
      meta.textContent = [entry.type, entry.unit, entry.source].filter(Boolean).join(" / ") || "未补充信息";

      button.append(title, meta);
      refs.itemList.appendChild(button);
    });
  }

  function renderAuditList() {
    const rows = [
      ["节点", Object.keys(state.nodes).length],
      ["变量", Object.keys(state.variables).length],
      ["问题", collectIssues().length]
    ];
    rows.forEach(([key, value]) => {
      const item = document.createElement("div");
      item.className = "item-button";
      const title = document.createElement("div");
      title.className = "item-title";
      title.textContent = key;
      const meta = document.createElement("div");
      meta.className = "item-meta";
      meta.textContent = String(value);
      item.append(title, meta);
      refs.itemList.appendChild(item);
    });
  }

  function renderEditor() {
    const hasAnyData = Object.keys(state.nodes).length > 0 || Object.keys(state.variables).length > 0;
    refs.emptyState.classList.toggle("hidden", hasAnyData);
    refs.nodePreview.classList.toggle("hidden", state.view !== "nodes" || !state.selectedNodeKey);
    refs.auditPanel.classList.toggle("hidden", state.view !== "audit");
    refs.nodeForm.classList.toggle("hidden", state.view !== "nodes" || !state.selectedNodeKey);
    refs.variableForm.classList.toggle("hidden", state.view !== "variables" || !state.selectedVariableKey);

    if (state.view === "nodes" && state.selectedNodeKey) {
      renderNodePreview();
      renderNodeForm();
    } else if (state.view === "variables" && state.selectedVariableKey) {
      renderVariableForm();
    }
  }

  function renderNodeForm() {
    const key = state.selectedNodeKey;
    const entry = normalizeNodeEntry(state.nodes[key], key);
    refs.nodeKey.value = key;
    refs.nodeTitle.value = entry.title;
    refs.nodeCategory.value = entry.category;
    refs.nodeDepartment.value = entry.department;
    refs.nodeMaintainer.value = entry.maintainer;
    refs.nodeDescription.value = entry.description;
    refs.nodeStatus.value = entry.mainline.status;
    refs.nodeRules.value = arrayToLines(entry.mainline.rules);
    refs.nodeExamples.value = arrayToLines(entry.mainline.examples);
    refs.nodeSourceNotes.value = arrayToLines(entry.source_notes);
    refs.nodeUsageFlows.value = JSON.stringify(entry.usageFlows || [], null, 2);
    refs.nodeUsageFlows.classList.remove("is-invalid");
    renderUsageFlowEditor(entry);
    renderParams(entry);
  }

  function renderUsageFlowEditor(entry) {
    refs.usageFlowEditor.replaceChildren();
    const flow = (entry.usageFlows || [])[0];
    if (!isRecord(flow?.tree)) {
      refs.usageFlowEditor.appendChild(createUsageFlowEmpty());
      return;
    }
    refs.usageFlowEditor.appendChild(createUsageFlowEditorNode(flow.tree, []));
  }

  function createUsageFlowEmpty() {
    const empty = document.createElement("div");
    empty.className = "usage-flow-editor-empty";
    empty.textContent = "暂无使用流程。点击“初始化流程”生成可编辑流程树。";
    return empty;
  }

  function createUsageFlowEditorNode(node, path) {
    const item = document.createElement("section");
    item.className = "usage-flow-editor-node";
    const header = document.createElement("div");
    header.className = "usage-flow-editor-header";

    const tagField = document.createElement("label");
    tagField.className = "field";
    const tagLabel = document.createElement("span");
    tagLabel.className = "field-label";
    tagLabel.textContent = "节点类型";
    const tagInput = document.createElement("input");
    tagInput.className = "input mono";
    tagInput.value = node.tagName || "";
    tagInput.placeholder = "Sequence / ScriptCondition / 当前节点 ID";
    tagInput.addEventListener("input", () => updateUsageFlowNode(path, { tagName: tagInput.value.trim() || "Action" }));
    tagField.append(tagLabel, tagInput);

    const actions = document.createElement("div");
    actions.className = "usage-flow-editor-actions";
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "btn small";
    addButton.textContent = "添加子节点";
    addButton.addEventListener("click", () => addUsageFlowChild(path));
    actions.appendChild(addButton);
    if (path.length > 0) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "btn small danger";
      removeButton.textContent = "删除";
      removeButton.addEventListener("click", () => removeUsageFlowNode(path));
      actions.appendChild(removeButton);
    }

    header.append(tagField, actions);
    item.appendChild(header);

    const attributesField = document.createElement("label");
    attributesField.className = "field";
    const attributesLabel = document.createElement("span");
    attributesLabel.className = "field-label";
    attributesLabel.textContent = "节点属性 JSON";
    const attributesInput = document.createElement("textarea");
    attributesInput.className = "textarea compact mono";
    attributesInput.rows = 3;
    attributesInput.value = JSON.stringify(node.attributes || {}, null, 2);
    attributesInput.addEventListener("change", () => {
      try {
        const parsed = attributesInput.value.trim() ? JSON.parse(attributesInput.value) : {};
        if (!isRecord(parsed)) {
          throw new Error("attributes must be object");
        }
        attributesInput.classList.remove("is-invalid");
        updateUsageFlowNode(path, { attributes: parsed });
      } catch (_error) {
        attributesInput.classList.add("is-invalid");
      }
    });
    attributesField.append(attributesLabel, attributesInput);
    item.appendChild(attributesField);

    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length > 0) {
      const childList = document.createElement("div");
      childList.className = "usage-flow-editor-children";
      children.forEach((child, index) => childList.appendChild(createUsageFlowEditorNode(child, [...path, index])));
      item.appendChild(childList);
    }
    return item;
  }

  function renderParams(entry) {
    refs.paramEditor.replaceChildren();
    refs.paramIndex.replaceChildren();
    refs.paramDetail.replaceChildren();
    const params = entry.mainline.params || {};
    const names = Object.keys(params).sort(compareText);
    if (!names.includes(state.selectedParamName)) {
      state.selectedParamName = names[0] || "";
    }
    names.forEach((name) => {
      const card = createParamCard(name, params[name]);
      refs.paramEditor.appendChild(card);
    });
    syncParamIndex();
    selectParamCard(state.selectedParamName, { focus: false });
  }

  function createParamCard(name, param) {
    const fragment = refs.paramTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".param-card");
    const fields = {
      name: card.querySelector(".param-name"),
      role: card.querySelector(".param-role"),
      type: card.querySelector(".param-type"),
      required: card.querySelector(".param-required"),
      defaultValue: card.querySelector(".param-default"),
      description: card.querySelector(".param-description"),
      remove: card.querySelector(".param-remove")
    };
    fields.name.value = name;
    card.dataset.paramName = name;
    fields.role.value = normalizeRole(param?.role);
    fields.type.value = param?.type || "";
    fields.required.checked = param?.required === true;
    fields.defaultValue.value = param?.default || "";
    fields.description.value = param?.description || "";
    syncParamCardState(card);
    syncParamVariableReference(card);

    [fields.name, fields.role, fields.type, fields.required, fields.defaultValue, fields.description].forEach((field) => {
      field.addEventListener("focus", () => selectParamCard(card.dataset.paramName || fields.name.value.trim(), { focus: false }));
      field.addEventListener("input", () => {
        if (field === fields.name || field === fields.defaultValue) {
          syncParamVariableReference(card);
        }
        if (field === fields.name) {
          card.dataset.paramName = fields.name.value.trim();
          state.selectedParamName = card.dataset.paramName;
          refs.paramDetailTitle.textContent = state.selectedParamName || "未命名参数";
        }
        syncParamCardState(card);
        updateParamsFromCards();
        syncParamIndex();
      });
      field.addEventListener("change", () => {
        if (field === fields.name || field === fields.defaultValue) {
          syncParamVariableReference(card);
        }
        if (field === fields.name) {
          card.dataset.paramName = fields.name.value.trim();
          state.selectedParamName = card.dataset.paramName;
          refs.paramDetailTitle.textContent = state.selectedParamName || "未命名参数";
        }
        syncParamCardState(card);
        updateParamsFromCards();
        syncParamIndex();
      });
    });
    fields.remove.addEventListener("click", () => {
      const removingSelected = card.dataset.paramName === state.selectedParamName;
      card.remove();
      if (removingSelected) {
        const nextCard = getAllParamCards()[0];
        state.selectedParamName = nextCard?.dataset.paramName || "";
      }
      updateParamsFromCards();
      syncParamIndex();
      selectParamCard(state.selectedParamName, { focus: false });
    });
    return card;
  }

  function syncParamIndex() {
    refs.paramIndex.replaceChildren();
    const cards = getAllParamCards();
    if (cards.length === 0) {
      const empty = document.createElement("div");
      empty.className = "param-index-empty";
      empty.textContent = "暂无参数。";
      refs.paramIndex.appendChild(empty);
      refs.paramDetailTitle.textContent = "未选择参数";
      refs.paramDetailEmpty.classList.remove("hidden");
      return;
    }
    cards.forEach((card) => {
      const name = card.querySelector(".param-name")?.value.trim() || "未命名参数";
      const role = normalizeRole(card.querySelector(".param-role")?.value || "input");
      const type = card.querySelector(".param-type")?.value.trim() || "unknown";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "param-index-button";
      button.dataset.paramName = card.dataset.paramName || "";
      button.classList.toggle("is-active", card.dataset.paramName === state.selectedParamName);
      button.addEventListener("click", () => selectParamCard(card.dataset.paramName || name, { focus: true }));

      const title = document.createElement("span");
      title.className = "param-index-name mono";
      title.textContent = name;
      const meta = document.createElement("span");
      meta.className = "param-index-meta";
      meta.textContent = `${role} / ${type}`;
      button.append(title, meta);
      refs.paramIndex.appendChild(button);
    });
  }

  function selectParamCard(name, options = {}) {
    parkParamDetailCard();
    const cards = getAllParamCards();
    const card = cards.find((item) => item.dataset.paramName === name) || cards[0];
    refs.paramDetail.replaceChildren();
    if (!card) {
      state.selectedParamName = "";
      refs.paramDetailTitle.textContent = "未选择参数";
      refs.paramDetailEmpty.classList.remove("hidden");
      syncParamIndex();
      return;
    }
    state.selectedParamName = card.dataset.paramName || card.querySelector(".param-name")?.value.trim() || "";
    refs.paramDetailTitle.textContent = state.selectedParamName || "未命名参数";
    refs.paramDetailEmpty.classList.add("hidden");
    refs.paramDetail.appendChild(card);
    syncParamIndexActiveState();
    if (options.focus) {
      card.querySelector(".param-name")?.focus();
    }
  }

  function parkParamDetailCard() {
    Array.from(refs.paramDetail.querySelectorAll(".param-card")).forEach((card) => {
      refs.paramEditor.appendChild(card);
    });
  }

  function syncParamIndexActiveState() {
    refs.paramIndex.querySelectorAll(".param-index-button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.paramName === state.selectedParamName);
    });
  }

  function getAllParamCards() {
    return Array.from(refs.nodeForm.querySelectorAll(".param-card"));
  }

  function syncParamVariableReference(card) {
    const nameInput = card.querySelector(".param-name");
    const typeInput = card.querySelector(".param-type");
    const defaultInput = card.querySelector(".param-default");
    const descriptionInput = card.querySelector(".param-description");
    const help = card.querySelector(".param-variable-help");
    const typeHelp = card.querySelector(".param-type-help");
    const descriptionHelp = card.querySelector(".param-description-help");
    const name = nameInput?.value?.trim() || "";
    const inferred = inferVariableReference(name, defaultInput?.value || "");
    card.classList.toggle("has-variable-reference", Boolean(inferred.variable));
    card.classList.toggle("has-inferred-type", Boolean(!inferred.variable && inferred.type));
    if (!inferred.variable && !inferred.type) {
      setVariableDerivedLock(card, false);
      if (help) {
        help.textContent = "使用 {变量名} 时会引用变量库里的类型和说明；引用后请到“变量”页修改。";
      }
      if (typeHelp) {
        typeHelp.textContent = "unknown 表示当前图鉴还不知道这个参数的数据类型，需要人工补充。";
      }
      if (descriptionHelp) {
        descriptionHelp.textContent = "说明这个参数的用途、取值含义、单位或限制。";
      }
      return;
    }
    if (typeInput) {
      const currentType = typeInput.value.trim();
      if (inferred.variable) {
        typeInput.value = inferred.type || "unknown";
      } else if (!currentType || currentType === "unknown") {
        typeInput.value = inferred.type || typeInput.value;
      }
    }
    if (descriptionInput && inferred.variable) {
      descriptionInput.value = inferred.description || "";
    } else if (descriptionInput && inferred.description && !descriptionInput.value.trim()) {
      descriptionInput.value = inferred.description;
    }
    if (defaultInput && inferred.variableKey) {
      if (!defaultInput.value.trim() || defaultInput.value.trim() === `{${toSnakeCase(name)}}`) {
        defaultInput.value = `{${inferred.variableKey}}`;
      }
    }
    if (help) {
      help.textContent = inferred.variable
        ? `已引用变量库：${inferred.summary || inferred.variableKey}。类型和说明请到“变量”页修改。`
        : `已根据命名推断类型：${inferred.type}`;
    }
    setVariableDerivedLock(card, Boolean(inferred.variable));
    if (inferred.variable) {
      if (typeHelp) {
        typeHelp.textContent = "类型来自变量库，如需修改请到“变量”页编辑。";
      }
      if (descriptionHelp) {
        descriptionHelp.textContent = "说明来自变量库，如需修改请到“变量”页编辑。";
      }
    } else {
      if (typeHelp) {
        typeHelp.textContent = "已根据参数名推断类型，可手动修改。";
      }
      if (descriptionHelp) {
        descriptionHelp.textContent = "说明这个参数的用途、取值含义、单位或限制。";
      }
    }
  }

  function setVariableDerivedLock(card, locked) {
    const typeInput = card.querySelector(".param-type");
    const descriptionInput = card.querySelector(".param-description");
    [typeInput, descriptionInput].filter(Boolean).forEach((field) => {
      field.readOnly = locked;
      field.classList.toggle("is-derived", locked);
      field.title = locked ? "来自变量库。如需修改，请到变量页编辑。" : "";
    });
  }

  function renderVariableSuggestions() {
    if (!refs.variableDefaultOptions) {
      return;
    }
    refs.variableDefaultOptions.replaceChildren();
    Object.entries(state.variables || {})
      .sort(([left], [right]) => compareText(left, right))
      .forEach(([key, rawVariable]) => {
        const variable = normalizeVariableEntry(rawVariable);
        const label = [variable.title, variable.type, variable.unit].filter(Boolean).join(" / ");
        const defaultOption = document.createElement("option");
        defaultOption.value = `{${key}}`;
        if (label) {
          defaultOption.label = label;
        }
        refs.variableDefaultOptions.appendChild(defaultOption);
      });
  }

  function inferVariableReference(paramName, defaultValue) {
    const explicitVariable = extractVariableName(defaultValue);
    const candidates = [explicitVariable].filter(Boolean);
    const variableMatch = findVariableMatch(candidates);
    if (variableMatch) {
      const variable = normalizeVariableEntry(variableMatch.value);
      return {
        variable: true,
        variableKey: variableMatch.key,
        type: variable.type || inferTypeFromName(variableMatch.key) || "unknown",
        description: variable.description || variable.title || "",
        summary: [variable.title, variable.type, variable.unit].filter(Boolean).join(" / ")
      };
    }
    const inferredType = inferTypeFromName(explicitVariable || paramName);
    return {
      variable: false,
      variableKey: explicitVariable || "",
      type: inferredType,
      description: ""
    };
  }

  function findVariableMatch(candidates) {
    const entries = Object.entries(state.variables || {});
    for (const candidate of candidates) {
      if (state.variables[candidate]) {
        return { key: candidate, value: state.variables[candidate] };
      }
      const normalizedCandidate = normalizeIdentifier(candidate);
      const found = entries.find(([key]) => normalizeIdentifier(key) === normalizedCandidate);
      if (found) {
        return { key: found[0], value: found[1] };
      }
    }
    return null;
  }

  function extractVariableName(value) {
    const match = String(value || "").match(/\{([^{}\s]+)\}/);
    return match ? match[1] : "";
  }

  function inferTypeFromName(name) {
    const normalized = normalizeIdentifier(name);
    if (!normalized) {
      return "";
    }
    if (/^(is|has|can|should|enable|enabled|disable|disabled|flag|valid|ready|success|failed|error)/.test(normalized)) {
      return "bool";
    }
    if (/(count|num|index|level|id|type|mode)$/.test(normalized)) {
      return "int";
    }
    if (/(height|width|distance|speed|velocity|length|radius|angle|time|duration|ratio|x|y|z)$/.test(normalized)) {
      return "double";
    }
    if (/(msg|message|name|code|text|path|state|status)$/.test(normalized)) {
      return "string";
    }
    return "";
  }

  function normalizeIdentifier(value) {
    return toSnakeCase(value).replace(/[^a-z0-9]/g, "");
  }

  function toSnakeCase(value) {
    return String(value || "")
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[-\s]+/g, "_")
      .toLowerCase();
  }

  function syncParamCardState(card) {
    const type = card.querySelector(".param-type")?.value?.trim() || "";
    const unknown = type === "" || type === "unknown";
    card.classList.toggle("has-unknown-type", unknown);
    const help = card.querySelector(".param-type-help");
    if (help) {
      if (card.classList.contains("has-variable-reference")) {
        help.textContent = unknown
          ? "类型来自变量库且当前为 unknown，请到“变量”页补充。"
          : "类型来自变量库，如需修改请到“变量”页编辑。";
        return;
      }
      help.textContent = unknown
        ? "当前参数类型未知，请补充为 bool、int、double、string 或项目内的具体类型。"
        : "已补充参数类型。";
    }
  }

  function renderVariableForm() {
    const key = state.selectedVariableKey;
    const entry = normalizeVariableEntry(state.variables[key]);
    refs.variableKey.value = key;
    refs.variableTitle.value = entry.title;
    refs.variableType.value = entry.type;
    refs.variableUnit.value = entry.unit;
    refs.variableSource.value = entry.source;
    refs.variableDescription.value = entry.description;
    refs.variableCommonNodes.value = arrayToLines(entry.commonNodes);
    refs.variableExamples.value = arrayToLines(entry.examples);
  }

  function updateSelectedNodeFromForm() {
    const key = state.selectedNodeKey;
    if (!key || !state.nodes[key]) {
      return;
    }
    const entry = normalizeNodeEntry(state.nodes[key], key);
    entry.title = refs.nodeTitle.value.trim();
    entry.category = refs.nodeCategory.value || "Action";
    entry.department = refs.nodeDepartment.value.trim();
    entry.maintainer = refs.nodeMaintainer.value.trim();
    entry.description = refs.nodeDescription.value.trim();
    entry.source_notes = linesToArray(refs.nodeSourceNotes.value);
    entry.mainline.status = refs.nodeStatus.value || "draft";
    entry.mainline.rules = linesToArray(refs.nodeRules.value);
    entry.mainline.examples = linesToArray(refs.nodeExamples.value);
    state.nodes[key] = entry;
    markDirty("nodes");
    renderNodePreview();
  }

  function updateSelectedNodeUsageFlows() {
    const key = state.selectedNodeKey;
    if (!key || !state.nodes[key]) {
      return true;
    }
    const text = refs.nodeUsageFlows.value.trim();
    try {
      const parsed = text ? JSON.parse(text) : [];
      if (!Array.isArray(parsed)) {
        throw new Error("usageFlows 必须是数组");
      }
      const entry = normalizeNodeEntry(state.nodes[key], key);
      entry.usageFlows = parsed.filter(isRecord).map(normalizeUsageFlow);
      state.nodes[key] = entry;
      refs.nodeUsageFlows.classList.remove("is-invalid");
      markDirty("nodes");
      renderNodePreview();
      renderUsageFlowEditor(entry);
      return true;
    } catch (_error) {
      refs.nodeUsageFlows.classList.add("is-invalid");
      renderInspector();
      return false;
    }
  }

  function ensureSelectedUsageFlow() {
    const key = state.selectedNodeKey;
    if (!key || !state.nodes[key]) {
      return;
    }
    const entry = normalizeNodeEntry(state.nodes[key], key);
    if (!Array.isArray(entry.usageFlows) || entry.usageFlows.length === 0 || !isRecord(entry.usageFlows[0]?.tree)) {
      entry.usageFlows = [{
        title: "基础用法",
        description: "",
        tree: {
          tagName: "Sequence",
          attributes: {},
          children: [
            {
              tagName: key,
              attributes: buildDefaultUsageFlowAttributes(entry),
              children: []
            }
          ]
        }
      }];
      state.nodes[key] = entry;
      syncUsageFlowJson(entry);
      markDirty("nodes");
    }
  }

  function buildDefaultUsageFlowAttributes(entry) {
    return Object.fromEntries(
      Object.entries(entry.mainline?.params || {}).map(([name, param]) => [name, formatParamPreviewValue(name, param)])
    );
  }

  function updateUsageFlowNode(path, patch) {
    const entry = getMutableSelectedUsageFlowEntry();
    const node = getUsageFlowNodeAtPath(entry.usageFlows[0].tree, path);
    if (!node) {
      return;
    }
    Object.assign(node, patch);
    commitUsageFlowEdit(entry);
  }

  function addUsageFlowChild(path) {
    const entry = getMutableSelectedUsageFlowEntry();
    const node = getUsageFlowNodeAtPath(entry.usageFlows[0].tree, path);
    if (!node) {
      return;
    }
    node.children = Array.isArray(node.children) ? node.children : [];
    node.children.push({ tagName: state.selectedNodeKey || "Action", attributes: {}, children: [] });
    commitUsageFlowEdit(entry);
    renderUsageFlowEditor(entry);
  }

  function removeUsageFlowNode(path) {
    if (path.length === 0) {
      return;
    }
    const entry = getMutableSelectedUsageFlowEntry();
    const parent = getUsageFlowNodeAtPath(entry.usageFlows[0].tree, path.slice(0, -1));
    if (!parent || !Array.isArray(parent.children)) {
      return;
    }
    parent.children.splice(path[path.length - 1], 1);
    commitUsageFlowEdit(entry);
    renderUsageFlowEditor(entry);
  }

  function getMutableSelectedUsageFlowEntry() {
    const key = state.selectedNodeKey;
    const entry = normalizeNodeEntry(state.nodes[key], key);
    if (!Array.isArray(entry.usageFlows) || entry.usageFlows.length === 0 || !isRecord(entry.usageFlows[0]?.tree)) {
      ensureSelectedUsageFlow();
      return normalizeNodeEntry(state.nodes[key], key);
    }
    return entry;
  }

  function getUsageFlowNodeAtPath(root, path) {
    let node = root;
    for (const index of path) {
      if (!node || !Array.isArray(node.children)) {
        return null;
      }
      node = node.children[index];
    }
    return node || null;
  }

  function commitUsageFlowEdit(entry) {
    const key = state.selectedNodeKey;
    state.nodes[key] = normalizeNodeEntry(entry, key);
    syncUsageFlowJson(state.nodes[key]);
    markDirty("nodes");
    renderNodePreview();
  }

  function syncUsageFlowJson(entry) {
    refs.nodeUsageFlows.value = JSON.stringify(entry.usageFlows || [], null, 2);
    refs.nodeUsageFlows.classList.remove("is-invalid");
  }

  function updateParamsFromCards() {
    const key = state.selectedNodeKey;
    if (!key || !state.nodes[key]) {
      return;
    }
    const entry = normalizeNodeEntry(state.nodes[key], key);
    const params = {};
    getAllParamCards().forEach((card) => {
      const name = card.querySelector(".param-name").value.trim();
      if (!name) {
        return;
      }
      const param = {
        role: normalizeRole(card.querySelector(".param-role").value),
        type: card.querySelector(".param-type").value.trim() || "unknown",
        required: card.querySelector(".param-required").checked,
        description: card.querySelector(".param-description").value.trim()
      };
      const inferred = inferVariableReference(name, card.querySelector(".param-default").value);
      if (inferred.variable) {
        param.type = inferred.type || param.type;
        param.description = inferred.description || param.description;
      }
      const defaultValue = card.querySelector(".param-default").value;
      if (defaultValue !== "") {
        param.default = defaultValue;
      }
      params[name] = param;
    });
    entry.mainline.params = params;
    state.nodes[key] = entry;
    markDirty("nodes");
  }

  function updateSelectedVariableFromForm() {
    const key = state.selectedVariableKey;
    if (!key || !state.variables[key]) {
      return;
    }
    state.variables[key] = {
      title: refs.variableTitle.value.trim(),
      type: refs.variableType.value.trim(),
      unit: refs.variableUnit.value.trim(),
      description: refs.variableDescription.value.trim(),
      source: refs.variableSource.value.trim(),
      commonNodes: linesToArray(refs.variableCommonNodes.value),
      examples: linesToArray(refs.variableExamples.value)
    };
    markDirty("variables");
  }

  function addNode() {
    const key = uniqueKey(state.nodes, "NewNode");
    state.nodes[key] = normalizeNodeEntry({}, key);
    state.selectedNodeKey = key;
    state.view = "nodes";
    markDirty("nodes");
    render();
  }

  async function saveSelectedNode() {
    updateSelectedNodeFromForm();
    updateParamsFromCards();
    if (!updateSelectedNodeUsageFlows()) {
      refs.statusLine.textContent = "保存失败：usageFlows JSON 格式不正确";
      return;
    }
    if (!applySelectedNodeRename()) {
      return;
    }
    await saveElectronAtlasFile("nodes");
    render();
  }

  function applySelectedNodeRename() {
    const current = state.selectedNodeKey;
    const next = refs.nodeKey.value.trim();
    if (!current || !next || current === next) {
      return true;
    }
    if (state.nodes[next]) {
      alert(`节点 ID 已存在：${next}`);
      refs.nodeKey.value = current;
      return false;
    }
    state.nodes[next] = state.nodes[current];
    delete state.nodes[current];
    state.nodes = sortObjectByKey(state.nodes);
    state.selectedNodeKey = next;
    markDirty("nodes");
    return true;
  }

  function deleteSelectedNode() {
    const key = state.selectedNodeKey;
    if (!key || !confirm(`删除节点 ${key}？`)) {
      return;
    }
    delete state.nodes[key];
    state.selectedNodeKey = Object.keys(state.nodes).sort(compareText)[0] || "";
    markDirty("nodes");
    render();
  }

  function addParam() {
    const name = uniqueParamName();
    const card = createParamCard(name, {
      role: "input",
      type: "unknown",
      required: false,
      description: ""
    });
    refs.paramEditor.appendChild(card);
    state.selectedParamName = name;
    updateParamsFromCards();
    syncParamIndex();
    selectParamCard(name, { focus: true });
  }

  function addVariable() {
    const key = uniqueKey(state.variables, "new_variable");
    state.variables[key] = normalizeVariableEntry({});
    state.selectedVariableKey = key;
    state.view = "variables";
    markDirty("variables");
    render();
  }

  async function saveSelectedVariable() {
    updateSelectedVariableFromForm();
    if (!applySelectedVariableRename()) {
      return;
    }
    await saveElectronAtlasFile("variables");
    render();
  }

  function applySelectedVariableRename() {
    const current = state.selectedVariableKey;
    const next = refs.variableKey.value.trim();
    if (!current || !next || current === next) {
      return true;
    }
    if (state.variables[next]) {
      alert(`变量 key 已存在：${next}`);
      refs.variableKey.value = current;
      return false;
    }
    state.variables[next] = state.variables[current];
    delete state.variables[current];
    state.variables = sortObjectByKey(state.variables);
    state.selectedVariableKey = next;
    markDirty("variables");
    return true;
  }

  function deleteSelectedVariable() {
    const key = state.selectedVariableKey;
    if (!key || !confirm(`删除变量 ${key}？`)) {
      return;
    }
    delete state.variables[key];
    state.selectedVariableKey = Object.keys(state.variables).sort(compareText)[0] || "";
    markDirty("variables");
    render();
  }

  function markDirty(kind) {
    state.dirty[kind] = true;
    renderList();
    renderInspector();
    renderStatus();
  }

  async function exportJson(kind) {
    if (state.isElectron) {
      await saveElectronAtlasFile(kind);
      return;
    }
    const value = getAtlasValue(kind);
    const text = `${JSON.stringify(value, null, 2)}\n`;
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${kind}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    state.dirty[kind] = false;
    renderStatus();
  }

  async function saveElectronAtlasFile(kind) {
    if (!state.isElectron) {
      return;
    }
    if (kind !== "nodes" && kind !== "variables") {
      refs.statusLine.textContent = "审计页没有可保存内容";
      return;
    }
    if (!flushCurrentEditor()) {
      refs.statusLine.textContent = "保存失败：usageFlows JSON 格式不正确";
      return;
    }
    try {
      refs.statusLine.textContent = `正在保存 ${kind}.json...`;
      await window.atlasEditorBridge.saveAtlasFile(kind, getAtlasValue(kind));
      state.dirty[kind] = false;
      renderStatus();
    } catch (error) {
      refs.statusLine.textContent = `保存失败：${formatError(error)}`;
    }
  }

  async function saveAllElectronAtlasFiles() {
    if (!state.isElectron) {
      return;
    }
    if (!flushCurrentEditor()) {
      refs.statusLine.textContent = "保存失败：usageFlows JSON 格式不正确";
      return;
    }
    try {
      refs.statusLine.textContent = "正在保存全部 atlas 文件...";
      await window.atlasEditorBridge.saveAllAtlasFiles({
        nodes: getAtlasValue("nodes"),
        variables: getAtlasValue("variables")
      });
      state.dirty.nodes = false;
      state.dirty.variables = false;
      renderStatus();
    } catch (error) {
      refs.statusLine.textContent = `保存失败：${formatError(error)}`;
    }
  }

  function getAtlasValue(kind) {
    if (kind === "nodes") {
      return sortObjectByKey(state.nodes);
    }
    return sortObjectByKey(state.variables);
  }

  function getFilteredNodeKeys() {
    return Object.keys(state.nodes)
      .filter((key) => {
        const entry = normalizeNodeEntry(state.nodes[key], key);
        if (!matchesQuery([key, entry.title, entry.description, entry.department, entry.maintainer], state.nodeQuery)) {
          return false;
        }
        if (state.nodeFilter === "missing") {
          return hasMissingNodeInfo(entry);
        }
        if (state.nodeFilter === "unknownType") {
          return hasUnknownType(entry);
        }
        if (state.nodeFilter === "hasVariables") {
          return collectNodeVariables(entry).length > 0;
        }
        return true;
      })
      .sort(compareText);
  }

  function renderInspector() {
    const issues = collectIssues();
    refs.nodeCount.textContent = String(Object.keys(state.nodes).length);
    refs.variableCount.textContent = String(Object.keys(state.variables).length);
    refs.issueCount.textContent = String(issues.length);
    refs.issueList.replaceChildren();
    if (issues.length === 0) {
      const item = document.createElement("div");
      item.className = "issue-item";
      item.textContent = "暂无问题";
      refs.issueList.appendChild(item);
      return;
    }
    issues.slice(0, 80).forEach((issue) => {
      const item = document.createElement("div");
      item.className = `issue-item ${issue.level}`;
      item.textContent = issue.message;
      refs.issueList.appendChild(item);
    });
  }

  function renderNodePreview() {
    if (!refs.nodePreview || state.view !== "nodes" || !state.selectedNodeKey) {
      return;
    }

    const key = state.selectedNodeKey;
    const entry = normalizeNodeEntry(state.nodes[key], key);
    refs.previewTitle.textContent = `${key}${entry.title && entry.title !== key ? ` - ${entry.title}` : ""}`;
    refs.previewSummary.textContent = [entry.category, entry.department, entry.maintainer].filter(Boolean).join(" / ") || "实时预览当前节点。";
    refs.previewModeNode.classList.toggle("is-active", state.previewMode === "node");
    refs.previewModeUsage.classList.toggle("is-active", state.previewMode === "usage");
    refs.previewCanvas.replaceChildren();

    if (state.previewMode === "usage") {
      renderUsageFlowPreview(key, entry);
    } else {
      refs.previewCanvas.appendChild(createAtlasNodeCard(key, entry));
    }
  }

  function renderUsageFlowPreview(key, entry) {
    const flow = (entry.usageFlows || [])[0];
    const tree = flow?.tree;
    if (!isRecord(tree)) {
      refs.previewCanvas.appendChild(createPreviewEmpty("暂无 usageFlows。请在下方 JSON 中维护结构化使用流程。"));
      return;
    }
    const title = document.createElement("div");
    title.className = "usage-flow-title";
    title.textContent = flow.title || "使用流程";
    refs.previewCanvas.appendChild(title);
    const root = document.createElement("div");
    root.className = "usage-flow-tree";
    root.appendChild(createUsageFlowNode(tree, key, entry));
    refs.previewCanvas.appendChild(root);
  }

  function createUsageFlowNode(node, selectedKey, selectedEntry) {
    const tagName = String(node?.tagName || node?.kind || "Action");
    const wrapper = document.createElement("div");
    wrapper.className = "usage-flow-node";
    const card = tagName === selectedKey
      ? createAtlasNodeCard(selectedKey, selectedEntry, node.attributes || {})
      : createSimpleFlowCard(tagName, node.attributes || {});
    wrapper.appendChild(card);
    const children = Array.isArray(node?.children) ? node.children.filter(isRecord) : [];
    if (children.length > 0) {
      const childList = document.createElement("div");
      childList.className = "usage-flow-children";
      children.forEach((child) => {
        childList.appendChild(createUsageFlowNode(child, selectedKey, selectedEntry));
      });
      wrapper.appendChild(childList);
    }
    return wrapper;
  }

  function createSimpleFlowCard(tagName, attributes = {}) {
    const card = document.createElement("article");
    card.className = "flow-card-preview compact";
    const heading = document.createElement("div");
    heading.className = "flow-card-heading-preview";
    const kind = document.createElement("span");
    kind.className = "flow-kind";
    kind.textContent = inferCategoryLabel(tagName);
    const name = document.createElement("strong");
    name.textContent = tagName;
    heading.append(kind, name);
    card.appendChild(heading);
    Object.entries(attributes).forEach(([key, value]) => {
      card.appendChild(createFieldRow(key, String(value ?? ""), "param"));
    });
    return card;
  }

  function createAtlasNodeCard(key, entry, overrideAttributes = {}) {
    const card = document.createElement("article");
    card.className = "flow-card-preview";
    const heading = document.createElement("div");
    heading.className = "flow-card-heading-preview";
    const kind = document.createElement("span");
    kind.className = "flow-kind";
    kind.textContent = entry.category || "Action";
    const name = document.createElement("strong");
    name.textContent = key;
    heading.append(kind, name);
    card.appendChild(heading);

    const params = Object.entries(entry.mainline.params || {});
    const groups = {
      input: [],
      output: [],
      param: []
    };
    params.forEach(([name, param]) => {
      const role = normalizeRole(param?.role);
      const row = createFieldRow(name, overrideAttributes[name] ?? formatParamPreviewValue(name, param), role);
      if (role === "input" || role === "inout") {
        groups.input.push(row);
      }
      if (role === "output" || role === "inout") {
        groups.output.push(createFieldRow(name, overrideAttributes[name] ?? formatParamPreviewValue(name, param), role));
      }
      if (role === "param") {
        groups.param.push(row);
      }
    });
    appendFieldGroup(card, "INPUT", groups.input);
    appendFieldGroup(card, "OUTPUT", groups.output);
    appendFieldGroup(card, "PARAM", groups.param);
    return card;
  }

  function appendFieldGroup(card, label, rows) {
    if (!rows.length) {
      return;
    }
    const section = document.createElement("section");
    section.className = "field-group-preview";
    const title = document.createElement("span");
    title.className = "field-group-label";
    title.textContent = label;
    section.appendChild(title);
    rows.forEach((row) => section.appendChild(row));
    card.appendChild(section);
  }

  function createFieldRow(name, value, role) {
    const row = document.createElement("div");
    row.className = `field-row-preview role-${normalizeRole(role)}`;
    row.dataset.paramName = name;
    row.tabIndex = 0;
    const key = document.createElement("span");
    key.className = "field-key-preview mono";
    key.textContent = name;
    const input = document.createElement("input");
    input.className = "field-value-preview mono";
    input.dataset.paramName = name;
    input.value = value || "";
    input.readOnly = true;
    input.tabIndex = 0;
    const selectPreviewParam = () => selectParamCard(name, { focus: false });
    input.addEventListener("focus", selectPreviewParam);
    input.addEventListener("pointerdown", selectPreviewParam);
    row.addEventListener("focusin", selectPreviewParam);
    row.addEventListener("pointerdown", selectPreviewParam);
    row.addEventListener("click", selectPreviewParam);
    row.append(key, input);
    return row;
  }

  function renderPreviewParams(entry) {
    const params = Object.entries(entry.mainline.params || {});
    if (!params.length) {
      refs.previewParams.appendChild(createPreviewEmpty("暂无参数"));
      return;
    }
    params.forEach(([name, param]) => {
      const item = document.createElement("section");
      item.className = "preview-param";
      const title = document.createElement("strong");
      title.className = "mono";
      title.textContent = name;
      const meta = document.createElement("span");
      meta.textContent = [param?.role, param?.type, param?.required ? "required" : ""].filter(Boolean).join(" / ") || "param";
      item.append(title, meta);
      if (param?.default) {
        const defaultValue = document.createElement("code");
        defaultValue.textContent = `default: ${param.default}`;
        item.appendChild(defaultValue);
      }
      if (param?.description) {
        const description = document.createElement("p");
        description.textContent = param.description;
        item.appendChild(description);
      }
      refs.previewParams.appendChild(item);
    });
  }

  function renderPreviewFunction(entry) {
    const blocks = [
      ["功能说明", entry.description],
      ["规则", entry.mainline.rules],
      ["示例", entry.mainline.examples],
      ["来源备注", entry.source_notes]
    ];
    let rendered = false;
    blocks.forEach(([title, value]) => {
      const lines = Array.isArray(value) ? value.map(formatListItem).filter(Boolean) : [String(value || "").trim()].filter(Boolean);
      if (!lines.length) {
        return;
      }
      rendered = true;
      const block = document.createElement("section");
      block.className = "preview-function-block";
      const heading = document.createElement("strong");
      heading.textContent = title;
      block.appendChild(heading);
      lines.forEach((line) => {
        const item = document.createElement("p");
        item.textContent = line;
        block.appendChild(item);
      });
      refs.previewFunction.appendChild(block);
    });
    if (!rendered) {
      refs.previewFunction.appendChild(createPreviewEmpty("暂无功能介绍"));
    }
  }

  function createPreviewEmpty(text) {
    const empty = document.createElement("div");
    empty.className = "preview-empty";
    empty.textContent = text;
    return empty;
  }

  function collectIssues() {
    const issues = [];
    for (const [key, rawEntry] of Object.entries(state.nodes)) {
      const entry = normalizeNodeEntry(rawEntry, key);
      if (!entry.title) {
        issues.push({ level: "warn", message: `${key}: 缺少中文名` });
      }
      if (!entry.department) {
        issues.push({ level: "warn", message: `${key}: 缺少部门` });
      }
      if (!entry.maintainer) {
        issues.push({ level: "warn", message: `${key}: 缺少负责人` });
      }
      for (const [paramName, param] of Object.entries(entry.mainline.params || {})) {
        if (!paramName.trim()) {
          issues.push({ level: "error", message: `${key}: 存在空参数名` });
        }
        if (!param.type || param.type === "unknown") {
          issues.push({ level: "warn", message: `${key}.${paramName}: 参数类型未知，需补充 bool/int/double/string 等具体类型` });
        }
      }
      (entry.usageFlows || []).forEach((flow, index) => {
        if (!flow.title) {
          issues.push({ level: "warn", message: `${key}: usageFlows[${index}] 缺少标题` });
        }
        if (!isRecord(flow.tree)) {
          issues.push({ level: "error", message: `${key}: usageFlows[${index}] 缺少 tree` });
        }
      });
    }
    for (const [key, variable] of Object.entries(state.variables)) {
      if (!variable?.title) {
        issues.push({ level: "warn", message: `${key}: 变量缺少标题` });
      }
      if (!variable?.description) {
        issues.push({ level: "warn", message: `${key}: 变量缺少说明` });
      }
    }
    return issues;
  }

  function renderStatus() {
    const parts = [];
    if (state.lastLoaded.nodes) {
      parts.push(`nodes: ${state.lastLoaded.nodes}${state.dirty.nodes ? "*" : ""}`);
    }
    if (state.lastLoaded.variables) {
      parts.push(`variables: ${state.lastLoaded.variables}${state.dirty.variables ? "*" : ""}`);
    }
    refs.statusLine.textContent = parts.length ? parts.join(" / ") : "未导入文件";
  }

  function normalizeNodeEntry(value, key) {
    const input = isRecord(value) ? value : {};
    const mainline = isRecord(input.mainline) ? input.mainline : {};
    return {
      ...input,
      title: typeof input.title === "string" ? input.title : key,
      category: typeof input.category === "string" && input.category ? input.category : "Action",
      description: typeof input.description === "string" ? input.description : "",
      department: typeof input.department === "string" ? input.department : "",
      maintainer: typeof input.maintainer === "string" ? input.maintainer : "",
      source_notes: Array.isArray(input.source_notes) ? input.source_notes.map(String) : [],
      mainline: {
        ...mainline,
        status: typeof mainline.status === "string" && mainline.status ? mainline.status : "draft",
        params: normalizeParams(mainline.params),
        rules: Array.isArray(mainline.rules) ? mainline.rules.map(normalizeListItem) : [],
        examples: Array.isArray(mainline.examples) ? mainline.examples.map(normalizeListItem) : []
      },
      usageFlows: Array.isArray(input.usageFlows) ? input.usageFlows.filter(isRecord).map(normalizeUsageFlow) : [],
      custom: isRecord(input.custom) ? input.custom : {}
    };
  }

  function normalizeParams(value) {
    if (!isRecord(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value).map(([name, rawParam]) => {
        const param = isRecord(rawParam) ? rawParam : {};
        const normalized = {
          role: normalizeRole(param.role),
          type: typeof param.type === "string" && param.type ? param.type : "unknown",
          required: param.required === true,
          description: typeof param.description === "string" ? param.description : ""
        };
        if (param.default !== undefined && param.default !== "") {
          normalized.default = String(param.default);
        }
        return [name, normalized];
      })
    );
  }

  function normalizeVariableEntry(value) {
    const input = isRecord(value) ? value : {};
    return {
      title: typeof input.title === "string" ? input.title : "",
      type: typeof input.type === "string" ? input.type : "",
      unit: typeof input.unit === "string" ? input.unit : "",
      description: typeof input.description === "string" ? input.description : "",
      source: typeof input.source === "string" ? input.source : "",
      commonNodes: Array.isArray(input.commonNodes) ? input.commonNodes.map(String) : [],
      examples: Array.isArray(input.examples) ? input.examples.map(String) : []
    };
  }

  function createBadge(text, tone = "") {
    const badge = document.createElement("span");
    badge.className = tone ? `badge ${tone}` : "badge";
    badge.textContent = text;
    return badge;
  }

  function hasMissingNodeInfo(entry) {
    return !entry.title || !entry.department || !entry.maintainer || !entry.description;
  }

  function hasUnknownType(entry) {
    return Object.values(entry.mainline?.params || {}).some((param) => !param?.type || param.type === "unknown");
  }

  function collectNodeVariables(entry) {
    const variables = new Set();
    Object.entries(entry.mainline?.params || {}).forEach(([name, param]) => {
      [name, param?.default, param?.description].filter(Boolean).forEach((value) => {
        for (const match of String(value).matchAll(/\{([^{}\s]+)\}/g)) {
          variables.add(match[1]);
        }
      });
    });
    return Array.from(variables).sort(compareText);
  }

  function matchesQuery(values, query) {
    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) {
      return true;
    }
    return values.some((value) => String(value || "").toLowerCase().includes(normalized));
  }

  function arrayToLines(value) {
    return Array.isArray(value) ? value.map(formatListItemForEditor).join("\n") : "";
  }

  function linesToArray(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .map(parseListLine)
      .filter(Boolean);
  }

  function normalizeListItem(value) {
    if (isRecord(value)) {
      return value;
    }
    return String(value || "");
  }

  function formatListItem(value) {
    if (typeof value === "string") {
      return value.trim();
    }
    if (isRecord(value)) {
      return [value.title, value.message || value.description, value.attributes ? JSON.stringify(value.attributes) : ""]
        .filter(Boolean)
        .join(" - ");
    }
    return String(value || "").trim();
  }

  function formatListItemForEditor(value) {
    return isRecord(value) ? JSON.stringify(value) : String(value || "");
  }

  function parseListLine(line) {
    if (!line) {
      return "";
    }
    if (line.startsWith("{") || line.startsWith("[")) {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return line;
      }
    }
    return line;
  }

  function normalizeUsageFlow(value) {
    const input = isRecord(value) ? value : {};
    return {
      ...input,
      title: typeof input.title === "string" ? input.title : "",
      description: typeof input.description === "string" ? input.description : "",
      tree: isRecord(input.tree) ? normalizeUsageTree(input.tree) : {}
    };
  }

  function normalizeUsageTree(value) {
    const input = isRecord(value) ? value : {};
    return {
      tagName: typeof input.tagName === "string" && input.tagName ? input.tagName : "Sequence",
      attributes: isRecord(input.attributes) ? Object.fromEntries(Object.entries(input.attributes).map(([key, val]) => [key, String(val ?? "")])) : {},
      children: Array.isArray(input.children) ? input.children.filter(isRecord).map(normalizeUsageTree) : []
    };
  }

  function formatParamPreviewValue(name, param) {
    if (param?.default) {
      return param.default;
    }
    return name ? `{${name}}` : "";
  }

  function inferCategoryLabel(tagName) {
    if (/Sequence|Fallback|Parallel|Switch|TryCatch|While|If/.test(tagName)) {
      return "Control";
    }
    if (/Retry|Repeat|Force|Inverter|Delay|Timeout|Loop|RunOnce|Precondition|Skip|Wait/.test(tagName)) {
      return "Decorator";
    }
    if (/Condition/.test(tagName)) {
      return "Condition";
    }
    return "Action";
  }

  function normalizeRole(role) {
    return role === "input" || role === "output" || role === "inout" || role === "param" ? role : "param";
  }

  function uniqueParamName() {
    const entry = normalizeNodeEntry(state.nodes[state.selectedNodeKey], state.selectedNodeKey);
    return uniqueKey(entry.mainline.params || {}, "new_param");
  }

  function uniqueKey(object, base) {
    if (!object[base]) {
      return base;
    }
    let index = 2;
    while (object[`${base}_${index}`]) {
      index += 1;
    }
    return `${base}_${index}`;
  }

  function sortObjectByKey(object) {
    return Object.fromEntries(Object.entries(object || {}).sort(([left], [right]) => compareText(left, right)));
  }

  function formatError(error) {
    return error instanceof Error ? error.message : String(error);
  }

  function compareText(left, right) {
    return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base" });
  }

  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function toCamelCase(value) {
    return value.replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
  }
})();
