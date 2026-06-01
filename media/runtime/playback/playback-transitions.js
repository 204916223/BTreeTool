(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function create(handlers) {
    const {
      persistUiState,
      isPlaybackTimeBasedMode,
      setPlaybackTime,
      setPlaybackFrame,
      shouldAutoNavigatePlayback,
      normalizeFilter,
      clampNumber,
      normalizeStatusClass,
      formatTransitionTime,
      resolvePlaybackNodeName,
      getCurrentPlaybackTimeUs,
      getPlaybackDomCache,
      invalidatePlaybackDomCache,
      getActiveTransitionIndexAtTime,
      getActiveTransitionIndex,
      getPlaybackTransitionIndexAtPosition,
      getPlaybackTransitionPosition,
      getPlaybackTransitionListModel
    } = handlers;

    const rowHeight = runtime.playbackConfig.transitionRowHeight;
    const overscanRows = runtime.playbackConfig.transitionOverscanRows;

    function renderPanel(log, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      const panel = document.createElement("aside");
      panel.className = "playback-side-panel playback-transition-panel";

      const header = document.createElement("div");
      header.className = "playback-panel-header";
      const title = document.createElement("strong");
      title.textContent = playbackCopy.transitions;
      const count = document.createElement("span");
      count.className = "playback-transition-count";
      count.textContent = formatCount(log);
      header.appendChild(title);
      header.appendChild(count);

      const filterRow = document.createElement("div");
      filterRow.className = "playback-transition-filter-row";
      const filterInput = document.createElement("input");
      filterInput.className = "playback-transition-filter";
      filterInput.type = "search";
      filterInput.placeholder = playbackCopy.filterByNodeName;
      filterInput.spellcheck = false;
      filterInput.value = runtime.state.playbackTransitionFilterDraft || runtime.state.playbackTransitionFilter || "";
      filterInput.addEventListener("input", () => {
        runtime.state.playbackTransitionFilterDraft = filterInput.value;
        updateFilterButtonState();
        persistUiState();
      });
      filterInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          applyFilter(log);
        }
      });
      const menuIcon = document.createElement("button");
      menuIcon.type = "button";
      menuIcon.className = "canvas-btn icon-btn playback-transition-filter-button";
      menuIcon.title = playbackCopy.applyTransitionFilter || playbackCopy.filterByNodeName;
      menuIcon.setAttribute("aria-label", menuIcon.title);
      menuIcon.appendChild(createFilterIcon());
      menuIcon.addEventListener("click", () => {
        applyFilter(log);
      });
      filterRow.appendChild(filterInput);
      filterRow.appendChild(menuIcon);

      const table = document.createElement("div");
      table.className = "playback-transition-table";
      const tableHeader = document.createElement("div");
      tableHeader.className = "playback-transition-table-header";
      [
        playbackCopy.transitionColumns.time,
        playbackCopy.transitionColumns.nodeName,
        playbackCopy.transitionColumns.prev,
        playbackCopy.transitionColumns.status
      ].forEach((label) => {
        const cell = document.createElement("span");
        cell.textContent = label;
        tableHeader.appendChild(cell);
      });
      const list = document.createElement("div");
      list.className = "playback-transition-list";
      table.appendChild(tableHeader);
      table.appendChild(list);

      panel.appendChild(header);
      panel.appendChild(filterRow);
      panel.appendChild(table);
      updateRows(log, list);
      updateFilterButtonState(panel);
      return panel;
    }

    function createFilterIcon() {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M4 6h16v2H4V6Zm3 5h10v2H7v-2Zm3 5h4v2h-4v-2Z");
      svg.appendChild(path);
      return svg;
    }

    function applyFilter(log) {
      runtime.state.playbackTransitionFilter = runtime.state.playbackTransitionFilterDraft || "";
      runtime.state.playbackTransitionScrollTop = 0;
      updateRows(log);
      updateCount(log);
      updateActive(log, true);
      updateFilterButtonState();
      persistUiState();
    }

    function stageUidFilter(uid) {
      if (!runtime.modeRules.isPlaybackMode() || !uid) {
        return;
      }
      runtime.state.playbackTransitionFilterDraft = String(uid);
      const filterInput = document.querySelector(".playback-transition-filter");
      if (filterInput) {
        filterInput.value = runtime.state.playbackTransitionFilterDraft;
      }
      updateFilterButtonState();
      persistUiState();
    }

    function updateFilterButtonState(scope = document) {
      const input = scope.querySelector?.(".playback-transition-filter");
      const button = scope.querySelector?.(".playback-transition-filter-button");
      if (!input || !button) {
        return;
      }
      const draft = input.value || "";
      const active = runtime.state.playbackTransitionFilter || "";
      button.classList.toggle("is-pending", draft !== active);
    }

    function updateRows(log, targetList = null) {
      const list = targetList || document.querySelector(".playback-transition-list");
      if (!list) {
        return;
      }

      const previousScrollTop = list.scrollTop || runtime.state.playbackTransitionScrollTop || 0;
      list._playbackTransitionLog = log;
      ensureScrollHandler(list);
      renderWindow(log, list, previousScrollTop);
    }

    function ensureScrollHandler(list) {
      if (list._playbackTransitionScrollHandler) {
        return;
      }

      list._playbackTransitionScrollHandler = () => {
        runtime.state.playbackTransitionScrollTop = list.scrollTop;
        if (list._playbackTransitionRenderHandle) {
          return;
        }
        list._playbackTransitionRenderHandle = requestAnimationFrame(() => {
          list._playbackTransitionRenderHandle = 0;
          if (list._playbackTransitionLog) {
            renderWindow(list._playbackTransitionLog, list);
          }
        });
      };
      list.addEventListener("scroll", list._playbackTransitionScrollHandler, { passive: true });
    }

    function renderWindow(log, list, requestedScrollTop = null) {
      const filter = normalizeFilter(runtime.state.playbackTransitionFilter);
      const activeTransitionIndex = getCurrentActiveTransitionIndex(log);
      const model = getPlaybackTransitionListModel(log, filter);
      const viewportHeight = list.clientHeight || rowHeight * 40;
      const maxScrollTop = Math.max(0, model.visibleCount * rowHeight - viewportHeight);
      const nextScrollTop = clampNumber(
        requestedScrollTop ?? list.scrollTop ?? runtime.state.playbackTransitionScrollTop ?? 0,
        0,
        maxScrollTop
      );
      const firstVisibleRow = Math.floor(nextScrollTop / rowHeight);
      const startPosition = Math.max(0, firstVisibleRow - overscanRows);
      const visibleRows = Math.ceil(viewportHeight / rowHeight) + overscanRows * 2;
      const endPosition = Math.min(model.visibleCount, startPosition + visibleRows);
      const fragment = document.createDocumentFragment();

      fragment.appendChild(createSpacer(startPosition * rowHeight));
      for (let position = startPosition; position < endPosition; position += 1) {
        const index = getPlaybackTransitionIndexAtPosition(model, position);
        const transition = log.transitions?.[index];
        if (!transition) {
          continue;
        }
        const row = createRow(log, transition, index, activeTransitionIndex);
        fragment.appendChild(row);
      }
      fragment.appendChild(createSpacer((model.visibleCount - endPosition) * rowHeight));

      list.replaceChildren(fragment);
      invalidatePlaybackDomCache();
      list.scrollTop = nextScrollTop;
      runtime.state.playbackTransitionScrollTop = list.scrollTop;
    }

    function createSpacer(height) {
      const spacer = document.createElement("div");
      spacer.className = "playback-transition-spacer";
      spacer.style.height = `${Math.max(0, height)}px`;
      return spacer;
    }

    function createRow(log, transition, index, activeTransitionIndex) {
      const nodeName = resolvePlaybackNodeName(log, transition);
      const row = document.createElement("button");
      row.type = "button";
      row.className = "playback-transition-row";
      row.dataset.transitionIndex = String(index);
      row.dataset.frameIndex = String(transition.frameIndex);
      row.classList.toggle("is-active", index === activeTransitionIndex);
      row.addEventListener("click", (event) => {
        if (event.detail > 1) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        jumpToTransition(log, transition);
      });
      row.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });

      row.appendChild(createCell("time", formatTransitionTime(log, transition.tUs)));
      row.appendChild(createCell("node", nodeName));
      row.appendChild(createStatusCell("prev", transition.prevStatus));
      row.appendChild(createStatusCell("status", transition.status));
      return row;
    }

    function jumpToTransition(log, transition) {
      const options = {
        navigateToActiveNode: shouldAutoNavigatePlayback(),
        scrollList: true,
        focusNode: shouldAutoNavigatePlayback(),
        persist: true
      };
      if (isPlaybackTimeBasedMode()) {
        setPlaybackTime(log, transition.tUs, { ...options, updateBlackboard: true });
        return;
      }
      setPlaybackFrame(log, transition.frameIndex, options);
    }

    function createCell(kind, text) {
      const cell = document.createElement("span");
      cell.className = `playback-transition-cell playback-transition-${kind}`;
      cell.textContent = text;
      return cell;
    }

    function createStatusCell(kind, status) {
      const cell = createCell(kind, status);
      cell.classList.add(`status-${normalizeStatusClass(status)}`);
      return cell;
    }

    function updateCount(log) {
      const count = document.querySelector(".playback-transition-count");
      if (count) {
        count.textContent = formatCount(log);
      }
    }

    function formatCount(log) {
      const filter = normalizeFilter(runtime.state.playbackTransitionFilter);
      const model = getPlaybackTransitionListModel(log, filter);
      const total = model.total;
      if (!filter) {
        return String(total);
      }
      return `${model.visibleCount}/${total}`;
    }

    function updateActive(log, scrollList) {
      const activeTransitionIndex = getCurrentActiveTransitionIndex(log);
      if (scrollList && activeTransitionIndex !== null) {
        const list = document.querySelector(".playback-transition-list");
        if (list && scrollListToIndex(log, list, activeTransitionIndex)) {
          const domCache = getPlaybackDomCache();
          domCache.activeTransitionRow = domCache.transitionRowsByIndex.get(String(activeTransitionIndex)) || null;
          return;
        }
      }

      const domCache = getPlaybackDomCache();
      domCache.activeTransitionRow?.classList.remove("is-active");
      domCache.activeTransitionRow = null;
      if (activeTransitionIndex === null) {
        return;
      }
      const activeRow = domCache.transitionRowsByIndex.get(String(activeTransitionIndex)) || null;
      activeRow?.classList.add("is-active");
      domCache.activeTransitionRow = activeRow;
      if (scrollList && activeRow) {
        activeRow.scrollIntoView({ block: "nearest" });
      }
    }

    function scrollListToIndex(log, list, transitionIndex) {
      const model = getPlaybackTransitionListModel(log);
      const position = getPlaybackTransitionPosition(model, transitionIndex);
      if (position < 0) {
        return false;
      }

      const viewportHeight = list.clientHeight || rowHeight * 40;
      const rowTop = position * rowHeight;
      const rowBottom = rowTop + rowHeight;
      const currentScrollTop = list.scrollTop || runtime.state.playbackTransitionScrollTop || 0;
      let nextScrollTop = currentScrollTop;

      if (rowTop < currentScrollTop) {
        nextScrollTop = rowTop;
      } else if (rowBottom > currentScrollTop + viewportHeight) {
        nextScrollTop = rowBottom - viewportHeight;
      }

      renderWindow(log, list, nextScrollTop);
      return true;
    }

    function getCurrentActiveTransitionIndex(log) {
      if (isPlaybackTimeBasedMode()) {
        return getActiveTransitionIndexAtTime(log, getCurrentPlaybackTimeUs(log, null));
      }
      return getActiveTransitionIndex(log, runtime.state.playbackFrameIndex);
    }

    return {
      renderPanel,
      stageUidFilter,
      updateRows,
      updateCount,
      updateActive,
      getCurrentActiveTransitionIndex
    };
  }

  runtime.playbackTransitions = {
    create
  };
})();
