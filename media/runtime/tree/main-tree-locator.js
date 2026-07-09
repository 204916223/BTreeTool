(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const SVG_NS = "http://www.w3.org/2000/svg";

  function renderMainTreeLocator(result, selectedTree) {
    const host = runtime.refs.mainTreeLocator;
    if (!host) {
      return;
    }

    if (runtime.modeRules?.isEditingEnabled && !runtime.modeRules.isEditingEnabled()) {
      clearMainTreeLocator();
      return;
    }

    const mainTree = getMainTreeForLocator(result);
    if (
      runtime.state.currentSettings?.showMainTreeLocator === false ||
      !result ||
      !selectedTree ||
      !mainTree ||
      selectedTree.id === mainTree.id ||
      !mainTree.node
    ) {
      clearMainTreeLocator();
      return;
    }

    const focusTreeId = resolveMainTreeLocatorFocusTreeId(result, selectedTree.id, mainTree.id);
    if (!focusTreeId) {
      clearMainTreeLocator();
      return;
    }

    const copy = runtime.i18n.getMainTreeLocatorCopy();
    const layout = buildMainTreeLocatorLayout(result, mainTree, focusTreeId);
    host.hidden = false;
    host.setAttribute("aria-label", copy.ariaLabel);

    const header = document.createElement("div");
    header.className = "main-tree-locator-header";

    const title = document.createElement("strong");
    title.className = "main-tree-locator-title";
    title.textContent = mainTree.id;

    const current = document.createElement("span");
    current.className = "main-tree-locator-current";
    current.textContent = copy.currentTree(selectedTree.id);

    header.appendChild(title);
    header.appendChild(current);
    host.replaceChildren(header, renderMainTreeLocatorSvg(result, mainTree, layout));
  }

  function clearMainTreeLocator() {
    const host = runtime.refs.mainTreeLocator;
    if (!host) {
      return;
    }
    host.hidden = true;
    host.replaceChildren();
  }

  function getMainTreeForLocator(result) {
    if (!result) {
      return null;
    }

    const treeMap = runtime.app.getTreeMap(result);
    const mainTreeId = result.mainTreeToExecute && treeMap.has(result.mainTreeToExecute)
      ? result.mainTreeToExecute
      : treeMap.has("MainTree")
        ? "MainTree"
        : result.defaultTreeId;
    return mainTreeId ? treeMap.get(mainTreeId) || null : null;
  }

  function buildMainTreeLocatorLayout(result, tree, focusTreeId) {
    const config = {
      nodeWidth: 78,
      nodeHeight: 24,
      horizontalGap: 22,
      verticalGap: 38,
      paddingX: 18,
      paddingY: 16
    };
    const treeMap = runtime.app.getTreeMap(result);
    const measuredRoot = measure(tree.node, tree.id, new Set([tree.id]), true);
    const positionedRoot = position(measuredRoot, config.paddingX, config.paddingY);
    const nodes = [];
    const edges = [];
    let maxX = 0;
    let maxY = 0;

    collect(positionedRoot);

    return {
      width: Math.max(maxX + config.paddingX, 180),
      height: Math.max(maxY + config.paddingY, 120),
      nodes,
      edges
    };

    function measure(node, sourceTreeId, branchTreeIds, includeNodeChildren) {
      const marker = getMainTreeLocatorMarker(node, focusTreeId);
      const children = includeNodeChildren
        ? (node.children || []).map((child) => measure(child, sourceTreeId, branchTreeIds, true))
        : [];
      const targetTreeId = node.kind === "SubTree" ? node.targetTreeId : "";
      if (targetTreeId && treeMap.has(targetTreeId) && !branchTreeIds.has(targetTreeId)) {
        const targetTree = treeMap.get(targetTreeId);
        if (targetTree?.node) {
          const nestedSubTrees = collectSubTreeReferences(targetTree.node);
          const nextBranchTreeIds = new Set([...branchTreeIds, targetTreeId]);
          nestedSubTrees.forEach((subTreeNode) => {
            children.push(measure(subTreeNode, targetTreeId, nextBranchTreeIds, false));
          });
        }
      }
      const childrenWidth =
        children.reduce((sum, child) => sum + child.subtreeWidth, 0) +
        config.horizontalGap * Math.max(0, children.length - 1);
      const subtreeWidth = children.length > 0
        ? Math.max(config.nodeWidth, childrenWidth)
        : config.nodeWidth;

      return {
        node,
        sourceTreeId,
        marker,
        children,
        width: config.nodeWidth,
        height: config.nodeHeight,
        subtreeWidth,
        subtreeHeight: config.nodeHeight + (children.length > 0 ? config.verticalGap : 0) +
          Math.max(0, ...children.map((child) => child.subtreeHeight))
      };
    }

    function position(entry, offsetX, offsetY) {
      const nodeX = offsetX + (entry.subtreeWidth - entry.width) / 2;
      const nodeY = offsetY;
      const children = [];
      if (entry.children.length > 0) {
        const totalChildrenWidth =
          entry.children.reduce((sum, child) => sum + child.subtreeWidth, 0) +
          config.horizontalGap * Math.max(0, entry.children.length - 1);
        let cursorX = offsetX + (entry.subtreeWidth - totalChildrenWidth) / 2;
        const childY = offsetY + entry.height + config.verticalGap;
        entry.children.forEach((child) => {
          const positionedChild = position(child, cursorX, childY);
          children.push(positionedChild);
          cursorX += child.subtreeWidth + config.horizontalGap;
        });
      }

      return {
        ...entry,
        x: nodeX,
        y: nodeY,
        children
      };
    }

    function collect(entry, parent) {
      const descriptor = {
        node: entry.node,
        sourceTreeId: entry.sourceTreeId,
        marker: entry.marker,
        x: entry.x,
        y: entry.y,
        width: entry.width,
        height: entry.height,
        centerX: entry.x + entry.width / 2,
        centerY: entry.y + entry.height / 2
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

  function collectSubTreeReferences(root) {
    const references = [];
    walkNode(root, (node) => {
      if (node?.kind === "SubTree" && node.targetTreeId) {
        references.push(node);
      }
    });
    return references;
  }

  function walkNode(node, visitor) {
    if (!node) {
      return;
    }
    visitor(node);
    (node.children || []).forEach((child) => walkNode(child, visitor));
  }

  function renderMainTreeLocatorSvg(result, tree, layout) {
    const copy = runtime.i18n.getMainTreeLocatorCopy();
    const treeMap = runtime.app.getTreeMap(result);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "main-tree-locator-map");
    svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    layout.edges.forEach((edge) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", renderZEdgePath(edge));
      path.setAttribute(
        "class",
        "main-tree-locator-edge"
      );
      svg.appendChild(path);
    });

    layout.nodes.forEach((entry) => {
      const group = document.createElementNS(SVG_NS, "g");
      group.setAttribute(
        "class",
        [
          "main-tree-locator-node",
          entry.marker ? `is-${entry.marker}` : ""
        ].filter(Boolean).join(" ")
      );
      group.setAttribute("role", "button");
      group.setAttribute("tabindex", "0");
      const sourceTreeId = entry.sourceTreeId || tree.id;
      const targetTreeId = entry.node.kind === "SubTree" ? entry.node.targetTreeId : "";
      group.setAttribute(
        "aria-label",
        targetTreeId && treeMap.has(targetTreeId)
          ? copy.openSubTree(targetTreeId)
          : copy.focusNode(sourceTreeId, entry.node.title)
      );

      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = [sourceTreeId, entry.node.title, entry.node.targetTreeId].filter(Boolean).join(" / ");
      group.appendChild(title);

      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("class", "main-tree-locator-node-box");
      rect.setAttribute("x", String(entry.x));
      rect.setAttribute("y", String(entry.y));
      rect.setAttribute("width", String(entry.width));
      rect.setAttribute("height", String(entry.height));
      rect.setAttribute("rx", "4");
      rect.setAttribute("ry", "4");
      group.appendChild(rect);

      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("class", "main-tree-locator-node-label");
      label.setAttribute("x", String(entry.centerX));
      label.setAttribute("y", String(entry.centerY + 0.5));
      label.textContent = abbreviateLocatorLabel(entry.node.title || entry.node.kind);
      group.appendChild(label);

      const focusLocatorNode = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (targetTreeId && treeMap.has(targetTreeId)) {
          runtime.treeNavigation.navigateToSubTree(result, sourceTreeId, entry.node.nodePath, targetTreeId);
        } else {
          runtime.state.selectedTreeId = sourceTreeId;
          runtime.state.selectedNodePath = entry.node.nodePath;
          runtime.editAssistant?.syncSelectedNodePrompt?.();
          runtime.app.persistUiState();
          runtime.app.renderCurrentTree(result, { ensureActiveTreeVisible: true });
        }
        requestAnimationFrame(() => {
          if (runtime.state.selectedTreeId === sourceTreeId) {
            runtime.viewport.focusNodePath(entry.node.nodePath, sourceTreeId);
          }
        });
      };

      group.addEventListener("click", focusLocatorNode);
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          focusLocatorNode(event);
        }
      });

      svg.appendChild(group);
    });

    return svg;
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

  function getMainTreeLocatorMarker(node, focusTreeId) {
    if (node.kind !== "SubTree" || !node.targetTreeId || !focusTreeId) {
      return "";
    }
    return node.targetTreeId === focusTreeId ? "current" : "";
  }

  function resolveMainTreeLocatorFocusTreeId(result, selectedTreeId, mainTreeId) {
    if (!result || !selectedTreeId || !mainTreeId || selectedTreeId === mainTreeId) {
      return null;
    }

    const visited = new Set();
    let currentTreeId = selectedTreeId;

    while (currentTreeId && currentTreeId !== mainTreeId && !visited.has(currentTreeId)) {
      visited.add(currentTreeId);
      const parentReference = runtime.treeNavigation.findParentTreeReference(result, currentTreeId);
      if (!parentReference) {
        return null;
      }
      currentTreeId = parentReference.treeId;
    }

    return currentTreeId === mainTreeId ? selectedTreeId : null;
  }

  function abbreviateLocatorLabel(label) {
    const normalized = String(label || "").trim();
    if (normalized.length <= 12) {
      return normalized;
    }
    return `${normalized.slice(0, 10)}...`;
  }

  runtime.mainTreeLocator = {
    render: renderMainTreeLocator,
    clear: clearMainTreeLocator
  };
})();
