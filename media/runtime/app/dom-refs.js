(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function createRefs(root = document) {
    return {
      treeSwitcher: root.getElementById("tree-switcher"),
      editModeButton: root.getElementById("mode-edit"),
      playbackModeButton: root.getElementById("mode-playback"),
      saveDocumentButton: root.getElementById("save-document"),
      fileLabel: root.getElementById("file-label"),
      treeWorkspace: root.querySelector(".tree-workspace"),
      treeRoot: root.getElementById("tree-root"),
      treeContent: root.getElementById("tree-content"),
      addBehaviorTreeButton: root.getElementById("add-behavior-tree"),
      splitViewButton: root.getElementById("toggle-split-view"),
      mainTreeLocator: root.getElementById("main-tree-locator"),
      treeSearchPanel: root.getElementById("tree-search-panel"),
      treeSearchTitle: root.getElementById("tree-search-title"),
      treeSearchInput: root.getElementById("tree-search-input"),
      treeSearchCloseButton: root.getElementById("tree-search-close"),
      treeSearchAdvancedToggle: root.getElementById("tree-search-advanced-toggle"),
      treeSearchOptions: root.getElementById("tree-search-options"),
      treeSearchDescriptionCheckbox: root.getElementById("tree-search-description"),
      treeSearchDescriptionLabel: root.getElementById("tree-search-description-label"),
      treeSearchAttributesCheckbox: root.getElementById("tree-search-attributes"),
      treeSearchAttributesLabel: root.getElementById("tree-search-attributes-label"),
      treeSearchCount: root.getElementById("tree-search-count"),
      treeSearchPrevButton: root.getElementById("tree-search-prev"),
      treeSearchNextButton: root.getElementById("tree-search-next"),
      treeSearchResults: root.getElementById("tree-search-results"),
      catalogPanel: root.getElementById("catalog-panel"),
      catalogEyebrow: root.getElementById("catalog-eyebrow"),
      catalogSummary: root.getElementById("catalog-summary"),
      catalogSearchButton: root.getElementById("catalog-search-button"),
      catalogList: root.getElementById("catalog-list"),
      catalogSearchInput: root.getElementById("catalog-search"),
      addNodeModelButton: root.getElementById("add-node-model"),
      catalogResizer: root.getElementById("catalog-resizer"),
      toggleCatalogButton: root.getElementById("toggle-catalog"),
      editAssistantPanel: root.getElementById("edit-assistant-panel"),
      editAssistantResizer: root.getElementById("edit-assistant-resizer"),
      toggleEditAssistantButton: root.getElementById("toggle-edit-assistant"),
      openSettingsButton: root.getElementById("open-settings")
    };
  }

  runtime.domRefs = {
    createRefs
  };
})();
