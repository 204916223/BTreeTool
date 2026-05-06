(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function openSearchPanel() {
    runtime.state.searchVisible = true;
    updateSearchUi();
    requestAnimationFrame(() => {
      runtime.refs.treeSearchInput?.focus();
      runtime.refs.treeSearchInput?.select();
    });
  }

  function closeSearchPanel() {
    runtime.state.searchVisible = false;
    runtime.state.searchQuery = "";
    runtime.state.searchResults = [];
    runtime.state.searchMatchedNodePaths = new Set();
    runtime.state.activeSearchResultIndex = -1;
    if (runtime.refs.treeSearchInput) {
      runtime.refs.treeSearchInput.value = "";
    }
    updateSearchUi();
    if (runtime.state.currentPreview) {
      runtime.app.renderCurrentTree(runtime.state.currentPreview, { preserveViewport: true });
    }
  }

  function clearSearchResults() {
    runtime.state.searchResults = [];
    runtime.state.searchMatchedNodePaths = new Set();
    runtime.state.activeSearchResultIndex = -1;
  }

  function refreshSearchResults(options = {}) {
    const renderTree = options.renderTree === true;
    const focusActive = options.focusActive !== false;
    const query = String(runtime.state.searchQuery || "").trim();
    const result = runtime.state.currentPreview;
    const previousActiveMatchKey =
      runtime.state.activeSearchResultIndex >= 0
        ? runtime.state.searchResults[runtime.state.activeSearchResultIndex]?.matchKey
        : getSearchMatchKey(runtime.state.selectedTreeId, runtime.state.selectedNodePath);

    if (!query || !result) {
      clearSearchResults();
      updateSearchUi();
      if (renderTree && result) {
        runtime.app.renderCurrentTree(result, { preserveViewport: true });
      }
      return;
    }

    const searchResults = buildSearchResults(result, query);
    runtime.state.searchResults = searchResults;
    runtime.state.searchMatchedNodePaths = new Set(searchResults.map((item) => item.matchKey));
    runtime.state.activeSearchResultIndex =
      searchResults.length > 0
        ? Math.max(
            0,
            searchResults.findIndex((item) => item.matchKey === previousActiveMatchKey)
          )
        : -1;

    if (focusActive && runtime.state.activeSearchResultIndex >= 0) {
      const activeResult = runtime.state.searchResults[runtime.state.activeSearchResultIndex];
      runtime.state.selectedTreeId = activeResult.treeId;
      runtime.state.selectedNodePath = activeResult.nodePath;
    }

    updateSearchUi();
    if (renderTree && result) {
      runtime.app.renderCurrentTree(result, { preserveViewport: true });
      if (focusActive && runtime.state.activeSearchResultIndex >= 0) {
        requestAnimationFrame(() => {
          runtime.viewport.focusNodePath(runtime.state.searchResults[runtime.state.activeSearchResultIndex].nodePath);
        });
      }
    }
  }

  function navigateSearchResults(direction) {
    if (!runtime.state.searchResults.length) {
      return;
    }

    const count = runtime.state.searchResults.length;
    const currentIndex = runtime.state.activeSearchResultIndex >= 0 ? runtime.state.activeSearchResultIndex : 0;
    const nextIndex = (currentIndex + direction + count) % count;
    activateSearchResult(nextIndex);
  }

  function activateSearchResult(index) {
    if (!runtime.state.searchResults.length || !runtime.state.currentPreview) {
      return;
    }

    const nextIndex = Math.max(0, Math.min(index, runtime.state.searchResults.length - 1));
    const nextResult = runtime.state.searchResults[nextIndex];
    runtime.state.activeSearchResultIndex = nextIndex;
    runtime.state.selectedTreeId = nextResult.treeId;
    runtime.state.selectedNodePath = nextResult.nodePath;
    updateSearchUi();
    runtime.app.renderCurrentTree(runtime.state.currentPreview, { preserveViewport: true });
    requestAnimationFrame(() => {
      runtime.viewport.focusNodePath(nextResult.nodePath);
    });
  }

  function updateSearchUi() {
    const refs = runtime.refs;
    const searchCopy = runtime.i18n.getSearchCopy();
    refs.treeSearchPanel.hidden = !runtime.state.searchVisible;
    refs.treeSearchOptions.hidden = !runtime.state.searchAdvancedVisible;
    refs.treeSearchDescriptionCheckbox.checked = runtime.state.searchIncludeDescription;
    refs.treeSearchAttributesCheckbox.checked = runtime.state.searchIncludeAttributes;

    const total = runtime.state.searchResults.length;
    const active = total > 0 && runtime.state.activeSearchResultIndex >= 0 ? runtime.state.activeSearchResultIndex + 1 : 0;
    refs.treeSearchCount.textContent = `${active} / ${total}`;
    refs.treeSearchPrevButton.disabled = total === 0;
    refs.treeSearchNextButton.disabled = total === 0;

    refs.treeSearchResults.replaceChildren();
    if (!runtime.state.searchVisible) {
      return;
    }

    if (!String(runtime.state.searchQuery || "").trim()) {
      refs.treeSearchResults.replaceChildren(createSearchEmptyState(searchCopy.noQuery));
      return;
    }

    if (!runtime.state.searchResults.length) {
      refs.treeSearchResults.replaceChildren(createSearchEmptyState(searchCopy.noResults));
      return;
    }

    const fragment = document.createDocumentFragment();
    runtime.state.searchResults.forEach((result, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = index === runtime.state.activeSearchResultIndex ? "tree-search-result is-active" : "tree-search-result";

      const title = document.createElement("span");
      title.className = "tree-search-result-title";
      title.textContent = result.title;

      const meta = document.createElement("span");
      meta.className = "tree-search-result-meta";
      meta.textContent = [result.treeId, result.kind, result.matchScopes.join(" • "), result.preview]
        .filter(Boolean)
        .join(" • ");

      button.appendChild(title);
      button.appendChild(meta);
      button.addEventListener("click", () => {
        activateSearchResult(index);
      });
      fragment.appendChild(button);
    });
    refs.treeSearchResults.replaceChildren(fragment);
  }

  function createSearchEmptyState(message) {
    const item = document.createElement("div");
    item.className = "tree-search-empty";
    item.textContent = message;
    return item;
  }

  function buildSearchResults(preview, query) {
    const searchCopy = runtime.i18n.getSearchCopy();
    const tokens = String(query || "")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!tokens.length) {
      return [];
    }

    const results = [];
    (preview.behaviorTrees || []).forEach((tree) => {
      walkTree(tree.node, (node) => {
        const matchScopes = [];
        const defaultSearchText = buildDefaultSearchText(node);
        let previewText = "";

        if (matchesTokens(defaultSearchText, tokens)) {
          matchScopes.push(searchCopy.matchName);
          previewText = buildNamePreview(node);
        }
        if (runtime.state.searchIncludeDescription && matchesTokens(node.description, tokens)) {
          matchScopes.push(searchCopy.matchDescription);
          previewText ||= node.description;
        }
        if (runtime.state.searchIncludeAttributes && matchesTokens(buildAttributeSearchText(node), tokens)) {
          matchScopes.push(searchCopy.matchAttributes);
          previewText ||= buildAttributePreview(node, tokens);
        }

        if (matchScopes.length > 0) {
          results.push({
            treeId: tree.id,
            nodePath: node.nodePath,
            matchKey: getSearchMatchKey(tree.id, node.nodePath),
            title: node.title,
            kind: node.kind,
            matchScopes,
            preview: previewText
          });
        }
      });
    });

    return results;
  }

  function getSearchMatchKey(treeId, nodePath) {
    return `${treeId || ""}::${nodePath || ""}`;
  }

  function buildDefaultSearchText(node) {
    return [node.title, node.instanceName, node.kind, node.targetTreeId, node.summary].filter(Boolean).join(" ");
  }

  function buildNamePreview(node) {
    if (node.instanceName && node.instanceName !== node.title) {
      return node.instanceName;
    }
    if (node.targetTreeId && node.targetTreeId !== node.title) {
      return node.targetTreeId;
    }
    return node.summary || "";
  }

  function buildAttributeSearchText(node) {
    return buildAttributeEntries(node).join(" ");
  }

  function buildAttributePreview(node, tokens) {
    const matchingEntries = buildAttributeEntries(node).filter((entry) =>
      tokens.some((token) => String(entry || "").toLowerCase().includes(token))
    );
    return matchingEntries.slice(0, 2).join(" • ");
  }

  function buildAttributeEntries(node) {
    const entries = new Set();

    Object.entries(node.attributes || {}).forEach(([key, value]) => {
      entries.add(key);
      if (value) {
        entries.add(value);
        entries.add(`${key}: ${value}`);
      }
    });

    ["inputs", "outputs", "params"].forEach((groupKey) => {
      (node.ioGroups?.[groupKey] || []).forEach((entry) => {
        entries.add(entry.key);
        if (entry.value) {
          entries.add(entry.value);
          entries.add(`${entry.key}: ${entry.value}`);
        }
      });
    });

    if (node.code) {
      entries.add(node.code);
      entries.add(`code: ${node.code}`);
    }

    if (node.summary) {
      entries.add(node.summary);
    }

    return Array.from(entries).filter(Boolean);
  }

  function matchesTokens(text, tokens) {
    const haystack = String(text || "").toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  }

  function walkTree(node, visitor) {
    if (!node) {
      return;
    }
    visitor(node);
    (node.children || []).forEach((child) => walkTree(child, visitor));
  }

  runtime.search = {
    openPanel: openSearchPanel,
    closePanel: closeSearchPanel,
    clearResults: clearSearchResults,
    refreshResults: refreshSearchResults,
    navigateResults: navigateSearchResults,
    activateResult: activateSearchResult,
    updateUi: updateSearchUi
  };
})();
