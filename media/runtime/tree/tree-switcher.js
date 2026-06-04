(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function renderTreeSwitcher(result, options = {}) {
    const ensureActiveVisible = options.ensureActiveVisible === true;
    const activeTreeId = options.activeTreeId || runtime.state.selectedTreeId;
    const selectResult = options.selectResult || result;
    runtime.state.treeSwitcherActiveTreeId = options.activeTreeId || null;
    const previousScrollLeft = runtime.refs.treeSwitcher?.scrollLeft || runtime.state.treeSwitcherScrollLeft || 0;
    const fragment = document.createDocumentFragment();
    let activeButton = null;
    getUniqueBehaviorTrees(result).forEach((tree) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.treeId = tree.id;
      button.className = tree.id === activeTreeId ? "tree-tab is-active" : "tree-tab";
      button.textContent = tree.id;
      if (tree.id === activeTreeId) {
        activeButton = button;
      }
      button.addEventListener("click", () => {
        runtime.app.selectTreeInActivePane(tree.id, selectResult);
      });
      fragment.appendChild(button);
    });
    runtime.refs.treeSwitcher.replaceChildren(fragment);
    requestAnimationFrame(() => {
      if (!runtime.refs.treeSwitcher) {
        return;
      }

      if (ensureActiveVisible && activeButton) {
        activeButton.scrollIntoView({ block: "nearest", inline: "nearest" });
      } else {
        runtime.refs.treeSwitcher.scrollLeft = previousScrollLeft;
      }

      runtime.state.treeSwitcherScrollLeft = runtime.refs.treeSwitcher.scrollLeft || 0;
    });
  }

  function getUniqueBehaviorTrees(result) {
    const seenTreeIds = new Set();
    const trees = [];
    (result?.behaviorTrees || []).forEach((tree) => {
      if (!tree?.id || seenTreeIds.has(tree.id)) {
        return;
      }
      seenTreeIds.add(tree.id);
      trees.push(tree);
    });
    return trees;
  }

  function updateActiveTreeSwitcherButton() {
    const activeTreeId = runtime.state.treeSwitcherActiveTreeId || runtime.state.selectedTreeId;
    runtime.refs.treeSwitcher?.querySelectorAll(".tree-tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.treeId === activeTreeId);
    });
  }

  runtime.treeSwitcher = {
    render: renderTreeSwitcher,
    updateActive: updateActiveTreeSwitcherButton
  };
})();
