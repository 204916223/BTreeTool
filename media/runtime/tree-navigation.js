(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function navigateToSubTree(result, parentTreeId, sourceNodePath, targetTreeId) {
    if (!result || !targetTreeId || !runtime.app.getTreeMap(result).has(targetTreeId)) {
      return;
    }

    if (parentTreeId && sourceNodePath) {
      runtime.state.treeNavigationParents = {
        ...(runtime.state.treeNavigationParents || {}),
        [targetTreeId]: {
          treeId: parentTreeId,
          nodePath: sourceNodePath
        }
      };
    }

    runtime.state.selectedTreeId = targetTreeId;
    runtime.state.selectedNodePath = "0";
    runtime.app.persistUiState();
    runtime.app.renderCurrentTree(result, { ensureActiveTreeVisible: true });
  }

  function navigateToParentTree(result, treeId) {
    const parentReference = findParentTreeReference(result, treeId);
    if (!parentReference) {
      return;
    }

    runtime.state.selectedTreeId = parentReference.treeId;
    runtime.state.selectedNodePath = parentReference.nodePath || "0";
    runtime.app.persistUiState();
    runtime.app.renderCurrentTree(result, { ensureActiveTreeVisible: true });
    requestAnimationFrame(() => {
      if (parentReference.nodePath) {
        runtime.viewport.focusNodePath(parentReference.nodePath);
      }
    });
  }

  function findParentTreeReference(result, treeId) {
    if (!result || !treeId) {
      return null;
    }

    const savedReference = runtime.state.treeNavigationParents?.[treeId];
    if (savedReference && runtime.app.getTreeMap(result).has(savedReference.treeId)) {
      const parentTree = runtime.app.getTreeMap(result).get(savedReference.treeId);
      if (!savedReference.nodePath || runtime.app.findNodeByPath(parentTree.node, savedReference.nodePath)) {
        return savedReference;
      }
    }

    for (const tree of result.behaviorTrees || []) {
      let parentReference = null;
      walkTree(tree.node, (node) => {
        if (parentReference || node.kind !== "SubTree" || node.targetTreeId !== treeId) {
          return;
        }
        parentReference = {
          treeId: tree.id,
          nodePath: node.nodePath
        };
      });
      if (parentReference) {
        return parentReference;
      }
    }

    return null;
  }

  function walkTree(node, visitor) {
    if (!node) {
      return;
    }
    visitor(node);
    (node.children || []).forEach((child) => walkTree(child, visitor));
  }

  runtime.treeNavigation = {
    navigateToSubTree,
    navigateToParentTree,
    findParentTreeReference
  };
})();
