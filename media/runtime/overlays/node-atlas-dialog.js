(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const overlayRuntime = (runtime.overlayRuntime = runtime.overlayRuntime || {});
  const overlayState = (overlayRuntime.state = overlayRuntime.state || {});
  const shared = overlayRuntime.shared;
  const state = {
    nodes: {},
    keys: [],
    selectedKey: "",
    query: "",
    previewMode: "node"
  };

  function createNodeAtlasDialog() {
    const shell = shared.createModalShell({
      rootClass: "settings-dialog node-atlas-dialog",
      dialogClass: "settings-dialog-panel node-atlas-dialog-panel",
      onClose: hideNodeAtlasDialog
    });
    const { element, dialog, header, title } = shell;

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

    const canvasToggleButton = document.createElement("button");
    canvasToggleButton.type = "button";
    canvasToggleButton.className = "canvas-btn icon-btn subtle node-atlas-canvas-toggle";
    canvasToggleButton.innerHTML = runtime.icons.iconHtml("canvasSwitch");
    canvasToggleButton.addEventListener("click", () => {
      state.previewMode = state.previewMode === "usage" ? "node" : "usage";
      renderPreview(overlayState.nodeAtlasDialog);
    });

    const params = document.createElement("div");
    params.className = "node-atlas-params";

    const functionIntro = document.createElement("div");
    functionIntro.className = "node-atlas-function";

    layout.appendChild(list);
    layout.appendChild(preview);
    layout.appendChild(params);
    layout.appendChild(functionIntro);
    header.appendChild(closeButton);
    dialog.appendChild(summary);
    dialog.appendChild(layout);

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
      canvasToggleButton,
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
    state.previewMode = "node";

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
      dialog.preview.appendChild(dialog.canvasToggleButton);
      syncAtlasPreviewMode(dialog);
      return;
    }

    if (state.previewMode === "usage") {
      const canvas = createAtlasUsageFlowCanvas(entry);
      if (canvas) {
        dialog.preview.appendChild(canvas);
        dialog.preview.appendChild(dialog.canvasToggleButton);
        syncAtlasPreviewMode(dialog);
        return;
      }
    }

    const node = createAtlasPreviewNode(entry, { nodePath: "0" });
    const canvas = createAtlasTreeCanvas(node, {
      treeId: "__node_atlas__",
      paneId: "node-atlas-preview",
      shellClass: "node-atlas-style-shell"
    });

    if (!canvas) {
      dialog.preview.appendChild(createEmpty(copy.atlasEmpty));
      dialog.preview.appendChild(dialog.canvasToggleButton);
      syncAtlasPreviewMode(dialog);
      return;
    }

    dialog.preview.appendChild(canvas);
    dialog.preview.appendChild(dialog.canvasToggleButton);
    syncAtlasPreviewMode(dialog);
  }

  function syncAtlasPreviewMode(dialog) {
    if (!dialog) {
      return;
    }

    const copy = runtime.i18n.getCatalogCopy();
    const usageMode = state.previewMode === "usage";
    dialog.preview.classList.toggle("is-usage-flow", usageMode);
    dialog.canvasToggleButton.classList.toggle("is-usage-flow", usageMode);
    const title = usageMode ? copy.atlasShowNodeStyleTitle : copy.atlasShowUsageFlowTitle;
    dialog.canvasToggleButton.title = title;
    dialog.canvasToggleButton.setAttribute("aria-label", title);
  }

  function createAtlasUsageFlowCanvas(entry) {
    const rootNode = createAtlasUsageFlowRoot(entry);
    const selectedNode = findAtlasUsageNode(rootNode, entry);
    return createAtlasTreeCanvas(rootNode, {
      treeId: "__node_atlas_usage__",
      paneId: "node-atlas-usage",
      selectedPath: selectedNode?.nodePath || "",
      shellClass: "node-atlas-usage-shell"
    });
  }

  function createAtlasTreeCanvas(rootNode, options = {}) {
    if (!rootNode || !runtime.viewport?.buildTreeLayout || !runtime.canvas?.buildNodeCard) {
      return null;
    }

    const treeId = options.treeId || "__node_atlas__";
    const layout = runtime.viewport.buildTreeLayout(rootNode, null);
    const shell = document.createElement("div");
    shell.className = ["canvas-shell", "node-atlas-canvas-shell", options.shellClass || ""].filter(Boolean).join(" ");

    const stage = document.createElement("div");
    stage.className = "canvas-stage node-atlas-canvas-stage";
    stage.style.width = `${layout.width}px`;
    stage.style.height = `${layout.height}px`;
    stage.dataset.baseWidth = String(layout.width);
    stage.dataset.baseHeight = String(layout.height);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "canvas-edges");
    svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute("width", String(layout.width));
    svg.setAttribute("height", String(layout.height));
    layout.edges.forEach((edge) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", renderAtlasZEdgePath(edge));
      path.setAttribute("class", "canvas-edge-path canvas-edge-path-base");
      svg.appendChild(path);
    });

    const nodesLayer = document.createElement("div");
    nodesLayer.className = "canvas-nodes";
    layout.nodes.forEach((entry) => {
      const wrapper = document.createElement("div");
      wrapper.className = "canvas-node node-atlas-flow-node";
      wrapper.dataset.nodePath = entry.node.nodePath;
      wrapper.dataset.treeId = treeId;
      wrapper.style.left = `${entry.x}px`;
      wrapper.style.top = `${entry.y}px`;
      wrapper.style.width = `${entry.width}px`;
      wrapper.style.height = `${entry.height}px`;
      wrapper.appendChild(runtime.canvas.buildNodeCard(entry.node, null, {
        interactive: false,
        measuring: false,
        readonlyControls: true,
        selected: Boolean(options.selectedPath && entry.node.nodePath === options.selectedPath),
        currentTreeId: treeId
      }));
      nodesLayer.appendChild(wrapper);
    });

    stage.appendChild(svg);
    stage.appendChild(nodesLayer);
    shell.appendChild(stage);
    runtime.viewport.setupCanvas(shell, stage, layout, null, {
      paneId: options.paneId || "node-atlas-preview",
      active: false
    });
    return shell;
  }

  function findAtlasUsageNode(node, entry) {
    if (!node) {
      return null;
    }
    if (isAtlasUsageNodeMatch(node, entry)) {
      return node;
    }
    for (const child of node.children || []) {
      const match = findAtlasUsageNode(child, entry);
      if (match) {
        return match;
      }
    }
    return null;
  }

  function isAtlasUsageNodeMatch(node, entry) {
    const key = state.selectedKey || "";
    const title = entry?.title || "";
    return [node.kind, node.title, node.instanceName].some((value) => value && (value === key || value === title));
  }

  function renderAtlasZEdgePath(edge) {
    const midY = edge.startY + (edge.endY - edge.startY) / 2;
    return [
      `M ${edge.startX} ${edge.startY}`,
      `L ${edge.startX} ${midY}`,
      `L ${edge.endX} ${midY}`,
      `L ${edge.endX} ${edge.endY}`
    ].join(" ");
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

    const title = document.createElement("div");
    title.className = "node-atlas-region-title";
    title.textContent = copy.atlasParamsTitle;
    dialog.params.appendChild(title);

    const body = document.createElement("div");
    body.className = "node-atlas-region-body";
    dialog.params.appendChild(body);

    if (!entry) {
      body.appendChild(createEmpty(copy.atlasEmpty));
      return;
    }

    const params = getSelectedParams();
    if (params.length === 0) {
      body.appendChild(createEmpty(copy.atlasNoParams));
      return;
    }

    for (const [name, param] of params) {
      body.appendChild(createParamSummary(name, param));
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

    const body = document.createElement("div");
    body.className = "node-atlas-region-body";
    dialog.functionIntro.appendChild(body);

    const sections = collectFunctionIntroSections(entry);
    if (sections.length === 0) {
      body.appendChild(createEmpty(copy.atlasNoFunctionIntro));
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
      body.appendChild(block);
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

  function createAtlasPreviewNode(entry, options = {}) {
    const exampleAttributes = options.attributes || {};
    const params = Object.entries(entry?.mainline?.params || {});
    const knownParamKeys = new Set(params.map(([key]) => key));
    const fields = params.map(([key, param]) => ({
      key,
      value: exampleAttributes[key] ?? formatParamValue(key, param),
      role: normalizeParamRole(param.role),
      editableKey: false,
      editableValue: true,
      removable: false,
      required: Boolean(param.required),
      source: "model"
    }));
    Object.entries(exampleAttributes).forEach(([key, value]) => {
      if (knownParamKeys.has(key)) {
        return;
      }
      fields.push({
        key,
        value: String(value ?? ""),
        role: "param",
        editableKey: false,
        editableValue: true,
        removable: false,
        required: false,
        source: "model"
      });
    });
    const attributes = Object.fromEntries(fields.map((field) => [field.key, field.value || ""]));
    const category = entry.category || "Action";
    const kind = state.selectedKey || entry.title || "";

    return {
      nodePath: options.nodePath || "0",
      uid: 0,
      title: kind,
      instanceName: "",
      kind,
      category,
      targetTreeId: "",
      description: options.description || entry.description || "",
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
      children: options.children || [],
      sourceTreeId: "__node_atlas__",
      renderPath: `__node_atlas__::${options.nodePath || "0"}::${kind}`
    };
  }

  function createAtlasUsageFlowRoot(entry) {
    const usageFlow = getPrimaryUsageFlow(entry);
    if (usageFlow?.tree) {
      const root = createAtlasUsageNodeFromTree(usageFlow.tree, entry);
      assignAtlasNodePaths(root);
      return root;
    }
    return createGeneratedAtlasUsageFlowRoot(entry);
  }

  function createAtlasUsageNodeFromTree(tree, selectedEntry) {
    const tagName = String(tree?.tagName || tree?.kind || "Action");
    const attributes = sanitizeExampleAttributes(tree?.attributes);
    const children = Array.isArray(tree?.children)
      ? tree.children.filter((child) => child && typeof child === "object" && !Array.isArray(child))
      : [];
    const node = tagName === state.selectedKey
      ? createAtlasPreviewNode(selectedEntry, {
        attributes,
        description: tree.description || selectedEntry.description || "",
        nodePath: "0"
      })
      : createAtlasFlowNode({
        title: tagName,
        kind: tagName,
        category: inferAtlasUsageCategory(tagName),
        description: tree?.description || "",
        attributes
      });
    node.children = children.map((child) => createAtlasUsageNodeFromTree(child, selectedEntry));
    return node;
  }

  function getPrimaryUsageFlow(entry) {
    const flows = Array.isArray(entry?.usageFlows) ? entry.usageFlows : [];
    return flows.find((flow) => flow && typeof flow === "object" && !Array.isArray(flow) && flow.tree) || null;
  }

  function createGeneratedAtlasUsageFlowRoot(entry) {
    const copy = runtime.i18n.getCatalogCopy();
    const example = getPrimaryUsageExample(entry);
    const selected = createAtlasPreviewNode(entry, {
      attributes: example.attributes,
      description: example.title || entry.description || "",
      nodePath: "0"
    });
    const category = String(selected.category || "").toLowerCase();

    if (category === "decorator") {
      selected.children = [createAtlasFlowNode({
        title: copy.atlasFlowDecoratedActionTitle,
        kind: "AlwaysSuccess",
        category: "Action",
        description: copy.atlasFlowDecoratedActionDescription
      })];
      assignAtlasNodePaths(selected);
      return selected;
    }

    if (category === "control") {
      selected.children = [
        createAtlasFlowNode({
          title: copy.atlasFlowConditionTitle,
          kind: "ScriptCondition",
          category: "Condition",
          description: copy.atlasFlowConditionDescription
        }),
        createAtlasFlowNode({
          title: copy.atlasFlowActionTitle,
          kind: "AlwaysSuccess",
          category: "Action",
          description: copy.atlasFlowActionDescription
        })
      ];
      assignAtlasNodePaths(selected);
      return selected;
    }

    const root = createAtlasFlowNode({
      title: copy.atlasFlowRootTitle,
      kind: "Sequence",
      category: "Control",
      description: copy.atlasFlowRootDescription,
      children: [
        createAtlasFlowNode({
          title: copy.atlasFlowConditionTitle,
          kind: "ScriptCondition",
          category: "Condition",
          description: copy.atlasFlowConditionDescription
        }),
        selected
      ]
    });
    assignAtlasNodePaths(root);
    return root;
  }

  function createAtlasFlowNode(options = {}) {
    const attributes = sanitizeExampleAttributes(options.attributes);
    const fields = Object.entries(attributes).map(([key, value]) => ({
      key,
      value,
      role: "param",
      editableKey: false,
      editableValue: true,
      removable: false,
      required: false,
      source: "extra"
    }));
    return {
      nodePath: options.nodePath || "0",
      title: options.title || options.kind || "",
      instanceName: "",
      kind: options.kind || options.title || "",
      category: options.category || "Action",
      targetTreeId: "",
      description: options.description || "",
      code: "",
      summary: "",
      attributes,
      ioGroups: { inputs: [], outputs: [], params: fields },
      attributeFields: fields,
      editorFields: fields,
      modelKind: options.category || "Action",
      warningCount: 0,
      hasError: false,
      warnings: [],
      children: options.children || [],
      sourceTreeId: "__node_atlas__",
      renderPath: `__node_atlas__::${options.kind || options.title || ""}`
    };
  }

  function assignAtlasNodePaths(node, path = "0") {
    node.nodePath = path;
    node.sourceTreeId = "__node_atlas__";
    node.renderPath = `__node_atlas__::${path}::${node.kind || node.title || ""}`;
    (node.children || []).forEach((child, index) => {
      assignAtlasNodePaths(child, `${path}.${index}`);
    });
  }

  function getPrimaryUsageExample(entry) {
    const examples = Array.isArray(entry?.mainline?.examples) ? entry.mainline.examples : [];
    const firstObjectExample = examples.find((example) => example && typeof example === "object" && !Array.isArray(example));
    if (!firstObjectExample) {
      return { title: "", attributes: {} };
    }
    return {
      title: typeof firstObjectExample.title === "string" ? firstObjectExample.title : "",
      attributes: sanitizeExampleAttributes(firstObjectExample.attributes)
    };
  }

  function sanitizeExampleAttributes(attributes) {
    if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
      return {};
    }
    return Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, String(value ?? "")]));
  }

  function inferAtlasUsageCategory(tagName) {
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

  function normalizeParamRole(role) {
    return ["input", "output", "inout", "param"].includes(role) ? role : "param";
  }

  function formatParamValue(key, param) {
    const value = param.default || "";
    if (value) {
      return value;
    }
    return key ? `{${key}}` : (param.required ? "required" : "");
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
    return value.map(formatIntroListItem).filter(Boolean);
  }

  function formatIntroListItem(item) {
    if (typeof item === "string") {
      return item.trim();
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return String(item || "").trim();
    }

    const title = typeof item.title === "string" ? item.title.trim() : "";
    const message = typeof item.message === "string" ? item.message.trim() : "";
    const description = typeof item.description === "string" ? item.description.trim() : "";
    const attributes = sanitizeExampleAttributes(item.attributes);
    const attributeText = Object.entries(attributes)
      .map(([key, value]) => `${key}: ${value}`)
      .join(" / ");
    return [title, message || description, attributeText].filter(Boolean).join(" - ");
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
