(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

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

  function shouldHideInSimplifiedView(section) {
    if (!runtime.state.simplifyTreeFlow) {
      return false;
    }

    const hiddenSections = runtime.state.currentSettings?.simplifyHiddenSections || [];
    return hiddenSections.includes(section);
  }

  function renderTree(tree, result, viewportState = null) {
    const section = document.createElement("section");
    section.className = "tree-section";
    section.appendChild(renderCanvasTree(tree, result, viewportState));
    return section;
  }

  function renderCanvasTree(tree, result, viewportState = null) {
    const layout = runtime.viewport.buildTreeLayout(tree.node, result);
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
      nodesLayer.appendChild(renderCanvasNode(entry, result, tree.id));
    });

    stage.appendChild(svg);
    stage.appendChild(nodesLayer);
    shell.appendChild(stage);

    runtime.viewport.setupCanvas(shell, stage, layout, viewportState);
    return shell;
  }

  function renderCanvasNode(entry, result, currentTreeId) {
    const wrapper = document.createElement("div");
    wrapper.className = "canvas-node";
    wrapper.dataset.nodePath = entry.node.nodePath;
    wrapper.style.left = `${entry.x}px`;
    wrapper.style.top = `${entry.y}px`;
    wrapper.style.width = `${entry.width}px`;
    wrapper.style.height = `${entry.height}px`;

    const card = buildNodeCard(entry.node, result, {
      interactive: true,
      selected: entry.node.nodePath === runtime.state.selectedNodePath,
      currentTreeId
    });
    wrapper.appendChild(card);
    return wrapper;
  }

  function buildNodeCard(node, result, options = {}) {
    const interactive = options.interactive !== false;
    const measuring = Boolean(options.measuring);
    const role = getNodeRole(node.kind, node.children.length);
    const card = document.createElement("div");
    card.className = `flow-card flow-card-${role}`;
    if (measuring) {
      card.classList.add("is-measuring");
    }

    const parentPath = getParentNodePath(node.nodePath);
    const siblingIndex = getNodeIndex(node.nodePath);
    const acceptsAppendDrop = canAppendChildren(node);

    if (interactive && parentPath !== null) {
      card.draggable = runtime.app.canPerformAction("dragCanvasNode", {
        parentPath,
        siblingIndex
      });
    }
    if (options.selected) {
      card.classList.add("is-selected");
    }
    const searchMatchKey = `${options.currentTreeId || ""}::${node.nodePath}`;
    if (runtime.state.searchMatchedNodePaths?.has(searchMatchKey)) {
      card.classList.add("is-search-match");
      const activeSearchResult = runtime.state.searchResults?.[runtime.state.activeSearchResultIndex];
      if (activeSearchResult?.treeId === options.currentTreeId && activeSearchResult?.nodePath === node.nodePath) {
        card.classList.add("is-search-active");
      }
    }
    if (node.warningCount > 0) {
      card.classList.add("has-warning");
    }
    if (node.hasError) {
      card.classList.add("has-error");
    }
    if (!runtime.state.simplifyTreeFlow && acceptsAppendDrop) {
      card.classList.add("has-append-slot");
    }
    if (node.warnings.length > 0) {
      card.title = node.warnings.map((warning) => warning.message).join("\n");
    }

    if (interactive) {
      card.addEventListener("click", () => {
        if (Date.now() < runtime.state.suppressNodeClickUntil) {
          return;
        }

        runtime.overlays.hideNodeContextMenu();
        runtime.state.selectedNodePath = node.nodePath;
        runtime.app.persistUiState();
        runtime.app.renderCurrentTree(result, { preserveViewport: true });
      });

      card.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!runtime.app.canPerformAction("openNodeEditor", { node })) {
          return;
        }
        runtime.overlays.hideNodeContextMenu();
        runtime.state.selectedNodePath = node.nodePath;
        runtime.app.persistUiState();
        runtime.inspector.renderInspector();
        runtime.overlays.showNodeEditorDialog({
          nodePath: node.nodePath
        });
      });

      card.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        if (!runtime.app.canPerformAction("openNodeContextMenu", { node })) {
          return;
        }
        runtime.overlays.showNodeContextMenu(event.clientX, event.clientY, {
          treeId: runtime.state.selectedTreeId,
          nodePath: node.nodePath,
          parentPath,
          siblingIndex,
          nodeTitle: node.title,
          allowAppendChild: canAppendChildren(node),
          childCount: node.children.length,
          allowDelete: node.nodePath !== "0"
        });
      });

      card.addEventListener("dragstart", (event) => {
        if (
          !runtime.app.canPerformAction("dragCanvasNode", {
            node,
            parentPath,
            siblingIndex
          })
        ) {
          event.preventDefault();
          return;
        }

        runtime.state.currentDragState = {
          kind: "move",
          treeId: runtime.state.selectedTreeId,
          sourceNodePath: node.nodePath,
          sourceParentPath: parentPath,
          sourceIndex: siblingIndex,
          nodeTitle: node.title,
          targetNodePath: null,
          targetParentPath: null,
          targetIndex: null
        };
        document.body.classList.add("is-reordering-nodes");
        card.classList.add("is-dragging-node");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", node.nodePath);
      });

      card.addEventListener("dragend", () => {
        clearDragState();
      });
    }

    const heading = document.createElement("div");
    heading.className = "flow-card-heading";

    const kind = document.createElement("span");
    kind.className = "flow-node-kind";
    kind.textContent = getNodeBadge(node);

    const name = document.createElement("span");
    name.className = "flow-node-name";
    name.textContent = node.title;

    heading.appendChild(kind);
    heading.appendChild(name);

    if (node.warningCount > 0) {
      const warningBadge = document.createElement("span");
      warningBadge.className = node.hasError ? "flow-warning-badge is-error" : "flow-warning-badge";
      warningBadge.textContent = node.warningCount === 1 ? "1 issue" : `${node.warningCount} issues`;
      heading.appendChild(warningBadge);
    }

    card.appendChild(heading);
    if (!shouldHideInSimplifiedView("description")) {
      renderDescriptionSection(card, node.description);
    }

    if (!shouldHideInSimplifiedView("code") && node.code) {
      renderTextSection(card, "Code", node.code, "code");
    }

    if (!shouldHideInSimplifiedView("inputs")) {
      renderIoSection(card, "Inputs", node.ioGroups.inputs, "input");
    }
    if (!shouldHideInSimplifiedView("outputs")) {
      renderIoSection(card, "Outputs", node.ioGroups.outputs, "output");
    }
    if (!shouldHideInSimplifiedView("params")) {
      renderIoSection(card, "Params", node.ioGroups.params, "param");
    }

    if (
      !shouldHideInSimplifiedView("subtreeJump") &&
      node.kind === "SubTree" &&
      node.targetTreeId &&
      runtime.app.getTreeMap(result).has(node.targetTreeId)
    ) {
      const jumpButton = document.createElement("button");
      jumpButton.type = "button";
      jumpButton.className = "subtree-jump";
      jumpButton.textContent = `Open ${node.targetTreeId}`;
      if (interactive) {
        jumpButton.addEventListener("click", (event) => {
          event.stopPropagation();
          runtime.state.selectedTreeId = node.targetTreeId;
          runtime.state.selectedNodePath = "0";
          runtime.app.persistUiState();
          runtime.app.renderCurrentTree(result, { preserveViewport: true });
          document.querySelector(".tree-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      card.appendChild(jumpButton);
    }

    if (interactive) {
      const slotOverlay = document.createElement("div");
      slotOverlay.className = "drop-slot-overlay";

      const beforeSlot = createDropSlot("Insert before", "drop-slot-before", () =>
        getSideDropTarget(node.nodePath, "before")
      );
      const afterSlot = createDropSlot("Insert after", "drop-slot-after", () =>
        getSideDropTarget(node.nodePath, "after")
      );
      slotOverlay.appendChild(beforeSlot);
      slotOverlay.appendChild(afterSlot);

      if (!runtime.state.simplifyTreeFlow && acceptsAppendDrop) {
        slotOverlay.classList.add("has-append");
        const appendSlot = createDropSlot("Append child here", "drop-slot-append", () =>
          getAppendDropTarget(node)
        );
        slotOverlay.appendChild(appendSlot);
      }

      card.appendChild(slotOverlay);
    }

    return card;
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
    const dragState = runtime.state.currentDragState;
    if (!dragState) {
      return null;
    }

    const parentPath = getParentNodePath(nodePath);
    const targetIndex = getNodeIndex(nodePath);
    if (parentPath === null || targetIndex === null) {
      return null;
    }

    if (parentPath === dragState.sourceNodePath || parentPath.startsWith(`${dragState.sourceNodePath}.`)) {
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
    const dragState = runtime.state.currentDragState;
    if (!dragState) {
      return null;
    }

    const targetParentPath = node.nodePath;
    if (
      targetParentPath === dragState.sourceNodePath ||
      targetParentPath.startsWith(`${dragState.sourceNodePath}.`)
    ) {
      return null;
    }

    return {
      targetParentPath,
      targetIndex: node.children.length
    };
  }

  function predictFinalIndex(sourceParentPath, sourceIndex, targetParentPath, targetIndex) {
    if (sourceParentPath === targetParentPath && targetIndex > sourceIndex) {
      return targetIndex - 1;
    }
    return targetIndex;
  }

  function clearDragState() {
    runtime.state.currentDragState = null;
    document.body.classList.remove("is-reordering-nodes");
    clearDropMarkers();
    runtime.catalog.clearCatalogDeleteTarget();
    runtime.overlays.hideNodeContextMenu();
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
    runtime.catalog.clearCatalogDeleteTarget();
    const node = document.querySelector(
      `.canvas-node[data-node-path="${CSS.escape(nodePath)}"] .drop-slot-${position}`
    );
    if (node) {
      node.classList.add("is-active");
    }
  }

  function applyAppendMarker(nodePath) {
    clearDropMarkers();
    runtime.catalog.clearCatalogDeleteTarget();
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

  function createDropSlot(label, className, resolveDropTarget) {
    const slot = document.createElement("div");
    slot.className = `drop-slot ${className}`;
    slot.textContent = label;

    slot.addEventListener("dragover", (event) => {
      if (!runtime.app.canPerformAction("dragPaletteNode", { treeId: runtime.state.selectedTreeId })) {
        return;
      }
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
      if (!runtime.app.canPerformAction("dragPaletteNode", { treeId: runtime.state.selectedTreeId })) {
        return;
      }
      const dropTarget = resolveDropTarget();
      const dragState = runtime.state.currentDragState;
      if (!dropTarget || !dragState) {
        return;
      }

      event.preventDefault();
      clearDropMarkers();
      const nextIndex = predictFinalIndex(
        dragState.sourceParentPath,
        dragState.sourceIndex,
        dropTarget.targetParentPath,
        dropTarget.targetIndex
      );

      if (
        dragState.kind === "move" &&
        nextIndex === dragState.sourceIndex &&
        dropTarget.targetParentPath === dragState.sourceParentPath
      ) {
        clearDragState();
        return;
      }

      runtime.state.selectedNodePath = `${dropTarget.targetParentPath}.${nextIndex}`;
      runtime.app.persistUiState();

      if (dragState.kind === "create") {
        runtime.vscode.postMessage({
          type: "createNode",
          payload: {
            treeId: dragState.treeId,
            targetParentPath: dropTarget.targetParentPath,
            targetIndex: dropTarget.targetIndex,
            nodeKey: dragState.nodeKey,
            nodeCategory: dragState.nodeCategory
          }
        });
      } else {
        runtime.vscode.postMessage({
          type: "moveNode",
          payload: {
            treeId: dragState.treeId,
            sourceNodePath: dragState.sourceNodePath,
            targetParentPath: dropTarget.targetParentPath,
            targetIndex: dropTarget.targetIndex
          }
        });
      }

      clearDragState();
    });

    return slot;
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

  runtime.canvas = {
    getNodeRole,
    renderTree,
    renderCanvasTree,
    renderCanvasNode,
    buildNodeCard,
    getParentNodePath,
    getNodeIndex,
    clearDragState,
    clearDropMarkers,
    applyDropMarker,
    applyAppendMarker,
    canAppendChildren
  };
})();
