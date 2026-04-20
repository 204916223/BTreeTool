(function () {
  const vscode = acquireVsCodeApi();
  const persistedState = vscode.getState() || {};
  let selectedTreeId = persistedState.selectedTreeId || null;
  let selectedNodePath = persistedState.selectedNodePath || "0";
  let showCatalog = persistedState.showCatalog || false;
  let showInspector = persistedState.showInspector || false;
  let simplifyTreeFlow = persistedState.simplifyTreeFlow || false;
  let catalogWidth = clampNumber(persistedState.catalogWidth, 220, 460, 280);
  let inspectorWidth = clampNumber(persistedState.inspectorWidth, 260, 520, 320);
  let currentFileName = "No active document";

  const treeSwitcher = document.getElementById("tree-switcher");
  const warningList = document.getElementById("warning-list");
  const fileLabel = document.getElementById("file-label");
  const treeWorkspace = document.querySelector(".tree-workspace");
  const treeRoot = document.getElementById("tree-root");
  const catalogPanel = document.getElementById("catalog-panel");
  const catalogList = document.getElementById("catalog-list");
  const catalogSearchInput = document.getElementById("catalog-search");
  const editNodeDefinitionsButton = document.getElementById("edit-node-definitions");
  const catalogResizer = document.getElementById("catalog-resizer");
  const toggleCatalogButton = document.getElementById("toggle-catalog");
  const toggleInspectorButton = document.getElementById("toggle-inspector");
  const toggleSimplifyButton = document.getElementById("toggle-simplify");
  const zoomLevelLabel = document.getElementById("zoom-level");
  const inspectorPanel = document.getElementById("inspector-panel");
  const inspectorTitle = document.getElementById("inspector-title");
  const inspectorKind = document.getElementById("inspector-kind");
  const inspectorSummary = document.getElementById("inspector-summary");
  const inspectorStatus = document.getElementById("inspector-status");
  const inspectorWarnings = document.getElementById("inspector-warnings");
  const attributeList = document.getElementById("attribute-list");
  const applyAttributesButton = document.getElementById("apply-attributes");
  const inspectorResizer = document.getElementById("inspector-resizer");
  const nodeContextMenu = createNodeContextMenu();
  const deleteConfirmBar = createDeleteConfirmBar();
  const nodePicker = createNodePicker();

  let currentCanvasState = null;
  let currentPreview = null;
  let currentCatalogGroups = [];
  let currentZoom = 1;
  let suppressNodeClickUntil = 0;
  let isSpacePressed = false;
  let currentDragState = null;
  const MIN_ZOOM = 0.45;
  const MAX_ZOOM = 1.8;

  window.addEventListener("message", (event) => {
    const message = event.data;

    if (message?.type === "btreeDocument") {
      render(message.payload);
      return;
    }

    if (message?.type === "editResult") {
      renderInspectorStatus(message.payload?.message || "Node edit finished.", message.payload?.ok ? "success" : "error");
      return;
    }
  });

  vscode.postMessage({ type: "ready" });
  document.body.appendChild(nodeContextMenu.element);
  document.body.appendChild(deleteConfirmBar.element);
  document.body.appendChild(nodePicker.element);

  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space") {
      return;
    }

    if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) {
      return;
    }

    isSpacePressed = true;
    syncCanvasInteractionMode();
    event.preventDefault();
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      isSpacePressed = false;
      syncCanvasInteractionMode();
      event.preventDefault();
    }
  });

  window.addEventListener("blur", () => {
    isSpacePressed = false;
    syncCanvasInteractionMode();
    hideNodeContextMenu();
  });
  window.addEventListener("click", () => {
    hideNodeContextMenu();
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape") {
      hideNodeContextMenu();
      hideDeleteConfirm();
      hideNodePicker();
    }
  });
  enableCatalogDeleteTarget();

  toggleCatalogButton?.addEventListener("click", () => {
    showCatalog = !showCatalog;
    persistUiState();
    applyWorkspacePanels();
  });
  toggleInspectorButton?.addEventListener("click", () => {
    showInspector = !showInspector;
    persistUiState();
    applyWorkspacePanels();
  });
  toggleSimplifyButton?.addEventListener("click", () => {
    simplifyTreeFlow = !simplifyTreeFlow;
    persistUiState();
    if (currentPreview) {
      renderCurrentTree(currentPreview);
    }
  });
  editNodeDefinitionsButton?.addEventListener("click", () => {
    vscode.postMessage({ type: "revealTreeNodesModel" });
  });
  catalogSearchInput?.addEventListener("input", () => {
    renderCatalog(currentCatalogGroups);
  });
  applyAttributesButton?.addEventListener("click", () => {
    applyAttributeChanges();
  });
  enablePanelResize(catalogResizer, "catalog");
  enablePanelResize(inspectorResizer, "inspector");
  enableHorizontalWheelScroll(treeSwitcher);
  enableHorizontalWheelScroll(warningList);

  updateZoomLabel();
  applyWorkspacePanels();

  function render(payload) {
    hideDeleteConfirm();
    hideNodePicker();

    if (!payload.hasDocument) {
      currentFileName = "No active document";
      currentPreview = null;
      currentCanvasState = null;
      currentZoom = 1;
      updateZoomLabel();
      treeSwitcher.replaceChildren();
      warningList.replaceChildren();
      catalogList.replaceChildren();
      if (fileLabel) {
        fileLabel.textContent = currentFileName;
      }
      treeRoot.replaceChildren(emptyState("Open a BehaviorTree XML file to see a parsed outline here."));
      renderInspectorEmpty("No node selected", "Select a node in the canvas to inspect and edit its XML attributes.");
      return;
    }

    if (payload.parseError) {
      currentFileName = toBaseName(payload.fileName);
      currentPreview = null;
      treeSwitcher.replaceChildren();
      renderWarnings([{ severity: "error", message: payload.parseError }]);
      catalogList.replaceChildren();
      if (fileLabel) {
        fileLabel.textContent = currentFileName;
      }
      treeRoot.replaceChildren(emptyState(`XML parse failed: ${payload.parseError}`));
      renderInspectorEmpty("Unavailable", "Fix the XML parse error before editing node attributes.");
      return;
    }

    const result = payload.preview;
    if (!result) {
      currentFileName = toBaseName(payload.fileName);
      currentPreview = null;
      currentCatalogGroups = [];
      treeSwitcher.replaceChildren();
      warningList.replaceChildren();
      catalogList.replaceChildren();
      if (fileLabel) {
        fileLabel.textContent = currentFileName;
      }
      treeRoot.replaceChildren(emptyState("No preview data is available for this file."));
      renderInspectorEmpty("Unavailable", "No preview data is available for this file.");
      return;
    }

    const hadViewport = Boolean(currentCanvasState);
    currentFileName = toBaseName(payload.fileName);
    currentPreview = result;
    currentCatalogGroups = result.catalog || [];

    renderWarnings(result.warnings);
    renderCatalog(currentCatalogGroups);

    if (result.warnings.some((warning) => warning.code === "empty_document")) {
      currentCanvasState = null;
      currentZoom = 1;
      updateZoomLabel();
      treeSwitcher.replaceChildren();
      if (fileLabel) {
        fileLabel.textContent = currentFileName;
      }
      treeRoot.replaceChildren(emptyState("This file is empty. Add a <root> element and at least one <BehaviorTree> to visualize it."));
      renderInspectorEmpty("Unavailable", "The current XML file is empty.");
      return;
    }

    if (result.behaviorTrees.length === 0) {
      currentCanvasState = null;
      currentZoom = 1;
      updateZoomLabel();
      treeSwitcher.replaceChildren();
      if (fileLabel) {
        fileLabel.textContent = currentFileName;
      }
      treeRoot.replaceChildren(
        emptyState("The file is valid XML, but no <BehaviorTree> nodes were found yet.")
      );
      renderInspectorEmpty("Unavailable", "No BehaviorTree nodes were found in this XML file.");
      return;
    }

    selectedTreeId = pickTreeId(result);
    renderCurrentTree(result, { preserveViewport: hadViewport });
  }

  function toBaseName(fileName) {
    if (!fileName || fileName === "No active document") {
      return "No active document";
    }

    const normalized = fileName.replace(/\\/g, "/");
    const segments = normalized.split("/");
    return segments[segments.length - 1] || fileName;
  }

  function getNodeRole(kind, childCount) {
    const controlKinds = new Set([
      "Sequence",
      "SequenceWithMemory",
      "ReactiveSequence",
      "Fallback",
      "Parallel",
      "IfThenElse",
      "WhileDoElse",
      "Switch"
    ]);

    const decoratorKinds = new Set([
      "RetryUntilSuccessful",
      "RetryUntilFailure",
      "Repeat",
      "Inverter",
      "Precondition",
      "ForceSuccess",
      "ForceFailure",
      "Timeout",
      "Delay"
    ]);

    if (kind === "SubTree") {
      return "subtree";
    }

    if (controlKinds.has(kind) || childCount > 1) {
      return "control";
    }

    if (decoratorKinds.has(kind) || childCount === 1) {
      return "decorator";
    }

    return "action";
  }

  function pickTreeId(result) {
    if (selectedTreeId && getTreeMap(result).has(selectedTreeId)) {
      return selectedTreeId;
    }

    return result.defaultTreeId;
  }

  function persistUiState() {
    vscode.setState({
      selectedTreeId,
      selectedNodePath,
      showCatalog,
      showInspector,
      simplifyTreeFlow,
      catalogWidth,
      inspectorWidth
    });
  }

  function applyWorkspacePanels() {
    if (catalogPanel) {
      catalogPanel.hidden = !showCatalog;
    }

    if (catalogResizer) {
      catalogResizer.hidden = !showCatalog;
    }

    if (inspectorPanel) {
      inspectorPanel.hidden = !showInspector;
    }

    if (inspectorResizer) {
      inspectorResizer.hidden = !showInspector;
    }

    if (treeWorkspace) {
      treeWorkspace.style.setProperty("--catalog-width", `${catalogWidth}px`);
      treeWorkspace.style.setProperty("--inspector-width", `${inspectorWidth}px`);
      treeWorkspace.classList.toggle("show-catalog", showCatalog);
      treeWorkspace.classList.toggle("show-inspector", showInspector);
    }

    if (toggleCatalogButton) {
      toggleCatalogButton.classList.toggle("is-active", showCatalog);
    }

    if (toggleInspectorButton) {
      toggleInspectorButton.classList.toggle("is-active", showInspector);
    }

    if (toggleSimplifyButton) {
      toggleSimplifyButton.classList.toggle("is-active", simplifyTreeFlow);
    }

    if (currentCanvasState) {
      requestAnimationFrame(() => {
        fitCanvas();
      });
    }
  }

  function getSelectedTree(result) {
    return getTreeMap(result).get(selectedTreeId) || null;
  }

  function pickNodePath(tree) {
    if (!tree?.node) {
      return "0";
    }

    if (selectedNodePath && findNodeByPath(tree.node, selectedNodePath)) {
      return selectedNodePath;
    }

    return "0";
  }

  function findNodeByPath(rootNode, nodePath) {
    const parts = String(nodePath || "").split(".");

    if (parts.length === 0 || parts[0] !== "0") {
      return null;
    }

    let currentNode = rootNode;

    for (const part of parts.slice(1)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= currentNode.children.length) {
        return null;
      }
      currentNode = currentNode.children[index];
    }

    return currentNode;
  }

  function renderTreeSwitcher(result) {
    const fragment = document.createDocumentFragment();

    result.behaviorTrees.forEach((tree) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = tree.id === selectedTreeId ? "tree-tab is-active" : "tree-tab";
      button.textContent = tree.id;
      button.addEventListener("click", () => {
        selectedTreeId = tree.id;
        selectedNodePath = "0";
        persistUiState();
        renderCurrentTree(result);
      });
      fragment.appendChild(button);
    });

    treeSwitcher.replaceChildren(fragment);
  }

  function renderCurrentTree(result, options = {}) {
    const preserveViewport = Boolean(options.preserveViewport && currentCanvasState);
    const viewportState = preserveViewport
      ? {
          zoom: currentZoom,
          panX: currentCanvasState.panX,
          panY: currentCanvasState.panY
        }
      : null;

    renderTreeSwitcher(result);

    const selectedTree = getSelectedTree(result);
    if (!selectedTree) {
      if (fileLabel) {
        fileLabel.textContent = currentFileName;
      }
      treeRoot.replaceChildren(emptyState("The selected tree could not be found in this document."));
      renderInspectorEmpty("Unavailable", "The selected tree could not be found in this document.");
      return;
    }

    selectedNodePath = pickNodePath(selectedTree);
    persistUiState();

    if (fileLabel) {
      fileLabel.textContent = currentFileName;
    }

    treeRoot.replaceChildren(renderTree(selectedTree, result, viewportState));
    clearDragState();
    renderInspector();
  }

  function renderCatalog(groups) {
    if (!catalogList) {
      return;
    }

    const filteredGroups = filterCatalogGroups(groups, catalogSearchInput?.value || "");

    if (!filteredGroups || filteredGroups.length === 0) {
      const query = (catalogSearchInput?.value || "").trim();
      const message = query
        ? `No nodes matched "${query}".`
        : "No node definitions are available for this XML file yet.";
      catalogList.replaceChildren(emptyState(message));
      return;
    }

    if (!groups || groups.length === 0) {
      catalogList.replaceChildren(emptyState("No node definitions are available for this XML file yet."));
      return;
    }

    const fragment = document.createDocumentFragment();

    filteredGroups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "catalog-group";

      const title = document.createElement("h3");
      title.className = "catalog-group-title";
      title.textContent = group.category;
      section.appendChild(title);

      const list = document.createElement("div");
      list.className = "catalog-items";

      group.items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "catalog-item";
        row.textContent = item.title;
        row.title = `${item.category}: ${item.title}`;
        row.draggable = true;
        row.addEventListener("dragstart", (event) => {
          if (!selectedTreeId) {
            event.preventDefault();
            return;
          }

          currentDragState = {
            kind: "create",
            treeId: selectedTreeId,
            nodeKey: item.key,
            nodeCategory: item.category
          };
          document.body.classList.add("is-reordering-nodes");
          row.classList.add("is-dragging-palette");
          event.dataTransfer.effectAllowed = "copyMove";
          event.dataTransfer.setData("text/plain", item.key);
        });
        row.addEventListener("dragend", () => {
          clearDragState();
        });
        list.appendChild(row);
      });

      section.appendChild(list);
      fragment.appendChild(section);
    });

    catalogList.replaceChildren(fragment);
  }

  function filterCatalogGroups(groups, query) {
    if (!groups || groups.length === 0) {
      return [];
    }

    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) {
      return groups;
    }

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const haystack = `${item.title} ${item.key} ${item.category}`.toLowerCase();
          return haystack.includes(normalized);
        })
      }))
      .filter((group) => group.items.length > 0);
  }

  function renderInspector() {
    if (!currentPreview) {
      renderInspectorEmpty("No node selected", "Select a node in the canvas to inspect and edit its XML attributes.");
      return;
    }

    const selectedTree = getSelectedTree(currentPreview);
    const selectedNode = selectedTree ? findNodeByPath(selectedTree.node, selectedNodePath) : null;

    if (!selectedTree || !selectedNode) {
      renderInspectorEmpty("Unavailable", "The selected node could not be resolved in the current tree.");
      return;
    }

    inspectorTitle.textContent = selectedNode.title;
    inspectorKind.textContent = selectedNode.kind;
    inspectorSummary.textContent =
      selectedNode.kind === "SubTree"
        ? `This SubTree node is a jump reference to ${selectedNode.targetTreeId || "another tree"}. Open that tree and edit its internal nodes there.`
        : selectedNode.description
          ? selectedNode.description
        : selectedNode.summary
          ? selectedNode.summary
          : "Edit the XML attributes below. Saving will rewrite this file using BTreeTool's normalized format.";
    renderInspectorStatus("", "info");
    renderInspectorWarnings(selectedNode.warnings);
    renderAttributeRowsFromNode(selectedNode);
    setInspectorButtonsDisabled(!hasEditableInspectorFields(selectedNode));
  }

  function renderInspectorEmpty(title, summary) {
    inspectorTitle.textContent = title;
    inspectorKind.textContent = "none";
    inspectorSummary.textContent = summary;
    renderInspectorStatus("", "info");
    renderInspectorWarnings([]);
    attributeList.replaceChildren();
    setInspectorButtonsDisabled(true);
  }

  function renderInspectorWarnings(warnings) {
    if (!warnings || warnings.length === 0) {
      inspectorWarnings.replaceChildren();
      return;
    }

    const fragment = document.createDocumentFragment();

    warnings.forEach((warning) => {
      const item = document.createElement("div");
      item.className = `inspector-warning inspector-warning-${warning.severity || "warning"}`;
      item.textContent = warning.message;
      fragment.appendChild(item);
    });

    inspectorWarnings.replaceChildren(fragment);
  }

  function renderInspectorStatus(message, tone) {
    if (!message) {
      inspectorStatus.hidden = true;
      inspectorStatus.className = "inspector-status";
      inspectorStatus.textContent = "";
      return;
    }

    inspectorStatus.hidden = false;
    inspectorStatus.className = `inspector-status is-${tone || "info"}`;
    inspectorStatus.textContent = message;
  }

  function setInspectorButtonsDisabled(disabled) {
    applyAttributesButton.disabled = disabled;
  }

  function hasEditableInspectorFields(node) {
    return (node?.inspectorFields || []).some(
      (field) => field.editableKey || field.editableValue
    );
  }

  function renderAttributeRowsFromNode(node) {
    attributeList.replaceChildren();

    node.inspectorFields.forEach((field) => {
      appendAttributeRow(field);
    });
  }

  function appendAttributeRow(field) {
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
    keyInput.placeholder = "attribute";
    keyInput.value = field.key || "";
    keyInput.readOnly = !field.editableKey;
    keyInput.disabled = !field.editableKey;

    const valueInput = document.createElement("input");
    valueInput.className = "attribute-input attribute-value";
    valueInput.type = "text";
    valueInput.placeholder = "value";
    valueInput.value = field.value || "";
    valueInput.readOnly = !field.editableValue;
    valueInput.disabled = !field.editableValue;

    row.appendChild(roleBadge);
    row.appendChild(keyInput);
    row.appendChild(valueInput);
    attributeList.appendChild(row);
  }

  function applyAttributeChanges() {
    if (!currentPreview) {
      return;
    }

    const selectedTree = getSelectedTree(currentPreview);
    const selectedNode = selectedTree ? findNodeByPath(selectedTree.node, selectedNodePath) : null;
    if (!selectedTree) {
      renderInspectorStatus("The selected tree is no longer available.", "error");
      return;
    }

    if (!selectedNode || !hasEditableInspectorFields(selectedNode)) {
      renderInspectorStatus("This node is read-only here. Open the target SubTree to edit its contents.", "info");
      return;
    }

    const rows = Array.from(attributeList.querySelectorAll(".attribute-row"));
    const attributes = {};

    for (const row of rows) {
      const keyInput = row.querySelector(".attribute-key");
      const valueInput = row.querySelector(".attribute-value");
      const key = keyInput?.value.trim() || "";
      const value = valueInput?.value || "";
      const required = row.dataset.required === "true";

      if (!key) {
        if (value) {
          renderInspectorStatus("Every attribute value needs a non-empty key.", "error");
          return;
        }
        continue;
      }

      if (required && !value) {
        renderInspectorStatus(`Attribute "${key}" requires a value.`, "error");
        return;
      }

      if (Object.prototype.hasOwnProperty.call(attributes, key)) {
        renderInspectorStatus(`Attribute "${key}" is duplicated in the inspector.`, "error");
        return;
      }

      if (!value && !required) {
        continue;
      }

      attributes[key] = value;
    }

    renderInspectorStatus("Applying node attributes...", "info");
    vscode.postMessage({
      type: "updateNodeAttributes",
      payload: {
        treeId: selectedTree.id,
        nodePath: selectedNodePath,
        attributes
      }
    });
  }

  function enablePanelResize(handle, side) {
    if (!handle || !treeWorkspace) {
      return;
    }

    handle.addEventListener("pointerdown", (event) => {
      if ((side === "catalog" && !showCatalog) || (side === "inspector" && !showInspector)) {
        return;
      }

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startCatalogWidth = catalogWidth;
      const startInspectorWidth = inspectorWidth;

      handle.setPointerCapture(pointerId);
      document.body.classList.add("is-resizing-panels");

      const onPointerMove = (moveEvent) => {
        const deltaX = moveEvent.clientX - startX;

        if (side === "catalog") {
          catalogWidth = clampNumber(startCatalogWidth + deltaX, 220, 460, startCatalogWidth);
        } else {
          inspectorWidth = clampNumber(startInspectorWidth - deltaX, 260, 520, startInspectorWidth);
        }

        persistUiState();
        applyWorkspacePanels();
      };

      const finishResize = () => {
        document.body.classList.remove("is-resizing-panels");
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerUp);
        handle.removeEventListener("pointercancel", onPointerCancel);
        try {
          handle.releasePointerCapture(pointerId);
        } catch (_error) {
          // Ignore stale pointer capture state.
        }
      };

      const onPointerUp = () => {
        finishResize();
      };

      const onPointerCancel = () => {
        finishResize();
      };

      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
      handle.addEventListener("pointercancel", onPointerCancel);
    });
  }

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, numeric));
  }

  function enableHorizontalWheelScroll(element) {
    if (!element) {
      return;
    }

    element.addEventListener(
      "wheel",
      (event) => {
        const canScroll = element.scrollWidth > element.clientWidth + 2;
        if (!canScroll) {
          return;
        }

        const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
        if (!delta) {
          return;
        }

        element.scrollLeft += delta;
        event.preventDefault();
      },
      { passive: false }
    );

    let dragging = false;
    let startX = 0;
    let startScrollLeft = 0;

    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) {
        return;
      }

      dragging = true;
      startX = event.clientX;
      startScrollLeft = element.scrollLeft;
      element.classList.add("is-drag-scrolling");
      element.setPointerCapture(event.pointerId);
    });

    element.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }

      const deltaX = event.clientX - startX;
      element.scrollLeft = startScrollLeft - deltaX;
    });

    const stopDragging = (event) => {
      if (!dragging) {
        return;
      }

      dragging = false;
      element.classList.remove("is-drag-scrolling");
      try {
        element.releasePointerCapture(event.pointerId);
      } catch (_error) {
        // Ignore stale pointer capture state.
      }
    };

    element.addEventListener("pointerup", stopDragging);
    element.addEventListener("pointercancel", stopDragging);
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

  function renderTree(tree, result, viewportState = null) {
    const section = document.createElement("section");
    section.className = "tree-section";
    section.appendChild(renderCanvasTree(tree.node, result, viewportState));
    return section;
  }

  function renderCanvasTree(rootNode, result, viewportState = null) {
    const layout = buildTreeLayout(rootNode);
    const shell = document.createElement("div");
    shell.className = "canvas-shell";

    const stage = document.createElement("div");
    stage.className = "canvas-stage";
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
      const midY = edge.startY + (edge.endY - edge.startY) / 2;
      path.setAttribute(
        "d",
        `M ${edge.startX} ${edge.startY} C ${edge.startX} ${midY}, ${edge.endX} ${midY}, ${edge.endX} ${edge.endY}`
      );
      path.setAttribute("class", "canvas-edge-path");
      svg.appendChild(path);
    });

    const nodesLayer = document.createElement("div");
    nodesLayer.className = "canvas-nodes";

    layout.nodes.forEach((entry) => {
      nodesLayer.appendChild(renderCanvasNode(entry, result));
    });

    stage.appendChild(svg);
    stage.appendChild(nodesLayer);
    shell.appendChild(stage);

    enableCanvasPan(shell);

    currentCanvasState = { shell, stage, layout, panX: 0, panY: 0 };
    syncCanvasInteractionMode();
    currentZoom = viewportState?.zoom || 1;
    updateZoomLabel();

    requestAnimationFrame(() => {
      if (viewportState) {
        setCanvasPan(viewportState.panX, viewportState.panY);
        return;
      }

      fitCanvas();
    });

    return shell;
  }

  function buildTreeLayout(rootNode) {
    const config = {
      horizontalGap: 28,
      verticalGap: 72,
      paddingX: 90,
      paddingY: 36
    };

    const measured = measureSubtree(rootNode);
    const positioned = positionSubtree(measured, config.paddingX, config.paddingY);
    const nodes = [];
    const edges = [];
    let maxX = 0;
    let maxY = 0;

    collect(positioned);

    const width = Math.max(maxX + config.paddingX, 900);
    const height = Math.max(maxY + config.paddingY, 640);

    return {
      width,
      height,
      rootCenterX: nodes[0]?.centerX || width / 2,
      nodes,
      edges
    };

    function measureSubtree(node) {
      const box = measureNodeBox(node);
      const children = node.children.map(measureSubtree);

      if (children.length === 0) {
        return {
          node,
          width: box.width,
          height: box.height,
          subtreeWidth: box.width,
          subtreeHeight: box.height,
          children
        };
      }

      const childrenWidth =
        children.reduce((sum, child) => sum + child.subtreeWidth, 0) +
        config.horizontalGap * Math.max(0, children.length - 1);
      const maxChildrenHeight = Math.max(...children.map((child) => child.subtreeHeight));

      return {
        node,
        width: box.width,
        height: box.height,
        children,
        subtreeWidth: Math.max(box.width, childrenWidth),
        subtreeHeight: box.height + config.verticalGap + maxChildrenHeight
      };
    }

    function positionSubtree(entry, offsetX, offsetY) {
      const positionedChildren = [];
      const children = entry.children;

      const nodeX = offsetX + (entry.subtreeWidth - entry.width) / 2;
      const nodeY = offsetY;

      if (children.length > 0) {
        let childCursorX =
          offsetX +
          (entry.subtreeWidth -
            (children.reduce((sum, child) => sum + child.subtreeWidth, 0) +
              config.horizontalGap * Math.max(0, children.length - 1))) /
            2;
        const childY = offsetY + entry.height + config.verticalGap;

        children.forEach((child) => {
          const positionedChild = positionSubtree(child, childCursorX, childY);
          positionedChildren.push(positionedChild);
          childCursorX += child.subtreeWidth + config.horizontalGap;
        });
      }

      return {
        node: entry.node,
        x: nodeX,
        y: nodeY,
        width: entry.width,
        height: entry.height,
        children: positionedChildren
      };
    }

    function collect(entry, parent) {
      const descriptor = {
        node: entry.node,
        x: entry.x,
        y: entry.y,
        width: entry.width,
        height: entry.height,
        centerX: entry.x + entry.width / 2
      };

      nodes.push(descriptor);
      maxX = Math.max(maxX, descriptor.x + descriptor.width);
      maxY = Math.max(maxY, descriptor.y + descriptor.height);

      if (parent) {
        edges.push({
          startX: parent.centerX,
          startY: parent.y + parent.height,
          endX: descriptor.centerX,
          endY: descriptor.y
        });
      }

      entry.children.forEach((child) => collect(child, descriptor));
    }
  }

  function measureNodeBox(node) {
    const role = getNodeRole(node.kind, node.children.length);
    const appendable = !simplifyTreeFlow && (role === "control" || (role === "decorator" && node.children.length === 0));
    const compact =
      simplifyTreeFlow &&
      role === "action" &&
      !node.description &&
      !node.code &&
      node.ioGroups.inputs.length === 0 &&
      node.ioGroups.outputs.length === 0 &&
      node.ioGroups.params.length === 0;
    const candidates = [
      textWidth(node.title, 8.8) + 68,
      textWidth(getNodeBadge(node), 6.4) + 34
    ];

    if (node.description) {
      candidates.push(textWidth(node.description, 6.2) + 34);
    }

    if (!simplifyTreeFlow && node.code) {
      candidates.push(textWidth(node.code, 6.1) + 34);
    }

    if (!simplifyTreeFlow) {
      [...node.ioGroups.inputs, ...node.ioGroups.outputs, ...node.ioGroups.params].forEach(({ key, value }) => {
        candidates.push(measureAttributePairWidth(key, value));
      });
    }

    const width = clamp(
      Math.max(...candidates),
      compact ? 180 : simplifyTreeFlow ? 220 : 240,
      simplifyTreeFlow ? 340 : 400
    );

    let height = compact ? 72 : 80;
    height += measureDescriptionHeight(node.description, width);

    if (!simplifyTreeFlow && node.code) {
      height += measureTextBlockHeight(node.code, width, 4);
    }

    if (!simplifyTreeFlow) {
      height += measureIoHeight(node.ioGroups.inputs, width);
      height += measureIoHeight(node.ioGroups.outputs, width);
      height += measureIoHeight(node.ioGroups.params, width);
    }

    if (!simplifyTreeFlow && node.kind === "SubTree" && node.targetTreeId) {
      height += 34;
    }

    return {
      width,
      height: Math.max(height + 8, compact ? 72 : appendable ? 152 : 110)
    };
  }

  function measureIoHeight(entries, width) {
    if (!entries || entries.length === 0) {
      return 0;
    }

    return 20 + entries.length * 31;
  }

  function measureDescriptionHeight(text, width) {
    return measureTextBlockHeight(text, width, 4, true);
  }

  function measureTextBlockHeight(text, width, maxLines, alwaysVisible = false) {
    const bodyWidth = width - 34;
    const charsPerLine = Math.max(12, Math.floor(bodyWidth / 6.4));
    const lines = text ? Math.min(maxLines, Math.ceil(text.length / charsPerLine)) : 1;
    const bodyHeight = Math.max(alwaysVisible ? 34 : 30, lines * 16 + 12);
    return 22 + bodyHeight;
  }

  function textWidth(text, glyphWidth) {
    return String(text || "").length * glyphWidth;
  }

  function measureAttributePairWidth(key, value) {
    return textWidth(key, 5.9) + textWidth(value, 5.9) + 46;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function renderCanvasNode(entry, result) {
    const wrapper = document.createElement("div");
    wrapper.className = "canvas-node";
    wrapper.dataset.nodePath = entry.node.nodePath;
    wrapper.style.left = `${entry.x}px`;
    wrapper.style.top = `${entry.y}px`;
    wrapper.style.width = `${entry.width}px`;
    wrapper.style.height = `${entry.height}px`;

    const card = document.createElement("div");
    const role = getNodeRole(entry.node.kind, entry.node.children.length);
    card.className = `flow-card flow-card-${role}`;
    const parentPath = getParentNodePath(entry.node.nodePath);
    const siblingIndex = getNodeIndex(entry.node.nodePath);
    const acceptsAppendDrop = canAppendChildren(entry.node);
    if (parentPath !== null) {
      card.draggable = true;
    }
    if (entry.node.nodePath === selectedNodePath) {
      card.classList.add("is-selected");
    }
    if (entry.node.warningCount > 0) {
      card.classList.add("has-warning");
    }
    if (entry.node.hasError) {
      card.classList.add("has-error");
    }
    if (entry.node.warnings.length > 0) {
      card.title = entry.node.warnings.map((warning) => warning.message).join("\n");
    }
    card.addEventListener("click", () => {
      if (Date.now() < suppressNodeClickUntil) {
        return;
      }

      hideNodeContextMenu();
      selectedNodePath = entry.node.nodePath;
      persistUiState();
      renderCurrentTree(result, { preserveViewport: true });
    });
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showNodeContextMenu(event.clientX, event.clientY, {
        treeId: selectedTreeId,
        nodePath: entry.node.nodePath,
        parentPath,
        siblingIndex,
        nodeTitle: entry.node.title,
        allowAppendChild: canAppendChildren(entry.node),
        childCount: entry.node.children.length,
        allowDelete: entry.node.nodePath !== "0"
      });
    });
    card.addEventListener("dragstart", (event) => {
      if (parentPath === null || siblingIndex === null || isSpacePressed) {
        event.preventDefault();
        return;
      }

      currentDragState = {
        kind: "move",
        treeId: selectedTreeId,
        sourceNodePath: entry.node.nodePath,
        sourceParentPath: parentPath,
        sourceIndex: siblingIndex,
        nodeTitle: entry.node.title,
        targetNodePath: null,
        targetParentPath: null,
        targetIndex: null
      };
      document.body.classList.add("is-reordering-nodes");
      card.classList.add("is-dragging-node");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", entry.node.nodePath);
    });
    card.addEventListener("dragend", () => {
      clearDragState();
    });

    const heading = document.createElement("div");
    heading.className = "flow-card-heading";

    const kind = document.createElement("span");
    kind.className = "flow-node-kind";
    kind.textContent = getNodeBadge(entry.node);

    const name = document.createElement("span");
    name.className = "flow-node-name";
    name.textContent = entry.node.title;

    heading.appendChild(kind);
    heading.appendChild(name);
    if (entry.node.warningCount > 0) {
      const warningBadge = document.createElement("span");
      warningBadge.className = entry.node.hasError ? "flow-warning-badge is-error" : "flow-warning-badge";
      warningBadge.textContent = entry.node.warningCount === 1 ? "1 issue" : `${entry.node.warningCount} issues`;
      heading.appendChild(warningBadge);
    }
    card.appendChild(heading);

    renderDescriptionSection(card, entry.node.description);

    if (!simplifyTreeFlow && entry.node.code) {
      renderTextSection(card, "Code", entry.node.code, "code");
    }

    if (!simplifyTreeFlow) {
      renderIoSection(card, "Inputs", entry.node.ioGroups.inputs, "input");
      renderIoSection(card, "Outputs", entry.node.ioGroups.outputs, "output");
      renderIoSection(card, "Params", entry.node.ioGroups.params, "param");
    }

    if (!simplifyTreeFlow && entry.node.kind === "SubTree" && entry.node.targetTreeId && getTreeMap(result).has(entry.node.targetTreeId)) {
      const jumpButton = document.createElement("button");
      jumpButton.type = "button";
      jumpButton.className = "subtree-jump";
      jumpButton.textContent = `Open ${entry.node.targetTreeId}`;
      jumpButton.addEventListener("click", (event) => {
        event.stopPropagation();
        selectedTreeId = entry.node.targetTreeId;
        selectedNodePath = "0";
        persistUiState();
        renderCurrentTree(result);
        document.querySelector(".tree-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      card.appendChild(jumpButton);
    }

    const slotOverlay = document.createElement("div");
    slotOverlay.className = "drop-slot-overlay";

    const beforeSlot = createDropSlot("Insert before", "drop-slot-before", () =>
      getSideDropTarget(entry.node.nodePath, "before")
    );
    const afterSlot = createDropSlot("Insert after", "drop-slot-after", () =>
      getSideDropTarget(entry.node.nodePath, "after")
    );
    slotOverlay.appendChild(beforeSlot);
    slotOverlay.appendChild(afterSlot);

    if (!simplifyTreeFlow && acceptsAppendDrop) {
      slotOverlay.classList.add("has-append");
      const appendSlot = createDropSlot("Append child here", "drop-slot-append", () => getAppendDropTarget(entry.node));
      slotOverlay.appendChild(appendSlot);
    }

    card.appendChild(slotOverlay);

    wrapper.appendChild(card);
    return wrapper;
  }

  function getParentNodePath(nodePath) {
    const parts = String(nodePath || "").split(".");
    if (parts.length <= 1) {
      return null;
    }

    return parts.slice(0, -1).join(".");
  }

  function getNodeIndex(nodePath) {
    const parts = String(nodePath || "").split(".");
    if (parts.length <= 1) {
      return null;
    }

    const index = Number(parts[parts.length - 1]);
    return Number.isInteger(index) ? index : null;
  }

  function getSideDropTarget(nodePath, position) {
    if (!currentDragState) {
      return null;
    }

    const parentPath = getParentNodePath(nodePath);
    const targetIndex = getNodeIndex(nodePath);
    if (parentPath === null || targetIndex === null) {
      return null;
    }

    if (parentPath === currentDragState.sourceNodePath || parentPath.startsWith(`${currentDragState.sourceNodePath}.`)) {
      return null;
    }

    return {
      nodePath,
      position,
      targetParentPath: parentPath,
      targetIndex: position === "before" ? targetIndex : targetIndex + 1
    };
  }

  function getAppendDropTarget(node) {
    if (!currentDragState) {
      return null;
    }

    const targetParentPath = node.nodePath;
    if (
      targetParentPath === currentDragState.sourceNodePath ||
      targetParentPath.startsWith(`${currentDragState.sourceNodePath}.`)
    ) {
      return null;
    }

    return {
      targetParentPath,
      targetIndex: node.children.length
    };
  }

  function normalizeDropIndex(sourceParentPath, sourceIndex, targetParentPath, targetIndex) {
    if (sourceParentPath === targetParentPath && targetIndex > sourceIndex) {
      return targetIndex - 1;
    }

    return targetIndex;
  }

  function clearDragState() {
    currentDragState = null;
    document.body.classList.remove("is-reordering-nodes");
    clearDropMarkers();
    clearCatalogDeleteTarget();
    hideNodeContextMenu();
    document.querySelectorAll(".flow-card.is-dragging-node").forEach((node) => {
      node.classList.remove("is-dragging-node");
    });
    document.querySelectorAll(".catalog-item.is-dragging-palette").forEach((node) => {
      node.classList.remove("is-dragging-palette");
    });
  }

  function clearDropMarkers() {
    document.querySelectorAll(".drop-slot.is-active").forEach((node) => {
      node.classList.remove("is-active");
    });
  }

  function applyDropMarker(nodePath, position) {
    clearDropMarkers();
    clearCatalogDeleteTarget();
    const node = document.querySelector(
      `.canvas-node[data-node-path="${CSS.escape(nodePath)}"] .drop-slot-${position}`
    );
    if (node) {
      node.classList.add("is-active");
    }
  }

  function applyAppendMarker(nodePath) {
    clearDropMarkers();
    clearCatalogDeleteTarget();
    const node = document.querySelector(
      `.canvas-node[data-node-path="${CSS.escape(nodePath)}"] .drop-slot-append`
    );
    if (node) {
      node.classList.add("is-active");
    }
  }

  function canAppendChildren(node) {
    const role = getNodeRole(node.kind, node.children.length);
    if (role === "control") {
      return true;
    }

    if (role === "decorator") {
      return node.children.length === 0;
    }

    return false;
  }

  function enableCatalogDeleteTarget() {
    if (!catalogPanel) {
      return;
    }

    catalogPanel.addEventListener("dragover", (event) => {
      if (!currentDragState || currentDragState.kind !== "move") {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      clearDropMarkers();
      catalogPanel.classList.add("is-delete-target");
    });

    catalogPanel.addEventListener("drop", (event) => {
      if (!currentDragState || currentDragState.kind !== "move") {
        return;
      }

      event.preventDefault();
      requestDeleteConfirmation({
        treeId: currentDragState.treeId,
        nodePath: currentDragState.sourceNodePath,
        parentPath: currentDragState.sourceParentPath,
        nodeTitle: currentDragState.nodeTitle
      });
      clearDragState();
    });
  }

  function clearCatalogDeleteTarget() {
    catalogPanel?.classList.remove("is-delete-target");
  }

  function createDropSlot(label, className, resolveDropTarget) {
    const slot = document.createElement("div");
    slot.className = `drop-slot ${className}`;
    slot.textContent = label;
    slot.addEventListener("dragover", (event) => {
      const dropTarget = resolveDropTarget();
      if (!dropTarget) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (className === "drop-slot-append") {
        applyAppendMarker(dropTarget.targetParentPath);
      } else {
        applyDropMarker(dropTarget.nodePath, dropTarget.position);
      }
    });
    slot.addEventListener("dragleave", (event) => {
      if (event.currentTarget !== event.target) {
        return;
      }

      clearDropMarkers();
    });
    slot.addEventListener("drop", (event) => {
      const dropTarget = resolveDropTarget();
      if (!dropTarget || !currentDragState) {
        return;
      }

      event.preventDefault();
      clearDropMarkers();
      const nextIndex = normalizeDropIndex(
        currentDragState.sourceParentPath,
        currentDragState.sourceIndex,
        dropTarget.targetParentPath,
        dropTarget.targetIndex
      );
      if (
        currentDragState.kind === "move" &&
        nextIndex === currentDragState.sourceIndex &&
        dropTarget.targetParentPath === currentDragState.sourceParentPath
      ) {
        clearDragState();
        return;
      }

      selectedNodePath = `${dropTarget.targetParentPath}.${nextIndex}`;
      persistUiState();
      if (currentDragState.kind === "create") {
        vscode.postMessage({
          type: "createNode",
          payload: {
            treeId: currentDragState.treeId,
            targetParentPath: dropTarget.targetParentPath,
            targetIndex: nextIndex,
            nodeKey: currentDragState.nodeKey,
            nodeCategory: currentDragState.nodeCategory
          }
        });
      } else {
        vscode.postMessage({
          type: "moveNode",
          payload: {
            treeId: currentDragState.treeId,
            sourceNodePath: currentDragState.sourceNodePath,
            targetParentPath: dropTarget.targetParentPath,
            targetIndex: nextIndex
          }
        });
      }
      clearDragState();
    });
    return slot;
  }

  function requestDeleteConfirmation(state) {
    if (!state?.treeId || !state.nodePath) {
      return;
    }

    selectedNodePath = state.parentPath || "0";
    persistUiState();
    showDeleteConfirm(state);
  }

  function createNodeContextMenu() {
    const element = document.createElement("div");
    element.className = "node-context-menu";
    element.hidden = true;

    const addBeforeButton = document.createElement("button");
    addBeforeButton.type = "button";
    addBeforeButton.className = "node-context-menu-item";
    addBeforeButton.textContent = "Add Before";
    addBeforeButton.addEventListener("click", () => {
      const state = nodeContextMenu.state;
      if (!state || !state.parentPath || !Number.isInteger(state.siblingIndex)) {
        return;
      }

      showNodePicker({
        treeId: state.treeId,
        targetParentPath: state.parentPath,
        targetIndex: state.siblingIndex,
        title: `Add node before "${state.nodeTitle || "node"}"`
      });
      hideNodeContextMenu();
    });

    const addAfterButton = document.createElement("button");
    addAfterButton.type = "button";
    addAfterButton.className = "node-context-menu-item";
    addAfterButton.textContent = "Add After";
    addAfterButton.addEventListener("click", () => {
      const state = nodeContextMenu.state;
      if (!state || !state.parentPath || !Number.isInteger(state.siblingIndex)) {
        return;
      }

      showNodePicker({
        treeId: state.treeId,
        targetParentPath: state.parentPath,
        targetIndex: state.siblingIndex + 1,
        title: `Add node after "${state.nodeTitle || "node"}"`
      });
      hideNodeContextMenu();
    });

    const addChildButton = document.createElement("button");
    addChildButton.type = "button";
    addChildButton.className = "node-context-menu-item";
    addChildButton.textContent = "Add Child";
    addChildButton.addEventListener("click", () => {
      const state = nodeContextMenu.state;
      if (!state || !state.allowAppendChild) {
        return;
      }

      showNodePicker({
        treeId: state.treeId,
        targetParentPath: state.nodePath,
        targetIndex: state.childCount || 0,
        title: `Add child to "${state.nodeTitle || "node"}"`
      });
      hideNodeContextMenu();
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "node-context-menu-item danger";
    deleteButton.textContent = "Delete Node";
    deleteButton.addEventListener("click", () => {
      const state = nodeContextMenu.state;
      if (!state) {
        return;
      }

      requestDeleteConfirmation(state);
      hideNodeContextMenu();
    });

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

  function showNodeContextMenu(x, y, state) {
    nodeContextMenu.state = state;
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
    nodeContextMenu.state = null;
    nodeContextMenu.element.hidden = true;
  }

  function createDeleteConfirmBar() {
    const element = document.createElement("div");
    element.className = "delete-confirm";
    element.hidden = true;

    const text = document.createElement("div");
    text.className = "delete-confirm-text";

    const actions = document.createElement("div");
    actions.className = "delete-confirm-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "canvas-btn subtle";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => {
      hideDeleteConfirm();
    });

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "canvas-btn danger";
    confirmButton.textContent = "Delete";
    confirmButton.addEventListener("click", () => {
      const pending = deleteConfirmBar.state;
      if (!pending) {
        return;
      }

      vscode.postMessage({
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
      state: null
    };
  }

  function showDeleteConfirm(state) {
    const title = state.nodeTitle || "this node";
    deleteConfirmBar.state = state;
    deleteConfirmBar.text.textContent = `Delete "${title}"? This only removes the current node instance.`;
    deleteConfirmBar.element.hidden = false;
    document.body.classList.add("has-blocking-overlay");
  }

  function hideDeleteConfirm() {
    deleteConfirmBar.state = null;
    deleteConfirmBar.element.hidden = true;
    if (nodePicker.element.hidden) {
      document.body.classList.remove("has-blocking-overlay");
    }
  }

  function createNodePicker() {
    const element = document.createElement("div");
    element.className = "node-picker";
    element.hidden = true;

    const backdrop = document.createElement("div");
    backdrop.className = "node-picker-backdrop";
    backdrop.addEventListener("click", () => {
      hideNodePicker();
    });

    const dialog = document.createElement("div");
    dialog.className = "node-picker-dialog";

    const header = document.createElement("div");
    header.className = "node-picker-header";

    const title = document.createElement("strong");
    title.className = "node-picker-title";
    title.textContent = "Add node";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "canvas-btn subtle";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => {
      hideNodePicker();
    });

    header.appendChild(title);
    header.appendChild(closeButton);

    const search = document.createElement("input");
    search.className = "panel-search node-picker-search";
    search.type = "text";
    search.placeholder = "Search nodes";
    search.spellcheck = false;
    search.addEventListener("input", () => {
      renderNodePickerList();
    });

    const list = document.createElement("div");
    list.className = "node-picker-list";

    dialog.appendChild(header);
    dialog.appendChild(search);
    dialog.appendChild(list);
    element.appendChild(backdrop);
    element.appendChild(dialog);

    return {
      element,
      title,
      search,
      list,
      state: null
    };
  }

  function showNodePicker(state) {
    if (!state?.treeId || !state.targetParentPath || !Number.isInteger(state.targetIndex)) {
      return;
    }

    nodePicker.state = state;
    nodePicker.title.textContent = state.title || "Add node";
    nodePicker.search.value = "";
    renderNodePickerList();
    nodePicker.element.hidden = false;
    document.body.classList.add("has-blocking-overlay");
    requestAnimationFrame(() => {
      nodePicker.search.focus();
      nodePicker.search.select();
    });
  }

  function hideNodePicker() {
    nodePicker.state = null;
    nodePicker.element.hidden = true;
    if (deleteConfirmBar.element.hidden) {
      document.body.classList.remove("has-blocking-overlay");
    }
  }

  function renderNodePickerList() {
    const groups = filterCatalogGroups(currentCatalogGroups, nodePicker.search.value || "");
    const fragment = document.createDocumentFragment();

    if (groups.length === 0) {
      nodePicker.list.replaceChildren(emptyState("No nodes matched the current search."));
      return;
    }

    groups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "catalog-group";

      const title = document.createElement("h3");
      title.className = "catalog-group-title";
      title.textContent = group.category;
      section.appendChild(title);

      const list = document.createElement("div");
      list.className = "catalog-items";

      group.items.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "catalog-item node-picker-item";
        button.textContent = item.title;
        button.title = `${item.category}: ${item.title}`;
        button.addEventListener("click", () => {
          const state = nodePicker.state;
          if (!state) {
            return;
          }

          selectedNodePath = `${state.targetParentPath}.${state.targetIndex}`;
          persistUiState();
          vscode.postMessage({
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

  function getNodeBadge(node) {
    if (node.title === node.kind) {
      return getNodeRole(node.kind, node.children.length).toUpperCase();
    }

    if (node.modelKind) {
      return node.modelKind;
    }

    return node.kind;
  }

  function renderIoSection(card, title, entries, tone) {
    if (!entries || entries.length === 0) {
      return;
    }

    const section = document.createElement("div");
    section.className = `flow-io flow-io-${tone}`;

    const label = document.createElement("span");
    label.className = "flow-io-label";
    label.textContent = title;
    section.appendChild(label);

    const list = document.createElement("div");
    list.className = "flow-node-attributes";

    entries.forEach(({ key, value }) => {
      const pair = document.createElement("span");
      pair.className = `flow-attribute-pair tone-${tone}`;

      const keyChip = document.createElement("span");
      keyChip.className = "flow-attribute-chip flow-attribute-chip-key";
      keyChip.textContent = key;

      const valueChip = document.createElement("span");
      valueChip.className = "flow-attribute-chip flow-attribute-chip-value";
      valueChip.textContent = value;

      pair.appendChild(keyChip);
      pair.appendChild(valueChip);
      list.appendChild(pair);
    });

    section.appendChild(list);
    card.appendChild(section);
  }

  function renderDescriptionSection(card, text) {
    renderTextSection(card, "Description", text, "description", true);
  }

  function renderTextSection(card, title, text, tone, alwaysVisible = false) {
    if (!alwaysVisible && !text) {
      return;
    }

    const section = document.createElement("div");
    section.className = `flow-text flow-text-${tone}`;

    const label = document.createElement("span");
    label.className = "flow-io-label";
    label.textContent = title;
    section.appendChild(label);

    const body = document.createElement("div");
    body.className = "flow-text-body";
    if (!text) {
      body.classList.add("is-empty");
    }
    body.textContent = text || " ";
    section.appendChild(body);
    card.appendChild(section);
  }

  function enableCanvasPan(shell) {
    let dragging = false;
    let didPan = false;
    let startX = 0;
    let startY = 0;
    let initialPanX = 0;
    let initialPanY = 0;

    shell.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) {
        return;
      }

      const onNodeCard = Boolean(event.target.closest(".flow-card"));
      if (onNodeCard && !isSpacePressed) {
        return;
      }

      dragging = true;
      didPan = false;
      startX = event.clientX;
      startY = event.clientY;
      initialPanX = currentCanvasState?.panX || 0;
      initialPanY = currentCanvasState?.panY || 0;
      shell.classList.add("is-dragging");
      shell.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    shell.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      if (!didPan && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
        didPan = true;
      }

      setCanvasPan(initialPanX + deltaX, initialPanY + deltaY);
    });

    const stopDragging = () => {
      if (!dragging) {
        return;
      }

      if (didPan) {
        suppressNodeClickUntil = Date.now() + 120;
      }

      dragging = false;
      didPan = false;
      shell.classList.remove("is-dragging");
    };

    shell.addEventListener("pointerup", stopDragging);
    shell.addEventListener("pointercancel", stopDragging);

    shell.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        if (event.deltaY !== 0) {
          const delta = event.deltaY < 0 ? 0.08 : -0.08;
          zoomCanvas(delta, { originX: event.clientX, originY: event.clientY });
        }
      },
      { passive: false }
    );
  }

  function zoomCanvas(delta, origin) {
    if (!currentCanvasState) {
      return;
    }

    const nextZoom = clamp(Number((currentZoom + delta).toFixed(2)), MIN_ZOOM, MAX_ZOOM);
    applyZoom(nextZoom, true, origin);
  }

  function fitCanvas() {
    if (!currentCanvasState) {
      return;
    }

    const { shell, layout } = currentCanvasState;
    const fitX = (shell.clientWidth - 40) / layout.width;
    const fitY = (shell.clientHeight - 40) / layout.height;
    const targetZoom = clamp(Math.min(fitX, fitY, 1), MIN_ZOOM, 1);
    applyZoom(targetZoom, false);
  }

  function applyZoom(nextZoom, preserveCenter, origin) {
    if (!currentCanvasState) {
      return;
    }

    const { shell, layout } = currentCanvasState;
    const previousZoom = currentZoom;
    currentZoom = nextZoom;
    updateZoomLabel();

    if (!preserveCenter) {
      const fittedPan = getFittedPan(shell, layout, currentZoom);
      setCanvasPan(fittedPan.panX, fittedPan.panY);
      return;
    }

    const rect = shell.getBoundingClientRect();
    const pointerX = origin ? origin.originX - rect.left : shell.clientWidth / 2;
    const pointerY = origin ? origin.originY - rect.top : shell.clientHeight / 2;
    const worldX = (pointerX - currentCanvasState.panX) / previousZoom;
    const worldY = (pointerY - currentCanvasState.panY) / previousZoom;
    const nextPanX = pointerX - worldX * currentZoom;
    const nextPanY = pointerY - worldY * currentZoom;
    setCanvasPan(nextPanX, nextPanY);
  }

  function setCanvasPan(nextPanX, nextPanY) {
    if (!currentCanvasState) {
      return;
    }

    const clamped = clampCanvasPan(
      nextPanX,
      nextPanY,
      currentCanvasState.shell,
      currentCanvasState.layout,
      currentZoom
    );

    currentCanvasState.panX = clamped.panX;
    currentCanvasState.panY = clamped.panY;
    currentCanvasState.stage.style.transform = `translate(${clamped.panX}px, ${clamped.panY}px) scale(${currentZoom})`;
    currentCanvasState.stage.style.transformOrigin = "top left";
  }

  function clampCanvasPan(nextPanX, nextPanY, shell, layout, zoom) {
    const margin = 24;
    const slack = 120;
    const contentWidth = layout.width * zoom;
    const contentHeight = layout.height * zoom;

    const clampAxis = (viewportSize, contentSize, desired) => {
      if (contentSize <= viewportSize - margin * 2) {
        const center = (viewportSize - contentSize) / 2;
        return clamp(desired, center - slack, center + slack);
      }

      const min = viewportSize - contentSize - margin;
      const max = margin;
      return clamp(desired, min, max);
    };

    return {
      panX: clampAxis(shell.clientWidth, contentWidth, nextPanX),
      panY: clampAxis(shell.clientHeight, contentHeight, nextPanY)
    };
  }

  function getFittedPan(shell, layout, zoom) {
    const contentWidth = layout.width * zoom;
    const contentHeight = layout.height * zoom;
    return {
      panX: (shell.clientWidth - contentWidth) / 2,
      panY: (shell.clientHeight - contentHeight) / 2
    };
  }

  function updateZoomLabel() {
    if (zoomLevelLabel) {
      zoomLevelLabel.textContent = `${Math.round(currentZoom * 100)}%`;
    }
  }

  function syncCanvasInteractionMode() {
    if (currentCanvasState?.shell) {
      currentCanvasState.shell.classList.toggle("is-hand-mode", isSpacePressed);
    }
  }

  function renderWarnings(warnings) {
    if (!warningList) {
      return;
    }

    if (!warnings || warnings.length === 0) {
      warningList.replaceChildren();
      return;
    }

    const fragment = document.createDocumentFragment();

    const groupedWarnings = groupWarnings(warnings);

    groupedWarnings.forEach((warning) => {
      const item = document.createElement("div");
      item.className = `warning-item warning-${warning.severity || "warning"}`;
      item.textContent = warning.count > 1 ? `${warning.message} ×${warning.count}` : warning.message;
      item.title = warning.message;
      fragment.appendChild(item);
    });

    warningList.replaceChildren(fragment);
  }

  function groupWarnings(warnings) {
    const groups = new Map();

    warnings.forEach((warning) => {
      const key = `${warning.severity || "warning"}::${warning.message}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        return;
      }

      groups.set(key, {
        severity: warning.severity || "warning",
        message: warning.message,
        count: 1
      });
    });

    return Array.from(groups.values());
  }

  function getTreeMap(result) {
    return new Map(result.behaviorTrees.map((tree) => [tree.id, tree]));
  }

  function emptyState(message) {
    const paragraph = document.createElement("p");
    paragraph.className = "empty-state";
    paragraph.textContent = message;
    return paragraph;
  }
})();
