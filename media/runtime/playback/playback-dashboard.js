(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function create(handlers) {
    const {
      renderPlaybackDurationTimeline,
      renderPlaybackBlackboardPanel,
      renderPlaybackTracePanel,
      getPlaybackTraceLabel,
      renderPlaybackLog,
      syncPlaybackFrameUi,
      reschedulePlaybackAutoAdvance,
      invalidatePlaybackDomCache,
      persistUiState
    } = handlers;

    function renderPlaybackDashboardLog(log, playbackSnapshot, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      runtime.refs.treeSwitcher.replaceChildren();
      runtime.mainTreeLocator.clear();
      runtime.viewport.disposeAllCanvasStates();

      const layout = document.createElement("div");
      layout.className = "playback-dashboard-layout";
      layout.style.setProperty("--playback-dashboard-bottom-height", `${runtime.state.playbackDashboardBottomHeight}px`);
      layout.style.setProperty("--playback-dashboard-left-width", `${runtime.state.playbackDashboardLeftWidth}px`);
      layout.classList.toggle("hide-bottom", runtime.state.playbackDashboardBottomVisible === false);

      const top = document.createElement("section");
      top.className = "playback-dashboard-top";
      top.appendChild(renderPlaybackDurationTimeline(log, playbackCopy));
      layout.appendChild(top);

      if (runtime.state.playbackDashboardBottomVisible !== false) {
        layout.appendChild(createPlaybackDashboardResizer("bottom"));

        const blackboardPanel = document.createElement("section");
        blackboardPanel.className = "playback-dashboard-panel playback-dashboard-blackboard";
        blackboardPanel.appendChild(createPlaybackDashboardPanelHeader(playbackCopy.blackboard, createPlaybackDashboardBottomToggle()));
        blackboardPanel.appendChild(renderPlaybackBlackboardPanel(log, playbackSnapshot, playbackCopy));

        const tracePanel = document.createElement("section");
        tracePanel.className = "playback-dashboard-panel playback-dashboard-trace";
        tracePanel.appendChild(createPlaybackDashboardPanelHeader(getPlaybackTraceLabel(playbackCopy)));
        tracePanel.appendChild(renderPlaybackTracePanel(log, playbackSnapshot, playbackCopy));

        layout.appendChild(blackboardPanel);
        layout.appendChild(createPlaybackDashboardResizer("split"));
        layout.appendChild(tracePanel);
      } else {
        layout.appendChild(createPlaybackDashboardBottomToggle({ floating: true }));
      }

      invalidatePlaybackDomCache();
      runtime.refs.treeContent.replaceChildren(layout);
      runtime.canvas.clearDragState();
      persistUiState();
      requestAnimationFrame(() => {
        syncPlaybackFrameUi(log, { scrollList: true, focusNode: false });
        if (runtime.state.playbackIsPlaying) {
          reschedulePlaybackAutoAdvance(log);
        }
      });
    }

    function createPlaybackDashboardPanelHeader(titleText, action = null) {
      const header = document.createElement("div");
      header.className = "playback-dashboard-panel-header";
      const title = document.createElement("strong");
      title.textContent = titleText;
      header.appendChild(title);
      if (action) {
        header.appendChild(action);
      }
      return header;
    }

    function createPlaybackDashboardBottomToggle(options = {}) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "playback-dashboard-bottom-toggle";
      if (options.floating) {
        button.classList.add("is-floating");
      }
      const hidden = runtime.state.playbackDashboardBottomVisible === false;
      button.title = hidden ? "Show lower panels" : "Hide lower panels";
      button.setAttribute("aria-label", button.title);
      button.addEventListener("click", () => {
        runtime.playbackDurationTimeline?.captureViewportState?.();
        runtime.state.playbackDashboardBottomVisible = runtime.state.playbackDashboardBottomVisible === false;
        renderPlaybackLog();
      });
      return button;
    }

    function createPlaybackDashboardResizer(kind) {
      const handle = document.createElement("div");
      handle.className = `panel-resizer playback-dashboard-resizer playback-dashboard-resizer-${kind}`;
      handle.addEventListener("pointerdown", (event) => {
        const layout = handle.closest(".playback-dashboard-layout");
        if (!layout) {
          return;
        }

        const pointerId = event.pointerId;
        const startX = event.clientX;
        const startY = event.clientY;
        const startBottomHeight = runtime.state.playbackDashboardBottomHeight;
        const startLeftWidth = runtime.state.playbackDashboardLeftWidth;
        const maxBottomHeight = Math.max(220, layout.clientHeight - 160);
        const maxLeftWidth = Math.max(260, layout.clientWidth - 260);
        let pendingClientX = startX;
        let pendingClientY = startY;
        let resizeFrame = 0;
        const resizeCursorClass = kind === "bottom" ? "is-resizing-rows" : "is-resizing-columns";

        const applyResize = () => {
          resizeFrame = 0;
          if (kind === "bottom") {
            const deltaY = startY - pendingClientY;
            runtime.state.playbackDashboardBottomHeight = runtime.viewport.clampNumber(
              startBottomHeight + deltaY,
              180,
              maxBottomHeight,
              startBottomHeight
            );
            layout.style.setProperty("--playback-dashboard-bottom-height", `${runtime.state.playbackDashboardBottomHeight}px`);
          } else {
            const deltaX = pendingClientX - startX;
            runtime.state.playbackDashboardLeftWidth = runtime.viewport.clampNumber(
              startLeftWidth + deltaX,
              240,
              maxLeftWidth,
              startLeftWidth
            );
            layout.style.setProperty("--playback-dashboard-left-width", `${runtime.state.playbackDashboardLeftWidth}px`);
          }
        };

        const scheduleResize = () => {
          if (resizeFrame) {
            return;
          }
          resizeFrame = requestAnimationFrame(applyResize);
        };

        handle.setPointerCapture(pointerId);
        document.body.classList.add("is-resizing-panels", resizeCursorClass);

        const onPointerMove = (moveEvent) => {
          pendingClientX = moveEvent.clientX;
          pendingClientY = moveEvent.clientY;
          scheduleResize();
        };

        const finish = () => {
          document.body.classList.remove("is-resizing-panels", resizeCursorClass);
          handle.removeEventListener("pointermove", onPointerMove);
          handle.removeEventListener("pointerup", finish);
          handle.removeEventListener("pointercancel", finish);
          if (resizeFrame) {
            cancelAnimationFrame(resizeFrame);
            applyResize();
          }
          persistUiState();
          try {
            handle.releasePointerCapture(pointerId);
          } catch (_error) {
            // Ignore stale pointer capture state.
          }
        };

        handle.addEventListener("pointermove", onPointerMove);
        handle.addEventListener("pointerup", finish);
        handle.addEventListener("pointercancel", finish);
      });
      return handle;
    }

    return {
      renderLog: renderPlaybackDashboardLog
    };
  }

  runtime.playbackDashboard = {
    create
  };
})();
