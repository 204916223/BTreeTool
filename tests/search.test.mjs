import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadSearchRuntime() {
  const runtime = {
    state: {
      searchVisible: false,
      searchAdvancedVisible: false,
      searchIncludeNode: true,
      searchIncludeDescription: true,
      searchIncludeAttributes: true,
      searchResults: [],
      searchMatchedNodePaths: new Set(),
      activeSearchResultIndex: -1,
      selectedTreeId: "MainTree",
      selectedNodePath: "0",
      currentPreview: {
        behaviorTrees: [
          {
            id: "MainTree",
            node: {
              nodePath: "0",
              title: "ArriveCheck",
              instanceName: "",
              kind: "Action",
              targetTreeId: "",
              summary: "",
              description: "wait for dock ready",
              attributes: {
                target_position: "{dock_point}"
              },
              ioGroups: {
                inputs: [],
                outputs: [],
                params: []
              },
              children: []
            }
          }
        ]
      }
    },
    refs: createRefs(),
    i18n: {
      getSearchCopy() {
        return {
          noQuery: "No query",
          noResults: "No results",
          matchNode: "Node",
          matchDescription: "Description",
          matchAttributes: "Attributes"
        };
      }
    },
    app: {
      renderCurrentTree() {},
      activateTreePaneByTreeId() {},
      persistUiState() {}
    },
    viewport: {
      focusNodePath() {}
    }
  };
  const context = {
    window: {
      BTreeToolRuntime: runtime,
      requestAnimationFrame(callback) {
        callback();
      }
    },
    document: {
      createElement() {
        return createElementStub();
      },
      createDocumentFragment() {
        return createElementStub();
      }
    }
  };
  const scriptPath = path.resolve("media/runtime/search/search.js");
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  return runtime;
}

function createRefs() {
  return {
    treeSearchPanel: {},
    treeSearchOptions: {},
    treeSearchAdvancedToggle: {
      classList: {
        toggle() {}
      }
    },
    treeSearchNodeCheckbox: {},
    treeSearchDescriptionCheckbox: {},
    treeSearchAttributesCheckbox: {},
    treeSearchCount: {},
    treeSearchPrevButton: {},
    treeSearchNextButton: {},
    treeSearchResults: {
      replaceChildren() {}
    },
    treeSearchInput: {
      value: "",
      focus() {},
      select() {}
    }
  };
}

function createElementStub() {
  return {
    children: [],
    className: "",
    textContent: "",
    type: "",
    classList: {
      toggle() {}
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener() {}
  };
}

test("tree search category toggles control node description and attribute matches", () => {
  const runtime = loadSearchRuntime();

  runtime.state.searchQuery = "Arrive";
  runtime.search.refreshResults();
  assert.equal(JSON.stringify(runtime.state.searchResults.map((result) => result.matchScopes)), JSON.stringify([["Node"]]));

  runtime.state.searchQuery = "dock";
  runtime.state.searchIncludeNode = false;
  runtime.state.searchIncludeDescription = true;
  runtime.state.searchIncludeAttributes = false;
  runtime.search.refreshResults();
  assert.equal(
    JSON.stringify(runtime.state.searchResults.map((result) => result.matchScopes)),
    JSON.stringify([["Description"]])
  );

  runtime.state.searchQuery = "target_position";
  runtime.state.searchIncludeNode = false;
  runtime.state.searchIncludeDescription = false;
  runtime.state.searchIncludeAttributes = true;
  runtime.search.refreshResults();
  assert.equal(
    JSON.stringify(runtime.state.searchResults.map((result) => result.matchScopes)),
    JSON.stringify([["Attributes"]])
  );
});
