(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function create(handlers) {
    const {
      persistUiState,
      togglePlayback,
      normalizePlaybackSpeed,
      updatePlaybackTimelineControls,
      reschedulePlaybackAutoAdvance,
      bindPlaybackRepeatButton,
      stepPlaybackTransition,
      createPlaybackTransportIcon,
      clampPlaybackTimeUs,
      setPlaybackTime,
      requestPlaybackTime,
      formatTransitionTime,
      formatPlaybackTimelineClock,
      normalizeStatusClass,
      clampNumber
    } = handlers;

    const PLAYBACK_DURATION_MIN_VISIBLE_US = runtime.playbackConfig.durationMinVisibleUs;
    const PLAYBACK_DURATION_MAX_VISIBLE_US = runtime.playbackConfig.durationMaxVisibleUs;
    const PLAYBACK_SPEED_OPTIONS = runtime.playbackConfig.speedOptions;

    function renderPlaybackDurationTimeline(log, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      const panel = document.createElement("div");
      panel.className = "playback-duration-panel";
      panel.classList.toggle("hide-current-task-panel", runtime.state.playbackDurationTaskPanelVisible !== true);
      const main = document.createElement("div");
      main.className = "playback-duration-main";

      const controls = document.createElement("div");
      controls.className = "playback-duration-controls";

      const playButton = document.createElement("button");
      playButton.type = "button";
      playButton.className = "canvas-btn icon-btn playback-play-btn";
      const iconKind = runtime.state.playbackIsPlaying ? "pause" : "play";
      playButton.replaceChildren(createPlaybackTransportIcon(iconKind));
      playButton.dataset.playbackIcon = iconKind;
      playButton.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        playButton.dataset.pointerActivated = "1";
        togglePlayback(log);
        window.setTimeout(() => {
          delete playButton.dataset.pointerActivated;
        }, 0);
      });
      playButton.addEventListener("click", (event) => {
        if (playButton.dataset.pointerActivated === "1") {
          event.preventDefault();
          event.stopPropagation();
        }
      });

      const speedSelect = document.createElement("select");
      speedSelect.className = "playback-speed-select";
      speedSelect.setAttribute("aria-label", playbackCopy.playbackSpeed);
      speedSelect.title = playbackCopy.playbackSpeed;
      PLAYBACK_SPEED_OPTIONS.forEach((option) => {
        const item = document.createElement("option");
        item.value = String(option.value);
        item.textContent = option.label;
        speedSelect.appendChild(item);
      });
      speedSelect.value = String(runtime.state.playbackPlaybackSpeed);
      speedSelect.addEventListener("change", () => {
        runtime.state.playbackPlaybackSpeed = normalizePlaybackSpeed(speedSelect.value);
        persistUiState();
        updatePlaybackTimelineControls(log);
        if (runtime.state.playbackIsPlaying) {
          reschedulePlaybackAutoAdvance(log);
        }
      });

      const prevButton = document.createElement("button");
      prevButton.type = "button";
      prevButton.className = "canvas-btn icon-btn playback-step-btn";
      prevButton.textContent = "<";
      prevButton.title = playbackCopy.previousNodeStatusChange;
      bindPlaybackRepeatButton(prevButton, () => {
        stepPlaybackTransition(log, -1);
      });

      const nextButton = document.createElement("button");
      nextButton.type = "button";
      nextButton.className = "canvas-btn icon-btn playback-step-btn";
      nextButton.textContent = ">";
      nextButton.title = playbackCopy.nextNodeStatusChange;
      bindPlaybackRepeatButton(nextButton, () => {
        stepPlaybackTransition(log, 1);
      });

      const heightControls = document.createElement("div");
      heightControls.className = "playback-duration-height-controls";
      const shrinkButton = document.createElement("button");
      shrinkButton.type = "button";
      shrinkButton.className = "canvas-btn icon-btn playback-duration-height-btn";
      shrinkButton.textContent = "-";
      shrinkButton.title = "Decrease track height";
      const growButton = document.createElement("button");
      growButton.type = "button";
      growButton.className = "canvas-btn icon-btn playback-duration-height-btn";
      growButton.textContent = "+";
      growButton.title = "Increase track height";
      heightControls.appendChild(shrinkButton);
      heightControls.appendChild(growButton);

      controls.appendChild(playButton);
      controls.appendChild(speedSelect);
      controls.appendChild(prevButton);
      controls.appendChild(nextButton);
      controls.appendChild(heightControls);

      const ruler = document.createElement("div");
      ruler.className = "playback-duration-ruler";
      const totalStart = document.createElement("span");
      totalStart.className = "playback-duration-total-start";
      const cursorTime = document.createElement("span");
      cursorTime.className = "playback-duration-cursor-time";
      const totalEnd = document.createElement("span");
      totalEnd.className = "playback-duration-total-end";
      ruler.appendChild(totalStart);
      ruler.appendChild(cursorTime);
      ruler.appendChild(totalEnd);

      const overview = document.createElement("div");
      overview.className = "playback-duration-overview";
      const overviewWindow = document.createElement("div");
      overviewWindow.className = "playback-duration-overview-window";
      const overviewCursor = document.createElement("div");
      overviewCursor.className = "playback-duration-overview-cursor";
      overviewCursor.title = playbackCopy.frame || "Frame";
      overviewCursor.setAttribute("role", "slider");
      overviewCursor.setAttribute("aria-label", overviewCursor.title);
      overview.appendChild(overviewWindow);
      overview.appendChild(overviewCursor);

      const axis = document.createElement("div");
      axis.className = "playback-duration-axis";
      const viewport = document.createElement("div");
      viewport.className = "playback-duration-viewport";
      const track = document.createElement("div");
      track.className = "playback-duration-track";

      const model = buildPlaybackDurationModel(log);
      bindPlaybackDurationOverviewCursor(overviewCursor, overview, log, model);
      track.style.width = `${model.trackWidth}px`;
      track.style.height = `${model.trackHeight}px`;
      track.style.setProperty("--playback-duration-lane-height", `${model.laneHeight}px`);
      track.style.setProperty("--playback-duration-block-height", `${model.blockHeight}px`);
      model.segments.forEach((segment) => {
        const item = document.createElement("div");
        item.className = `playback-duration-segment status-${normalizeStatusClass(segment.status)}`;
        item.dataset.playbackTreeId = segment.treeId ? String(segment.treeId) : "";
        item.dataset.playbackTaskId = segment.id ? String(segment.id) : "";
        item.dataset.playbackTaskSource = segment.source ? String(segment.source) : "";
        item.dataset.frameIndex = String(segment.frameIndex);
        item.dataset.playbackLane = String(segment.lane);
        item.dataset.segmentStart = String(segment.start);
        item.dataset.segmentEnd = String(segment.end);
        item.style.left = `${segment.leftPercent}%`;
        item.style.width = `${segment.widthPercent}%`;
        item.style.top = `${segment.laneTop}px`;
        item.title = segment.title;
        const label = document.createElement("span");
        label.className = "playback-duration-segment-label";
        label.textContent = segment.label;
        item.appendChild(label);
        track.appendChild(item);
      });

      const playhead = document.createElement("div");
      playhead.className = "playback-duration-playhead";
      playhead.title = playbackCopy.frame || "Frame";
      playhead.setAttribute("role", "slider");
      playhead.setAttribute("aria-label", playhead.title);
      bindPlaybackDurationPlayhead(playhead, viewport, log, model);
      track.appendChild(playhead);

      viewport.appendChild(track);
      viewport.addEventListener("scroll", () => {
        updatePlaybackDurationRangeLabels(log, model);
      }, { passive: true });
      bindPlaybackDurationOverviewWindow(overviewWindow, overview, viewport, log, model);
      shrinkButton.addEventListener("click", () => {
        adjustPlaybackDurationLaneHeight(viewport, log, model, -4);
      });
      growButton.addEventListener("click", () => {
        adjustPlaybackDurationLaneHeight(viewport, log, model, 4);
      });
      bindPlaybackDurationViewportInteractions(viewport, log, model);
      axis.appendChild(viewport);
      const windowRuler = document.createElement("div");
      windowRuler.className = "playback-duration-window-ruler";
      const windowStart = document.createElement("span");
      windowStart.className = "playback-duration-window-start";
      const windowEnd = document.createElement("span");
      windowEnd.className = "playback-duration-window-end";
      windowRuler.appendChild(windowStart);
      windowRuler.appendChild(windowEnd);
      main.appendChild(controls);
      main.appendChild(ruler);
      main.appendChild(overview);
      main.appendChild(axis);
      main.appendChild(windowRuler);
      panel.appendChild(main);
      panel.appendChild(renderPlaybackCurrentTaskPanel(log, model, playbackCopy));
      requestAnimationFrame(() => {
        applyPlaybackDurationTrackWidth(viewport, log, model, getClampedPlaybackDurationTrackWidth(viewport, model, model.trackWidth));
      });
      syncPlaybackDurationTimeline(log, model);
      return panel;
    }

    function renderPlaybackCurrentTaskPanel(log, model, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      const panel = document.createElement("aside");
      panel.className = "playback-duration-task-panel";
      const header = document.createElement("div");
      header.className = "playback-duration-task-header";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "canvas-btn icon-btn playback-duration-task-toggle";
      toggle.textContent = runtime.state.playbackDurationTaskPanelVisible === true ? ">" : "<";
      toggle.title = runtime.state.playbackDurationTaskPanelVisible === true
        ? playbackCopy.hideCurrentTasks
        : playbackCopy.showCurrentTasks;
      toggle.setAttribute("aria-label", toggle.title);
      toggle.addEventListener("click", () => {
        runtime.state.playbackDurationTaskPanelVisible = runtime.state.playbackDurationTaskPanelVisible !== true;
        document.querySelector(".playback-duration-panel")?.classList.toggle(
          "hide-current-task-panel",
          runtime.state.playbackDurationTaskPanelVisible !== true
        );
        toggle.textContent = runtime.state.playbackDurationTaskPanelVisible === true ? ">" : "<";
        toggle.title = runtime.state.playbackDurationTaskPanelVisible === true
          ? playbackCopy.hideCurrentTasks
          : playbackCopy.showCurrentTasks;
        toggle.setAttribute("aria-label", toggle.title);
        updatePlaybackCurrentTaskPanel(log, model);
        persistUiState();
      });
      const title = document.createElement("strong");
      title.textContent = playbackCopy.currentTasks;
      const count = document.createElement("span");
      count.className = "playback-duration-task-count";
      header.appendChild(toggle);
      header.appendChild(title);
      header.appendChild(count);
      const list = document.createElement("div");
      list.className = "playback-duration-task-list";
      panel.appendChild(header);
      panel.appendChild(list);
      return panel;
    }

    function buildPlaybackDurationModel(log) {
      const laneHeight = getPlaybackDurationLaneHeight();
      const blockHeight = getPlaybackDurationBlockHeight(laneHeight);
      const model = runtime.playbackTimelineTasks.buildPlaybackDurationModel(log, { laneHeight, blockHeight });
      return {
        ...model,
        trackWidth: getPlaybackDurationTrackWidth(model.total)
      };
    }

    function getPlaybackDurationLaneHeight() {
      return runtime.viewport.clampNumber(runtime.state.playbackDurationLaneHeight, 18, 72, 42);
    }

    function getPlaybackDurationBlockHeight(laneHeight = getPlaybackDurationLaneHeight()) {
      return runtime.viewport.clampNumber(laneHeight - 10, 10, 64, 32);
    }

    function getPlaybackDurationTimeScale() {
      return runtime.viewport.clampNumber(runtime.state.playbackDurationTimeScale, 0.5, 12, 1);
    }

    function getPlaybackDurationTrackWidth(total) {
      const baseWidth = Math.max(960, Math.ceil((Math.max(1, total) / 1000) * 0.12));
      return Math.max(480, Math.min(40000, Math.round(baseWidth * getPlaybackDurationTimeScale())));
    }

    function getPlaybackDurationTrackWidthBounds(viewport, model) {
      const viewportWidth = Math.max(1, viewport?.clientWidth || 960);
      const total = Math.max(1, model.total);
      const maxVisible = Math.min(total, PLAYBACK_DURATION_MAX_VISIBLE_US);
      const minVisible = Math.min(total, PLAYBACK_DURATION_MIN_VISIBLE_US);
      const minWidth = Math.max(viewportWidth, Math.ceil((viewportWidth * total) / Math.max(1, maxVisible)));
      const maxWidth = Math.max(minWidth, Math.ceil((viewportWidth * total) / Math.max(1, minVisible)));
      return { minWidth, maxWidth };
    }

    function getClampedPlaybackDurationTrackWidth(viewport, model, width) {
      const { minWidth, maxWidth } = getPlaybackDurationTrackWidthBounds(viewport, model);
      return runtime.viewport.clampNumber(width, minWidth, maxWidth, minWidth);
    }

    function syncPlaybackDurationTimeline(log, model = null) {
      const track = document.querySelector(".playback-duration-track");
      const playhead = document.querySelector(".playback-duration-playhead");
      if (!track && !playhead) {
        return;
      }

      const durationModel = model || buildPlaybackDurationModel(log);
      const tUs = getCurrentPlaybackTimeUs(log, durationModel);
      const progress = clampNumber(((tUs - durationModel.firstTime) / durationModel.total) * 100, 0, 100);
      track?.style.setProperty("--playback-duration-progress", `${progress}%`);
      if (playhead) {
        playhead.setAttribute("aria-valuemin", formatTransitionTime(log, durationModel.firstTime));
        playhead.setAttribute("aria-valuemax", formatTransitionTime(log, durationModel.firstTime + durationModel.total));
        playhead.setAttribute("aria-valuenow", formatTransitionTime(log, tUs));
      }

      updatePlaybackCurrentTaskPanel(log, durationModel, tUs);
      updatePlaybackDurationRangeLabels(log, durationModel);
      syncPlaybackDurationSegmentLabels(durationModel);
    }

    function updatePlaybackCurrentTaskPanel(log, model, currentTime = getCurrentPlaybackTimeUs(log, model)) {
      const taskPanel = document.querySelector(".playback-duration-task-panel");
      const list = taskPanel?.querySelector(".playback-duration-task-list");
      const count = taskPanel?.querySelector(".playback-duration-task-count");
      if (!taskPanel || !list || !count) {
        return;
      }

      const activeTasks = (model.segments || []).filter((segment) =>
        isPlaybackDurationSegmentAtTime(model, segment, currentTime)
      );
      count.textContent = String(activeTasks.length);
      if (runtime.state.playbackDurationTaskPanelVisible !== true) {
        list.replaceChildren();
        return;
      }

      if (activeTasks.length === 0) {
        const empty = document.createElement("div");
        empty.className = "playback-duration-task-empty";
        empty.textContent = runtime.i18n.getPlaybackCopy().noCurrentTasks;
        list.replaceChildren(empty);
        return;
      }

      const fragment = document.createDocumentFragment();
      activeTasks.forEach((task) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "playback-duration-task-item";
        item.title = task.title || task.label;
        item.addEventListener("click", () => {
          centerPlaybackDurationViewportOnTime(log, model, task.start);
        });
        const name = document.createElement("strong");
        name.textContent = task.label;
        const time = document.createElement("span");
        time.textContent = `${formatPlaybackTimelineClock(log, task.start)} - ${formatPlaybackTimelineClock(log, task.end)}`;
        item.appendChild(name);
        item.appendChild(time);
        fragment.appendChild(item);
      });
      list.replaceChildren(fragment);
    }

    function isPlaybackDurationSegmentAtTime(model, segment, currentTime) {
      const start = Number(segment.start);
      const end = Number(segment.end);
      const time = Number(currentTime);
      if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(time)) {
        return false;
      }
      if (time >= start && time <= end) {
        return true;
      }

      const visualStartPercent = Number(segment.leftPercent);
      const visualWidthPercent = Number(segment.widthPercent);
      if (!Number.isFinite(visualStartPercent) || !Number.isFinite(visualWidthPercent) || visualWidthPercent <= 0) {
        return false;
      }
      const visualStart = model.firstTime + (visualStartPercent / 100) * model.total;
      const visualEnd = model.firstTime + ((visualStartPercent + visualWidthPercent) / 100) * model.total;
      return time >= visualStart && time <= visualEnd;
    }

    function bindPlaybackDurationPlayhead(playhead, viewport, log, model) {
      let activePointerId = null;
      let latestClientX = 0;
      let dragFrame = 0;

      const timeFromClientX = (clientX) => {
        const track = viewport.querySelector(".playback-duration-track");
        const rect = track?.getBoundingClientRect();
        if (!rect || rect.width <= 0) {
          return getCurrentPlaybackTimeUs(log, model);
        }
        const offsetX = clampNumber(clientX - rect.left, 0, rect.width);
        return clampPlaybackTimeUs(log, model.firstTime + (offsetX / rect.width) * model.total);
      };

      const applyDrag = (persist) => {
        dragFrame = 0;
        scrollPlaybackDurationViewportNearEdge(viewport, latestClientX);
        const tUs = timeFromClientX(latestClientX);
        const options = {
          navigateToActiveNode: false,
          scrollList: false,
          focusNode: false,
          persist,
          updateBlackboard: true
        };
        if (persist) {
          setPlaybackTime(log, tUs, options);
        } else {
          requestPlaybackTime(log, tUs, options);
        }
      };

      const scheduleDrag = () => {
        if (dragFrame) {
          return;
        }
        dragFrame = requestAnimationFrame(() => applyDrag(false));
      };

      const finish = (commit = true) => {
        if (activePointerId === null) {
          return;
        }
        if (dragFrame) {
          cancelAnimationFrame(dragFrame);
          dragFrame = 0;
        }
        if (commit) {
          applyDrag(true);
        }
        document.body.classList.remove("is-dragging-playback-playhead");
        try {
          playhead.releasePointerCapture(activePointerId);
        } catch (_error) {
          // Ignore stale pointer capture state.
        }
        activePointerId = null;
      };

      playhead.addEventListener("pointerdown", (event) => {
        if (event.button !== undefined && event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        latestClientX = event.clientX;
        activePointerId = event.pointerId;
        document.body.classList.add("is-dragging-playback-playhead");
        try {
          playhead.setPointerCapture(event.pointerId);
        } catch (_error) {
          // Dragging still works in hosts without pointer capture.
        }
        applyDrag(false);
      });

      playhead.addEventListener("pointermove", (event) => {
        if (activePointerId === null || event.pointerId !== activePointerId) {
          return;
        }
        if ((event.buttons & 1) !== 1) {
          finish(false);
          return;
        }
        latestClientX = event.clientX;
        scheduleDrag();
      });
      playhead.addEventListener("pointerup", (event) => {
        if (activePointerId !== null && event.pointerId !== activePointerId) {
          return;
        }
        finish();
      });
      playhead.addEventListener("pointercancel", () => finish(false));
      playhead.addEventListener("lostpointercapture", () => finish(false));
    }

    function scrollPlaybackDurationViewportNearEdge(viewport, clientX) {
      const rect = viewport.getBoundingClientRect();
      const edgeSize = 28;
      const maxStep = 56;
      if (clientX > rect.right - edgeSize) {
        viewport.scrollLeft += Math.min(maxStep, Math.max(1, clientX - rect.right + edgeSize));
      } else if (clientX < rect.left + edgeSize) {
        viewport.scrollLeft -= Math.min(maxStep, Math.max(1, rect.left + edgeSize - clientX));
      }
    }

    function bindPlaybackDurationOverviewCursor(cursor, overview, log, model) {
      let activePointerId = null;
      let startClientX = 0;
      let latestClientX = 0;
      let dragFrame = 0;
      let didDrag = false;
      const dragThreshold = 3;

      const timeFromClientX = (clientX) => {
        const rect = overview.getBoundingClientRect();
        if (!rect || rect.width <= 0) {
          return getCurrentPlaybackTimeUs(log, model);
        }
        const ratio = clampNumber((clientX - rect.left) / rect.width, 0, 1);
        return clampPlaybackTimeUs(log, model.firstTime + ratio * model.total);
      };

      const applyDrag = (persist) => {
        dragFrame = 0;
        const tUs = timeFromClientX(latestClientX);
        const options = {
          navigateToActiveNode: false,
          scrollList: false,
          focusNode: false,
          persist,
          updateBlackboard: true
        };
        if (persist) {
          setPlaybackTime(log, tUs, options);
        } else {
          requestPlaybackTime(log, tUs, options);
        }
      };

      const scheduleDrag = () => {
        if (dragFrame) {
          return;
        }
        dragFrame = requestAnimationFrame(() => applyDrag(false));
      };

      const finish = (commit = true) => {
        if (activePointerId === null) {
          return;
        }
        if (dragFrame) {
          cancelAnimationFrame(dragFrame);
          dragFrame = 0;
        }
        if (commit && didDrag) {
          applyDrag(true);
        } else if (commit) {
          centerPlaybackDurationViewportOnTime(log, model, getCurrentPlaybackTimeUs(log, model));
        }
        document.body.classList.remove("is-dragging-playback-playhead");
        try {
          cursor.releasePointerCapture(activePointerId);
        } catch (_error) {
          // Ignore stale pointer capture state.
        }
        activePointerId = null;
        didDrag = false;
      };

      cursor.addEventListener("pointerdown", (event) => {
        if (event.button !== undefined && event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        startClientX = event.clientX;
        latestClientX = event.clientX;
        activePointerId = event.pointerId;
        try {
          cursor.setPointerCapture(event.pointerId);
        } catch (_error) {
          // Dragging still works in hosts without pointer capture.
        }
      });

      cursor.addEventListener("pointermove", (event) => {
        if (activePointerId === null || event.pointerId !== activePointerId) {
          return;
        }
        if ((event.buttons & 1) !== 1) {
          finish(false);
          return;
        }
        latestClientX = event.clientX;
        if (!didDrag) {
          if (Math.abs(latestClientX - startClientX) < dragThreshold) {
            return;
          }
          didDrag = true;
          document.body.classList.add("is-dragging-playback-playhead");
        }
        scheduleDrag();
      });
      cursor.addEventListener("pointerup", (event) => {
        if (activePointerId !== null && event.pointerId !== activePointerId) {
          return;
        }
        finish();
      });
      cursor.addEventListener("pointercancel", () => finish(false));
      cursor.addEventListener("lostpointercapture", () => finish(false));
    }

    function bindPlaybackDurationOverviewWindow(windowEl, overview, viewport, log, model) {
      let activePointerId = null;
      let startClientX = 0;
      let startScrollLeft = 0;
      let latestClientX = 0;
      let panFrame = 0;

      const applyPan = () => {
        panFrame = 0;
        const rect = overview.getBoundingClientRect();
        const track = viewport.querySelector(".playback-duration-track");
        const trackWidth = Math.max(1, track?.scrollWidth || model.trackWidth || 1);
        if (!rect || rect.width <= 0) {
          return;
        }
        viewport.scrollLeft = startScrollLeft + ((latestClientX - startClientX) / rect.width) * trackWidth;
        updatePlaybackDurationRangeLabels(log, model);
        syncPlaybackDurationSegmentLabels(model);
      };

      const schedulePan = () => {
        if (panFrame) {
          return;
        }
        panFrame = requestAnimationFrame(applyPan);
      };

      const finish = () => {
        if (activePointerId === null) {
          return;
        }
        if (panFrame) {
          cancelAnimationFrame(panFrame);
          applyPan();
        }
        document.body.classList.remove("is-panning-playback-duration");
        try {
          windowEl.releasePointerCapture(activePointerId);
        } catch (_error) {
          // Ignore stale pointer capture state.
        }
        activePointerId = null;
      };

      windowEl.addEventListener("pointerdown", (event) => {
        if (event.button !== undefined && event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        activePointerId = event.pointerId;
        startClientX = event.clientX;
        latestClientX = event.clientX;
        startScrollLeft = viewport.scrollLeft;
        document.body.classList.add("is-panning-playback-duration");
        try {
          windowEl.setPointerCapture(event.pointerId);
        } catch (_error) {
          // Dragging still works in hosts without pointer capture.
        }
      });

      windowEl.addEventListener("pointermove", (event) => {
        if (activePointerId === null || event.pointerId !== activePointerId) {
          return;
        }
        if ((event.buttons & 1) !== 1) {
          finish();
          return;
        }
        latestClientX = event.clientX;
        schedulePan();
      });
      windowEl.addEventListener("pointerup", (event) => {
        if (activePointerId !== null && event.pointerId !== activePointerId) {
          return;
        }
        finish();
      });
      windowEl.addEventListener("pointercancel", finish);
      windowEl.addEventListener("lostpointercapture", finish);
    }

    function getCurrentPlaybackTimeUs(log, model) {
      return clampPlaybackTimeUs(log, runtime.state.playbackTimeUs ?? model?.firstTime ?? 0);
    }

    function centerPlaybackDurationViewportOnTime(log, model, tUs) {
      const viewport = document.querySelector(".playback-duration-viewport");
      const track = document.querySelector(".playback-duration-track");
      if (!viewport || !track) {
        return;
      }
      const trackWidth = Math.max(1, track.scrollWidth || model.trackWidth || 1);
      const ratio = clampNumber((Number(tUs) - model.firstTime) / model.total, 0, 1);
      viewport.scrollLeft = Math.max(0, ratio * trackWidth - viewport.clientWidth / 2);
      updatePlaybackDurationRangeLabels(log, model);
      syncPlaybackDurationSegmentLabels(model);
    }

    function bindPlaybackDurationViewportInteractions(viewport, log, model) {
      let activePointerId = null;
      let startX = 0;
      let startY = 0;
      let startScrollLeft = 0;
      let startScrollTop = 0;
      let panFrame = 0;
      let latestClientX = 0;
      let latestClientY = 0;

      const applyPan = () => {
        panFrame = 0;
        viewport.scrollLeft = startScrollLeft - (latestClientX - startX);
        viewport.scrollTop = startScrollTop - (latestClientY - startY);
        updatePlaybackDurationRangeLabels(log, model);
        syncPlaybackDurationSegmentLabels(model);
      };

      const schedulePan = () => {
        if (panFrame) {
          return;
        }
        panFrame = requestAnimationFrame(applyPan);
      };

      const finishPan = () => {
        if (activePointerId === null) {
          return;
        }
        if (panFrame) {
          cancelAnimationFrame(panFrame);
          applyPan();
        }
        document.body.classList.remove("is-panning-playback-duration");
        try {
          viewport.releasePointerCapture(activePointerId);
        } catch (_error) {
          // Ignore stale pointer capture state.
        }
        activePointerId = null;
      };

      viewport.addEventListener("pointerdown", (event) => {
        if (event.button !== undefined && event.button !== 0) {
          return;
        }
        if (event.target?.closest?.(".playback-duration-playhead")) {
          return;
        }
        event.preventDefault();
        activePointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        latestClientX = event.clientX;
        latestClientY = event.clientY;
        startScrollLeft = viewport.scrollLeft;
        startScrollTop = viewport.scrollTop;
        document.body.classList.add("is-panning-playback-duration");
        try {
          viewport.setPointerCapture(event.pointerId);
        } catch (_error) {
          // Dragging still works in hosts without pointer capture.
        }
      });

      viewport.addEventListener("pointermove", (event) => {
        if (activePointerId === null || event.pointerId !== activePointerId) {
          return;
        }
        if ((event.buttons & 1) !== 1) {
          finishPan();
          return;
        }
        latestClientX = event.clientX;
        latestClientY = event.clientY;
        schedulePan();
      });
      viewport.addEventListener("pointerup", (event) => {
        if (activePointerId !== null && event.pointerId !== activePointerId) {
          return;
        }
        finishPan();
      });
      viewport.addEventListener("pointercancel", finishPan);
      viewport.addEventListener("lostpointercapture", finishPan);
      viewport.addEventListener("wheel", (event) => {
        if (!event.deltaY) {
          return;
        }
        event.preventDefault();
        const current = getPlaybackDurationTimeScale();
        const rect = viewport.getBoundingClientRect();
        const anchorX = clampNumber(event.clientX - rect.left, 0, Math.max(1, rect.width));
        const oldTrackWidth = Math.max(1, model.trackWidth);
        const anchorRatio = clampNumber((viewport.scrollLeft + anchorX) / oldTrackWidth, 0, 1);
        const requestedWidth = oldTrackWidth * (event.deltaY > 0 ? 0.88 : 1.14);
        const nextWidth = getClampedPlaybackDurationTrackWidth(viewport, model, requestedWidth);
        if (Math.abs(nextWidth - oldTrackWidth) < 1) {
          return;
        }
        applyPlaybackDurationTrackWidth(viewport, log, model, nextWidth, anchorRatio, anchorX);
        persistUiState();
      }, { passive: false });
    }

    function adjustPlaybackDurationLaneHeight(viewport, log, model, delta) {
      const current = getPlaybackDurationLaneHeight();
      const next = runtime.viewport.clampNumber(current + delta, 18, 72, 42);
      if (next === current) {
        return;
      }
      runtime.state.playbackDurationLaneHeight = next;
      applyPlaybackDurationLaneHeight(viewport, log, model, next);
      persistUiState();
    }

    function applyPlaybackDurationLaneHeight(viewport, log, model, laneHeight) {
      const track = viewport.querySelector(".playback-duration-track");
      if (!track) {
        return;
      }
      const blockHeight = getPlaybackDurationBlockHeight(laneHeight);
      model.laneHeight = laneHeight;
      model.blockHeight = blockHeight;
      model.trackHeight = Math.max(96, model.laneCount * laneHeight);
      track.style.height = `${model.trackHeight}px`;
      track.style.setProperty("--playback-duration-lane-height", `${laneHeight}px`);
      track.style.setProperty("--playback-duration-block-height", `${blockHeight}px`);
      track.querySelectorAll(".playback-duration-segment").forEach((segment) => {
        const lane = Number(segment.dataset.playbackLane);
        if (Number.isFinite(lane)) {
          segment.style.top = `${lane * laneHeight}px`;
        }
      });
      updatePlaybackDurationRangeLabels(log, model);
      syncPlaybackDurationSegmentLabels(model);
    }

    function applyPlaybackDurationTrackWidth(viewport, log, model, width, anchorRatio = null, anchorX = null) {
      const track = viewport.querySelector(".playback-duration-track");
      if (!track) {
        return;
      }
      const previousTrackWidth = Math.max(1, model.trackWidth);
      const resolvedAnchorRatio = anchorRatio ?? clampNumber((viewport.scrollLeft + viewport.clientWidth / 2) / previousTrackWidth, 0, 1);
      const resolvedAnchorX = anchorX ?? viewport.clientWidth / 2;
      model.trackWidth = getClampedPlaybackDurationTrackWidth(viewport, model, width);
      track.style.width = `${model.trackWidth}px`;
      runtime.state.playbackDurationTimeScale = model.trackWidth / Math.max(1, model.baseTrackWidth || 1);
      viewport.scrollLeft = Math.max(0, resolvedAnchorRatio * model.trackWidth - resolvedAnchorX);
      updatePlaybackDurationRangeLabels(log, model);
      syncPlaybackDurationSegmentLabels(model);
    }

    function updatePlaybackDurationRangeLabels(log, model) {
      const viewport = document.querySelector(".playback-duration-viewport");
      const track = document.querySelector(".playback-duration-track");
      const totalStartLabel = document.querySelector(".playback-duration-total-start");
      const cursorLabel = document.querySelector(".playback-duration-cursor-time");
      const totalEndLabel = document.querySelector(".playback-duration-total-end");
      const windowStartLabel = document.querySelector(".playback-duration-window-start");
      const windowEndLabel = document.querySelector(".playback-duration-window-end");
      const overviewWindow = document.querySelector(".playback-duration-overview-window");
      const overviewCursor = document.querySelector(".playback-duration-overview-cursor");
      if (!viewport || !track || !totalStartLabel || !cursorLabel || !totalEndLabel || !windowStartLabel || !windowEndLabel) {
        return;
      }

      const trackWidth = Math.max(1, track.scrollWidth || model.trackWidth || 1);
      const visibleStart = model.firstTime + clampNumber(viewport.scrollLeft / trackWidth, 0, 1) * model.total;
      const visibleEnd = model.firstTime + clampNumber((viewport.scrollLeft + viewport.clientWidth) / trackWidth, 0, 1) * model.total;
      const currentTime = getCurrentPlaybackTimeUs(log, model);
      totalStartLabel.textContent = formatPlaybackTimelineClock(log, model.firstTime);
      cursorLabel.textContent = formatPlaybackTimelineClock(log, currentTime);
      totalEndLabel.textContent = formatPlaybackTimelineClock(log, model.firstTime + model.total);
      windowStartLabel.textContent = formatPlaybackTimelineClock(log, visibleStart);
      windowEndLabel.textContent = formatPlaybackTimelineClock(log, visibleEnd);
      if (overviewWindow) {
        overviewWindow.style.left = `${clampNumber((visibleStart - model.firstTime) / model.total, 0, 1) * 100}%`;
        overviewWindow.style.width = `${clampNumber((visibleEnd - visibleStart) / model.total, 0, 1) * 100}%`;
      }
      if (overviewCursor) {
        overviewCursor.style.left = `${clampNumber((currentTime - model.firstTime) / model.total, 0, 1) * 100}%`;
      }
      syncPlaybackDurationSegmentLabels(model);
    }

    function syncPlaybackDurationSegmentLabels(model) {
      const viewport = document.querySelector(".playback-duration-viewport");
      const track = document.querySelector(".playback-duration-track");
      if (!viewport || !track) {
        return;
      }

      const trackWidth = Math.max(1, track.scrollWidth || model.trackWidth || 1);
      track.querySelectorAll(".playback-duration-segment").forEach((segment) => {
        const label = segment.querySelector(".playback-duration-segment-label");
        if (!label) {
          return;
        }
        const segmentStart = Number(segment.dataset.segmentStart);
        const segmentEnd = Number(segment.dataset.segmentEnd);
        if (!Number.isFinite(segmentStart) || !Number.isFinite(segmentEnd)) {
          return;
        }
        const segmentLeft = Number.isFinite(segment.offsetLeft)
          ? segment.offsetLeft
          : ((segmentStart - model.firstTime) / model.total) * trackWidth;
        const segmentWidth = Math.max(
          0,
          segment.offsetWidth || ((segmentEnd - segmentStart) / model.total) * trackWidth
        );
        const padding = 6;
        const rawOffset = viewport.scrollLeft - segmentLeft + padding;
        const maxOffset = Math.max(0, segmentWidth - label.offsetWidth - padding * 2);
        const offset = clampNumber(rawOffset, 0, maxOffset);
        label.style.transform = `translateX(${offset}px)`;
      });
    }

    return {
      renderTimeline: renderPlaybackDurationTimeline,
      syncTimeline: syncPlaybackDurationTimeline
    };
  }

  runtime.playbackDurationTimeline = {
    create
  };
})();
