(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function create(handlers) {
    const {
      vscode,
      buildCurrentPlaybackSnapshot,
      getCurrentPlaybackTimeUs,
      isPlaybackTimeBasedMode,
      getActiveTransitionAtTime,
      getActiveTransition,
      resolvePlaybackNodeName,
      getSelectedTree,
      formatRelativeTime,
      formatPlaybackTimelineClock,
      flattenBlackboardRows
    } = handlers;

    function renderPanel(log, snapshot, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      const panel = document.createElement("section");
      panel.className = "playback-right-tab-panel playback-trace-panel";
      panel.dataset.playbackTab = "trace";
      updatePlaybackTracePanel(log, snapshot, panel);
      return panel;
    }

    function updatePlaybackTracePanel(log, snapshot, targetPanel = null, options = {}) {
      const panel = targetPanel || document.querySelector(".playback-trace-panel");
      if (!panel) {
        return;
      }

      if (options.refreshContent === false) {
        return;
      }

      const playbackCopy = runtime.i18n.getPlaybackCopy();
      const config = runtime.state.traceConfig;
      const nextMode = config?.ready ? "chat" : "setup";
      if (panel.dataset.traceMode !== nextMode) {
        panel.dataset.traceMode = nextMode;
        panel.replaceChildren(nextMode === "chat"
          ? renderPlaybackTraceChat(log, playbackCopy)
          : renderPlaybackTraceSetup(config, playbackCopy));
      }

      if (nextMode === "chat") {
        updatePlaybackTraceChat(panel, log, playbackCopy);
      } else {
        updatePlaybackTraceSetup(panel, config, playbackCopy);
      }
    }

    function renderPlaybackTraceSetup(config, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      const wrapper = document.createElement("div");
      wrapper.className = "playback-trace-setup";

      const body = document.createElement("div");
      body.className = "playback-trace-setup-body";

      const title = document.createElement("strong");
      title.className = "playback-trace-setup-title";
      title.textContent = playbackCopy.traceConfigTitle;

      const description = document.createElement("p");
      description.className = "playback-trace-note";
      description.textContent = playbackCopy.traceConfigDescription;

      const missing = document.createElement("div");
      missing.className = "playback-trace-missing";
      missing.dataset.traceMissing = "true";
      const missingMessage = document.createElement("div");
      missingMessage.dataset.traceMissingMessage = "true";
      const addProviderButton = createTraceButton(playbackCopy.traceAddProvider, () => {
        vscode.postMessage({ type: "addTraceProvider" });
      }, "accent");
      missing.appendChild(missingMessage);
      missing.appendChild(addProviderButton);

      const providers = document.createElement("div");
      providers.className = "playback-trace-provider-list";
      providers.dataset.traceProviders = "true";

      body.appendChild(title);
      body.appendChild(description);
      body.appendChild(missing);
      body.appendChild(providers);

      wrapper.appendChild(body);
      updatePlaybackTraceSetup(wrapper, config, playbackCopy);
      return wrapper;
    }

    function updatePlaybackTraceSetup(panel, config, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      const missingMessage = panel.querySelector("[data-trace-missing-message]");
      if (missingMessage) {
        missingMessage.textContent = config
          ? config.notice || playbackCopy.traceNoAvailableProviders
          : playbackCopy.traceConfigLoading;
      }

      const providerList = panel.querySelector("[data-trace-providers]");
      if (providerList) {
        providerList.replaceChildren();
        (config?.providers || []).forEach((provider) => {
          const item = document.createElement("div");
          item.className = "playback-trace-provider-row";
          item.classList.toggle("is-ready", provider.configured === true);
          item.classList.toggle("is-active", provider.id === config?.activeProvider);

          const name = document.createElement("strong");
          name.textContent = provider.label;
          const status = document.createElement("span");
          status.textContent = provider.configured
            ? playbackCopy.traceProviderReady(provider.model)
            : playbackCopy.traceProviderMissing(provider.missing.join(", "));
          item.appendChild(name);
          item.appendChild(status);
          providerList.appendChild(item);
        });
      }

    }

    function renderPlaybackTraceChat(log, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      const wrapper = document.createElement("div");
      wrapper.className = "playback-trace-chat";

      const messages = document.createElement("div");
      messages.className = "playback-trace-messages";
      messages.dataset.traceMessages = "true";

      const form = document.createElement("form");
      form.className = "playback-trace-composer";
      const composerShell = document.createElement("div");
      composerShell.className = "playback-trace-composer-shell";

      const input = document.createElement("textarea");
      input.className = "playback-trace-input";
      input.rows = 2;
      input.placeholder = playbackCopy.traceAskPlaceholder;
      input.spellcheck = false;
      input.addEventListener("input", () => resizePlaybackTraceInput(input));
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          form.requestSubmit();
        }
      });

      const footer = document.createElement("div");
      footer.className = "playback-trace-composer-footer";

      const statusbar = document.createElement("div");
      statusbar.className = "playback-trace-statusbar";
      const provider = document.createElement("span");
      provider.dataset.traceProvider = "true";
      statusbar.appendChild(provider);

      const send = document.createElement("button");
      send.type = "submit";
      send.className = "canvas-btn accent icon-btn playback-trace-send";
      send.title = playbackCopy.traceSend;
      send.setAttribute("aria-label", playbackCopy.traceSend);
      send.appendChild(createPlaybackSendIcon());
      send.addEventListener("click", (event) => {
        if (!runtime.state.tracePendingRequestId) {
          return;
        }
        event.preventDefault();
        cancelTraceQuestion();
      });

      footer.appendChild(statusbar);
      footer.appendChild(send);
      composerShell.appendChild(input);
      composerShell.appendChild(footer);
      form.appendChild(composerShell);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        sendTraceQuestion(log, input);
      });

      wrapper.appendChild(messages);
      wrapper.appendChild(form);
      updatePlaybackTraceChat(wrapper, log, playbackCopy);
      resizePlaybackTraceInput(input);
      return wrapper;
    }

    function updatePlaybackTraceChat(panel, log, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      const messages = panel.querySelector("[data-trace-messages]");
      if (messages) {
        renderTraceMessages(messages, playbackCopy);
      }

      const input = panel.querySelector(".playback-trace-input");
      const send = panel.querySelector(".playback-trace-send");
      const disabled = !log || Boolean(runtime.state.tracePendingRequestId);
      if (input) {
        input.disabled = disabled;
        input.placeholder = log ? playbackCopy.traceAskPlaceholder : playbackCopy.traceNoLog;
        resizePlaybackTraceInput(input);
      }
      if (send) {
        const isPending = Boolean(runtime.state.tracePendingRequestId);
        send.disabled = !log && !isPending;
        send.type = isPending ? "button" : "submit";
        const label = isPending ? playbackCopy.traceStop : playbackCopy.traceSend;
        send.title = label;
        send.setAttribute("aria-label", label);
        send.replaceChildren(isPending ? createPlaybackStopIcon() : createPlaybackSendIcon());
      }

      const provider = panel.querySelector("[data-trace-provider]");
      const config = runtime.state.traceConfig;
      if (provider) {
        provider.textContent = config?.ready
          ? playbackCopy.traceCurrentProvider(config.activeProviderLabel, config.activeModel)
          : playbackCopy.providerNotConfigured;
      }
    }

    function renderTraceMessages(container, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      container.replaceChildren();
      if (runtime.state.traceMessages.length === 0 && !runtime.state.tracePendingRequestId) {
        const empty = document.createElement("div");
        empty.className = "playback-trace-empty";
        empty.textContent = playbackCopy.traceEmpty;
        container.appendChild(empty);
        return;
      }

      runtime.state.traceMessages.forEach((message) => {
        container.appendChild(createTraceMessage(message, playbackCopy));
      });

      if (runtime.state.tracePendingRequestId) {
        const pending = document.createElement("div");
        pending.className = "playback-trace-message assistant is-pending";
        pending.textContent = runtime.state.tracePendingAnswer || playbackCopy.traceThinking;
        container.appendChild(pending);
      }
      container.scrollTop = container.scrollHeight;
    }

    function createTraceMessage(message, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      const item = document.createElement("article");
      item.className = `playback-trace-message ${message.role || "assistant"}`;
      const label = document.createElement("span");
      label.className = "playback-trace-message-role";
      label.textContent = message.role === "user" ? playbackCopy.traceQuestion : playbackCopy.traceAnswer;
      const content = document.createElement("div");
      content.className = "playback-trace-message-content";
      content.textContent = message.content || "";
      item.appendChild(label);
      item.appendChild(content);
      return item;
    }

    function sendTraceQuestion(log, input) {
      const question = input?.value?.trim() || "";
      const config = runtime.state.traceConfig;
      if (!question || !log || !config?.ready || runtime.state.tracePendingRequestId) {
        return;
      }

      const snapshot = buildCurrentPlaybackSnapshot(log);
      const context = buildPlaybackTraceContext(log, snapshot, runtime.i18n.getPlaybackCopy());
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      runtime.state.traceMessages.push({ role: "user", content: question });
      runtime.state.tracePendingRequestId = requestId;
      runtime.state.tracePendingAnswer = "";
      input.value = "";
      updatePlaybackTracePanel(log, snapshot);
      vscode.postMessage({
        type: "traceAsk",
        payload: {
          requestId,
          logFilePath: log.filePath || "",
          question,
          context: context.prompt
        }
      });
    }

    function handleTraceAnswerChunk(payload) {
      if (!payload?.requestId || payload.requestId !== runtime.state.tracePendingRequestId) {
        return;
      }
      const delta = typeof payload.delta === "string" ? payload.delta : "";
      if (!delta) {
        return;
      }
      runtime.state.tracePendingAnswer += delta;
      const log = runtime.state.playbackLog;
      const snapshot = log ? buildCurrentPlaybackSnapshot(log) : null;
      updatePlaybackTracePanel(log, snapshot);
    }

    function handleTraceAnswer(payload) {
      if (!payload?.requestId || payload.requestId !== runtime.state.tracePendingRequestId) {
        return;
      }

      const pendingAnswer = runtime.state.tracePendingAnswer.trim();
      const cancelled = payload.cancelled === true;
      const errorMessage = cancelled
        ? runtime.i18n.getPlaybackCopy().traceRequestCancelled
        : runtime.i18n.getPlaybackCopy().traceRequestFailed(payload.error || "");
      if (cancelled) {
        if (pendingAnswer) {
          runtime.state.traceMessages.push({
            role: "assistant",
            content: pendingAnswer
          });
        } else {
          runtime.state.traceMessages.push({
            role: "assistant",
            content: errorMessage
          });
        }
      } else if (payload.ok) {
        runtime.state.traceMessages.push({
          role: "assistant",
          content: payload.answer || pendingAnswer
        });
      } else {
        runtime.state.traceMessages.push({
          role: "assistant",
          content: errorMessage
        });
      }
      runtime.state.tracePendingRequestId = "";
      runtime.state.tracePendingAnswer = "";
      const log = runtime.state.playbackLog;
      const snapshot = log ? buildCurrentPlaybackSnapshot(log) : null;
      updatePlaybackTracePanel(log, snapshot);
    }

    function clearTraceMessages() {
      runtime.state.traceMessages = [];
      runtime.state.tracePendingRequestId = "";
      runtime.state.tracePendingAnswer = "";
    }

    function cancelTraceQuestion() {
      const requestId = runtime.state.tracePendingRequestId;
      if (!requestId) {
        return;
      }
      vscode.postMessage({
        type: "traceCancel",
        payload: { requestId }
      });
    }

    function resizePlaybackTraceInput(input) {
      if (!input) {
        return;
      }
      input.style.height = "auto";
      const nextHeight = Math.min(Math.max(input.scrollHeight, 44), 148);
      input.style.height = `${nextHeight}px`;
    }

    function createTraceButton(label, onClick, variant = "") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `canvas-btn playback-trace-action ${variant}`.trim();
      button.textContent = label;
      button.addEventListener("click", onClick);
      return button;
    }

    function createPlaybackSendIcon() {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M4 12.5 19.5 4l-4.1 16-4.4-5.4L4 12.5Zm6.4-.3 4 4.8 2.6-10.4-6.6 5.6Z");
      svg.appendChild(path);
      return svg;
    }

    function createPlaybackStopIcon() {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M7 7h10v10H7z");
      svg.appendChild(path);
      return svg;
    }

    function buildPlaybackTraceContext(log, snapshot, playbackCopy = runtime.i18n.getPlaybackCopy()) {
      const frame = log.frames?.[runtime.state.playbackFrameIndex] || null;
      const activeTransition = isPlaybackTimeBasedMode()
        ? getActiveTransitionAtTime(log, getCurrentPlaybackTimeUs(log, null))
        : getActiveTransition(log, runtime.state.playbackFrameIndex);
      const activeTransitionName = activeTransition ? resolvePlaybackNodeName(log, activeTransition) : playbackCopy.noActiveTransition;
      const selectedTree = getSelectedTree(log.preview);
      const treeLabel = selectedTree?.id || log.preview?.defaultTreeId || "MainTree";
      const currentTime = getCurrentPlaybackTimeUs(log, null);
      const frameLabel = frame
        ? `${formatRelativeTime(log, currentTime)}  ${formatPlaybackTimelineClock(log, currentTime)}`
        : playbackCopy.noFrames;
      const transitionLabel = activeTransition
        ? `${activeTransitionName} · ${activeTransition.prevStatus} → ${activeTransition.status}`
        : playbackCopy.noTransition;
      const blackboardRows = flattenBlackboardRows(snapshot.blackboardValues);
      const blackboardLabel = playbackCopy.blackboardEntries(blackboardRows.length);
      const prompt = [
        playbackCopy.promptIntro,
        `${playbackCopy.tree}: ${treeLabel}`,
        `${playbackCopy.frame}: ${frameLabel}`,
        `${playbackCopy.transition}: ${transitionLabel}`,
        playbackCopy.promptBlackboardEntries(blackboardRows.length),
        playbackCopy.promptSelectedNodePath(runtime.state.selectedNodePath || "0"),
        "",
        playbackCopy.promptFocus
      ].join("\n");

      return {
        treeLabel,
        frameLabel,
        transitionLabel,
        blackboardLabel,
        prompt
      };
    }

    return {
      renderPanel,
      updatePanel: updatePlaybackTracePanel,
      handleAnswerChunk: handleTraceAnswerChunk,
      handleAnswer: handleTraceAnswer,
      clearMessages: clearTraceMessages
    };
  }

  runtime.playbackTrace = {
    create
  };
})();
