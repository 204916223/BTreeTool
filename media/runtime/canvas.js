(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const VIRTUAL_ROOT_PATH = "__btree_root__";
  const CONTROL_NODE_KINDS = new Set([
    "AsyncFallback",
    "AsyncSequence",
    "Sequence",
    "SequenceWithMemory",
    "ReactiveSequence",
    "Fallback",
    "ReactiveFallback",
    "Parallel",
    "ParallelAll",
    "IfThenElse",
    "WhileDoElse",
    "Switch",
    "Switch2",
    "Switch3",
    "Switch4",
    "Switch5",
    "Switch6",
    "TryCatch"
  ]);
  const DECORATOR_NODE_KINDS = new Set([
    "RetryUntilSuccessful",
    "RetryUntilFailure",
    "Repeat",
    "Inverter",
    "Precondition",
    "ForceSuccess",
    "ForceFailure",
    "Timeout",
    "Delay",
    "KeepRunningUntilFailure",
    "LoopBool",
    "LoopDouble",
    "LoopInt",
    "LoopString",
    "RunOnce",
    "SkipUnlessUpdated",
    "WaitValueUpdate"
  ]);

  function getNodeRole(nodeOrKind, childCount = 0) {
    const node = typeof nodeOrKind === "object" && nodeOrKind !== null ? nodeOrKind : null;
    const kind = node ? node.kind : nodeOrKind;
    const resolvedCategory = node?.category || node?.modelKind || "";
    const resolvedChildCount = node ? (node.children || []).length : childCount;

    if (kind === "__BehaviorTreeRoot") {
      return "root";
    }

    if (resolvedCategory === "SubTree" || kind === "SubTree") {
      return "subtree";
    }

    if (resolvedCategory === "Control") {
      return "control";
    }

    if (resolvedCategory === "Decorator") {
      return "decorator";
    }

    if (resolvedCategory === "Action" || resolvedCategory === "Condition") {
      return "action";
    }

    if (CONTROL_NODE_KINDS.has(kind) || resolvedChildCount > 1) {
      return "control";
    }

    if (DECORATOR_NODE_KINDS.has(kind) || resolvedChildCount === 1) {
      return "decorator";
    }

    return "action";
  }

  const NODE_DETAIL_SECTIONS = ["description", "code", "inputs", "outputs", "params", "subtreeJump"];

  function shouldHideNodeSection(section) {
    if (
      runtime.modeRules?.isPlaybackMode?.() !== true &&
      runtime.state.forceHideNodeDetails &&
      NODE_DETAIL_SECTIONS.includes(section)
    ) {
      return true;
    }

    const hiddenSections = runtime.state.currentSettings?.simplifyHiddenSections || [];
    return hiddenSections.includes(section);
  }

  function normalizeNodeSectionTitleMode(value) {
    return value === "hidden" || value === "emphasis" ? value : "regular";
  }

  function renderTree(tree, result, viewportState = null, options = {}) {
    const section = document.createElement("section");
    section.className = "tree-section";
    section.appendChild(renderCanvasTree(tree, result, viewportState, options));
    return section;
  }

  function renderCanvasTree(tree, result, viewportState = null, options = {}) {
    const canvasRootNode = getCanvasRootNode(tree, result);
    if (!canvasRootNode) {
      const shell = document.createElement("div");
      shell.className = "canvas-shell";
      runtime.viewport.disposeAllCanvasStates();
      runtime.state.currentZoom = 1;
      runtime.viewport.updateZoomLabel();
      shell.appendChild(runtime.app.emptyState(runtime.i18n.getAppCopy().selectedTreeNotFound));
      return shell;
    }

    const layout = runtime.viewport.buildTreeLayout(canvasRootNode, result);
    const shell = document.createElement("div");
    shell.className = "canvas-shell";
    shell.addEventListener("contextmenu", (event) => {
      if (event.target instanceof Element && event.target.closest(".flow-card")) {
        return;
      }

      event.preventDefault();
      runtime.app.activateTreePane(options.paneId, tree.id, null);
      runtime.overlays.showCanvasContextMenu(event.clientX, event.clientY);
    });

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
      const edgeTreeId = edge.childTreeId || tree.id;
      const playbackClass = getPlaybackStatusClassForPath(edgeTreeId, edge.childNodePath, true);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", renderZEdgePath(edge));
      path.setAttribute("class", `canvas-edge-path canvas-edge-path-base ${playbackClass}`.trim());
      if (edge.childNodePath) {
        path.dataset.nodePath = edge.childNodePath;
      }
      const edgeUid = runtime.state.playbackUidByTreePath?.[`${edgeTreeId}::${edge.childNodePath}`];
      if (edgeUid) {
        path.dataset.playbackUid = String(edgeUid);
      }
      svg.appendChild(path);

      const dropPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      dropPath.setAttribute("d", renderZEdgePath({
        startX: edge.dropStartX,
        startY: edge.dropStartY,
        endX: edge.dropEndX,
        endY: edge.dropEndY
      }));
      dropPath.setAttribute("class", "canvas-edge-path canvas-edge-path-drop");
      svg.appendChild(dropPath);
    });

    const nodesLayer = document.createElement("div");
    nodesLayer.className = "canvas-nodes";
    layout.nodes.forEach((entry) => {
      nodesLayer.appendChild(renderCanvasNode(entry, result, tree.id, options));
    });

    stage.appendChild(svg);
    stage.appendChild(nodesLayer);
    shell.appendChild(stage);
    shell.appendChild(createCanvasFitViewButton({ ...options, treeId: tree.id }));

    runtime.viewport.setupCanvas(shell, stage, layout, viewportState, {
      paneId: options.paneId || "main",
      active: options.active !== false
    });
    return shell;
  }

  function createCanvasFitViewButton(options = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "canvas-fit-view-btn";
    button.title = "Reset view";
    button.setAttribute("aria-label", "Reset view");
    button.innerHTML = [
      '<svg viewBox="0 0 1024 1024" aria-hidden="true">',
      '<path d="M874.048 533.333C863.424 716.63 716.629 863.424 533.333 874.048v43.285a21.333 21.333 0 0 1-42.666 0v-43.285C307.37 863.424 160.576 716.629 149.952 533.333h-43.285a21.333 21.333 0 0 1 0-42.666h43.285c10.624-183.296 157.419-330.091 340.715-340.715v-43.285a21.333 21.333 0 0 1 42.666 0v43.285c183.296 10.624 330.091 157.419 340.715 340.715h42.816a21.333 21.333 0 1 1 0 42.666h-42.837z m-42.752 0H703.509a21.333 21.333 0 0 1 0-42.666h127.787c-10.517-159.744-138.24-287.446-297.963-297.963V320a21.333 21.333 0 0 1-42.666 0V192.704c-159.744 10.517-287.446 138.24-297.963 297.963H320a21.333 21.333 0 0 1 0 42.666H192.704c10.517 159.744 138.24 287.446 297.963 297.963V704a21.333 21.333 0 0 1 42.666 0v127.296c159.744-10.517 287.446-138.24 297.963-297.963zM512 554.667a42.667 42.667 0 1 1 0-85.334 42.667 42.667 0 0 1 0 85.334z"></path>',
      "</svg>"
    ].join("");

    button.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const canvasState = button.closest(".canvas-shell")?.__btreeCanvasState;
      if (!canvasState) {
        return;
      }
      runtime.app.activateTreePane(options.paneId, options.treeId, null);
      runtime.viewport.activateCanvasState(canvasState);
      runtime.viewport.fitCanvas(canvasState);
    });

    return button;
  }

  function renderZEdgePath(edge) {
    const midY = edge.startY + (edge.endY - edge.startY) / 2;
    return [
      `M ${edge.startX} ${edge.startY}`,
      `L ${edge.startX} ${midY}`,
      `L ${edge.endX} ${midY}`,
      `L ${edge.endX} ${edge.endY}`
    ].join(" ");
  }

  function renderCanvasNode(entry, result, currentTreeId, options = {}) {
    const nodeTreeId = getNodeTreeId(entry.node, currentTreeId);
    const selectedNodePath = Object.prototype.hasOwnProperty.call(options, "selectedNodePath")
      ? options.selectedNodePath
      : runtime.state.selectedNodePath;
    const wrapper = document.createElement("div");
    wrapper.className = "canvas-node";
    wrapper.dataset.nodePath = entry.node.nodePath;
    wrapper.dataset.treeId = nodeTreeId;
    if (entry.node.renderPath) {
      wrapper.dataset.renderPath = entry.node.renderPath;
    }
    if (entry.node.attributes?._uid) {
      wrapper.dataset.playbackUid = String(entry.node.attributes._uid);
    }
    wrapper.style.left = `${entry.x}px`;
    wrapper.style.top = `${entry.y}px`;
    wrapper.style.width = `${entry.width}px`;
    wrapper.style.height = `${entry.height}px`;
    wrapper.style.setProperty("--node-base-width", `${entry.width}px`);
    wrapper.style.setProperty("--node-base-height", `${entry.height}px`);
    wrapper.style.setProperty("--drop-target-left", `${entry.dropTargetX ?? entry.x}px`);
    wrapper.style.setProperty("--drop-target-top", `${entry.dropTargetY ?? entry.y}px`);
    wrapper.style.setProperty("--drop-target-width", `${entry.dropTargetWidth || entry.width}px`);
    wrapper.style.setProperty("--drop-target-height", `${entry.dropTargetHeight || entry.height}px`);
    wrapper.style.setProperty(
      "--drop-target-source-left",
      `${(entry.dropTargetX ?? entry.x) + ((entry.dropTargetWidth || entry.width) - entry.width) / 2}px`
    );
    wrapper.style.setProperty("--drop-target-source-top", `${entry.dropTargetY ?? entry.y}px`);
    if (entry.expandForDropTarget) {
      wrapper.classList.add("is-drop-target-expandable");
    }
    if (isDropTargetHidden(entry.node.nodePath, currentTreeId)) {
      wrapper.classList.add("is-drop-target-hidden");
    }

    const card = buildNodeCard(entry.node, result, {
      interactive: true,
      selected: entry.node.nodePath === selectedNodePath && nodeTreeId === runtime.state.selectedTreeId,
      currentTreeId: nodeTreeId,
      paneId: options.paneId
    });
    wrapper.appendChild(card);
    return wrapper;
  }

  function buildNodeCard(node, result, options = {}) {
    const interactive = options.interactive !== false;
    const measuring = Boolean(options.measuring);
    const isVirtualRoot = node.isVirtualRoot === true;
    const children = node.children || [];
    const role = getNodeRole(node);
    const card = document.createElement("div");
    card.className = `flow-card flow-card-${role}`;
    if (isVirtualRoot) {
      card.classList.add("is-virtual-root");
    }
    if (runtime.modeRules?.isPlaybackMode?.() !== true && runtime.state.forceHideNodeDetails) {
      card.classList.add("is-details-hidden");
    }
    if (runtime.state.currentSettings?.nodeAttributeLayout === "stacked") {
      card.classList.add("is-attribute-layout-stacked");
    }
    const sectionTitleMode = normalizeNodeSectionTitleMode(runtime.state.currentSettings?.nodeSectionTitleMode);
    card.classList.add(`is-section-title-${sectionTitleMode}`);
    if (measuring) {
      card.classList.add("is-measuring");
    }
    const body = document.createElement("div");
    body.className = "flow-card-body";

    const parentPath = getParentNodePath(node.nodePath);
    const siblingIndex = getNodeIndex(node.nodePath);
    const dragParentPath = getDragParentNodePath(node, parentPath);
    const dragSiblingIndex = getDragSiblingIndex(node, siblingIndex);
    const acceptsAppendDrop = isVirtualRoot ? children.length === 0 : canAppendChildren(node);
    const canDragNode =
      interactive &&
      !isVirtualRoot &&
      runtime.app.canPerformAction("dragCanvasNode", {
        parentPath: dragParentPath,
        siblingIndex: dragSiblingIndex
      });
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
    if (node.warnings.length > 0) {
      card.title = node.warnings.map((warning) => warning.message).join("\n");
    }
    const playbackClass = getPlaybackStatusClass(node);
    if (playbackClass) {
      card.classList.add("is-playback-status", playbackClass);
    }

    if (interactive && isVirtualRoot) {
      card.addEventListener("click", () => {
        if (Date.now() < runtime.state.suppressNodeClickUntil) {
          return;
        }

        runtime.app.activateTreePane(options.paneId, options.currentTreeId, node.nodePath);
        runtime.overlays.hideNodeContextMenu();
        runtime.app.navigateToParentTree(result, options.currentTreeId);
      });

      card.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        if (!runtime.app.canPerformAction("openNodeContextMenu", { node })) {
          return;
        }
        runtime.app.activateTreePane(options.paneId, options.currentTreeId, node.nodePath);
        runtime.overlays.showNodeContextMenu(event.clientX, event.clientY, {
          treeId: options.currentTreeId,
          paneId: options.paneId,
          nodePath: node.nodePath,
          parentPath: null,
          siblingIndex: null,
          nodeTitle: node.title,
          nodeTemplate: null,
          allowAppendChild: true,
          childCount: node.children.length,
          allowDelete: false
        });
      });
    } else if (interactive) {
      card.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        if (!runtime.app.canPerformAction("openNodeContextMenu", { node })) {
          return;
        }
        runtime.app.activateTreePane(options.paneId, options.currentTreeId, node.nodePath);
        runtime.overlays.showNodeContextMenu(event.clientX, event.clientY, {
          treeId: options.currentTreeId,
          paneId: options.paneId,
          nodePath: node.nodePath,
          parentPath,
          siblingIndex,
          nodeTitle: node.title,
          nodeTemplate: toNodeCopyTemplate(node),
          allowAppendChild: canAppendChildren(node),
          childCount: node.children.length,
          allowDelete: canDeleteNode(node)
        });
      });
    }

    const heading = document.createElement("div");
    heading.className = "flow-card-heading";

    const kind = document.createElement("span");
    kind.className = "flow-node-kind";
    kind.textContent = getNodeBadge(node);

    const uid = document.createElement("span");
    uid.className = "flow-node-uid";
    uid.textContent = String(node.uid || "");
    uid.title = node.uid ? `UID ${node.uid}` : "";

    const name = document.createElement("span");
    name.className = "flow-node-name";
    name.textContent = node.title;

    heading.appendChild(kind);
    if (node.uid) {
      heading.appendChild(uid);
    }
    heading.appendChild(name);

    if (node.warningCount > 0) {
      const warningBadge = document.createElement("span");
      warningBadge.className = node.hasError ? "flow-warning-badge is-error" : "flow-warning-badge";
      warningBadge.textContent = node.warningCount === 1 ? "1 issue" : `${node.warningCount} issues`;
      heading.appendChild(warningBadge);
    }

    if (interactive && !isVirtualRoot) {
      heading.addEventListener("click", (event) => {
        event.stopPropagation();
        if (Date.now() < runtime.state.suppressNodeClickUntil) {
          return;
        }

        runtime.overlays.hideNodeContextMenu();
        runtime.app.activateTreePane(options.paneId, options.currentTreeId, node.nodePath);
        runtime.state.selectedNodePath = node.nodePath;
        if (runtime.editAssistant?.syncSelectedNodePrompt?.()) {
          runtime.app.persistUiState();
          runtime.viewport.updateCanvasSelection(node.nodePath, options.currentTreeId);
          return;
        }
        if (runtime.editAssistant?.insertNodeUid?.(node.uid)) {
          runtime.app.persistUiState();
          runtime.viewport.updateCanvasSelection(node.nodePath, options.currentTreeId);
          return;
        }
        runtime.app.stagePlaybackTransitionUidFilter?.(node.attributes?._uid);
        runtime.app.persistUiState();
        runtime.viewport.updateCanvasSelection(node.nodePath, options.currentTreeId);
      });

      heading.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!runtime.app.canPerformAction("openNodeEditor", { node })) {
          return;
        }
        runtime.overlays.hideNodeContextMenu();
        runtime.app.activateTreePane(options.paneId, options.currentTreeId, node.nodePath);
        runtime.state.selectedNodePath = node.nodePath;
        runtime.app.persistUiState();
        runtime.overlays.showNodeEditorDialog({
          nodePath: node.nodePath
        });
      });

      if (canDragNode) {
        heading.draggable = true;
        heading.classList.add("is-drag-handle");
        heading.addEventListener("dragstart", (event) => {
          if (
            !runtime.app.canPerformAction("dragCanvasNode", {
              node,
              parentPath: dragParentPath,
              siblingIndex: dragSiblingIndex
            })
          ) {
            event.preventDefault();
            return;
          }

          runtime.app.activateTreePane(options.paneId, options.currentTreeId, node.nodePath);
          runtime.state.currentDragState = {
            kind: "move",
            treeId: options.currentTreeId,
            sourceNodePath: node.nodePath,
            sourceParentPath: dragParentPath,
            sourceIndex: dragSiblingIndex,
            nodeTitle: node.title,
            targetNodePath: null,
            targetParentPath: null,
            targetIndex: null
          };
          const dragSource = card.closest(".canvas-node");
          const dragSourceRect = dragSource?.getBoundingClientRect?.();
          const dragViewportOrigin = dragSourceRect
            ? {
                screenX: dragSourceRect.left + dragSourceRect.width / 2,
                screenY: dragSourceRect.top + dragSourceRect.height / 2,
                nodePath: node.nodePath,
                treeId: options.currentTreeId
              }
            : null;
          document.body.classList.add("is-reordering-nodes");
          card.classList.add("is-dragging-node");
          dragSource?.classList.add("is-drag-source");
          runtime.viewport.beginDragPreviewViewport(dragViewportOrigin);
          runtime.viewport.refreshDropTargetVisibility();
          runtime.catalog.syncDeleteTargetIndicator?.();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", node.nodePath);
          runtime.setVisibleDragImage?.(event, card);
        });

        heading.addEventListener("dragend", () => {
          if (runtime.state.currentDragState) {
            clearDragState({ cancelled: true });
          }
        });
      }
    }

    card.appendChild(heading);
    card.appendChild(body);
    let hasRenderedDetails = false;
    if (!isVirtualRoot) {
      if (!shouldHideNodeSection("description")) {
        hasRenderedDetails = renderDescriptionSection(body, node, options) || hasRenderedDetails;
      }

      if (!shouldHideNodeSection("code")) {
        hasRenderedDetails = renderCodeSection(body, node, options) || hasRenderedDetails;
      }

      if (!shouldHideNodeSection("inputs")) {
        hasRenderedDetails = renderAttributeSection(body, node, "Inputs", "input", options) || hasRenderedDetails;
      }
      if (!shouldHideNodeSection("outputs")) {
        hasRenderedDetails = renderAttributeSection(body, node, "Outputs", "output", options) || hasRenderedDetails;
      }
      if (!shouldHideNodeSection("params")) {
        hasRenderedDetails = renderAttributeSection(body, node, "Params", "param", options) || hasRenderedDetails;
      }

      if (
        !shouldHideNodeSection("subtreeJump") &&
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
            runtime.app.activateTreePane(options.paneId, options.currentTreeId, node.nodePath);
            runtime.app.navigateToSubTree(result, options.currentTreeId, node.nodePath, node.targetTreeId);
            document.querySelector(".tree-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
        body.appendChild(jumpButton);
        hasRenderedDetails = true;
      }
    }

    if (!hasRenderedDetails) {
      card.classList.add("is-details-hidden");
    }

    if (interactive) {
      const slotOverlay = document.createElement("div");
      slotOverlay.className = "drop-slot-overlay";

      const hasSideSlots = !isVirtualRoot;
      if (hasSideSlots) {
        const beforeSlot = createDropSlot("Insert before", "drop-slot-before", () =>
          getSideDropTarget(node.nodePath, "before", options.currentTreeId, options.paneId)
        );
        const afterSlot = createDropSlot("Insert after", "drop-slot-after", () =>
          getSideDropTarget(node.nodePath, "after", options.currentTreeId, options.paneId)
        );
        slotOverlay.appendChild(beforeSlot);
        slotOverlay.appendChild(afterSlot);
      }

      if (acceptsAppendDrop) {
        slotOverlay.classList.add("has-append");
        if (!hasSideSlots) {
          slotOverlay.classList.add("has-append-only");
        }
        const appendSlot = createDropSlot("Append child here", "drop-slot-append", () =>
          getAppendDropTarget(node, options.currentTreeId, options.paneId)
        );
        slotOverlay.appendChild(appendSlot);
      }

      if (slotOverlay.children.length > 0) {
        card.appendChild(slotOverlay);
      }
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

  function getPlaybackStatusClass(node) {
    if (!runtime.modeRules?.isPlaybackMode?.()) {
      return "";
    }
    const uid = node?.attributes?._uid;
    if (!uid) {
      return "";
    }
    return getPlaybackStatusClassForUid(String(uid), false);
  }

  function getPlaybackStatusClassForPath(treeId, nodePath, edge) {
    if (!runtime.modeRules?.isPlaybackMode?.()) {
      return "";
    }
    const uid = runtime.state.playbackUidByTreePath?.[`${treeId}::${nodePath}`];
    if (!uid) {
      return "";
    }
    return getPlaybackStatusClassForUid(String(uid), edge);
  }

  function getPlaybackStatusClassForUid(uid, edge) {
    const status = runtime.state.playbackStatusByUid?.[uid] || "IDLE";
    const lastTerminalStatus = runtime.state.playbackLastTerminalStatusByUid?.[uid] || "";
    const normalized = String(status || "IDLE").toLowerCase();
    const prefix = edge ? "playback-edge-status" : "playback-status";
    if (status === "IDLE" && lastTerminalStatus === "SUCCESS") {
      return `${prefix}-success-idle`;
    }
    if (status === "IDLE" && lastTerminalStatus === "FAILURE") {
      return `${prefix}-failure-idle`;
    }
    if (["idle", "running", "success", "failure"].includes(normalized)) {
      return `${prefix}-${normalized}`;
    }
    return `${prefix}-unknown`;
  }

  function getNodeTreeId(node, fallbackTreeId) {
    return node?.sourceTreeId || fallbackTreeId;
  }

  function getNodeIndex(nodePath) {
    const parts = String(nodePath || "").split(".");
    if (parts.length <= 1) {
      return null;
    }

    const index = Number(parts[parts.length - 1]);
    return Number.isInteger(index) ? index : null;
  }

  function getDragParentNodePath(node, parentPath) {
    if (isRealRootUnderVirtualRoot(node)) {
      return VIRTUAL_ROOT_PATH;
    }

    return parentPath;
  }

  function getDragSiblingIndex(node, siblingIndex) {
    if (isRealRootUnderVirtualRoot(node)) {
      return 0;
    }

    return siblingIndex;
  }

  function isRealRootUnderVirtualRoot(node) {
    return node?.nodePath === "0" && runtime.state.currentSettings?.showBehaviorTreeRoot !== false;
  }

  function getSideDropTarget(nodePath, position, targetTreeId, targetPaneId) {
    const dragState = runtime.state.currentDragState;
    if (!dragState) {
      return null;
    }

    if (dragState.kind === "move" && targetTreeId !== dragState.treeId) {
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
      targetTreeId,
      targetPaneId,
      nodePath,
      position,
      targetParentPath: parentPath,
      targetIndex: position === "before" ? targetIndex : targetIndex + 1
    };
  }

  function getAppendDropTarget(node, targetTreeId, targetPaneId) {
    const dragState = runtime.state.currentDragState;
    if (!dragState) {
      return null;
    }

    if (dragState.kind === "move" && targetTreeId !== dragState.treeId) {
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
      targetTreeId,
      targetPaneId,
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

  function clearDragState(options = {}) {
    const wasDragging =
      Boolean(runtime.state.currentDragState) ||
      document.body.classList.contains?.("is-reordering-nodes") === true;
    if (wasDragging) {
      // Every drag completion restores the drop-target layout and viewport in the
      // same frame. Suppress node transitions for both cancellation and commits.
      document.body.classList.add("is-ending-node-drag");
    }
    runtime.state.currentDragState = null;
    document.body.classList.remove("is-reordering-nodes");
    runtime.viewport.endDragPreviewViewport(options);
    runtime.viewport.refreshDropTargetVisibility();
    clearDropMarkers();
    runtime.catalog.clearCatalogDeleteTarget();
    runtime.catalog.syncDeleteTargetIndicator?.();
    runtime.overlays.hideNodeContextMenu();
    document.querySelectorAll(".flow-card.is-dragging-node").forEach((node) => {
      node.classList.remove("is-dragging-node");
    });
    document.querySelectorAll(".canvas-node.is-drag-source").forEach((node) => {
      node.classList.remove("is-drag-source");
    });
    document.querySelectorAll(".catalog-item.is-dragging-palette").forEach((node) => {
      node.classList.remove("is-dragging-palette");
    });
    if (wasDragging) {
      document.body.classList.remove("is-ending-node-drag");
    }
  }

  function clearDropMarkers() {
    document.querySelectorAll(".drop-slot.is-active").forEach((node) => {
      node.classList.remove("is-active");
    });
  }

  function applyDropMarker(nodePath, position, treeId = runtime.state.selectedTreeId) {
    clearDropMarkers();
    const node = document.querySelector(
      `.canvas-node[data-tree-id="${CSS.escape(treeId || "")}"][data-node-path="${CSS.escape(nodePath)}"] .drop-slot-${position}`
    );
    if (node) {
      node.classList.add("is-active");
    }
  }

  function applyAppendMarker(nodePath, treeId = runtime.state.selectedTreeId) {
    clearDropMarkers();
    const node = document.querySelector(
      `.canvas-node[data-tree-id="${CSS.escape(treeId || "")}"][data-node-path="${CSS.escape(nodePath)}"] .drop-slot-append`
    );
    if (node) {
      node.classList.add("is-active");
    }
  }

  function isDropTargetHidden(nodePath, treeId) {
    const dragState = runtime.state.currentDragState;
    if (!dragState || dragState.kind !== "move") {
      return false;
    }

    if (!treeId || dragState.treeId !== treeId) {
      return false;
    }

    const sourceNodePath = String(dragState.sourceNodePath || "");
    const targetNodePath = String(nodePath || "");
    return (
      targetNodePath === sourceNodePath ||
      targetNodePath.startsWith(`${sourceNodePath}.`)
    );
  }

  function canAppendChildren(node) {
    const role = getNodeRole(node);
    if (role === "control") {
      return true;
    }

    if (role === "decorator") {
      return node.children.length === 0;
    }

    return false;
  }

  function canDeleteNode(node) {
    if (node.isVirtualRoot === true) {
      return false;
    }

    if (node.nodePath !== "0") {
      return true;
    }

    return runtime.state.currentSettings?.showBehaviorTreeRoot !== false;
  }

  function toNodeCopyTemplate(node) {
    return {
      tagName: node.kind,
      attributes: { ...(node.attributes || {}) },
      children: (node.children || [])
        .filter((child) => child.expandedSubtreeInjection !== true)
        .map(toNodeCopyTemplate)
    };
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
      if (!runtime.app.canPerformAction("dragPaletteNode", { treeId: dropTarget.targetTreeId || runtime.state.selectedTreeId })) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (className === "drop-slot-append") {
        applyAppendMarker(dropTarget.targetParentPath, dropTarget.targetTreeId);
      } else {
        applyDropMarker(dropTarget.nodePath, dropTarget.position, dropTarget.targetTreeId);
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
      const dragState = runtime.state.currentDragState;
      if (!dropTarget || !dragState) {
        return;
      }
      if (!runtime.app.canPerformAction("dragPaletteNode", { treeId: dropTarget.targetTreeId || runtime.state.selectedTreeId })) {
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
        clearDragState({ cancelled: true });
        return;
      }

      const targetTreeId = dropTarget.targetTreeId || dragState.treeId;
      runtime.state.selectedNodePath = toInsertedNodePath(dropTarget.targetParentPath, nextIndex);
      if (dropTarget.targetPaneId) {
        runtime.app.activateTreePane(dropTarget.targetPaneId, targetTreeId, runtime.state.selectedNodePath);
      } else {
        runtime.app.activateTreePaneByTreeId(targetTreeId, runtime.state.selectedNodePath);
      }
      runtime.app.persistUiState();

      if (dragState.kind === "create") {
        runtime.vscode.postMessage({
          type: "createNode",
          payload: {
            treeId: targetTreeId,
            targetParentPath: dropTarget.targetParentPath,
            targetIndex: dropTarget.targetIndex,
            nodeKey: dragState.nodeKey,
            nodeCategory: dragState.nodeCategory
          }
        });
      } else {
        if (targetTreeId !== dragState.treeId) {
          clearDragState({ cancelled: true });
          return;
        }
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
    if (node.isVirtualRoot === true) {
      return "ROOT";
    }
    if (node.modelKind) {
      return node.modelKind;
    }
    if (node.title === node.kind) {
      return getNodeRole(node).toUpperCase();
    }
    return node.kind;
  }

  function toInsertedNodePath(targetParentPath, targetIndex) {
    if (targetParentPath === VIRTUAL_ROOT_PATH) {
      return "0";
    }
    return `${targetParentPath}.${targetIndex}`;
  }

  function getCanvasRootNode(tree, result) {
    if (runtime.state.currentSettings?.showBehaviorTreeRoot === false) {
      return tree.node;
    }

    const children = tree?.node ? [tree.node] : [];
    const warnings = (result?.warnings || []).filter(
      (warning) => warning.treeId === tree?.id && warning.nodePath === VIRTUAL_ROOT_PATH
    );
    const hasBlockingWarning = warnings.some(
      (warning) => warning.severity === "error" || warning.code === "empty_behavior_tree"
    );

    return {
      nodePath: VIRTUAL_ROOT_PATH,
      title: "root",
      instanceName: "",
      kind: "__BehaviorTreeRoot",
      category: "Control",
      targetTreeId: "",
      description: "",
      code: "",
      summary: tree.id,
      attributes: {},
      ioGroups: {
        inputs: [],
        outputs: [],
        params: []
      },
      attributeFields: [],
      editorFields: [],
      modelKind: "",
      warningCount: warnings.length,
      hasError: hasBlockingWarning,
      warnings,
      children,
      isVirtualRoot: true,
      sourceTreeId: tree?.sourceTreeId || tree?.id || "",
      renderPath: `${tree?.sourceTreeId || tree?.id || ""}::__btree_root__`
    };
  }

  function renderAttributeSection(container, node, title, tone, options) {
    const fields = getCardFieldsByTone(node, tone);
    if (fields.length === 0) {
      return false;
    }

    const section = document.createElement("div");
    section.className = `flow-io flow-io-${tone}`;

    const label = document.createElement("span");
    label.className = "flow-io-label";
    label.textContent = title;
    section.appendChild(label);

    const list = document.createElement("div");
    list.className = "flow-node-attributes";

    fields.forEach((field) => {
      const pair = document.createElement("span");
      pair.className = `flow-attribute-pair tone-${tone}`;

      const keyChip = document.createElement("span");
      keyChip.className = "flow-attribute-chip flow-attribute-chip-key";
      keyChip.textContent = field.key;

      pair.appendChild(keyChip);
      pair.appendChild(renderAttributeValueControl(node, field, tone, options));
      list.appendChild(pair);
    });

    section.appendChild(list);
    container.appendChild(section);
    return true;
  }

  function getCardFieldsByTone(node, tone) {
    const fields = Array.isArray(node.attributeFields) && node.attributeFields.length > 0
      ? node.attributeFields
      : getLegacyCardFields(node);
    const visibleFields = fields.filter((field) => field.key !== "_uid");
    if (tone === "input") {
      return visibleFields.filter((field) => field.role === "input" || field.role === "inout");
    }
    if (tone === "output") {
      return visibleFields.filter((field) => field.role === "output" || field.role === "inout");
    }
    const paramFields = visibleFields.filter((field) => field.role === "param" && !isDedicatedCodeField(node, field));
    if (runtime.modeRules?.isPlaybackMode?.() === true) {
      appendPlaybackConditionFields(node, paramFields);
    }
    return paramFields;
  }

  function appendPlaybackConditionFields(node, fields) {
    const attributes = node?.attributes || {};
    const existingKeys = new Set(fields.map((field) => field.key));
    [
      "_skipIf",
      "_successIf",
      "_failureIf",
      "_while",
      "_onSuccess",
      "_onFailure",
      "_onHalted",
      "_post"
    ].forEach((key) => {
      const value = attributes[key];
      if (!value || existingKeys.has(key)) {
        return;
      }
      fields.push({
        key,
        value,
        role: "param",
        editableKey: false,
        editableValue: false,
        removable: false,
        required: false,
        source: "builtin"
      });
      existingKeys.add(key);
    });
  }

  function getLegacyCardFields(node) {
    const fieldsByKey = new Map();
    const addField = (entry, role) => {
      if (!entry?.key) {
        return;
      }

      const existing = fieldsByKey.get(entry.key);
      if (existing) {
        existing.role = existing.role !== role ? "inout" : existing.role;
        if (!existing.value && entry.value) {
          existing.value = entry.value;
        }
        return;
      }

      fieldsByKey.set(entry.key, {
        key: entry.key,
        value: entry.value || "",
        role,
        editableKey: false,
        editableValue: true,
        removable: false,
        required: false,
        source: "extra"
      });
    };

    (node.ioGroups?.inputs || []).forEach((entry) => addField(entry, "input"));
    (node.ioGroups?.outputs || []).forEach((entry) => addField(entry, "output"));
    (node.ioGroups?.params || []).forEach((entry) => addField(entry, "param"));
    return Array.from(fieldsByKey.values());
  }

  function renderAttributeValueControl(node, field, tone, options) {
    const measuring = Boolean(options.measuring);
    const playbackMode = runtime.modeRules?.isPlaybackMode?.() === true;
    const readonlyControls = options.readonlyControls === true && field.editableValue && !playbackMode;
    const editable =
      field.editableValue &&
      !playbackMode &&
      (measuring ||
        (options.interactive !== false &&
          runtime.app.canPerformAction("editNodeAttributes", {
            node,
            hasEditableFields: true
          })));

    if (!editable && !readonlyControls) {
      const valueChip = document.createElement("span");
      valueChip.className = "flow-attribute-chip flow-attribute-chip-value is-readonly-value";
      valueChip.textContent = field.value || "-";
      if (!field.value) {
        valueChip.classList.add("is-empty");
      }
      if (!measuring && field.value) {
        bindAttributeValuePreview(valueChip, field.value, field.key || "");
      }
      return valueChip;
    }

    const input = document.createElement("input");
    input.className = `flow-attribute-input tone-${tone}`;
    input.type = "text";
    input.draggable = false;
    input.value = field.value || "";
    input.placeholder = runtime.i18n.getAttributeCopy().valuePlaceholder;
    input.spellcheck = false;
    input.dataset.originalValue = field.value || "";
    input.dataset.attributeKey = field.key || "";
    if (measuring || readonlyControls) {
      input.readOnly = true;
      input.tabIndex = -1;
    } else {
      input.addEventListener("pointerdown", stopInputEvent);
      input.addEventListener("click", stopInputEvent);
      input.addEventListener("dblclick", stopInputEvent);
      input.addEventListener("contextmenu", stopInputEvent);
      input.addEventListener("copy", stopInputEvent);
      input.addEventListener("cut", stopInputEvent);
      input.addEventListener("paste", stopInputEvent);
      input.addEventListener("dragstart", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      input.addEventListener("focus", () => {
        syncAttributeInputPreview(input);
      });
      input.addEventListener("input", () => {
        syncAttributeInputPreview(input);
      });
      input.addEventListener("blur", (event) => {
        hideAttributeValuePreview(input, { relatedTarget: event.relatedTarget });
      });
      input.addEventListener("compositionstart", () => {
        input.dataset.isComposing = "true";
        input.dataset.justComposed = "false";
      });
      input.addEventListener("compositionend", () => {
        input.dataset.isComposing = "false";
        input.dataset.justComposed = "true";
        window.setTimeout(() => {
          input.dataset.justComposed = "false";
        }, 80);
      });
      input.addEventListener("change", () => {
        commitNodeAttributeValue(node, field, input, options.currentTreeId);
      });
      input.__attributePreviewCommit = () => {
        commitNodeAttributeValue(node, field, input, options.currentTreeId);
      };
      input.__attributePreviewCancel = () => {
        input.value = input.dataset.originalValue || "";
      };
      input.addEventListener("keydown", (event) => {
        if (isTextEditingShortcut(event)) {
          return;
        }

        event.stopPropagation();
        if (event.key === "Enter") {
          if (isInputCompositionEnter(event, input)) {
            return;
          }
          event.preventDefault();
          commitNodeAttributeValue(node, field, input, options.currentTreeId);
          input.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          input.value = input.dataset.originalValue || "";
          input.blur();
        }
      });
    }

    return input;
  }

  function syncAttributeInputPreview(input) {
    if (!input || document.activeElement !== input) {
      return;
    }

    const value = input.value || "";
    if (!value) {
      hideAttributeValuePreview(input, { force: true });
      return;
    }

    showAttributeValuePreview(input, value, input.dataset.attributeKey || "");
  }

  function bindAttributeValuePreview(element, value, attributeKey) {
    element.tabIndex = 0;
    element.dataset.attributeKey = attributeKey;
    element.addEventListener("pointerdown", stopInputEvent);
    element.addEventListener("click", stopInputEvent);
    element.addEventListener("dblclick", stopInputEvent);
    element.addEventListener("contextmenu", stopInputEvent);
    element.addEventListener("focus", () => {
      showAttributeValuePreview(element, value, attributeKey);
    });
    element.addEventListener("blur", () => {
      hideAttributeValuePreview(element);
    });
    element.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        element.blur();
      }
    });
  }

  function showAttributeValuePreview(source, value, attributeKey) {
    const preview = ensureAttributeInputPreview();
    if (!preview?.content) {
      return;
    }

    const editable = isEditableAttributePreviewSource(source);
    preview.source = source || null;
    preview.host.dataset.sourceAttributeKey = attributeKey || "";
    preview.host.dataset.editable = editable ? "true" : "false";
    preview.host.setAttribute("aria-hidden", editable ? "false" : "true");
    if (editable && preview.editor) {
      preview.editor.hidden = false;
      preview.editor.value = normalizePreviewEditorValue(value);
      preview.editor.dataset.attributeKey = attributeKey || "";
      preview.editor.placeholder = source?.placeholder || "";
      resizeAttributePreviewEditor(preview.editor);
    }
    preview.content.hidden = editable;
    preview.content.textContent = editable ? "" : value;
    preview.host.hidden = false;
  }

  function hideAttributeValuePreview(source, options = {}) {
    const preview = runtime.state.attributeInputPreview;
    if (!preview?.host) {
      return;
    }

    const nextFocus = options.relatedTarget || document.activeElement;
    if (!options.force && isAttributePreviewElement(nextFocus, preview)) {
      return;
    }

    if (!options.force && source && document.activeElement === source) {
      return;
    }

    preview.host.hidden = true;
    preview.host.dataset.editable = "false";
    preview.host.setAttribute("aria-hidden", "true");
    preview.source = null;
    if (preview.content) {
      preview.content.hidden = false;
      preview.content.textContent = "";
    }
    if (preview.editor) {
      preview.editor.hidden = true;
      preview.editor.value = "";
      delete preview.editor.dataset.attributeKey;
    }
    delete preview.host.dataset.sourceAttributeKey;
  }

  function ensureAttributeInputPreview() {
    const parent = getAttributeInputPreviewParent();
    if (!parent) {
      return null;
    }

    const existingPreview = runtime.state.attributeInputPreview;
    if (existingPreview?.host && isUsableAttributePreviewHost(existingPreview.host)) {
      if (existingPreview.host.parentElement !== parent) {
        parent.appendChild(existingPreview.host);
      }
      return existingPreview;
    }

    const host = document.createElement("div");
    host.className = "attribute-input-preview";
    host.hidden = true;
    host.setAttribute("aria-hidden", "true");

    const content = document.createElement("div");
    content.className = "attribute-input-preview-content";
    host.appendChild(content);

    const editor = document.createElement("textarea");
    editor.className = "attribute-input-preview-editor";
    editor.rows = 1;
    editor.spellcheck = false;
    editor.hidden = true;
    bindAttributePreviewEditor(host, editor);
    host.appendChild(editor);
    parent.appendChild(host);

    runtime.state.attributeInputPreview = { host, content, editor, source: null };
    return runtime.state.attributeInputPreview;
  }

  function getAttributeInputPreviewParent() {
    if (runtime.modeRules?.isPlaybackMode?.() === true) {
      const playbackCanvasPane = document.querySelector(".playback-canvas-pane");
      if (playbackCanvasPane) {
        return playbackCanvasPane;
      }
    }

    return runtime.refs?.treeWorkspace || document.querySelector(".tree-workspace");
  }

  function isUsableAttributePreviewHost(host) {
    if (!host) {
      return false;
    }
    if (host.isConnected === true) {
      return true;
    }
    return host.isConnected === undefined && Boolean(host.parentElement);
  }

  function bindAttributePreviewEditor(host, editor) {
    editor.addEventListener("pointerdown", stopInputEvent);
    editor.addEventListener("click", stopInputEvent);
    editor.addEventListener("dblclick", stopInputEvent);
    editor.addEventListener("contextmenu", stopInputEvent);
    editor.addEventListener("copy", stopInputEvent);
    editor.addEventListener("cut", stopInputEvent);
    editor.addEventListener("paste", stopInputEvent);
    editor.addEventListener("input", () => {
      const preview = runtime.state.attributeInputPreview;
      const source = preview?.source;
      const nextValue = normalizePreviewEditorValue(editor.value);
      if (editor.value !== nextValue) {
        editor.value = nextValue;
      }
      if (source) {
        source.value = nextValue;
      }
      resizeAttributePreviewEditor(editor);
    });
    editor.addEventListener("compositionstart", () => {
      editor.dataset.isComposing = "true";
      editor.dataset.justComposed = "false";
    });
    editor.addEventListener("compositionend", () => {
      editor.dataset.isComposing = "false";
      editor.dataset.justComposed = "true";
      window.setTimeout(() => {
        editor.dataset.justComposed = "false";
      }, 80);
    });
    editor.addEventListener("keydown", (event) => {
      if (isTextEditingShortcut(event)) {
        return;
      }

      event.stopPropagation();
      if (event.key === "Enter") {
        if (isInputCompositionEnter(event, editor)) {
          return;
        }
        event.preventDefault();
        runtime.state.attributeInputPreview?.source?.__attributePreviewCommit?.();
        editor.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        const source = runtime.state.attributeInputPreview?.source;
        source?.__attributePreviewCancel?.();
        editor.value = source?.value || "";
        resizeAttributePreviewEditor(editor);
        editor.blur();
      }
    });
    editor.addEventListener("blur", (event) => {
      const preview = runtime.state.attributeInputPreview;
      const source = preview?.source;
      if (source && event.relatedTarget !== source) {
        source.__attributePreviewCommit?.();
      }
      hideAttributeValuePreview(source, { force: true });
    });
    host.addEventListener("pointerdown", stopInputEvent);
  }

  function isEditableAttributePreviewSource(source) {
    return Boolean(source?.classList?.contains("flow-attribute-input") && source.readOnly !== true);
  }

  function isAttributePreviewElement(element, preview) {
    let cursor = element || null;
    while (cursor) {
      if (cursor === preview.host) {
        return true;
      }
      cursor = cursor.parentElement || null;
    }
    return false;
  }

  function resizeAttributePreviewEditor(editor) {
    if (!editor) {
      return;
    }

    const valueLength = normalizePreviewEditorValue(editor.value).length;
    const widthCh = Math.min(Math.max(valueLength + 2, 14), 96);
    editor.style.width = `min(calc(${widthCh}ch + 24px), 100%)`;
    editor.style.height = "auto";
    const scrollHeight = Number(editor.scrollHeight) || 0;
    if (scrollHeight > 0) {
      editor.style.height = `${Math.min(Math.max(scrollHeight, 34), 112)}px`;
    }
  }

  function normalizePreviewEditorValue(value) {
    return String(value || "").replace(/\s*[\r\n]+\s*/g, " ");
  }

  function isTextEditingShortcut(event) {
    if (!event.metaKey && !event.ctrlKey) {
      return false;
    }

    return ["a", "c", "v", "x", "y", "z"].includes(String(event.key || "").toLowerCase());
  }

  function isInputCompositionEnter(event, input) {
    return (
      event.isComposing === true ||
      event.keyCode === 229 ||
      input.dataset.isComposing === "true" ||
      input.dataset.justComposed === "true"
    );
  }

  function stopInputEvent(event) {
    event.stopPropagation();
  }

  function commitNodeAttributeValue(node, field, input, treeId) {
    if (input.dataset.commitInFlight === "true") {
      return;
    }

    const nextValue = input.value || "";
    const originalValue = input.dataset.originalValue || "";
    if (nextValue === originalValue) {
      return;
    }

    if (field.required && !nextValue) {
      input.classList.add("is-invalid");
      input.title = runtime.i18n.getAttributeCopy().requiredAttributeValue(field.key);
      return;
    }

    const attributes = getOptimisticNodeAttributes(node, treeId);
    preserveModeledEmptyAttributes(attributes, node);
    attributes[field.key] = nextValue;

    input.classList.remove("is-invalid");
    input.classList.add("is-saving");
    input.dataset.commitInFlight = "true";
    runtime.state.selectedTreeId = treeId || runtime.state.selectedTreeId;
    runtime.state.selectedNodePath = node.nodePath;
    runtime.state.pendingAttributeEdit = {
      treeId,
      nodePath: node.nodePath,
      attributeKey: field.key,
      attributes,
      previousValue: originalValue,
      nextValue
    };
    setOptimisticNodeAttributes(treeId, node.nodePath, attributes);
    syncAttributeInputs(treeId, node.nodePath, field.key, nextValue, {
      saving: true,
      commitInFlight: true,
      originalValue: nextValue
    });
    stageAttributeEditViewportAnchor(node, input, runtime.state.selectedTreeId);
    runtime.app.persistUiState();
    runtime.vscode.postMessage({
      type: "updateNodeAttributes",
      payload: {
        treeId,
        nodePath: node.nodePath,
        attributes
      }
    });
  }

  function preserveModeledEmptyAttributes(attributes, node) {
    (node?.attributeFields || []).forEach((field) => {
      if (!field?.key || (field.source !== "model" && field.source !== "preset")) {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(attributes, field.key)) {
        attributes[field.key] = "";
      }
    });
  }

  function getOptimisticNodeAttributes(node, treeId) {
    const key = getAttributeSnapshotKey(treeId, node.nodePath);
    const snapshot = runtime.state.pendingAttributeSnapshots?.[key];
    if (snapshot && isAttributeSnapshotCompatible(key, snapshot, node)) {
      return { ...snapshot };
    }
    if (snapshot) {
      deleteOptimisticNodeAttributes(key);
    }
    return { ...(node.attributes || {}) };
  }

  function setOptimisticNodeAttributes(treeId, nodePath, attributes) {
    const key = getAttributeSnapshotKey(treeId, nodePath);
    runtime.state.pendingAttributeSnapshots = {
      ...(runtime.state.pendingAttributeSnapshots || {}),
      [key]: { ...(attributes || {}) }
    };
    runtime.state.pendingAttributeSnapshotKinds = {
      ...(runtime.state.pendingAttributeSnapshotKinds || {}),
      [key]: getCurrentPreviewNodeKind(treeId, nodePath) || ""
    };
  }

  function clearOptimisticNodeAttributes(treeId, nodePath, attributes) {
    const key = getAttributeSnapshotKey(treeId, nodePath);
    const snapshots = runtime.state.pendingAttributeSnapshots || {};
    const snapshot = snapshots[key];
    if (!snapshot || !attributesEqual(snapshot, attributes || {})) {
      return;
    }

    const nextSnapshots = { ...snapshots };
    delete nextSnapshots[key];
    runtime.state.pendingAttributeSnapshots = nextSnapshots;
    deleteOptimisticNodeKind(key);
  }

  function deleteOptimisticNodeAttributes(key) {
    const snapshots = runtime.state.pendingAttributeSnapshots || {};
    if (Object.prototype.hasOwnProperty.call(snapshots, key)) {
      const nextSnapshots = { ...snapshots };
      delete nextSnapshots[key];
      runtime.state.pendingAttributeSnapshots = nextSnapshots;
    }
    deleteOptimisticNodeKind(key);
  }

  function deleteOptimisticNodeKind(key) {
    const kinds = runtime.state.pendingAttributeSnapshotKinds || {};
    if (!Object.prototype.hasOwnProperty.call(kinds, key)) {
      return;
    }
    const nextKinds = { ...kinds };
    delete nextKinds[key];
    runtime.state.pendingAttributeSnapshotKinds = nextKinds;
  }

  function isAttributeSnapshotCompatible(key, snapshot, node) {
    const snapshotKind = runtime.state.pendingAttributeSnapshotKinds?.[key];
    if (snapshotKind && snapshotKind !== node.kind) {
      return false;
    }
    if (!snapshotKind && !snapshotKeysMatchNodeFields(snapshot, node)) {
      return false;
    }
    return true;
  }

  function snapshotKeysMatchNodeFields(snapshot, node) {
    const allowedKeys = new Set((node.attributeFields || []).map((field) => field.key));
    Object.keys(node.attributes || {}).forEach((key) => allowedKeys.add(key));
    return Object.keys(snapshot || {}).every((key) => allowedKeys.has(key));
  }

  function getCurrentPreviewNodeKind(treeId, nodePath) {
    const tree = (runtime.state.currentPreview?.behaviorTrees || []).find((entry) => entry.id === treeId);
    const node = tree?.node ? findPreviewNodeByPath(tree.node, nodePath) : null;
    return node?.kind || "";
  }

  function findPreviewNodeByPath(rootNode, nodePath) {
    const parts = String(nodePath || "").split(".");
    if (!rootNode || parts[0] !== "0") {
      return null;
    }
    let cursor = rootNode;
    for (const part of parts.slice(1)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || !Array.isArray(cursor.children)) {
        return null;
      }
      cursor = cursor.children[index];
      if (!cursor) {
        return null;
      }
    }
    return cursor;
  }

  function getAttributeSnapshotKey(treeId, nodePath) {
    return JSON.stringify([treeId || "", nodePath || ""]);
  }

  function attributesEqual(left, right) {
    return JSON.stringify(left || {}) === JSON.stringify(right || {});
  }

  function syncAttributeInputs(treeId, nodePath, attributeKey, value, options = {}) {
    document.querySelectorAll(getAttributeInputSelector(treeId, nodePath, attributeKey)).forEach((input) => {
      input.value = value;
      input.dataset.originalValue = options.originalValue ?? value;
      input.dataset.commitInFlight = options.commitInFlight ? "true" : "false";
      input.classList.toggle("is-saving", options.saving === true);
      input.classList.remove("is-invalid");
      input.title = "";
    });
  }

  function finishPendingAttributeEdit(ok) {
    const pending = runtime.state.pendingAttributeEdit;
    if (!pending) {
      return;
    }

    const value = ok === false ? pending.previousValue || "" : pending.nextValue || "";
    if (ok === false) {
      clearOptimisticNodeAttributes(pending.treeId, pending.nodePath, pending.attributes || {});
    }
    syncAttributeInputs(pending.treeId, pending.nodePath, pending.attributeKey, value, {
      saving: false,
      commitInFlight: false,
      originalValue: value
    });
    runtime.state.pendingAttributeEdit = null;
  }

  function getAttributeInputSelector(treeId, nodePath, attributeKey) {
    return [
      `.canvas-node[data-tree-id="${CSS.escape(treeId || "")}"]`,
      `[data-node-path="${CSS.escape(nodePath || "")}"]`,
      ` .flow-attribute-input[data-attribute-key="${CSS.escape(attributeKey || "")}"]`
    ].join("");
  }

  function stageAttributeEditViewportAnchor(node, input, treeId) {
    const canvasState = input.closest(".canvas-shell")?.__btreeCanvasState || runtime.state.currentCanvasState;
    if (!canvasState || typeof runtime.viewport.captureNodePositionViewportAnchor !== "function") {
      return;
    }

    const anchor = runtime.viewport.captureNodePositionViewportAnchor(canvasState, node.nodePath, treeId);
    if (anchor) {
      runtime.state.pendingViewportAnchor = anchor;
    }
  }

  function renderDescriptionSection(container, node, options) {
    const editable = runtime.modeRules?.isPlaybackMode?.() !== true && options.interactive !== false;
    if (!editable) {
      return renderTextSection(container, "Description", node.description, "description", true);
    }

    const section = document.createElement("div");
    section.className = "flow-text flow-text-description";

    const label = document.createElement("span");
    label.className = "flow-io-label";
    label.textContent = "Description";
    section.appendChild(label);

    section.appendChild(
      renderAttributeValueControl(
        node,
        {
          key: "_description",
          value: node.description || "",
          role: "param",
          editableKey: false,
          editableValue: true,
          removable: false,
          required: false,
          source: "extra"
        },
        "description",
        options
      )
    );

    container.appendChild(section);
    return true;
  }

  function renderCodeSection(container, node, options) {
    if (!isCodeNode(node)) {
      return false;
    }

    const field = getDedicatedCodeField(node);
    if (!field && !node.code) {
      return false;
    }

    const section = document.createElement("div");
    section.className = "flow-text flow-text-code";

    const label = document.createElement("span");
    label.className = "flow-io-label";
    label.textContent = "Code";
    section.appendChild(label);

    section.appendChild(
      renderAttributeValueControl(
        node,
        field || {
          key: "code",
          value: node.code || "",
          role: "param",
          editableKey: false,
          editableValue: false,
          removable: false,
          required: true,
          source: "builtin"
        },
        "code",
        options
      )
    );

    container.appendChild(section);
    return true;
  }

  function getDedicatedCodeField(node) {
    return (node.attributeFields || []).find((field) => isDedicatedCodeField(node, field)) || null;
  }

  function isDedicatedCodeField(node, field) {
    return isCodeNode(node) && field?.key === "code";
  }

  function isCodeNode(node) {
    return node?.kind === "Script" || node?.kind === "ScriptCondition";
  }

  function renderTextSection(container, title, text, tone, alwaysVisible = false) {
    if (!alwaysVisible && !text) {
      return false;
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
    container.appendChild(section);
    return true;
  }

  runtime.canvas = {
    getNodeRole,
    renderTree,
    renderCanvasTree,
    renderCanvasNode,
    buildNodeCard,
    clearOptimisticNodeAttributes,
    deleteOptimisticNodeAttributes,
    getCanvasRootNode,
    getParentNodePath,
    getNodeIndex,
    clearDragState,
    finishPendingAttributeEdit,
    clearDropMarkers,
    applyDropMarker,
    applyAppendMarker,
    canAppendChildren,
    canDeleteNode
  };
})();
