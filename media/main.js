(function () {
  const vscode = acquireVsCodeApi();
  const persistedState = vscode.getState() || {};
  let selectedTreeId = persistedState.selectedTreeId || null;

  const docBadge = document.getElementById("doc-badge");
  const fileName = document.getElementById("file-name");
  const filePath = document.getElementById("file-path");
  const languageId = document.getElementById("language-id");
  const treeCount = document.getElementById("tree-count");
  const modelCount = document.getElementById("model-count");
  const activeTree = document.getElementById("active-tree");
  const treeSwitcher = document.getElementById("tree-switcher");
  const treeHint = document.getElementById("tree-hint");
  const treeRoot = document.getElementById("tree-root");
  const zoomOutButton = document.getElementById("zoom-out");
  const zoomInButton = document.getElementById("zoom-in");
  const zoomFitButton = document.getElementById("zoom-fit");
  const zoomLevelLabel = document.getElementById("zoom-level");

  let currentCanvasState = null;
  let currentZoom = 1;
  const MIN_ZOOM = 0.45;
  const MAX_ZOOM = 1.8;

  window.addEventListener("message", (event) => {
    const message = event.data;

    if (message?.type !== "btreeDocument") {
      return;
    }

    render(message.payload);
  });

  vscode.postMessage({ type: "ready" });

  zoomOutButton?.addEventListener("click", () => zoomCanvas(-0.1));
  zoomInButton?.addEventListener("click", () => zoomCanvas(0.1));
  zoomFitButton?.addEventListener("click", () => fitCanvas());

  updateZoomLabel();

  function render(payload) {
    docBadge.textContent = payload.hasDocument ? "Loaded" : "Waiting";
    fileName.textContent = toBaseName(payload.fileName);
    filePath.textContent = payload.hasDocument ? payload.fileName : "Open an XML file to inspect its behavior tree.";
    languageId.textContent = payload.languageId;

    if (!payload.hasDocument || !payload.source.trim()) {
      currentCanvasState = null;
      currentZoom = 1;
      updateZoomLabel();
      treeCount.textContent = "0";
      modelCount.textContent = "0";
      activeTree.textContent = "none";
      treeSwitcher.replaceChildren();
      treeHint.textContent = "Open an XML file to inspect its flow canvas.";
      treeRoot.replaceChildren(emptyState("Open a BehaviorTree XML file to see a parsed outline here."));
      return;
    }

    try {
      const result = parseBehaviorTree(payload.source);
      treeCount.textContent = String(result.behaviorTrees.length);
      modelCount.textContent = String(result.modelCount);

      if (result.behaviorTrees.length === 0) {
        currentCanvasState = null;
        currentZoom = 1;
        updateZoomLabel();
        activeTree.textContent = "none";
        treeSwitcher.replaceChildren();
        treeHint.textContent = "This XML parsed successfully, but it does not define any <BehaviorTree> blocks.";
        treeRoot.replaceChildren(
          emptyState("The file is valid XML, but no <BehaviorTree> nodes were found yet.")
        );
        return;
      }

      selectedTreeId = pickTreeId(result);
      vscode.setState({ selectedTreeId });

      activeTree.textContent = selectedTreeId;
      renderTreeSwitcher(result);

      const selectedTree = result.treeMap.get(selectedTreeId);
      if (!selectedTree) {
        treeHint.textContent = "Select a tree to inspect its flow canvas.";
        treeRoot.replaceChildren(emptyState("The selected tree could not be found in this document."));
        return;
      }

      treeHint.textContent =
        selectedTreeId === result.defaultTreeId
          ? `Showing ${selectedTreeId}. This is the default entry tree for this file.`
          : `Showing ${selectedTreeId}. Use the tree tabs above or SubTree jump buttons to navigate.`;

      treeRoot.replaceChildren(renderTree(selectedTree, result));
    } catch (error) {
      treeCount.textContent = "0";
      modelCount.textContent = "0";
      activeTree.textContent = "none";
      treeSwitcher.replaceChildren();
      treeHint.textContent = "The XML could not be parsed.";
      treeRoot.replaceChildren(
        emptyState(`XML parse failed: ${error instanceof Error ? error.message : String(error)}`)
      );
    }
  }

  function toBaseName(fileName) {
    if (!fileName || fileName === "No active document") {
      return "No active document";
    }

    const normalized = fileName.replace(/\\/g, "/");
    const segments = normalized.split("/");
    return segments[segments.length - 1] || fileName;
  }

  function parseBehaviorTree(source) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(source, "text/xml");
    const parserError = xml.querySelector("parsererror");

    if (parserError) {
      throw new Error(parserError.textContent || "Unknown parse error");
    }

    const modelMap = parseTreeNodesModel(xml);

    const behaviorTrees = Array.from(xml.getElementsByTagName("BehaviorTree"))
      .map((element) => {
        const firstElementChild = Array.from(element.children).find(Boolean);
        return {
          id: element.getAttribute("ID") || "BehaviorTree",
          node: firstElementChild ? toTreeNode(firstElementChild, modelMap) : null
        };
      })
      .filter((tree) => tree.node !== null);

    const treeMap = new Map(behaviorTrees.map((tree) => [tree.id, tree]));

    return {
      modelCount: xml.getElementsByTagName("TreeNodesModel").length > 0
        ? xml.getElementsByTagName("TreeNodesModel")[0].children.length
        : 0,
      behaviorTrees,
      treeMap,
      modelMap,
      defaultTreeId: treeMap.has("MainTree") ? "MainTree" : behaviorTrees[0]?.id || null
    };
  }

  function parseTreeNodesModel(xml) {
    const modelMap = new Map();
    const treeNodesModel = xml.getElementsByTagName("TreeNodesModel")[0];

    if (!treeNodesModel) {
      return modelMap;
    }

    Array.from(treeNodesModel.children).forEach((modelElement) => {
      const id = modelElement.getAttribute("ID");
      if (!id) {
        return;
      }

      const ports = {
        input: [],
        output: [],
        inout: []
      };

      Array.from(modelElement.children).forEach((portElement) => {
        const portName = portElement.getAttribute("name");
        if (!portName) {
          return;
        }

        if (portElement.tagName === "input_port") {
          ports.input.push(portName);
        } else if (portElement.tagName === "output_port") {
          ports.output.push(portName);
        } else if (portElement.tagName === "inout_port") {
          ports.inout.push(portName);
        }
      });

      modelMap.set(id, {
        id,
        modelKind: modelElement.tagName,
        ports
      });
    });

    return modelMap;
  }

  function toTreeNode(element, modelMap) {
    const attributes = Object.fromEntries(
      Array.from(element.attributes).map((attribute) => [attribute.name, attribute.value])
    );
    const model = modelMap.get(element.tagName) || modelMap.get(element.getAttribute("ID") || "");
    const title = getNodeTitle(element, model);
    const ioGroups = groupAttributes(attributes, model);

    return {
      label: element.getAttribute("name") || element.getAttribute("ID") || element.tagName,
      kind: element.tagName,
      title,
      targetTreeId: element.tagName === "SubTree" ? element.getAttribute("ID") || "" : "",
      summary: getNodeSummary(element.tagName, attributes),
      attributes,
      ioGroups,
      modelKind: model?.modelKind || "",
      children: Array.from(element.children).map((child) => toTreeNode(child, modelMap))
    };
  }

  function getNodeTitle(element, model) {
    const explicitName = element.getAttribute("name");
    if (explicitName) {
      return explicitName;
    }

    if (element.tagName === "SubTree") {
      return element.getAttribute("ID") || "SubTree";
    }

    if (model?.id && model.id !== element.tagName) {
      return model.id;
    }

    return element.tagName;
  }

  function groupAttributes(attributes, model) {
    const groups = {
      inputs: [],
      outputs: [],
      params: []
    };

    const inputPorts = new Set(model?.ports.input || []);
    const outputPorts = new Set(model?.ports.output || []);
    const inoutPorts = new Set(model?.ports.inout || []);

    Object.entries(attributes)
      .filter(([key]) => key !== "name" && key !== "ID")
      .forEach(([key, value]) => {
        const entry = { key, value };

        if (inputPorts.has(key)) {
          groups.inputs.push(entry);
          return;
        }

        if (outputPorts.has(key)) {
          groups.outputs.push(entry);
          return;
        }

        if (inoutPorts.has(key)) {
          groups.inputs.push(entry);
          groups.outputs.push(entry);
          return;
        }

        groups.params.push(entry);
      });

    return groups;
  }

  function getNodeSummary(kind, attributes) {
    if (kind === "Script" && attributes.code) {
      return attributes.code;
    }

    if (kind === "Precondition" && attributes.if) {
      return `if ${attributes.if}`;
    }

    if (kind === "RetryUntilSuccessful" && attributes.num_attempts) {
      return `attempts ${attributes.num_attempts}`;
    }

    if (kind === "Parallel") {
      const parts = [];

      if (attributes.success_count) {
        parts.push(`success ${attributes.success_count}`);
      }
      if (attributes.failure_count) {
        parts.push(`failure ${attributes.failure_count}`);
      }

      return parts.join(" • ");
    }

    if (kind === "SubTree" && attributes.ID) {
      return `jump to ${attributes.ID}`;
    }

    const preferredKeys = ["ID", "action_cmd", "message", "target_position", "result", "if"];

    for (const key of preferredKeys) {
      if (attributes[key]) {
        return `${key}: ${attributes[key]}`;
      }
    }

    return "";
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
    if (selectedTreeId && result.treeMap.has(selectedTreeId)) {
      return selectedTreeId;
    }

    return result.defaultTreeId;
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
        vscode.setState({ selectedTreeId });
        renderCurrentTree(result);
      });
      fragment.appendChild(button);
    });

    treeSwitcher.replaceChildren(fragment);
  }

  function renderCurrentTree(result) {
    activeTree.textContent = selectedTreeId || "none";
    renderTreeSwitcher(result);

    const selectedTree = result.treeMap.get(selectedTreeId);
    if (!selectedTree) {
      treeHint.textContent = "The selected tree could not be found in this document.";
      treeRoot.replaceChildren(emptyState("The selected tree could not be found in this document."));
      return;
    }

    treeHint.textContent =
      selectedTreeId === result.defaultTreeId
        ? `Showing ${selectedTreeId}. This is the default entry tree for this file.`
        : `Showing ${selectedTreeId}. Use the tree tabs above or SubTree jump buttons to navigate.`;

    treeRoot.replaceChildren(renderTree(selectedTree, result));
  }

  function renderTree(tree, result) {
    const section = document.createElement("section");
    section.className = "tree-section";

    const header = document.createElement("div");
    header.className = "tree-section-header";

    const title = document.createElement("h3");
    title.className = "tree-section-title";
    title.textContent = tree.id;

    const subtitle = document.createElement("p");
    subtitle.className = "tree-section-subtitle";
    subtitle.textContent = tree.id === "MainTree" ? "Primary flow" : "SubTree flow";

    header.appendChild(title);
    header.appendChild(subtitle);
    section.appendChild(header);
    section.appendChild(renderCanvasTree(tree.node, result));
    return section;
  }

  function renderCanvasTree(rootNode, result) {
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

    currentCanvasState = { shell, stage, layout };
    currentZoom = 1;
    applyZoom(1, false);

    requestAnimationFrame(() => {
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
    const compact = role === "action" && !node.summary && node.ioGroups.inputs.length === 0 && node.ioGroups.outputs.length === 0;
    const width = clamp(
      Math.max(
        textWidth(node.title, 8.8) + 68,
        textWidth(getNodeBadge(node), 6.4) + 34,
        node.summary ? textWidth(node.summary, 6.6) + 28 : 0
      ),
      compact ? 180 : 210,
      280
    );

    let height = compact ? 72 : 82;
    if (node.summary) {
      height += summaryHeight(node.summary, width - 28);
    }

    height += measureIoHeight(node.ioGroups.inputs, width);
    height += measureIoHeight(node.ioGroups.outputs, width);
    height += measureIoHeight(node.ioGroups.params.slice(0, 3), width);

    if (node.kind === "SubTree" && node.targetTreeId) {
      height += 34;
    }

    return {
      width,
      height: Math.max(height, compact ? 72 : 88)
    };
  }

  function measureIoHeight(entries, width) {
    if (!entries || entries.length === 0) {
      return 0;
    }

    const contentWidth = width - 28;
    let rows = 1;
    let currentRowWidth = 0;

    entries.forEach(({ key, value }) => {
      const chipWidth = clamp(textWidth(`${key}=${value}`, 6.2) + 18, 64, contentWidth);
      if (currentRowWidth === 0) {
        currentRowWidth = chipWidth;
        return;
      }

      if (currentRowWidth + 8 + chipWidth > contentWidth) {
        rows += 1;
        currentRowWidth = chipWidth;
        return;
      }

      currentRowWidth += 8 + chipWidth;
    });

    return 18 + rows * 24;
  }

  function summaryHeight(text, width) {
    const charsPerLine = Math.max(12, Math.floor(width / 7));
    return Math.min(3, Math.ceil(text.length / charsPerLine)) * 16;
  }

  function textWidth(text, glyphWidth) {
    return String(text || "").length * glyphWidth;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function renderCanvasNode(entry, result) {
    const wrapper = document.createElement("div");
    wrapper.className = "canvas-node";
    wrapper.style.left = `${entry.x}px`;
    wrapper.style.top = `${entry.y}px`;
    wrapper.style.width = `${entry.width}px`;
    wrapper.style.height = `${entry.height}px`;

    const card = document.createElement("div");
    const role = getNodeRole(entry.node.kind, entry.node.children.length);
    card.className = `flow-card flow-card-${role}`;

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
    card.appendChild(heading);

    if (entry.node.summary) {
      const summary = document.createElement("span");
      summary.className = "flow-node-summary";
      summary.textContent = entry.node.summary;
      card.appendChild(summary);
    }

    renderIoSection(card, "Inputs", entry.node.ioGroups.inputs, "input");
    renderIoSection(card, "Outputs", entry.node.ioGroups.outputs, "output");
    renderIoSection(card, "Params", entry.node.ioGroups.params.slice(0, 3), "param");

    if (entry.node.kind === "SubTree" && entry.node.targetTreeId && result.treeMap.has(entry.node.targetTreeId)) {
      const jumpButton = document.createElement("button");
      jumpButton.type = "button";
      jumpButton.className = "subtree-jump";
      jumpButton.textContent = `Open ${entry.node.targetTreeId}`;
      jumpButton.addEventListener("click", () => {
        selectedTreeId = entry.node.targetTreeId;
        vscode.setState({ selectedTreeId });
        renderCurrentTree({
          behaviorTrees: Array.from(result.treeMap.values()),
          treeMap: result.treeMap,
          modelMap: result.modelMap,
          defaultTreeId: result.treeMap.has("MainTree") ? "MainTree" : Array.from(result.treeMap.keys())[0]
        });
        document.querySelector(".tree-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      card.appendChild(jumpButton);
    }

    wrapper.appendChild(card);
    return wrapper;
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
      const chip = document.createElement("span");
      chip.className = `flow-attribute-chip tone-${tone}`;
      chip.textContent = `${key}=${value}`;
      list.appendChild(chip);
    });

    section.appendChild(list);
    card.appendChild(section);
  }

  function enableCanvasPan(shell) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let initialScrollLeft = 0;
    let initialScrollTop = 0;

    shell.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) {
        return;
      }

      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      initialScrollLeft = shell.scrollLeft;
      initialScrollTop = shell.scrollTop;
      shell.classList.add("is-dragging");
      shell.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    shell.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }

      shell.scrollLeft = initialScrollLeft - (event.clientX - startX);
      shell.scrollTop = initialScrollTop - (event.clientY - startY);
    });

    const stopDragging = () => {
      if (!dragging) {
        return;
      }

      dragging = false;
      shell.classList.remove("is-dragging");
    };

    shell.addEventListener("pointerup", stopDragging);
    shell.addEventListener("pointercancel", stopDragging);

    shell.addEventListener(
      "wheel",
      (event) => {
        if (!(event.ctrlKey || event.metaKey)) {
          return;
        }

        event.preventDefault();
        const delta = event.deltaY < 0 ? 0.08 : -0.08;
        zoomCanvas(delta, { originX: event.clientX, originY: event.clientY });
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

    requestAnimationFrame(() => {
      const scaledWidth = layout.width * currentZoom;
      const targetLeft = Math.max(0, layout.rootCenterX * currentZoom - shell.clientWidth / 2);
      shell.scrollLeft = Math.min(targetLeft, Math.max(0, scaledWidth - shell.clientWidth));
      shell.scrollTop = 0;
    });
  }

  function applyZoom(nextZoom, preserveCenter, origin) {
    if (!currentCanvasState) {
      return;
    }

    const { shell, stage, layout } = currentCanvasState;
    const previousZoom = currentZoom;
    currentZoom = nextZoom;

    stage.style.transform = `scale(${currentZoom})`;
    stage.style.transformOrigin = "top left";
    stage.style.width = `${layout.width * currentZoom}px`;
    stage.style.height = `${layout.height * currentZoom}px`;
    updateZoomLabel();

    if (!preserveCenter) {
      return;
    }

    requestAnimationFrame(() => {
      const rect = shell.getBoundingClientRect();
      const pointerX = origin ? origin.originX - rect.left + shell.scrollLeft : shell.clientWidth / 2 + shell.scrollLeft;
      const pointerY = origin ? origin.originY - rect.top + shell.scrollTop : shell.clientHeight / 2 + shell.scrollTop;
      const worldX = pointerX / previousZoom;
      const worldY = pointerY / previousZoom;

      shell.scrollLeft = Math.max(0, worldX * currentZoom - (origin ? origin.originX - rect.left : shell.clientWidth / 2));
      shell.scrollTop = Math.max(0, worldY * currentZoom - (origin ? origin.originY - rect.top : shell.clientHeight / 2));
    });
  }

  function updateZoomLabel() {
    if (zoomLevelLabel) {
      zoomLevelLabel.textContent = `${Math.round(currentZoom * 100)}%`;
    }
  }

  function emptyState(message) {
    const paragraph = document.createElement("p");
    paragraph.className = "empty-state";
    paragraph.textContent = message;
    return paragraph;
  }
})();
