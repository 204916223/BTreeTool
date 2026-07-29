(function () {
  const EDIT_PANE_WIDTH_KEY = "btree-atlas-editor.editPaneWidth";
  const ATLAS_DRAFT_KEY = "btree-atlas-editor.draft.v1";
  const EDIT_PANE_MIN_WIDTH = 460;
  const PREVIEW_MIN_WIDTH = 360;

  const state = {
    view: "nodes",
    nodes: {},
    variables: {},
    meta: createDefaultMeta(),
    hashes: { nodes: null, variables: null, meta: null },
    tnmCandidate: null,
    tnmChanges: [],
    warningBaseline: [],
    selectedNodeKey: "",
    selectedVariableKey: "",
    nodeQuery: "",
    variableQuery: "",
    nodeFilter: "all",
    selectedParamName: "",
    pendingVariableKeys: {},
    restoredDraft: false,
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
    refs.tnmFile.addEventListener("change", loadTnmCandidate);

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
    refs.reloadFiles.addEventListener("click", () => loadElectronAtlasFiles({ confirmDirty: true }));
    refs.saveAllFiles.addEventListener("click", saveAllElectronAtlasFiles);
    refs.openAtlasDir.addEventListener("click", () => window.atlasEditorBridge?.openAtlasDir());
    refs.tnmSelectRecommended.addEventListener("click", () => setTnmSelection("recommended"));
    refs.tnmSelectAll.addEventListener("click", () => setTnmSelection("all"));
    refs.tnmSelectNone.addEventListener("click", () => setTnmSelection("none"));
    refs.tnmApply.addEventListener("click", applySelectedTnmChanges);
    refs.tnmChangeList.addEventListener("change", updateTnmSelectionSummary);
    window.addEventListener("beforeunload", (event) => {
      if (!hasDirtyChanges() || state.isElectron) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
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
  }

  function bindVariableForm() {
    const fields = [
      refs.variableTitle,
      refs.variableType,
      refs.variableUnit,
      refs.variableSource,
      refs.variableDescription,
      refs.variableDefault
    ];
    fields.forEach((field) => field.addEventListener("input", updateSelectedVariableFromForm));
    refs.variableKey.addEventListener("input", () => {
      const key = state.selectedVariableKey;
      if (!key) {
        return;
      }
      const previousDraftKey = Object.prototype.hasOwnProperty.call(state.pendingVariableKeys, key)
        ? state.pendingVariableKeys[key]
        : key;
      const nextDraftKey = refs.variableKey.value;
      if (state.variables[key]?.description === createVariableDescriptionTemplate(previousDraftKey)) {
        state.variables[key].description = createVariableDescriptionTemplate(nextDraftKey);
        refs.variableDescription.value = state.variables[key].description;
      }
      state.pendingVariableKeys[key] = nextDraftKey;
      markDirty("variables");
    });
  }

  async function loadElectronAtlasFiles(options = {}) {
    if (!state.isElectron) {
      return;
    }
    if (options.confirmDirty && hasDirtyChanges() && !confirm("重载磁盘会放弃当前未保存更改，是否继续？")) {
      return;
    }
    try {
      refs.statusLine.textContent = "正在读取 node-library/atlas...";
      const payload = await window.atlasEditorBridge.loadAtlas();
      if (!isRecord(payload.files?.nodes) || !isRecord(payload.files?.variables) || !isRecord(payload.files?.meta)) {
        throw new Error("磁盘中的图鉴文件结构无效。");
      }
      state.nodes = payload.files.nodes;
      state.variables = payload.files.variables;
      state.meta = payload.files.meta;
      state.hashes = { ...state.hashes, ...(payload.hashes || {}) };
      state.warningBaseline = (payload.issues || [])
        .filter((issue) => issue.level === "warning")
        .map(issueFingerprint);
      state.dirty.nodes = false;
      state.dirty.variables = false;
      state.pendingVariableKeys = {};
      if (options.confirmDirty) {
        clearCachedDraft();
        state.restoredDraft = false;
      } else {
        state.restoredDraft = restoreCachedDraft();
      }
      state.selectedNodeKey = state.selectedNodeKey && state.nodes[state.selectedNodeKey]
        ? state.selectedNodeKey
        : Object.keys(state.nodes).sort(compareText)[0] || "";
      state.selectedVariableKey = state.selectedVariableKey && state.variables[state.selectedVariableKey]
        ? state.selectedVariableKey
        : Object.keys(state.variables).sort(compareText)[0] || "";
      state.lastLoaded.nodes = "node-library/atlas/nodes.json";
      state.lastLoaded.variables = "node-library/atlas/variables.json";
      syncDirtyState();
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
      if (!isRecord(parsed)) {
        throw new Error(`${file.name} 顶层必须是 JSON 对象。`);
      }
      if (kind === "nodes") {
        state.nodes = parsed;
        state.selectedNodeKey = Object.keys(state.nodes).sort(compareText)[0] || "";
        state.view = "nodes";
      } else if (kind === "variables") {
        state.variables = parsed;
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
      return true;
    }
    if (state.view === "variables" && state.selectedVariableKey) {
      updateSelectedVariableFromForm();
    }
    return true;
  }

  function render() {
    document.body.dataset.view = state.view;
    renderTabs();
    renderTools();
    renderList();
    renderEditor();
    renderInspector();
    renderStatus();
    if (hasDirtyChanges()) {
      persistCachedDraft();
    }
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
    renderParams(entry);
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

    [fields.name, fields.role, fields.type, fields.required, fields.defaultValue, fields.description].forEach((field) => {
      field.addEventListener("input", () => {
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

  function syncParamCardState(card) {
    const type = card.querySelector(".param-type")?.value?.trim() || "";
    const unknown = type === "" || type === "unknown";
    card.classList.toggle("has-unknown-type", unknown);
    const help = card.querySelector(".param-type-help");
    if (help) {
      help.textContent = unknown
        ? "当前参数类型未知，请补充为 bool、int、double、string 或项目内的具体类型。"
        : "类型完全由当前字段维护，不会自动推断。";
    }
  }

  function renderVariableForm() {
    const key = state.selectedVariableKey;
    const entry = normalizeVariableEntry(state.variables[key]);
    refs.variableKey.value = Object.prototype.hasOwnProperty.call(state.pendingVariableKeys, key)
      ? state.pendingVariableKeys[key]
      : key;
    refs.variableTitle.value = entry.title;
    refs.variableType.value = entry.type;
    refs.variableUnit.value = entry.unit;
    refs.variableSource.value = entry.source;
    refs.variableDescription.value = entry.description;
    refs.variableDefault.value = entry.default;
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
      default: refs.variableDefault.value
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
    state.variables[key] = normalizeVariableEntry({
      description: createVariableDescriptionTemplate(key)
    });
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
    if (current) {
      state.pendingVariableKeys[current] = refs.variableKey.value;
    }
    const renameEntries = Object.entries(state.pendingVariableKeys)
      .filter(([key]) => Object.prototype.hasOwnProperty.call(state.variables, key))
      .map(([key, value]) => [key, String(value || "").trim()]);
    const emptyEntry = renameEntries.find(([, next]) => !next);
    if (emptyEntry) {
      alert(`变量 key 不能为空：${emptyEntry[0]}`);
      return false;
    }
    const targets = renameEntries.map(([, next]) => next);
    if (new Set(targets).size !== targets.length) {
      alert("多个变量不能使用同一个 key。");
      return false;
    }
    const renamedKeys = new Set(renameEntries.map(([key]) => key));
    const conflict = renameEntries.find(([currentKey, next]) => currentKey !== next
      && Object.prototype.hasOwnProperty.call(state.variables, next)
      && !renamedKeys.has(next));
    if (conflict) {
      alert(`变量 key 已存在：${conflict[1]}`);
      return false;
    }
    const renameMap = new Map(renameEntries);
    const variables = {};
    Object.entries(state.variables).forEach(([key, value]) => {
      variables[renameMap.get(key) || key] = value;
    });
    state.variables = sortObjectByKey(variables);
    state.selectedVariableKey = renameMap.get(current) || current;
    state.pendingVariableKeys = {};
    markDirty("variables");
    return true;
  }

  function deleteSelectedVariable() {
    const key = state.selectedVariableKey;
    if (!key || !confirm(`删除变量 ${key}？`)) {
      return;
    }
    delete state.pendingVariableKeys[key];
    delete state.variables[key];
    state.selectedVariableKey = Object.keys(state.variables).sort(compareText)[0] || "";
    markDirty("variables");
    render();
  }

  function markDirty(kind) {
    state.dirty[kind] = true;
    persistCachedDraft();
    syncDirtyState();
    renderList();
    renderInspector();
    renderStatus();
  }

  async function exportJson(kind) {
    if (state.isElectron) {
      await saveElectronAtlasFile(kind);
      return;
    }
    if (!validateBeforeSave()) {
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
    state.restoredDraft = false;
    persistCachedDraft();
    updateWarningBaseline();
    syncDirtyState();
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
      refs.statusLine.textContent = "保存失败：当前表单内容无效";
      return;
    }
    if (!validateBeforeSave()) {
      return;
    }
    try {
      refs.statusLine.textContent = `正在保存 ${kind}.json...`;
      const result = await window.atlasEditorBridge.saveAtlasFile(
        kind,
        getAtlasValue(kind),
        state.meta,
        state.hashes
      );
      state.meta = result.meta || state.meta;
      state.hashes = { ...state.hashes, ...(result.hashes || {}) };
      state.dirty[kind] = false;
      state.restoredDraft = false;
      persistCachedDraft();
      updateWarningBaseline();
      syncDirtyState();
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
      refs.statusLine.textContent = "保存失败：当前表单内容无效";
      return;
    }
    if ((state.view === "variables" || Object.keys(state.pendingVariableKeys).length > 0)
      && !applySelectedVariableRename()) {
      return;
    }
    if (!validateBeforeSave()) {
      return;
    }
    try {
      refs.statusLine.textContent = "正在保存全部 atlas 文件...";
      await window.atlasEditorBridge.saveAllAtlasFiles({
        nodes: getAtlasValue("nodes"),
        variables: getAtlasValue("variables"),
        meta: state.meta
      }, state.hashes).then((result) => {
        state.meta = result.meta || state.meta;
        state.hashes = { ...state.hashes, ...(result.hashes || {}) };
      });
      state.dirty.nodes = false;
      state.dirty.variables = false;
      state.restoredDraft = false;
      persistCachedDraft();
      updateWarningBaseline();
      syncDirtyState();
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
    refs.previewCanvas.replaceChildren();
    refs.previewCanvas.appendChild(createAtlasNodeCard(key, entry));
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

  function collectIssues() {
    return window.BTreeAtlasCore.validateAtlas(state.nodes, state.variables, state.meta)
      .map((issue) => ({ ...issue, level: issue.level === "warning" ? "warn" : issue.level }));
  }

  function validateBeforeSave() {
    const issues = window.BTreeAtlasCore.validateAtlas(state.nodes, state.variables, state.meta);
    const errors = issues.filter((issue) => issue.level === "error");
    if (errors.length > 0) {
      state.view = "audit";
      render();
      alert(`图鉴存在 ${errors.length} 个错误，已阻止保存。请先在审计页修复。\n\n${errors.slice(0, 8).map((issue) => `- ${issue.message}`).join("\n")}`);
      return false;
    }
    const baseline = new Set(state.warningBaseline);
    const newWarnings = issues.filter((issue) => issue.level === "warning" && !baseline.has(issueFingerprint(issue)));
    if (newWarnings.length > 0 && !confirm(`本次编辑新增了 ${newWarnings.length} 条警告，是否仍然保存？`)) {
      return false;
    }
    return true;
  }

  async function loadTnmCandidate(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    try {
      const candidate = window.BTreeAtlasCore.parseCandidate(await file.text());
      state.tnmCandidate = { ...candidate, fileName: file.name };
      state.tnmChanges = window.BTreeAtlasCore.diffCandidate(state.nodes, candidate);
      renderTnmDialog();
      refs.tnmDialog.showModal();
    } catch (error) {
      alert(`TNM 导入失败：${formatError(error)}`);
    } finally {
      event.target.value = "";
    }
  }

  function renderTnmDialog() {
    const candidate = state.tnmCandidate;
    refs.tnmSummary.textContent = candidate
      ? `${candidate.fileName} / atlas_tag=${candidate.atlasTag} / ${state.tnmChanges.length} 项差异`
      : "尚未读取候选文件";
    refs.tnmChangeList.replaceChildren();
    if (state.tnmChanges.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "候选 TNM 与当前图鉴接口一致。";
      refs.tnmChangeList.appendChild(empty);
    }
    state.tnmChanges.forEach((change) => {
      const label = document.createElement("label");
      label.className = `tnm-change-item${change.type.endsWith("remove") ? " is-removal" : ""}`;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = change.id;
      checkbox.checked = change.defaultSelected === true;
      checkbox.dataset.recommended = change.defaultSelected ? "true" : "false";
      const copy = document.createElement("span");
      copy.className = "tnm-change-copy";
      const title = document.createElement("code");
      title.textContent = change.message;
      const detail = document.createElement("small");
      detail.textContent = formatTnmChangeDetail(change);
      copy.append(title, detail);
      label.append(checkbox, copy);
      refs.tnmChangeList.appendChild(label);
    });
    updateTnmSelectionSummary();
  }

  function formatTnmChangeDetail(change) {
    if (change.type === "node_remove" || change.type === "param_remove") {
      return "删除项默认不应用；确认已从当前 async 移除后再手动勾选。";
    }
    if (change.type === "param_update") {
      return `当前：${JSON.stringify(change.before)}  候选：${JSON.stringify(change.after)}`;
    }
    return change.type.replace(/_/g, " ");
  }

  function setTnmSelection(mode) {
    refs.tnmChangeList.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = mode === "all" || (mode === "recommended" && checkbox.dataset.recommended === "true");
    });
    updateTnmSelectionSummary();
  }

  function updateTnmSelectionSummary() {
    const selectedCount = refs.tnmChangeList.querySelectorAll('input[type="checkbox"]:checked').length;
    refs.tnmSelectionSummary.textContent = `已选择 ${selectedCount} / ${state.tnmChanges.length} 项`;
    refs.tnmApply.disabled = selectedCount === 0;
  }

  function applySelectedTnmChanges() {
    if (!state.tnmCandidate) {
      return;
    }
    const selectedIds = Array.from(
      refs.tnmChangeList.querySelectorAll('input[type="checkbox"]:checked'),
      (checkbox) => checkbox.value
    );
    state.nodes = window.BTreeAtlasCore.applyCandidateChanges(state.nodes, state.tnmCandidate, selectedIds);
    state.meta = {
      ...createDefaultMeta(),
      ...state.meta,
      source: {
        ...(state.meta.source || {}),
        asyncTag: state.tnmCandidate.atlasTag,
        candidateFile: state.tnmCandidate.fileName
      }
    };
    state.selectedNodeKey = state.selectedNodeKey && state.nodes[state.selectedNodeKey]
      ? state.selectedNodeKey
      : Object.keys(state.nodes)[0] || "";
    markDirty("nodes");
    refs.tnmDialog.close();
    render();
  }

  function hasDirtyChanges() {
    return state.dirty.nodes || state.dirty.variables;
  }

  function syncDirtyState() {
    window.atlasEditorBridge?.setDirty(hasDirtyChanges());
  }

  function persistCachedDraft() {
    if (!hasDirtyChanges()) {
      clearCachedDraft();
      return;
    }
    const draft = {
      version: 1,
      savedAt: new Date().toISOString(),
      hashes: state.hashes,
      dirty: state.dirty,
      nodes: state.dirty.nodes ? state.nodes : undefined,
      variables: state.dirty.variables ? state.variables : undefined,
      meta: state.meta,
      view: state.view,
      selectedNodeKey: state.selectedNodeKey,
      selectedVariableKey: state.selectedVariableKey,
      pendingVariableKeys: state.pendingVariableKeys
    };
    try {
      window.localStorage?.setItem(ATLAS_DRAFT_KEY, JSON.stringify(draft));
    } catch (error) {
      console.warn("Atlas draft cache failed", error);
    }
  }

  function restoreCachedDraft() {
    let draft;
    try {
      draft = JSON.parse(window.localStorage?.getItem(ATLAS_DRAFT_KEY) || "null");
    } catch (error) {
      console.warn("Atlas draft cache is invalid", error);
      clearCachedDraft();
      return false;
    }
    if (!isRecord(draft) || draft.version !== 1) {
      return false;
    }
    let restored = false;
    if (draft.dirty?.nodes === true && draft.hashes?.nodes === state.hashes.nodes && isRecord(draft.nodes)) {
      state.nodes = draft.nodes;
      state.dirty.nodes = true;
      restored = true;
    }
    if (draft.dirty?.variables === true && draft.hashes?.variables === state.hashes.variables && isRecord(draft.variables)) {
      state.variables = draft.variables;
      state.dirty.variables = true;
      state.pendingVariableKeys = isRecord(draft.pendingVariableKeys) ? draft.pendingVariableKeys : {};
      restored = true;
    }
    if (restored) {
      state.meta = isRecord(draft.meta) ? draft.meta : state.meta;
      state.view = draft.view === "variables" || draft.view === "audit" ? draft.view : "nodes";
      state.selectedNodeKey = typeof draft.selectedNodeKey === "string" ? draft.selectedNodeKey : "";
      state.selectedVariableKey = typeof draft.selectedVariableKey === "string" ? draft.selectedVariableKey : "";
      syncDirtyState();
    }
    return restored;
  }

  function clearCachedDraft() {
    try {
      window.localStorage?.removeItem(ATLAS_DRAFT_KEY);
    } catch (error) {
      console.warn("Atlas draft cache cleanup failed", error);
    }
  }

  function createDefaultMeta() {
    return {
      schemaVersion: 1,
      atlasVersion: "1",
      updatedAt: "",
      source: { asyncTag: "unknown" }
    };
  }

  function updateWarningBaseline() {
    state.warningBaseline = window.BTreeAtlasCore.validateAtlas(state.nodes, state.variables, state.meta)
      .filter((issue) => issue.level === "warning")
      .map(issueFingerprint);
  }

  function issueFingerprint(issue) {
    return `${issue.code || "warning"}:${issue.path || issue.message}`;
  }

  function renderStatus() {
    const parts = [];
    if (state.lastLoaded.nodes) {
      parts.push(`nodes: ${state.lastLoaded.nodes}${state.dirty.nodes ? "*" : ""}`);
    }
    if (state.lastLoaded.variables) {
      parts.push(`variables: ${state.lastLoaded.variables}${state.dirty.variables ? "*" : ""}`);
    }
    if (state.restoredDraft) {
      parts.push("已恢复本地草稿");
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
      default: input.default === undefined || input.default === null ? "" : String(input.default)
    };
  }

  function createVariableDescriptionTemplate(key) {
    return `[${String(key || "变量 key")}] 对应[配置来源]中用户配置项 [配置项名称]\n通常用于[使用场景或判断逻辑]`;
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

  function formatParamPreviewValue(_name, param) {
    return param?.default || "";
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
