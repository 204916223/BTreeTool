(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function renderTreeSwitcher(result, options = {}) {
    const ensureActiveVisible = options.ensureActiveVisible === true;
    const previousScrollLeft = runtime.refs.treeSwitcher?.scrollLeft || runtime.state.treeSwitcherScrollLeft || 0;
    const fragment = document.createDocumentFragment();
    let activeButton = null;
    result.behaviorTrees.forEach((tree) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = tree.id === runtime.state.selectedTreeId ? "tree-tab is-active" : "tree-tab";
      button.textContent = tree.id;
      if (tree.id === runtime.state.selectedTreeId) {
        activeButton = button;
      }
      button.addEventListener("click", () => {
        runtime.state.selectedTreeId = tree.id;
        runtime.state.selectedNodePath = "0";
        runtime.app.persistUiState();
        runtime.app.renderCurrentTree(result, { ensureActiveTreeVisible: true });
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

  runtime.treeSwitcher = {
    render: renderTreeSwitcher
  };
})();
