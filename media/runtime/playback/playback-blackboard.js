(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function create(handlers) {
    const {
      buildCurrentPlaybackSnapshot,
      persistUiState,
      normalizeFilter
    } = handlers;

    function renderPanel(log, snapshot, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      const panel = document.createElement("section");
      panel.className = "playback-right-tab-panel playback-blackboard-panel";
      panel.dataset.playbackTab = "blackboard";

      const filterInputRow = document.createElement("div");
      filterInputRow.className = "playback-blackboard-filter-row";
      const filterInput = document.createElement("input");
      filterInput.className = "playback-blackboard-filter";
      filterInput.type = "search";
      filterInput.placeholder = playbackCopy.filterBlackboard;
      filterInput.spellcheck = false;
      filterInput.value = runtime.state.playbackBlackboardFilter || "";
      filterInput.addEventListener("input", () => {
        runtime.state.playbackBlackboardFilter = filterInput.value;
        updatePanel(log, buildCurrentPlaybackSnapshot(log));
        persistUiState();
      });
      const count = document.createElement("span");
      count.className = "playback-blackboard-count";
      count.textContent = formatCount(snapshot);
      filterInputRow.appendChild(filterInput);
      filterInputRow.appendChild(count);

      panel.appendChild(filterInputRow);
      panel.appendChild(renderBody(log, snapshot, playbackCopy));
      panel.dataset.blackboardRenderKey = getRenderKey(snapshot);
      return panel;
    }

    function renderBody(log, snapshot, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      const table = document.createElement("div");
      table.className = "playback-blackboard-table";
      applyColumnWidths(table);

      const tableHeader = document.createElement("div");
      tableHeader.className = "playback-blackboard-table-header";
      [
        { key: "key", label: playbackCopy.blackboardColumns.key },
        { key: "value", label: playbackCopy.blackboardColumns.value }
      ].forEach((column, index, columns) => {
        const cell = document.createElement("span");
        cell.textContent = column.label;
        if (index < columns.length - 1) {
          cell.appendChild(createColumnResizeHandle(table, column.key));
        }
        tableHeader.appendChild(cell);
      });

      const list = document.createElement("div");
      list.className = "playback-blackboard-list";
      const rows = getFilteredRows(snapshot);
      if (rows.length === 0) {
        const empty = document.createElement("div");
        empty.className = "playback-blackboard-empty";
        empty.textContent = snapshot.latestBlackboardEvent
          ? playbackCopy.noMatchingBlackboardValues
          : playbackCopy.noBlackboardValuesBeforeFrame;
        list.appendChild(empty);
      } else {
        const fragment = document.createDocumentFragment();
        rows.forEach((row) => {
          const item = document.createElement("div");
          item.className = "playback-blackboard-row";
          item.dataset.blackboardKey = row.key;
          item.classList.toggle("is-expanded", row.expanded === true);
          item.appendChild(createCell("key", row.key, row.keyTitle));
          item.appendChild(createValueCell(row, log, snapshot));
          fragment.appendChild(item);
        });
        list.appendChild(fragment);
      }

      if (runtime.state.playbackBlackboardScrollTop > 0) {
        requestAnimationFrame(() => {
          list.scrollTop = runtime.state.playbackBlackboardScrollTop;
        });
      }
      list.addEventListener("scroll", () => {
        runtime.state.playbackBlackboardScrollTop = list.scrollTop;
      }, { passive: true });

      table.appendChild(tableHeader);
      table.appendChild(list);
      return table;
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
          runtime.state.playbackBlackboardColumnWidths = widths;
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
      table.style.setProperty("--playback-blackboard-col-key", `${widths.key}px`);
      table.style.setProperty("--playback-blackboard-col-value", `${widths.value}px`);
      table.style.setProperty("--playback-blackboard-table-min-width", `${widths.key + widths.value + 1}px`);
    }

    function getColumnWidths() {
      const input = runtime.state.playbackBlackboardColumnWidths || {};
      return {
        key: clampColumnWidth("key", input.key ?? 150),
        value: clampColumnWidth("value", input.value ?? 180)
      };
    }

    function clampColumnWidthForTable(table, key, value, widths) {
      const scrollbarWidth = getCssPixelValue(table, "--playback-blackboard-scrollbar-width", 11);
      const available = (table.clientWidth || 0) - scrollbarWidth - 1;
      if (!available) {
        return clampColumnWidth(key, value);
      }
      const otherWidth = Object.entries(widths)
        .filter(([otherKey]) => otherKey !== key)
        .reduce((total, [_otherKey, width]) => total + width, 0);
      return clampColumnWidth(key, Math.min(value, available - otherWidth));
    }

    function clampColumnWidth(key, value) {
      const limits = {
        key: [120, 360],
        value: [140, 520]
      };
      const [min, max] = limits[key] || [80, 520];
      const numeric = Number(value);
      return Math.min(max, Math.max(min, Math.round(Number.isFinite(numeric) ? numeric : min)));
    }

    function getCssPixelValue(element, name, fallback) {
      const numeric = Number.parseFloat(getComputedStyle(element).getPropertyValue(name));
      return Number.isFinite(numeric) ? numeric : fallback;
    }

    function updatePanel(log, snapshot) {
      const panel = document.querySelector(".playback-blackboard-panel");
      if (!panel) {
        return;
      }
      const nextRenderKey = getRenderKey(snapshot);
      if (panel.dataset.blackboardRenderKey === nextRenderKey) {
        return;
      }

      const previousPanelScrollTop = panel.scrollTop || 0;
      const oldList = panel.querySelector(".playback-blackboard-list");
      const scrollSnapshot = captureScrollSnapshot(oldList);
      const count = panel.querySelector(".playback-blackboard-count");
      if (count) {
        count.textContent = formatCount(snapshot);
      }
      panel.dataset.blackboardRenderKey = nextRenderKey;
      const oldBody = panel.querySelector(".playback-blackboard-table");
      oldBody?.replaceWith(renderBody(log, snapshot));
      const nextList = panel.querySelector(".playback-blackboard-list");
      if (nextList) {
        restoreScrollSnapshot(nextList, scrollSnapshot);
      }
      panel.scrollTop = previousPanelScrollTop;
    }

    function createCell(kind, text, title = "") {
      const cell = document.createElement("span");
      cell.className = `playback-blackboard-cell playback-blackboard-${kind}`;
      cell.textContent = text;
      cell.title = title || text;
      return cell;
    }

    function createValueCell(row, log, snapshot) {
      const cell = document.createElement("div");
      cell.className = "playback-blackboard-cell playback-blackboard-value";
      cell.title = row.valueTitle || row.valueText;

      if (row.expandable) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "playback-blackboard-expand";
        button.textContent = row.expanded ? "▾" : "▸";
        button.title = row.expanded ? "Collapse value" : "Expand value";
        button.setAttribute("aria-label", button.title);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (runtime.state.playbackExpandedBlackboardKeys.has(row.key)) {
            runtime.state.playbackExpandedBlackboardKeys.delete(row.key);
          } else {
            runtime.state.playbackExpandedBlackboardKeys.add(row.key);
          }
          updatePanel(log, snapshot);
          persistUiState();
        });
        cell.appendChild(button);
      }

      if (row.expanded) {
        const value = document.createElement("pre");
        value.className = "playback-blackboard-value-full";
        value.textContent = row.valueFullText;
        cell.appendChild(value);
      } else {
        const value = document.createElement("span");
        value.className = "playback-blackboard-value-preview";
        value.textContent = row.valueText;
        cell.appendChild(value);
      }

      return cell;
    }

    function getRenderKey(snapshot) {
      const event = snapshot?.latestBlackboardEvent || null;
      const eventKey = event
        ? `${event.frameIndex}:${event.kind}:${event.seq}:${event.tUs}`
        : "none";
      const expandedKey = Array.from(runtime.state.playbackExpandedBlackboardKeys || []).sort().join("\u0000");
      return `${eventKey}|${normalizeFilter(runtime.state.playbackBlackboardFilter)}|${expandedKey}`;
    }

    function captureScrollSnapshot(list) {
      if (!list) {
        return {
          scrollTop: runtime.state.playbackBlackboardScrollTop || 0,
          anchorKey: "",
          anchorOffset: 0
        };
      }

      const listTop = list.getBoundingClientRect().top;
      const rows = Array.from(list.querySelectorAll(".playback-blackboard-row[data-blackboard-key]"));
      const anchor = rows.find((row) => row.getBoundingClientRect().bottom >= listTop) || rows[0] || null;
      return {
        scrollTop: list.scrollTop,
        anchorKey: anchor?.dataset.blackboardKey || "",
        anchorOffset: anchor ? anchor.getBoundingClientRect().top - listTop : 0
      };
    }

    function restoreScrollSnapshot(list, snapshot) {
      if (!list) {
        return;
      }
      const fallbackScrollTop = snapshot?.scrollTop ?? runtime.state.playbackBlackboardScrollTop ?? 0;
      const restore = () => {
        const anchorKey = snapshot?.anchorKey || "";
        const anchor = anchorKey
          ? list.querySelector(`.playback-blackboard-row[data-blackboard-key="${CSS.escape(anchorKey)}"]`)
          : null;
        if (anchor) {
          list.scrollTop += anchor.getBoundingClientRect().top - list.getBoundingClientRect().top - (snapshot.anchorOffset || 0);
        } else {
          list.scrollTop = fallbackScrollTop;
        }
        runtime.state.playbackBlackboardScrollTop = list.scrollTop;
      };

      list.scrollTop = fallbackScrollTop;
      restore();
      requestAnimationFrame(restore);
    }

    function formatCount(snapshot) {
      const total = flattenRows(snapshot.blackboardValues).length;
      const visible = getFilteredRows(snapshot).length;
      if (visible === total) {
        return String(total);
      }
      return `${visible}/${total}`;
    }

    function getFilteredRows(snapshot) {
      const filter = normalizeFilter(runtime.state.playbackBlackboardFilter);
      const rows = flattenRows(snapshot.blackboardValues);
      if (!filter) {
        return rows;
      }
      return rows.filter((row) =>
        `${row.key} ${row.valueText}`.toLowerCase().includes(filter)
      );
    }

    function flattenRows(values) {
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        return [];
      }

      const rowsByKey = new Map();
      Object.entries(values).forEach(([scope, scopedValues]) => {
        if (scopedValues && typeof scopedValues === "object" && !Array.isArray(scopedValues)) {
          Object.entries(scopedValues).forEach(([key, value]) => {
            const displayKey = toDisplayKey(key);
            rowsByKey.set(displayKey, toRow(displayKey, value, toSourceKey(scope, key)));
          });
          return;
        }
        const displayKey = toDisplayKey(scope);
        rowsByKey.set(displayKey, toRow(displayKey, scopedValues, scope));
      });

      const rows = Array.from(rowsByKey.values());
      rows.sort((left, right) =>
        left.key.localeCompare(right.key)
      );
      return rows;
    }

    function toDisplayKey(key) {
      const text = String(key || "");
      const parts = text.split("/").filter(Boolean);
      return parts[parts.length - 1] || text || "(value)";
    }

    function toSourceKey(scope, key) {
      if (!scope) {
        return key || "(value)";
      }
      if (!key) {
        return scope;
      }
      return `${scope}/${key}`;
    }

    function toRow(key, value, sourceKey) {
      const valueInfo = formatValueInfo(value);
      return {
        key,
        keyTitle: sourceKey || key,
        valueText: valueInfo.preview,
        valueFullText: valueInfo.full,
        valueTitle: valueInfo.preview,
        expandable: valueInfo.expandable,
        expanded: runtime.state.playbackExpandedBlackboardKeys.has(key)
      };
    }

    function formatValue(value) {
      return formatValueInfo(value).preview;
    }

    function formatValueInfo(value) {
      if (value === null) {
        return { preview: "null", full: "null", expandable: false };
      }
      if (value === undefined) {
        return { preview: "", full: "", expandable: false };
      }
      if (typeof value === "string") {
        const parsed = parseJsonLikeValue(value);
        if (parsed.ok) {
          return {
            preview: value,
            full: JSON.stringify(parsed.value, null, 2),
            expandable: true
          };
        }
        return { preview: value, full: value, expandable: false };
      }
      if (typeof value === "number" || typeof value === "boolean") {
        const text = String(value);
        return { preview: text, full: text, expandable: false };
      }
      try {
        return {
          preview: JSON.stringify(value),
          full: JSON.stringify(value, null, 2),
          expandable: true
        };
      } catch (_error) {
        const text = String(value);
        return { preview: text, full: text, expandable: false };
      }
    }

    function parseJsonLikeValue(value) {
      const text = String(value || "").trim();
      if (!text || !["{", "["].includes(text[0])) {
        return { ok: false, value: null };
      }
      try {
        return { ok: true, value: JSON.parse(text) };
      } catch (_error) {
        return { ok: false, value: null };
      }
    }

    return {
      renderPanel,
      updatePanel,
      flattenRows,
      formatValue
    };
  }

  runtime.playbackBlackboard = {
    create
  };
})();
