(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function getTreeRenderMode(scope) {
    const settings = runtime.state.currentSettings || {};
    if (scope === "playback") {
      return settings.playbackTreeRenderMode === "expanded" ? "expanded" : "paged";
    }
    return settings.editTreeRenderMode === "expanded" ? "expanded" : "paged";
  }

  function isExpandedTreeRenderMode(scope) {
    return getTreeRenderMode(scope) === "expanded";
  }

  function getPlaybackPanelLayout() {
    return runtime.state.currentSettings?.playbackPanelLayout === "dashboard" ? "dashboard" : "classic";
  }

  function isPlaybackTimeBasedMode() {
    return runtime.modeRules.isPlaybackMode() && getPlaybackPanelLayout() === "dashboard";
  }

  function getTreeRenderContext(result, scope, getTreeMap) {
    if (!result || !isExpandedTreeRenderMode(scope)) {
      return {
        expanded: false,
        tree: result ? getSelectedTree(result) : null,
        renderResult: result,
        switcherResult: result,
        rootTreeId: runtime.state.selectedTreeId || result?.defaultTreeId || null
      };
    }

    const treeMap = getTreeMap(result);
    const rootTreeId = pickExpandedRenderRootTreeId(result, treeMap);
    const rootTree = rootTreeId ? treeMap.get(rootTreeId) || null : null;
    const expandedTree = rootTree ? buildExpandedRenderTree(rootTree, treeMap) : null;
    const switcherResult = expandedTree
      ? {
        ...result,
        defaultTreeId: expandedTree.id,
        mainTreeToExecute: expandedTree.id,
        behaviorTrees: [expandedTree]
      }
      : {
        ...result,
        behaviorTrees: []
      };

    return {
      expanded: true,
      tree: expandedTree,
      renderResult: result,
      switcherResult,
      rootTreeId
    };
  }

  function ensureRenderSelection(renderContext) {
    if (!renderContext?.expanded || !renderContext.tree?.node) {
      return;
    }

    if (findRenderNodeByTreePath(renderContext.tree.node, runtime.state.selectedTreeId, runtime.state.selectedNodePath)) {
      return;
    }

    runtime.state.selectedTreeId = renderContext.rootTreeId;
    runtime.state.selectedNodePath = "0";
  }

  function getSelectedTree(result) {
    return (
      (runtime.state.selectedTreeId &&
        result.behaviorTrees.find((tree) => tree.id === runtime.state.selectedTreeId)) ||
      result.behaviorTrees.find((tree) => tree.id === result.defaultTreeId) ||
      result.behaviorTrees[0] ||
      null
    );
  }

  function pickExpandedRenderRootTreeId(result, treeMap) {
    if (result?.defaultTreeId && treeMap.has(result.defaultTreeId)) {
      return result.defaultTreeId;
    }
    if (result?.mainTreeToExecute && treeMap.has(result.mainTreeToExecute)) {
      return result.mainTreeToExecute;
    }
    if (treeMap.has("MainTree")) {
      return "MainTree";
    }
    return result?.behaviorTrees?.[0]?.id || null;
  }

  function buildExpandedRenderTree(rootTree, treeMap) {
    return {
      ...rootTree,
      sourceTreeId: rootTree.id,
      expandedRenderTree: true,
      node: rootTree.node
        ? cloneExpandedRenderNode(rootTree.node, rootTree.id, treeMap, new Set([rootTree.id]), `${rootTree.id}::`)
        : null
    };
  }

  function cloneExpandedRenderNode(node, sourceTreeId, treeMap, treeStack, renderPrefix) {
    const renderPath = `${renderPrefix}${sourceTreeId}:${node.nodePath}`;
    const children = (node.children || []).map((child) =>
      cloneExpandedRenderNode(child, sourceTreeId, treeMap, treeStack, `${renderPath}/`)
    );
    const clone = {
      ...node,
      sourceTreeId,
      renderPath,
      children
    };

    if (node.kind !== "SubTree" || !node.targetTreeId) {
      return clone;
    }

    const targetTree = treeMap.get(node.targetTreeId);
    if (!targetTree?.node || treeStack.has(node.targetTreeId)) {
      return clone;
    }

    const nextStack = new Set(treeStack);
    nextStack.add(node.targetTreeId);
    const expandedChild = cloneExpandedRenderNode(targetTree.node, targetTree.id, treeMap, nextStack, `${renderPath}=>`);
    expandedChild.expandedSubtreeInjection = true;
    clone.children = [...children, expandedChild];
    return clone;
  }

  function findRenderNodeByTreePath(node, treeId, nodePath) {
    if (!node || !treeId || !nodePath) {
      return null;
    }
    if ((node.sourceTreeId || "") === treeId && node.nodePath === nodePath) {
      return node;
    }
    for (const child of node.children || []) {
      const match = findRenderNodeByTreePath(child, treeId, nodePath);
      if (match) {
        return match;
      }
    }
    return null;
  }

  runtime.treeRender = {
    getTreeRenderMode,
    isExpandedTreeRenderMode,
    getPlaybackPanelLayout,
    isPlaybackTimeBasedMode,
    getTreeRenderContext,
    ensureRenderSelection,
    findRenderNodeByTreePath
  };
})();
