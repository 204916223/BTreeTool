(function () {
  const state = {
    view: "nodes",
    nodes: {},
    variables: {},
    manifest: {},
    selectedNodeKey: "",
    selectedVariableKey: "",
    nodeQuery: "",
    variableQuery: "",
    nodeFilter: "all",
    dirty: {
      nodes: false,
      variables: false,
      manifest: false
    },
    lastLoaded: {
      nodes: "",
      variables: "",
      manifest: ""
    }
  };

  const refs = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindRefs();
    bindEvents();
    render();
  }

  function bindRefs() {
    for (const element of document.querySelectorAll("[id]")) {
      refs[toCamelCase(element.id)] = element;
    }
  }

  function bindEvents() {
    refs.nodesFile.addEventListener("change", (event) => loadJsonFile(event, "nodes"));
    refs.variablesFile.addEventListener("change", (event) => loadJsonFile(event, "variables"));
    refs.manifestFile.addEventListener("change", (event) => loadJsonFile(event, "manifest"));

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
    refs.renameNode.addEventListener("click", renameSelectedNode);
    refs.deleteNode.addEventListener("click", deleteSelectedNode);
    refs.addParam.addEventListener("click", addParam);

    refs.addVariable.addEventListener("click", addVariable);
    refs.renameVariable.addEventListener("click", renameSelectedVariable);
    refs.deleteVariable.addEventListener("click", deleteSelectedVariable);

    bindNodeForm();
    bindVariableForm();
    bindManifestForm();

    refs.exportNodes.addEventListener("click", () => exportJson("nodes"));
    refs.exportVariables.addEventListener("click", () => exportJson("variables"));
    refs.exportManifest.addEventListener("click", () => exportJson("manifest"));
    refs.exportAll.addEventListener("click", () => {
      exportJson("nodes");
      window.setTimeout(() => exportJson("variables"), 120);
      window.setTimeout(() => exportJson("manifest"), 240);
    });
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
      refs.variableCommonNodes,
      refs.variableExamples
    ];
    fields.forEach((field) => field.addEventListener("input", updateSelectedVariableFromForm));
  }

  function bindManifestForm() {
    const fields = [
      refs.manifestSchemaVersion,
      refs.manifestAtlasVersion,
      refs.manifestDefaultTag,
      refs.manifestTagDescription,
      refs.manifestTagExamples,
      refs.manifestKnownProjects,
      refs.policyUnknownTag,
      refs.policyUnknownProject,
      refs.policyCustomExtendsDefault
    ];
    fields.forEach((field) => field.addEventListener("input", updateManifestFromForm));
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
      } else {
        state.manifest = isRecord(parsed) ? parsed : {};
        state.view = "manifest";
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

  function render() {
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
    refs.manifestTools.classList.toggle("hidden", state.view !== "manifest");
  }

  function renderList() {
    refs.itemList.replaceChildren();
    if (state.view === "nodes") {
      renderNodeList();
    } else if (state.view === "variables") {
      renderVariableList();
    } else {
      renderManifestList();
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
        badges.appendChild(createBadge("unknown", "warn"));
      }
      if (collectNodeVariables(entry).length > 0) {
        badges.appendChild(createBadge("变量"));
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

  function renderManifestList() {
    const rows = [
      ["schemaVersion", state.manifest.schemaVersion],
      ["atlasVersion", state.manifest.atlasVersion],
      ["defaultTag", state.manifest.defaultTag],
      ["knownProjects", Array.isArray(state.manifest.knownProjects) ? state.manifest.knownProjects.join(", ") : ""]
    ];
    rows.forEach(([key, value]) => {
      const item = document.createElement("div");
      item.className = "item-button";
      const title = document.createElement("div");
      title.className = "item-title";
      title.textContent = key;
      const meta = document.createElement("div");
      meta.className = "item-meta";
      meta.textContent = value === undefined || value === "" ? "未设置" : String(value);
      item.append(title, meta);
      refs.itemList.appendChild(item);
    });
  }

  function renderEditor() {
    const hasAnyData = Object.keys(state.nodes).length > 0 || Object.keys(state.variables).length > 0 || Object.keys(state.manifest).length > 0;
    refs.emptyState.classList.toggle("hidden", hasAnyData);
    refs.nodeForm.classList.toggle("hidden", state.view !== "nodes" || !state.selectedNodeKey);
    refs.variableForm.classList.toggle("hidden", state.view !== "variables" || !state.selectedVariableKey);
    refs.manifestForm.classList.toggle("hidden", state.view !== "manifest" || Object.keys(state.manifest).length === 0);

    if (state.view === "nodes" && state.selectedNodeKey) {
      renderNodeForm();
    } else if (state.view === "variables" && state.selectedVariableKey) {
      renderVariableForm();
    } else if (state.view === "manifest") {
      renderManifestForm();
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
    const params = entry.mainline.params || {};
    Object.keys(params)
      .sort(compareText)
      .forEach((name) => {
        refs.paramEditor.appendChild(createParamCard(name, params[name]));
      });
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
      availability: card.querySelector(".param-availability"),
      description: card.querySelector(".param-description"),
      remove: card.querySelector(".param-remove")
    };
    fields.name.value = name;
    fields.role.value = normalizeRole(param?.role);
    fields.type.value = param?.type || "";
    fields.required.checked = param?.required === true;
    fields.defaultValue.value = param?.default || "";
    fields.availability.value = JSON.stringify(Array.isArray(param?.availability) ? param.availability : []);
    fields.description.value = param?.description || "";

    [fields.name, fields.role, fields.type, fields.required, fields.defaultValue, fields.availability, fields.description].forEach((field) => {
      field.addEventListener("input", updateParamsFromCards);
      field.addEventListener("change", updateParamsFromCards);
    });
    fields.remove.addEventListener("click", () => {
      card.remove();
      updateParamsFromCards();
    });
    return card;
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

  function renderManifestForm() {
    const manifest = normalizeManifest(state.manifest);
    refs.manifestSchemaVersion.value = manifest.schemaVersion;
    refs.manifestAtlasVersion.value = manifest.atlasVersion;
    refs.manifestDefaultTag.value = manifest.defaultTag;
    refs.manifestTagDescription.value = manifest.tagFormat.description;
    refs.manifestTagExamples.value = arrayToLines(manifest.tagFormat.examples);
    refs.manifestKnownProjects.value = arrayToLines(manifest.knownProjects);
    refs.policyUnknownTag.value = manifest.resolutionPolicy.unknownTag;
    refs.policyUnknownProject.value = manifest.resolutionPolicy.unknownProject;
    refs.policyCustomExtendsDefault.value = manifest.resolutionPolicy.customExtendsDefault;
    refs.manifestSummary.textContent = manifest.defaultTag || manifest.atlasVersion || "已导入";
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
  }

  function updateParamsFromCards() {
    const key = state.selectedNodeKey;
    if (!key || !state.nodes[key]) {
      return;
    }
    const entry = normalizeNodeEntry(state.nodes[key], key);
    const params = {};
    refs.paramEditor.querySelectorAll(".param-card").forEach((card) => {
      const name = card.querySelector(".param-name").value.trim();
      if (!name) {
        return;
      }
      const availabilityText = card.querySelector(".param-availability").value.trim();
      let availability = [];
      if (availabilityText) {
        try {
          const parsed = JSON.parse(availabilityText);
          availability = Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
          availability = [];
        }
      }
      const param = {
        availability,
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
      commonNodes: linesToArray(refs.variableCommonNodes.value),
      examples: linesToArray(refs.variableExamples.value)
    };
    markDirty("variables");
  }

  function updateManifestFromForm() {
    state.manifest = {
      ...state.manifest,
      schemaVersion: Number(refs.manifestSchemaVersion.value) || 1,
      atlasVersion: refs.manifestAtlasVersion.value.trim(),
      defaultTag: refs.manifestDefaultTag.value.trim(),
      tagFormat: {
        ...(isRecord(state.manifest.tagFormat) ? state.manifest.tagFormat : {}),
        description: refs.manifestTagDescription.value.trim(),
        examples: linesToArray(refs.manifestTagExamples.value)
      },
      knownProjects: linesToArray(refs.manifestKnownProjects.value),
      resolutionPolicy: {
        ...(isRecord(state.manifest.resolutionPolicy) ? state.manifest.resolutionPolicy : {}),
        unknownTag: refs.policyUnknownTag.value.trim(),
        unknownProject: refs.policyUnknownProject.value.trim(),
        customExtendsDefault: refs.policyCustomExtendsDefault.value.trim()
      }
    };
    markDirty("manifest");
  }

  function addNode() {
    const key = uniqueKey(state.nodes, "NewNode");
    state.nodes[key] = normalizeNodeEntry({}, key);
    state.selectedNodeKey = key;
    state.view = "nodes";
    markDirty("nodes");
    render();
  }

  function renameSelectedNode() {
    const current = state.selectedNodeKey;
    const next = refs.nodeKey.value.trim();
    if (!current || !next || current === next) {
      return;
    }
    if (state.nodes[next]) {
      alert(`节点 ID 已存在：${next}`);
      refs.nodeKey.value = current;
      return;
    }
    state.nodes[next] = state.nodes[current];
    delete state.nodes[current];
    state.nodes = sortObjectByKey(state.nodes);
    state.selectedNodeKey = next;
    markDirty("nodes");
    render();
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
    refs.paramEditor.appendChild(createParamCard(uniqueParamName(), {
      availability: defaultAvailability(),
      role: "input",
      type: "unknown",
      required: false,
      description: ""
    }));
    updateParamsFromCards();
  }

  function addVariable() {
    const key = uniqueKey(state.variables, "new_variable");
    state.variables[key] = normalizeVariableEntry({});
    state.selectedVariableKey = key;
    state.view = "variables";
    markDirty("variables");
    render();
  }

  function renameSelectedVariable() {
    const current = state.selectedVariableKey;
    const next = refs.variableKey.value.trim();
    if (!current || !next || current === next) {
      return;
    }
    if (state.variables[next]) {
      alert(`变量 key 已存在：${next}`);
      refs.variableKey.value = current;
      return;
    }
    state.variables[next] = state.variables[current];
    delete state.variables[current];
    state.variables = sortObjectByKey(state.variables);
    state.selectedVariableKey = next;
    markDirty("variables");
    render();
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

  function exportJson(kind) {
    const value = kind === "nodes" ? sortObjectByKey(state.nodes) : kind === "variables" ? sortObjectByKey(state.variables) : state.manifest;
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
          issues.push({ level: "warn", message: `${key}.${paramName}: 参数类型 unknown` });
        }
      }
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
    if (state.lastLoaded.manifest) {
      parts.push(`manifest: ${state.lastLoaded.manifest}${state.dirty.manifest ? "*" : ""}`);
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
        params: isRecord(mainline.params) ? mainline.params : {},
        rules: Array.isArray(mainline.rules) ? mainline.rules.map(String) : [],
        examples: Array.isArray(mainline.examples) ? mainline.examples.map(String) : []
      },
      custom: isRecord(input.custom) ? input.custom : {}
    };
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

  function normalizeManifest(value) {
    const input = isRecord(value) ? value : {};
    const tagFormat = isRecord(input.tagFormat) ? input.tagFormat : {};
    const resolutionPolicy = isRecord(input.resolutionPolicy) ? input.resolutionPolicy : {};
    return {
      ...input,
      schemaVersion: Number(input.schemaVersion) || 1,
      atlasVersion: typeof input.atlasVersion === "string" ? input.atlasVersion : "",
      defaultTag: typeof input.defaultTag === "string" ? input.defaultTag : "",
      tagFormat: {
        ...tagFormat,
        description: typeof tagFormat.description === "string" ? tagFormat.description : "",
        examples: Array.isArray(tagFormat.examples) ? tagFormat.examples.map(String) : []
      },
      knownProjects: Array.isArray(input.knownProjects) ? input.knownProjects.map(String) : [],
      resolutionPolicy: {
        ...resolutionPolicy,
        unknownTag: typeof resolutionPolicy.unknownTag === "string" ? resolutionPolicy.unknownTag : "",
        unknownProject: typeof resolutionPolicy.unknownProject === "string" ? resolutionPolicy.unknownProject : "",
        customExtendsDefault:
          typeof resolutionPolicy.customExtendsDefault === "string" ? resolutionPolicy.customExtendsDefault : ""
      }
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
    return Array.isArray(value) ? value.join("\n") : "";
  }

  function linesToArray(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function normalizeRole(role) {
    return role === "input" || role === "output" || role === "inout" || role === "param" ? role : "param";
  }

  function defaultAvailability() {
    const tag = state.manifest?.defaultTag;
    return tag ? [{ since: tag }] : [];
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
