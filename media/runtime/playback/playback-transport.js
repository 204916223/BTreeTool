(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function create(handlers) {
    const {
      persistUiState,
      togglePlayback,
      normalizePlaybackSpeed,
      reschedulePlaybackAutoAdvance,
      stepPlaybackTransition,
      requestPlaybackFrame,
      setPlaybackFrame,
      shouldAutoNavigatePlayback,
      formatRelativeTime,
      formatWallTime
    } = handlers;

    const PLAYBACK_SPEED_OPTIONS = runtime.playbackConfig.speedOptions;

    function renderPlaybackTimeline(log) {
      const playbackCopy = runtime.i18n.getPlaybackCopy();
      const footer = document.createElement("div");
      footer.className = "playback-timeline";

      const leftControls = document.createElement("div");
      leftControls.className = "playback-timeline-group playback-timeline-group-left";

      const playButton = document.createElement("button");
      playButton.type = "button";
      playButton.className = "canvas-btn icon-btn playback-play-btn";
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
      leftControls.appendChild(playButton);

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
      leftControls.appendChild(speedSelect);

      const rightControls = document.createElement("div");
      rightControls.className = "playback-timeline-group playback-timeline-group-right";

      const prevButton = document.createElement("button");
      prevButton.type = "button";
      prevButton.className = "canvas-btn icon-btn playback-step-btn";
      prevButton.replaceChildren(runtime.icons.createIcon("previous"));
      prevButton.title = playbackCopy.previousNodeStatusChange;
      bindPlaybackRepeatButton(prevButton, () => {
        stepPlaybackTransition(log, -1);
      });

      const nextButton = document.createElement("button");
      nextButton.type = "button";
      nextButton.className = "canvas-btn icon-btn playback-step-btn";
      nextButton.replaceChildren(runtime.icons.createIcon("next"));
      nextButton.title = playbackCopy.nextNodeStatusChange;
      bindPlaybackRepeatButton(nextButton, () => {
        stepPlaybackTransition(log, 1);
      });

      const slider = document.createElement("input");
      slider.className = "playback-slider";
      slider.type = "range";
      slider.min = "0";
      slider.max = String(Math.max(0, (log.frames?.length || 1) - 1));
      slider.step = "1";
      slider.value = String(runtime.state.playbackFrameIndex);
      slider.addEventListener("input", () => {
        requestPlaybackFrame(log, Number(slider.value), {
          navigateToActiveNode: false,
          scrollList: false,
          focusNode: false,
          persist: false,
          updateBlackboard: true
        });
      });
      slider.addEventListener("change", () => {
        setPlaybackFrame(log, Number(slider.value), {
          navigateToActiveNode: shouldAutoNavigatePlayback(),
          scrollList: true,
          focusNode: shouldAutoNavigatePlayback(),
          persist: true,
          updateBlackboard: true
        });
      });

      const time = document.createElement("div");
      time.className = "playback-current-time";
      const frame = log.frames?.[runtime.state.playbackFrameIndex] || null;
      time.textContent = frame ? `${formatRelativeTime(log, frame.tUs)}  ${formatWallTime(frame.wallUs)}` : playbackCopy.noFrames;

      rightControls.appendChild(prevButton);
      rightControls.appendChild(nextButton);
      rightControls.appendChild(time);

      footer.appendChild(leftControls);
      footer.appendChild(slider);
      footer.appendChild(rightControls);
      updatePlaybackTimelineControls(log);
      return footer;
    }

    function updatePlaybackTimelineControls(log) {
      const playbackCopy = runtime.i18n.getPlaybackCopy();
      const playButton = document.querySelector(".playback-play-btn");
      if (playButton) {
        const isPlaying = runtime.state.playbackIsPlaying === true;
        const nextIconKind = isPlaying ? "pause" : "play";
        playButton.classList.toggle("is-active", isPlaying);
        playButton.setAttribute("aria-pressed", isPlaying ? "true" : "false");
        playButton.title = isPlaying ? playbackCopy.pausePlayback : playbackCopy.playPlayback;
        playButton.setAttribute("aria-label", playButton.title);
        if (playButton.dataset.playbackIcon !== nextIconKind) {
          playButton.replaceChildren(createPlaybackTransportIcon(nextIconKind));
          playButton.dataset.playbackIcon = nextIconKind;
        }
      }

      const speedSelect = document.querySelector(".playback-speed-select");
      if (speedSelect) {
        const nextValue = String(normalizePlaybackSpeed(runtime.state.playbackPlaybackSpeed));
        if (speedSelect.value !== nextValue) {
          speedSelect.value = nextValue;
        }
        speedSelect.disabled = !log?.frames || log.frames.length < 2;
      }
    }

    function bindPlaybackRepeatButton(button, action) {
      let holdTimer = 0;
      let repeatTimer = 0;
      let activePointerId = null;
      let didRepeat = false;
      let suppressNextClick = false;
      let suppressClickResetTimer = 0;

      const clearTimers = () => {
        if (holdTimer) {
          window.clearTimeout(holdTimer);
          holdTimer = 0;
        }
        if (repeatTimer) {
          window.clearInterval(repeatTimer);
          repeatTimer = 0;
        }
      };

      const finishPress = () => {
        clearTimers();
        if (didRepeat) {
          suppressNextClick = true;
          if (suppressClickResetTimer) {
            window.clearTimeout(suppressClickResetTimer);
          }
          suppressClickResetTimer = window.setTimeout(() => {
            suppressNextClick = false;
            suppressClickResetTimer = 0;
          }, 80);
        }
        activePointerId = null;
        didRepeat = false;
      };

      button.addEventListener("pointerdown", (event) => {
        if (event.button !== undefined && event.button !== 0) {
          return;
        }
        if (button.disabled) {
          return;
        }

        clearTimers();
        didRepeat = false;
        activePointerId = event.pointerId;
        try {
          button.setPointerCapture(event.pointerId);
        } catch (_error) {
          // Some hosts may reject stale pointer capture; repeating still works without it.
        }

        holdTimer = window.setTimeout(() => {
          didRepeat = true;
          action();
          repeatTimer = window.setInterval(action, 200);
        }, 200);
      });

      button.addEventListener("pointerup", (event) => {
        if (activePointerId !== null && event.pointerId !== activePointerId) {
          return;
        }
        try {
          button.releasePointerCapture(event.pointerId);
        } catch (_error) {
          // Ignore stale pointer capture state.
        }
        finishPress();
      });
      button.addEventListener("pointercancel", finishPress);
      button.addEventListener("lostpointercapture", finishPress);
      button.addEventListener("contextmenu", (event) => {
        if (holdTimer || repeatTimer) {
          event.preventDefault();
        }
      });
      button.addEventListener("click", (event) => {
        if (suppressNextClick) {
          event.preventDefault();
          event.stopPropagation();
          suppressNextClick = false;
          if (suppressClickResetTimer) {
            window.clearTimeout(suppressClickResetTimer);
            suppressClickResetTimer = 0;
          }
          return;
        }
        action();
      });
    }

    function createPlaybackTransportIcon(kind) {
      return runtime.icons.createIcon(kind === "pause" ? "pause" : "play");
    }

    return {
      renderTimeline: renderPlaybackTimeline,
      updateControls: updatePlaybackTimelineControls,
      bindRepeatButton: bindPlaybackRepeatButton,
      createTransportIcon: createPlaybackTransportIcon
    };
  }

  runtime.playbackTransport = {
    create
  };
})();
