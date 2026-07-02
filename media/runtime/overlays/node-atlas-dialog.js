(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const overlayRuntime = (runtime.overlayRuntime = runtime.overlayRuntime || {});
  const overlayState = (overlayRuntime.state = overlayRuntime.state || {});
  const shared = overlayRuntime.shared;
  const state = {
    nodes: {},
    keys: [],
    selectedKey: "",
    query: ""
  };

  function createNodeAtlasDialog() {
    const element = document.createElement("div");
    element.className = "node-picker settings-dialog node-atlas-dialog";
    element.hidden = true;

    const backdrop = document.createElement("div");
    backdrop.className = "node-picker-backdrop";
    backdrop.addEventListener("click", hideNodeAtlasDialog);

    const dialog = document.createElement("div");
    dialog.className = "node-picker-dialog settings-dialog-panel node-atlas-dialog-panel";

    const header = document.createElement("div");
    header.className = "node-picker-header";

    const title = document.createElement("strong");
    title.className = "node-picker-title";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "settings-close-button";
    closeButton.setAttribute("aria-label", "Close");
    closeButton.innerHTML = runtime.icons.iconHtml("close");
    closeButton.addEventListener("click", hideNodeAtlasDialog);

    const summary = document.createElement("p");
    summary.className = "node-atlas-summary";

    const layout = document.createElement("div");
    layout.className = "node-atlas-layout";

    const list = document.createElement("div");
    list.className = "node-atlas-node-list";

    const filters = document.createElement("div");
    filters.className = "node-atlas-filters";

    const searchRow = document.createElement("div");
    searchRow.className = "node-atlas-search-row";

    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "node-atlas-filter-input node-atlas-search-input";
    searchInput.spellcheck = false;
    searchInput.addEventListener("input", () => {
      state.query = searchInput.value || "";
      renderNodeAtlasDialog();
    });
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        state.query = searchInput.value || "";
        renderNodeAtlasDialog();
      }
    });

    const searchButton = document.createElement("button");
    searchButton.type = "button";
    searchButton.className = "canvas-btn icon-btn subtle node-atlas-search-button";
    searchButton.innerHTML = runtime.icons.iconHtml("search");
    searchButton.addEventListener("click", () => {
      state.query = searchInput.value || "";
      renderNodeAtlasDialog();
    });

    searchRow.appendChild(searchInput);
    searchRow.appendChild(searchButton);
    filters.appendChild(searchRow);

    const listResults = document.createElement("div");
    listResults.className = "node-atlas-list-results";

    list.appendChild(filters);
    list.appendChild(listResults);

    const preview = document.createElement("div");
    preview.className = "node-atlas-preview";

    const params = document.createElement("div");
    params.className = "node-atlas-params";

    const functionIntro = document.createElement("div");
    functionIntro.className = "node-atlas-function";

    layout.appendChild(list);
    layout.appendChild(preview);
    layout.appendChild(params);
    layout.appendChild(functionIntro);
    header.appendChild(title);
    header.appendChild(closeButton);
    dialog.appendChild(header);
    dialog.appendChild(summary);
    dialog.appendChild(layout);
    element.appendChild(backdrop);
    element.appendChild(dialog);

    return {
      element,
      title,
      closeButton,
      summary,
      list,
      listResults,
      searchInput,
      searchButton,
      preview,
      params,
      functionIntro
    };
  }

  function showNodeAtlasDialog() {
    const dialog = overlayState.nodeAtlasDialog;
    if (!dialog) {
      return;
    }

    const copy = runtime.i18n.getCatalogCopy();
    dialog.title.textContent = copy.atlasDialogTitle;
    dialog.summary.textContent = copy.atlasDialogSummary;
    dialog.searchInput.placeholder = copy.atlasSearchPlaceholder;
    dialog.searchButton.title = copy.atlasSearchTitle;
    dialog.searchButton.setAttribute("aria-label", copy.atlasSearchTitle);
    dialog.closeButton.title = runtime.i18n.getSettingsCopy?.().close || "Close";
    dialog.closeButton.setAttribute("aria-label", dialog.closeButton.title);

    const parsed = parseAtlasNodes();
    state.nodes = parsed.nodes;
    state.keys = parsed.keys;
    state.selectedKey = state.keys.includes(state.selectedKey) ? state.selectedKey : state.keys[0] || "";
    renderNodeAtlasDialog();
    dialog.element.hidden = false;
    shared.syncBlockingOverlay();
  }

  function renderNodeAtlasDialog() {
    const dialog = overlayState.nodeAtlasDialog;
    if (!dialog) {
      return;
    }

    renderNodeList(dialog);
    renderPreview(dialog);
    renderParams(dialog);
    renderFunctionIntro(dialog);
  }

  function renderNodeList(dialog) {
    const copy = runtime.i18n.getCatalogCopy();
    dialog.searchInput.value = state.query || "";
    dialog.listResults.replaceChildren();
    const filteredKeys = getFilteredKeys();
    if (filteredKeys.length > 0 && !filteredKeys.includes(state.selectedKey)) {
      state.selectedKey = filteredKeys[0];
    } else if (filteredKeys.length === 0 && state.keys.length > 0) {
      state.selectedKey = "";
    }

    if (state.keys.length === 0) {
      const empty = document.createElement("div");
      empty.className = "node-atlas-empty";
      empty.textContent = copy.atlasEmpty;
      dialog.listResults.appendChild(empty);
      return;
    }
    if (filteredKeys.length === 0) {
      const empty = document.createElement("div");
      empty.className = "node-atlas-empty";
      empty.textContent = copy.atlasNoFilterResults;
      dialog.listResults.appendChild(empty);
      return;
    }

    for (const key of filteredKeys) {
      const entry = state.nodes[key];
      const button = document.createElement("button");
      button.type = "button";
      button.className = key === state.selectedKey ? "node-atlas-node is-selected" : "node-atlas-node";
      const englishName = getNodeEnglishName(key);
      const chineseName = getNodeChineseName(entry);
      const department = getNodeDepartment(entry);
      const author = getNodeAuthor(entry);
      button.title = [englishName, chineseName, department, author].filter(Boolean).join(" · ");
      button.dataset.title = englishName;
      button.dataset.category = entry?.category || "";
      button.textContent = `${englishName}${chineseName ? ` - ${chineseName}` : ""}\n${department || " "} - ${author || " "}`;
      button.addEventListener("click", () => {
        state.selectedKey = key;
        renderNodeAtlasDialog();
      });
      dialog.listResults.appendChild(button);
    }
  }

  function getFilteredKeys() {
    const query = normalizeSearchText(state.query);
    return state.keys.filter((key) => {
      const entry = state.nodes[key] || {};
      if (!query) {
        return true;
      }
      return matchesFilter(query, [
        key,
        entry.title,
        getNodeAuthor(entry),
        getNodeDepartment(entry),
        getNodeMaintainer(entry)
      ]);
    }).sort((left, right) => compareNodeKeys(left, right));
  }

  function compareNodeKeys(leftKey, rightKey) {
    return getNodeEnglishName(leftKey).localeCompare(getNodeEnglishName(rightKey), undefined, {
      sensitivity: "base"
    });
  }

  function matchesFilter(query, values) {
    return values.some((value) => normalizeSearchText(value).includes(query));
  }

  function normalizeSearchText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getNodeEnglishName(key) {
    return key;
  }

  function getNodeChineseName(entry) {
    return entry?.title || "";
  }

  function getNodeDepartment(entry) {
    return entry?.department || "";
  }

  function getNodeAuthor(entry) {
    return entry?.maintainer || "";
  }

  function getNodeMaintainer(entry) {
    return entry?.maintainer || "";
  }

  function renderPreview(dialog) {
    const copy = runtime.i18n.getCatalogCopy();
    const entry = getSelectedEntry();
    dialog.preview.replaceChildren();
    if (!entry) {
      dialog.preview.appendChild(createEmpty(copy.atlasEmpty));
      return;
    }

    const node = createAtlasPreviewNode(entry);
    const card = runtime.canvas?.buildNodeCard?.(node, null, {
      interactive: false,
      measuring: true,
      selected: false,
      currentTreeId: "__node_atlas__"
    });

    if (!card) {
      dialog.preview.appendChild(createEmpty(copy.atlasEmpty));
      return;
    }

    const canvas = createAtlasPreviewCanvas(node, card);
    dialog.preview.appendChild(canvas.shell);
    requestAnimationFrame(() => {
      initializeAtlasPreviewCanvas(canvas);
    });
  }

  function createAtlasPreviewCanvas(node, card) {
    const shell = document.createElement("div");
    shell.className = "canvas-shell node-atlas-canvas-shell";

    const stage = document.createElement("div");
    stage.className = "canvas-stage node-atlas-canvas-stage";

    const nodesLayer = document.createElement("div");
    nodesLayer.className = "canvas-nodes";

    const nodeWidth = 560;
    const nodeX = 96;
    const nodeY = 80;
    const wrapper = document.createElement("div");
    wrapper.className = "canvas-node node-atlas-canvas-node";
    wrapper.dataset.nodePath = node.nodePath;
    wrapper.dataset.treeId = "__node_atlas__";
    wrapper.style.left = `${nodeX}px`;
    wrapper.style.top = `${nodeY}px`;
    wrapper.style.width = `${nodeWidth}px`;
    wrapper.appendChild(card);
    nodesLayer.appendChild(wrapper);
    stage.appendChild(nodesLayer);
    shell.appendChild(stage);

    return {
      shell,
      stage,
      wrapper,
      card,
      node,
      nodeX,
      nodeY,
      nodeWidth
    };
  }

  function initializeAtlasPreviewCanvas(canvas) {
    if (!canvas.shell.isConnected) {
      return;
    }

    const { shell, stage, wrapper, card, node, nodeX, nodeY, nodeWidth } = canvas;
    const nodeHeight = Math.max(168, Math.ceil(card.getBoundingClientRect().height || card.scrollHeight || 0));
    wrapper.style.height = `${nodeHeight}px`;
    const layout = {
      width: nodeWidth + nodeX * 2,
      height: Math.max(nodeHeight + nodeY * 2, 520),
      rootCenterX: nodeX + nodeWidth / 2,
      dropTargetReferenceSize: {
        width: nodeWidth,
        height: nodeHeight
      },
      nodes: [
        {
          node,
          x: nodeX,
          y: nodeY,
          width: nodeWidth,
          height: nodeHeight,
          centerX: nodeX + nodeWidth / 2,
          centerY: nodeY + nodeHeight / 2
        }
      ],
      edges: []
    };

    stage.style.width = `${layout.width}px`;
    stage.style.height = `${layout.height}px`;
    stage.dataset.baseWidth = String(layout.width);
    stage.dataset.baseHeight = String(layout.height);
    runtime.viewport?.setupCanvas?.(shell, stage, layout, null, {
      paneId: "node-atlas-preview",
      active: false
    });
  }

  function renderParams(dialog) {
    const copy = runtime.i18n.getCatalogCopy();
    const entry = getSelectedEntry();
    dialog.params.replaceChildren();
    if (!entry) {
      dialog.params.appendChild(createEmpty(copy.atlasEmpty));
      return;
    }

    const title = document.createElement("div");
    title.className = "node-atlas-region-title";
    title.textContent = copy.atlasParamsTitle;
    dialog.params.appendChild(title);

    const params = getSelectedParams();
    if (params.length === 0) {
      dialog.params.appendChild(createEmpty(copy.atlasNoParams));
      return;
    }

    for (const [name, param] of params) {
      dialog.params.appendChild(createParamSummary(name, param));
    }
  }

  function createParamSummary(name, param) {
    const item = document.createElement("section");
    item.className = "node-atlas-param";

    const heading = document.createElement("div");
    heading.className = "node-atlas-param-name";
    heading.textContent = name;
    item.appendChild(heading);

    const meta = [param?.role, param?.type, param?.required ? "required" : ""].filter(Boolean);
    if (meta.length > 0) {
      const detail = document.createElement("div");
      detail.className = "node-atlas-param-meta";
      detail.textContent = meta.join(" / ");
      item.appendChild(detail);
    }

    if (param?.default !== undefined && param.default !== "") {
      const defaultValue = document.createElement("div");
      defaultValue.className = "node-atlas-param-line";
      defaultValue.textContent = `default: ${param.default}`;
      item.appendChild(defaultValue);
    }

    if (param?.description) {
      const description = document.createElement("div");
      description.className = "node-atlas-param-line";
      description.textContent = param.description;
      item.appendChild(description);
    }

    return item;
  }

  function renderFunctionIntro(dialog) {
    const copy = runtime.i18n.getCatalogCopy();
    const entry = getSelectedEntry();
    dialog.functionIntro.replaceChildren();

    const title = document.createElement("div");
    title.className = "node-atlas-region-title";
    title.textContent = copy.atlasFunctionTitle;
    dialog.functionIntro.appendChild(title);

    const sections = collectFunctionIntroSections(entry);
    if (sections.length === 0) {
      dialog.functionIntro.appendChild(createEmpty(copy.atlasNoFunctionIntro));
      return;
    }

    for (const section of sections) {
      const block = document.createElement("section");
      block.className = "node-atlas-function-section";
      if (section.title) {
        const heading = document.createElement("div");
        heading.className = "node-atlas-function-title";
        heading.textContent = section.title;
        block.appendChild(heading);
      }
      for (const line of section.lines) {
        const item = document.createElement("div");
        item.className = "node-atlas-function-line";
        item.textContent = line;
        block.appendChild(item);
      }
      dialog.functionIntro.appendChild(block);
    }
  }

  function parseAtlasNodes() {
    const copy = runtime.i18n.getCatalogCopy();
    try {
      const nodes = JSON.parse(window.BTreeToolAtlasNodesJson || "{}");
      const keys = Object.keys(nodes).sort((left, right) => compareNodeKeys(left, right));
      return { nodes, keys };
    } catch (_error) {
      return { nodes: { [copy.atlasInvalidJson]: { title: copy.atlasInvalidJson, category: "Info" } }, keys: [copy.atlasInvalidJson] };
    }
  }

  function getSelectedEntry() {
    return state.selectedKey ? state.nodes[state.selectedKey] : null;
  }

  function getSelectedParams() {
    const entry = getSelectedEntry();
    const params = entry?.mainline?.params || {};
    return Object.entries(params);
  }

  function createAtlasPreviewNode(entry) {
    const fields = getSelectedParams().map(([key, param]) => ({
      key,
      value: formatParamValue(param),
      role: normalizeParamRole(param.role),
      editableKey: false,
      editableValue: true,
      removable: false,
      required: Boolean(param.required),
      source: "model"
    }));
    const attributes = Object.fromEntries(fields.map((field) => [field.key, field.value || ""]));
    const category = entry.category || "Action";
    const title = entry.title || state.selectedKey;

    return {
      nodePath: "0",
      title,
      instanceName: "",
      kind: state.selectedKey || title,
      category,
      targetTreeId: "",
      description: entry.description || "",
      code: "",
      summary: "",
      attributes,
      ioGroups: {
        inputs: fields.filter((field) => field.role === "input" || field.role === "inout"),
        outputs: fields.filter((field) => field.role === "output" || field.role === "inout"),
        params: fields.filter((field) => field.role === "param")
      },
      attributeFields: fields,
      editorFields: fields,
      modelKind: category,
      warningCount: 0,
      hasError: false,
      warnings: [],
      children: [],
      sourceTreeId: "__node_atlas__",
      renderPath: `__node_atlas__::${state.selectedKey || title}`
    };
  }

  function normalizeParamRole(role) {
    return ["input", "output", "inout", "param"].includes(role) ? role : "param";
  }

  function formatParamValue(param) {
    const value = param.default || param.type || "";
    if (value) {
      return value;
    }
    return param.required ? "required" : "";
  }

  function collectFunctionIntroSections(entry) {
    if (!entry) {
      return [];
    }
    const copy = runtime.i18n.getCatalogCopy();
    const sections = [];
    const description = normalizeIntroText(entry.description);
    if (description) {
      sections.push({ title: copy.atlasFunctionDescriptionTitle, lines: [description] });
    }
    const rules = normalizeIntroList(entry.mainline?.rules);
    if (rules.length > 0) {
      sections.push({ title: copy.atlasFunctionRulesTitle, lines: rules });
    }
    const examples = normalizeIntroList(entry.mainline?.examples);
    if (examples.length > 0) {
      sections.push({ title: copy.atlasFunctionExamplesTitle, lines: examples });
    }
    const paramLines = collectParamIntroLines(entry);
    if (paramLines.length > 0) {
      sections.push({ title: copy.atlasFunctionParamsTitle, lines: paramLines });
    }
    const notes = normalizeIntroList(entry.source_notes);
    if (notes.length > 0) {
      sections.push({ title: copy.atlasFunctionNotesTitle, lines: notes });
    }
    return sections;
  }

  function collectParamIntroLines(entry) {
    return Object.entries(entry?.mainline?.params || {})
      .map(([name, param]) => {
        const parts = [
          param?.role || "",
          param?.type || "",
          param?.required ? "required" : "",
          param?.description || ""
        ].filter(Boolean);
        return parts.length > 0 ? `${name}: ${parts.join(" / ")}` : "";
      })
      .filter(Boolean);
  }

  function normalizeIntroText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeIntroList(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  function createEmpty(text) {
    const empty = document.createElement("div");
    empty.className = "node-atlas-empty";
    empty.textContent = text;
    return empty;
  }

  function hideNodeAtlasDialog() {
    if (!overlayState.nodeAtlasDialog) {
      return;
    }
    overlayState.nodeAtlasDialog.element.hidden = true;
    shared.syncBlockingOverlay();
  }

  overlayRuntime.parts.nodeAtlasDialog = {
    createNodeAtlasDialog,
    showNodeAtlasDialog,
    hideNodeAtlasDialog
  };
})();
