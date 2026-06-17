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
        if (!normalizeFilter(filterInput.value)) {
          applyFilter(log);
          return;
        }
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
      menuIcon.appendChild(runtime.icons.createIcon("filter"));
      menuIcon.addEventListener("click", () => {
        applyFilter(log);
      });
      filterRow.appendChild(filterInput);
      filterRow.appendChild(menuIcon);

      const table = document.createElement("div");
      table.className = "playback-transition-table";
      applyColumnWidths(table);
      observeTableResize(table);
      const tableHeader = document.createElement("div");
      tableHeader.className = "playback-transition-table-header";
      [
        { key: "time", label: playbackCopy.transitionColumns.time },
        { key: "node", label: playbackCopy.transitionColumns.nodeName },
        { key: "prev", label: playbackCopy.transitionColumns.prev },
        { key: "status", label: playbackCopy.transitionColumns.status }
      ].forEach((column, index, columns) => {
        const cell = document.createElement("span");
        cell.textContent = column.label;
        if (index < columns.length - 1) {
          cell.appendChild(createColumnResizeHandle(table, column.key));
        }
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

    function createColumnResizeHandle(table, columnKey) {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "playback-table-column-resizer";
      handle.title = "Resize column";
      handle.setAttribute("aria-label", handle.title);
      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const pointerId = event.pointerId;
        const startX = event.clientX;
        const startWidth = getColumnWidths()[columnKey];
        handle.setPointerCapture(pointerId);
        document.body.classList.add("is-resizing-columns");

        const onPointerMove = (moveEvent) => {
          const widths = getColumnWidths();
          widths[columnKey] = clampColumnWidthForTable(table, columnKey, startWidth + moveEvent.clientX - startX, widths);
          runtime.state.playbackTransitionColumnWidths = widths;
          applyColumnWidths(table);
          persistUiState();
        };
        const finish = () => {
          document.body.classList.remove("is-resizing-columns");
          handle.removeEventListener("pointermove", onPointerMove);
          handle.removeEventListener("pointerup", onPointerUp);
          handle.removeEventListener("pointercancel", onPointerCancel);
          try {
            handle.releasePointerCapture(pointerId);
          } catch (_error) {
            // Ignore stale pointer capture state.
          }
        };
        const onPointerUp = () => finish();
        const onPointerCancel = () => finish();
        handle.addEventListener("pointermove", onPointerMove);
        handle.addEventListener("pointerup", onPointerUp);
        handle.addEventListener("pointercancel", onPointerCancel);
      });
      return handle;
    }

    function applyColumnWidths(table) {
      const widths = getColumnWidths();
      const displayWidths = distributeExtraWidth(table, widths);
      table.style.setProperty("--playback-transition-col-time", `${displayWidths.time}px`);
      table.style.setProperty("--playback-transition-col-node", `${displayWidths.node}px`);
      table.style.setProperty("--playback-transition-col-prev", `${displayWidths.prev}px`);
      table.style.setProperty("--playback-transition-col-status", `${displayWidths.status}px`);
      table.style.setProperty(
        "--playback-transition-table-min-width",
        `${displayWidths.time + displayWidths.node + displayWidths.prev + displayWidths.status}px`
      );
    }

    function observeTableResize(table) {
      if (typeof ResizeObserver !== "function") {
        return;
      }
      const observer = new ResizeObserver(() => applyColumnWidths(table));
      observer.observe(table);
    }

    function getColumnWidths() {
      const input = runtime.state.playbackTransitionColumnWidths || {};
      return {
        time: clampColumnWidth("time", input.time ?? 52),
        node: clampColumnWidth("node", input.node ?? 100),
        prev: clampColumnWidth("prev", input.prev ?? 60),
        status: clampColumnWidth("status", input.status ?? 68)
      };
    }

    function clampColumnWidthForTable(table, key, value, widths) {
      const scrollbarWidth = getCssPixelValue(table, "--playback-transition-scrollbar-width", 11);
      const available = (table.clientWidth || 0) - scrollbarWidth - 1;
      if (!available) {
        return clampColumnWidth(key, value);
      }
      const otherWidth = Object.entries(widths)
        .filter(([otherKey]) => otherKey !== key)
        .reduce((total, [_otherKey, width]) => total + width, 0);
      return clampColumnWidth(key, Math.min(value, available - otherWidth));
    }

    function distributeExtraWidth(table, widths) {
      const scrollbarWidth = getCssPixelValue(table, "--playback-transition-scrollbar-width", 11);
      const available = Math.max(0, (table.clientWidth || 0) - scrollbarWidth);
      const total = widths.time + widths.node + widths.prev + widths.status;
      if (!available || available <= total) {
        return widths;
      }
      const extra = Math.floor((available - total) / 4);
      const remainder = (available - total) - extra * 4;
      return {
        time: widths.time + extra + (remainder > 0 ? 1 : 0),
        node: widths.node + extra + (remainder > 1 ? 1 : 0),
        prev: widths.prev + extra + (remainder > 2 ? 1 : 0),
        status: widths.status + extra
      };
    }

    function clampColumnWidth(key, value) {
      const limits = {
        time: [44, 140],
        node: [90, 360],
        prev: [54, 160],
        status: [62, 180]
      };
      const [min, max] = limits[key] || [40, 400];
      return clampNumber(Number(value), min, max, min);
    }

    function getCssPixelValue(element, name, fallback) {
      const numeric = Number.parseFloat(getComputedStyle(element).getPropertyValue(name));
      return Number.isFinite(numeric) ? numeric : fallback;
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
        jumpToTransition(log, transition, { forceNavigate: true });
      });

      row.appendChild(createCell("time", formatTransitionTime(log, transition.tUs)));
      row.appendChild(createCell("node", nodeName));
      row.appendChild(createStatusCell("prev", transition.prevStatus));
      row.appendChild(createStatusCell("status", transition.status));
      return row;
    }

    function jumpToTransition(log, transition, optionsOverride = {}) {
      const shouldNavigate = optionsOverride.forceNavigate === true || shouldAutoNavigatePlayback();
      const options = {
        navigateToActiveNode: shouldNavigate,
        scrollList: true,
        focusNode: shouldNavigate,
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
