(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function create(handlers) {
    const {
      renderBlackboardPanel,
      renderTracePanel,
      persistUiState
    } = handlers;

    function renderPanel(log, snapshot, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      const panel = document.createElement("aside");
      panel.className = "playback-side-panel playback-right-panel";
      panel.dataset.activeTab = normalizeTab(runtime.state.playbackRightTab);

      const header = document.createElement("div");
      header.className = "playback-panel-header playback-right-panel-header";

      const tabs = document.createElement("div");
      tabs.className = "playback-right-tabs";
      tabs.setAttribute("role", "tablist");
      tabs.appendChild(createTabButton("blackboard", playbackCopy.blackboard, panel));
      tabs.appendChild(createTabButton("trace", getTraceLabel(playbackCopy), panel));
      header.appendChild(tabs);

      const panels = document.createElement("div");
      panels.className = "playback-right-panels";

      const blackboardPanel = renderBlackboardPanel(log, snapshot, playbackCopy);
      const tracePanel = renderTracePanel(log, snapshot, playbackCopy);
      panels.appendChild(blackboardPanel);
      panels.appendChild(tracePanel);

      panel.appendChild(header);
      panel.appendChild(panels);
      updateTabs(panel);
      return panel;
    }

    function createTabButton(tabId, label, panel) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "playback-right-tab-button";
      button.dataset.tabId = tabId;
      button.setAttribute("role", "tab");
      button.textContent = label;
      button.addEventListener("click", () => {
        setTab(tabId, panel);
      });
      return button;
    }

    function updateTabs(panel = document.querySelector(".playback-right-panel")) {
      if (!panel) {
        return;
      }

      const activeTab = normalizeTab(runtime.state.playbackRightTab);
      runtime.state.playbackRightTab = activeTab;
      panel.dataset.activeTab = activeTab;

      panel.querySelectorAll(".playback-right-tab-button").forEach((button) => {
        const isActive = button.dataset.tabId === activeTab;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", isActive ? "true" : "false");
        button.setAttribute("tabindex", isActive ? "0" : "-1");
      });

      panel.querySelectorAll(".playback-right-tab-panel").forEach((tabPanel) => {
        const isActive = tabPanel.dataset.playbackTab === activeTab;
        tabPanel.hidden = !isActive;
      });
    }

    function setTab(tabId, panel = null) {
      const nextTab = normalizeTab(tabId);
      if (runtime.state.playbackRightTab === nextTab) {
        updateTabs(panel || document.querySelector(".playback-right-panel"));
        return;
      }

      runtime.state.playbackRightTab = nextTab;
      updateTabs(panel || document.querySelector(".playback-right-panel"));
      persistUiState();
    }

    function normalizeTab(value) {
      return value === "trace" || value === "ai" ? "trace" : "blackboard";
    }

    function getTraceLabel(playbackCopy = runtime.i18n.getPlaybackCopy()) {
      return playbackCopy.trace;
    }

    return {
      renderPanel,
      getTraceLabel
    };
  }

  runtime.playbackRightPanel = {
    create
  };
})();
