(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function create(handlers) {
    const {
      vscode,
      buildCurrentPlaybackSnapshot,
      setPlaybackFrame,
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

      const attachments = document.createElement("div");
      attachments.className = "playback-trace-attachments";
      attachments.dataset.traceAttachments = "true";
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.className = "playback-trace-file-input";
      fileInput.dataset.traceFileInput = "true";
      fileInput.accept = ".log,.txt,.1";
      fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0] || null;
        fileInput.value = "";
        if (!file) {
          return;
        }
        readTraceContextFile(file);
      });

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
      const providerSelect = document.createElement("select");
      providerSelect.className = "playback-trace-provider-select";
      providerSelect.dataset.traceProviderSelect = "true";
      providerSelect.addEventListener("change", () => {
        const providerId = providerSelect.value;
        if (!providerId || providerId === runtime.state.traceConfig?.activeProvider) {
          return;
        }
        vscode.postMessage({
          type: "setTraceProvider",
          payload: { providerId }
        });
      });
      statusbar.appendChild(providerSelect);

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
      composerShell.appendChild(attachments);
      composerShell.appendChild(fileInput);
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

      const providerSelect = panel.querySelector("[data-trace-provider-select]");
      const config = runtime.state.traceConfig;
      if (providerSelect) {
        updateTraceProviderSelect(providerSelect, config, playbackCopy, Boolean(runtime.state.tracePendingRequestId));
      }
      const attachments = panel.querySelector("[data-trace-attachments]");
      if (attachments) {
        updateTraceAttachmentTray(attachments, playbackCopy, Boolean(runtime.state.tracePendingRequestId));
      }
    }

    function updateTraceProviderSelect(select, config, playbackCopy, isPending) {
      const providers = (config?.providers || []).filter((provider) => provider.configured === true);
      const activeProvider = config?.activeProvider || "";
      const activeKey = providers
        .map((provider) => `${provider.id}:${provider.label}:${provider.model}`)
        .join("|");
      if (select.dataset.providerListKey !== activeKey) {
        select.dataset.providerListKey = activeKey;
        select.replaceChildren();
        if (providers.length === 0) {
          const option = document.createElement("option");
          option.value = "";
          option.textContent = playbackCopy.providerNotConfigured;
          select.appendChild(option);
        } else {
          providers.forEach((provider) => {
            const option = document.createElement("option");
            option.value = provider.id;
            option.textContent = playbackCopy.traceCurrentProvider(provider.label, provider.model);
            select.appendChild(option);
          });
        }
      }
      select.value = providers.some((provider) => provider.id === activeProvider)
        ? activeProvider
        : providers[0]?.id || "";
      select.disabled = providers.length === 0 || isPending;
      select.title = providers.length === 0 ? playbackCopy.providerNotConfigured : "";
    }

    function updateTraceAttachmentTray(container, playbackCopy, isPending) {
      container.replaceChildren();
      const fileState = runtime.state.traceContextFileReading || runtime.state.traceContextFileState;
      container.hidden = false;
      if (fileState) {
        const chip = document.createElement("div");
        chip.className = "playback-trace-attachment-chip";
        chip.classList.toggle("is-pending", runtime.state.traceContextFileReading === fileState);
        chip.title = fileState.filePath || fileState.fileName || "async.log";
        const icon = document.createElement("span");
        icon.className = "playback-trace-attachment-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "▤";
        const body = document.createElement("span");
        body.className = "playback-trace-attachment-body";
        const name = document.createElement("span");
        name.className = "playback-trace-attachment-name";
        name.textContent = fileState.fileName || "async.log";
        const kind = document.createElement("span");
        kind.className = "playback-trace-attachment-kind";
        kind.textContent = "LOG";
        body.appendChild(name);
        body.appendChild(kind);
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "playback-trace-attachment-clear";
        clear.textContent = "×";
        clear.title = playbackCopy.traceClearLog;
        clear.setAttribute("aria-label", playbackCopy.traceClearLog);
        clear.disabled = isPending;
        clear.addEventListener("click", () => {
          vscode.postMessage({ type: "clearTraceContextFile" });
        });
        chip.appendChild(icon);
        chip.appendChild(body);
        chip.appendChild(clear);
        container.appendChild(chip);
      }
      const attach = document.createElement("button");
      attach.type = "button";
      attach.className = "canvas-btn icon-btn playback-trace-attach";
      attach.dataset.traceAttachButton = "true";
      attach.textContent = "+";
      attach.title = playbackCopy.traceAttachLog;
      attach.setAttribute("aria-label", playbackCopy.traceAttachLog);
      attach.disabled = isPending;
      attach.addEventListener("click", () => {
        const input = container.closest(".playback-trace-composer-shell")?.querySelector("[data-trace-file-input]");
        if (input) {
          input.click();
          return;
        }
        vscode.postMessage({ type: "chooseTraceContextFile" });
      });
      container.appendChild(attach);
    }

    function readTraceContextFile(file) {
      runtime.state.traceContextFileReading = {
        fileName: file.name || "async.log",
        filePath: file.name || "async.log",
        lineCount: 0,
        charCount: file.size || 0,
        truncated: false
      };
      const log = runtime.state.playbackLog;
      const snapshot = log ? buildCurrentPlaybackSnapshot(log) : null;
      updatePlaybackTracePanel(log, snapshot);

      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        vscode.postMessage({
          type: "setTraceContextFile",
          payload: {
            fileName: file.name || "async.log",
            text
          }
        });
      });
      reader.addEventListener("error", () => {
        runtime.state.traceContextFileReading = null;
        updatePlaybackTracePanel(log, snapshot);
        vscode.postMessage({ type: "chooseTraceContextFile" });
      });
      reader.readAsText(file);
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
      label.textContent = message.role === "user"
        ? playbackCopy.traceQuestion
        : [playbackCopy.traceAnswer, message.sectionLabel].filter(Boolean).join(" · ");
      const content = document.createElement("div");
      content.className = "playback-trace-message-content";
      content.textContent = message.content || "";
      item.appendChild(label);
      item.appendChild(content);
      if (
        runtime.state.currentSettings?.traceLearningEnabled === true &&
        message.role === "assistant" &&
        message.requestId &&
        !message.error
      ) {
        item.appendChild(createTraceFeedbackActions(message));
      }
      return item;
    }

    function createTraceFeedbackActions(message) {
      const actions = document.createElement("div");
      actions.className = "playback-trace-feedback";
      if (message.feedback) {
        const status = document.createElement("span");
        status.className = "playback-trace-feedback-status";
        status.textContent = message.feedback === "reasonable" ? "已标记：合理" : "已标记：放屁";
        actions.appendChild(status);
        return actions;
      }
      actions.appendChild(createTraceFeedbackButton("合理", "reasonable", message));
      actions.appendChild(createTraceFeedbackButton("放屁", "nonsense", message));
      return actions;
    }

    function createTraceFeedbackButton(label, verdict, message) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `canvas-btn playback-trace-feedback-btn ${verdict}`;
      button.textContent = label;
      button.addEventListener("click", () => {
        submitTraceFeedback(message, verdict);
      });
      return button;
    }

    function submitTraceFeedback(message, verdict) {
      const target = runtime.state.traceMessages.find((entry) =>
        entry.requestId === message.requestId &&
        entry.role === "assistant" &&
        entry.feedbackTarget === message.feedbackTarget
      );
      if (target) {
        target.feedback = verdict;
      }
      const log = runtime.state.playbackLog;
      vscode.postMessage({
        type: "traceFeedback",
        payload: {
          requestId: message.requestId,
          verdict,
          logFilePath: log?.filePath || "",
          frameIndex: Number.isInteger(message.frameIndex) ? message.frameIndex : runtime.state.playbackFrameIndex,
          question: message.question || "",
          answer: message.content || "",
          context: message.context || "",
          feedbackTarget: message.feedbackTarget || "answer",
          sectionLabel: message.sectionLabel || ""
        }
      });
      const snapshot = log ? buildCurrentPlaybackSnapshot(log) : null;
      updatePlaybackTracePanel(log, snapshot);
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
      runtime.state.traceMessages.push({ role: "user", content: question, requestId });
      runtime.state.tracePendingRequestId = requestId;
      runtime.state.tracePendingQuestion = question;
      runtime.state.tracePendingContext = context.prompt;
      runtime.state.tracePendingFrameIndex = runtime.state.playbackFrameIndex;
      runtime.state.tracePendingFocusFrameIndex = context.focusFrameIndex;
      runtime.state.tracePendingShouldNavigate = context.shouldAutoNavigate === true;
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
      const log = runtime.state.playbackLog;
      const errorMessage = cancelled
        ? runtime.i18n.getPlaybackCopy().traceRequestCancelled
        : runtime.i18n.getPlaybackCopy().traceRequestFailed(payload.error || "");
      if (cancelled) {
        if (pendingAnswer) {
          runtime.state.traceMessages.push({
            role: "assistant",
            content: pendingAnswer,
            requestId: payload.requestId,
            question: runtime.state.tracePendingQuestion || "",
            context: runtime.state.tracePendingContext || "",
            frameIndex: runtime.state.tracePendingFrameIndex
          });
        } else {
          runtime.state.traceMessages.push({
            role: "assistant",
            content: errorMessage,
            error: true
          });
        }
      } else if (payload.ok) {
        const answerParts = splitTraceAnswerSections(payload.answer || pendingAnswer);
        runtime.state.traceMessages.push(createTraceAnswerMessage(payload.requestId, answerParts.conclusion, {
          sectionLabel: "结论",
          feedbackTarget: "conclusion"
        }));
        runtime.state.traceMessages.push(createTraceAnswerMessage(payload.requestId, answerParts.evidence, {
          sectionLabel: "核心证据",
          feedbackTarget: "evidence"
        }));
        if (answerParts.guess) {
          runtime.state.traceMessages.push(createTraceAnswerMessage(payload.requestId, answerParts.guess, {
            sectionLabel: "猜测",
            feedbackTarget: "guess"
          }));
        }
        navigateToTraceFocusFrame(log);
      } else {
        runtime.state.traceMessages.push({
          role: "assistant",
          content: errorMessage,
          error: true
        });
      }
      runtime.state.tracePendingRequestId = "";
      runtime.state.tracePendingQuestion = "";
      runtime.state.tracePendingContext = "";
      runtime.state.tracePendingFrameIndex = null;
      runtime.state.tracePendingFocusFrameIndex = null;
      runtime.state.tracePendingShouldNavigate = false;
      runtime.state.tracePendingAnswer = "";
      const snapshot = log ? buildCurrentPlaybackSnapshot(log) : null;
      updatePlaybackTracePanel(log, snapshot);
    }

    function createTraceAnswerMessage(requestId, content, options = {}) {
      return {
        role: "assistant",
        content: content || "未提供明确内容。",
        requestId,
        question: runtime.state.tracePendingQuestion || "",
        context: runtime.state.tracePendingContext || "",
        frameIndex: runtime.state.tracePendingFrameIndex,
        sectionLabel: options.sectionLabel || "",
        feedbackTarget: options.feedbackTarget || "answer"
      };
    }

    function navigateToTraceFocusFrame(log) {
      if (!log || runtime.state.tracePendingShouldNavigate !== true) {
        return;
      }
      const frameIndex = runtime.state.tracePendingFocusFrameIndex;
      if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex === runtime.state.playbackFrameIndex) {
        return;
      }
      setPlaybackFrame?.(log, frameIndex, {
        scrollList: true,
        focusNode: true,
        navigateToActiveNode: true,
        updateBlackboard: true,
        persist: true
      });
    }

    function splitTraceAnswerSections(answer) {
      const text = String(answer || "").trim();
      if (!text) {
        return {
          conclusion: "未获得有效结论。",
          evidence: "未获得核心证据。",
          guess: ""
        };
      }
      const conclusionMatch = findTraceSectionLabel(text, ["结论", "Conclusion"]);
      const evidenceMatch = findTraceSectionLabel(text, ["核心证据", "证据", "Evidence", "Core Evidence", "分析过程", "过程"]);
      const guessMatch = findTraceSectionLabel(text, ["猜测", "推测", "可能", "Guess", "Hypothesis"]);
      if (conclusionMatch && evidenceMatch && conclusionMatch.index < evidenceMatch.index) {
        const evidenceEnd = guessMatch && evidenceMatch.index < guessMatch.index ? guessMatch.index : text.length;
        return {
          conclusion: text.slice(conclusionMatch.end, evidenceMatch.index).trim() || "未获得有效结论。",
          evidence: text.slice(evidenceMatch.end, evidenceEnd).trim() || "未获得核心证据。",
          guess: guessMatch && guessMatch.index > evidenceMatch.index ? text.slice(guessMatch.end).trim() : ""
        };
      }

      const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
      if (paragraphs.length >= 2) {
        return {
          conclusion: stripTraceSectionLabel(paragraphs[0]) || "未获得有效结论。",
          evidence: stripTraceSectionLabel(paragraphs[1]) || "未获得核心证据。",
          guess: paragraphs.slice(2).map(stripTraceSectionLabel).join("\n\n")
        };
      }

      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.length >= 2) {
        return {
          conclusion: stripTraceSectionLabel(lines[0]) || "未获得有效结论。",
          evidence: stripTraceSectionLabel(lines[1]) || "未获得核心证据。",
          guess: lines.slice(2).map(stripTraceSectionLabel).join("\n")
        };
      }

      return {
        conclusion: stripTraceSectionLabel(text) || "未获得有效结论。",
        evidence: "未获得核心证据。",
        guess: ""
      };
    }

    function findTraceSectionLabel(text, labels) {
      const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
      const pattern = new RegExp(`(^|\\n)\\s*(?:${escaped})\\s*[:：]?\\s*`, "i");
      const match = pattern.exec(text);
      return match ? { index: match.index + match[1].length, end: match.index + match[0].length } : null;
    }

    function stripTraceSectionLabel(text) {
      return String(text || "").replace(/^\s*(结论|核心证据|证据|猜测|推测|可能|Conclusion|Evidence|Core Evidence|Guess|Hypothesis|分析过程|过程)\s*[:：]?\s*/i, "").trim();
    }

    function clearTraceMessages() {
      runtime.state.traceMessages = [];
      runtime.state.tracePendingRequestId = "";
      runtime.state.tracePendingQuestion = "";
      runtime.state.tracePendingContext = "";
      runtime.state.tracePendingFrameIndex = null;
      runtime.state.tracePendingFocusFrameIndex = null;
      runtime.state.tracePendingShouldNavigate = false;
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
      const anchorFrameIndex = Math.max(0, (log.frames?.length || 1) - 1);
      const anchorFrame = log.frames?.[anchorFrameIndex] || null;
      const anchorSnapshot = runtime.playbackData?.buildPlaybackSnapshot
        ? runtime.playbackData.buildPlaybackSnapshot(log, anchorFrameIndex)
        : snapshot;
      const selectedTree = getSelectedTree(log.preview);
      const treeLabel = selectedTree?.id || log.preview?.defaultTreeId || "MainTree";
      const diagnostics = buildPlaybackTraceDiagnostics(log, anchorFrameIndex, anchorSnapshot, selectedTree);
      const currentTime = getCurrentPlaybackTimeUs(log, null);
      const frameLabel = frame
        ? `${formatRelativeTime(log, currentTime)}  ${formatPlaybackTimelineClock(log, currentTime)}`
        : playbackCopy.noFrames;
      const anchorFrameLabel = anchorFrame
        ? `${formatRelativeTime(log, anchorFrame.tUs)}  ${formatPlaybackTimelineClock(log, anchorFrame.tUs)}`
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
        "Diagnostic rules:",
        "- Use the final frame as the diagnostic anchor because reported errors often appear shortly before the log ends.",
        "- Check blackboard keys out_error_id, out_error_name, and out_error_details first.",
        "- If out_error_id or out_error_name matches a known error code/name, classify it directly before explaining.",
        "- Empty error blackboard fields are not the root cause; continue searching earlier failure, distance, action-context, and servo-context clues.",
        "- List blackboard values with no usable parameter/value.",
        "- In the 100 frames before the final frame, look for child FAILURE transitions.",
        "- Treat a child FAILURE as a chain failure only when ancestor transitions propagate FAILURE without a retry/success before that failure.",
        "- In the 100 frames before the final frame, check distance-like blackboard values; flag -1, 99999, below 0, or above 100.",
        "- Check action-context fields such as current_action, next_action, cached/current action names, task_starting_dist_data, and task_ending_dist_data for mismatch.",
        "- Check servo/navigation context fields such as servo_type, configure_string, servo_mode, current_dist, prepare_dist, and DecelerateNavi values.",
        "- If the user pasted async logs in the question, correlate their timestamped distance/action/navigation evidence with the btlog failure frame. Invalid distance sentinels such as -99999, 99999, and -1 immediately before a RaiseException are deeper-cause evidence and should be handed off to navigation/distance investigation after the behavior-tree branch is proven.",
        "- If this playback file has no blackboard events, say that blackboard values are unavailable and use node transitions plus XML node attributes instead.",
        "- For RaiseException failures, use the node attributes error_id, error_name, error_details, and the preceding condition node attributes as primary evidence.",
        "- Concrete error evidence has priority over non-terminal final/root status. Populated out_error fields, known error code/name, root FAILURE, or confirmed failure chain are enough to conclude a btlog error.",
        "- If the final/root status is RUNNING or otherwise non-terminal and there is no concrete error evidence, conclude that this btlog is incomplete or inconclusive. Do not conclude success or failure from intermediate clues.",
        "- If the root node and relevant chain return SUCCESS near the final frame and there is no concrete error evidence, conclude only that the btlog shows normal successful completion.",
        "- Do not say behavior abnormality is likely without concrete evidence in this btlog. Missing external context belongs in next checks, not in the conclusion.",
        "- Answer as two required short sections: 结论 and 核心证据. Add 猜测 only after 核心证据 when uncertainty remains. Do not repeat every candidate.",
        "",
        `Diagnostic anchor frame: #${anchorFrameIndex} ${anchorFrameLabel}`,
        `Trace focus frame: #${diagnostics.focusFrameIndex} (${diagnostics.focusReason})`,
        diagnostics.prompt,
        "",
        playbackCopy.promptFocus
      ].join("\n");

      return {
        treeLabel,
        frameLabel,
        transitionLabel,
        blackboardLabel,
        prompt,
        focusFrameIndex: diagnostics.focusFrameIndex,
        shouldAutoNavigate: diagnostics.shouldAutoNavigate
      };
    }

    function buildPlaybackTraceDiagnostics(log, anchorFrameIndex, anchorSnapshot, selectedTree) {
      const previousWindowStart = Math.max(0, anchorFrameIndex - 100);
      const blackboardEntries = flattenTraceBlackboardEntries(anchorSnapshot?.blackboardValues || {});
      const errorKeys = ["out_error_id", "out_error_name", "out_error_details"].map((key) =>
        describeTraceBlackboardKey(blackboardEntries, key)
      );
      const emptyValues = blackboardEntries
        .filter((entry) => isMissingTraceValue(entry.value))
        .slice(0, 30);
      const failureCandidates = collectTraceFailureCandidates(log, previousWindowStart, anchorFrameIndex);
      const distanceAnomalies = collectTraceDistanceAnomalies(log, previousWindowStart, anchorFrameIndex);
      const knownError = classifyTraceKnownError(errorKeys);
      const actionContext = collectTraceBlackboardSignals(blackboardEntries, [
        "current_action",
        "next_action",
        "缓存动作名",
        "当前动作名",
        "task_starting_dist_data",
        "task_ending_dist_data",
        "fork_height",
        "dist_to_target",
        "dist_to_start"
      ]);
      const servoContext = collectTraceBlackboardSignals(blackboardEntries, [
        "servo_type",
        "configure_string",
        "servo_mode",
        "current_dist",
        "prepare_dist",
        "DecelerateNavi"
      ]);
      const rootStatus = describeTraceRootStatus(log, selectedTree, previousWindowStart, anchorFrameIndex, anchorSnapshot);
      const hasErrorBlackboard = errorKeys.some((entry) => entry.present && !isMissingTraceValue(entry.value));
      const assessment = assessTraceBtlogAbnormality(errorKeys, failureCandidates, distanceAnomalies, rootStatus, knownError);
      const focus = determineTraceFocusFrame(anchorFrameIndex, knownError, hasErrorBlackboard, failureCandidates, distanceAnomalies, rootStatus);

      return {
        focusFrameIndex: focus.frameIndex,
        focusReason: focus.reason,
        shouldAutoNavigate: focus.shouldAutoNavigate,
        prompt: [
          `Btlog anomaly assessment: ${assessment}`,
          `Root status near final frame: ${formatTraceRootStatus(rootStatus)}`,
          `Known error classification: ${knownError ? `${knownError.name} (${knownError.evidence})` : "none"}`,
          `Blackboard availability: ${(log.blackboardEvents || []).length > 0 ? `${log.blackboardEvents.length} events` : "none in this playback file"}`,
          formatTraceSection("Error blackboard keys", errorKeys.map(formatTraceBlackboardKey)),
          formatTraceSection("Blackboard values without usable parameters", emptyValues.map(formatTraceBlackboardEntry)),
          formatTraceSection("Action context signals", actionContext.map(formatTraceBlackboardEntry)),
          formatTraceSection("Servo/navigation context signals", servoContext.map(formatTraceBlackboardEntry)),
          formatTraceSection(
            `Child FAILURE candidates in frames ${previousWindowStart}-${anchorFrameIndex}`,
            failureCandidates.map(formatTraceFailureCandidate)
          ),
          formatTraceSection(
            `Distance anomalies in frames ${previousWindowStart}-${anchorFrameIndex}`,
            distanceAnomalies.map(formatTraceDistanceAnomaly)
          )
        ].join("\n")
      };
    }

    function determineTraceFocusFrame(anchorFrameIndex, knownError, hasErrorBlackboard, failureCandidates, distanceAnomalies, rootStatus) {
      const confirmedFailure = failureCandidates.find((candidate) => candidate.chain.confirmed);
      if (confirmedFailure) {
        return {
          frameIndex: confirmedFailure.transition.frameIndex,
          reason: `confirmed failure chain at ${confirmedFailure.nodeName}#${confirmedFailure.transition.uid}`,
          shouldAutoNavigate: true
        };
      }
      if (knownError || hasErrorBlackboard) {
        return {
          frameIndex: anchorFrameIndex,
          reason: "error blackboard near final frame",
          shouldAutoNavigate: true
        };
      }
      if (isTraceNonTerminalStatus(rootStatus?.lastTransition?.status || rootStatus?.snapshotStatus || "")) {
        return {
          frameIndex: anchorFrameIndex,
          reason: "final/root status is non-terminal without concrete error evidence",
          shouldAutoNavigate: true
        };
      }
      if (rootStatus?.lastTransition?.status === "FAILURE") {
        return {
          frameIndex: rootStatus.lastTransition.frameIndex,
          reason: `root FAILURE at ${rootStatus.nodeName}#${rootStatus.uid}`,
          shouldAutoNavigate: true
        };
      }
      if (rootStatus?.lastTransition?.status === "SUCCESS") {
        const firstDistanceAnomaly = distanceAnomalies[0];
        if (firstDistanceAnomaly) {
          return {
            frameIndex: firstDistanceAnomaly.frameIndex,
            reason: `first distance anomaly ${firstDistanceAnomaly.sourceKey}`,
            shouldAutoNavigate: true
          };
        }
        return {
          frameIndex: anchorFrameIndex,
          reason: "root SUCCESS and no concrete btlog error evidence",
          shouldAutoNavigate: false
        };
      }
      const firstFailure = failureCandidates[0];
      if (firstFailure) {
        return {
          frameIndex: firstFailure.transition.frameIndex,
          reason: `first failure candidate at ${firstFailure.nodeName}#${firstFailure.transition.uid}`,
          shouldAutoNavigate: true
        };
      }
      const firstDistanceAnomaly = distanceAnomalies[0];
      if (firstDistanceAnomaly) {
        return {
          frameIndex: firstDistanceAnomaly.frameIndex,
          reason: `first distance anomaly ${firstDistanceAnomaly.sourceKey}`,
          shouldAutoNavigate: true
        };
      }
      return {
        frameIndex: anchorFrameIndex,
        reason: "final frame anchor",
        shouldAutoNavigate: false
      };
    }

    function describeTraceBlackboardKey(entries, key) {
      const match = entries.find((entry) => entry.key === key || entry.sourceKey === key);
      return {
        key,
        present: Boolean(match),
        value: match?.value
      };
    }

    function collectTraceFailureCandidates(log, startFrameIndex, endFrameIndex) {
      const transitions = log.transitions || [];
      const parentByUid = buildTraceParentByUid(log);
      const candidates = [];
      transitions.forEach((transition, index) => {
        if (
          transition.frameIndex < startFrameIndex ||
          transition.frameIndex > endFrameIndex ||
          transition.status !== "FAILURE" ||
          !parentByUid[String(transition.uid)]
        ) {
          return;
        }
        const chain = evaluateTraceFailureChain(log, index, parentByUid, endFrameIndex);
        candidates.push({
          transition,
          index,
          nodeName: resolvePlaybackNodeName(log, transition),
          chain
        });
      });
      candidates.sort((left, right) => left.transition.frameIndex - right.transition.frameIndex || left.index - right.index);
      return candidates.slice(0, 20);
    }

    function describeTraceRootStatus(log, selectedTree, startFrameIndex, endFrameIndex, anchorSnapshot) {
      const rootNode = findTraceExecutionRootNode(selectedTree?.node);
      const rootUid = rootNode?.attributes?._uid ? String(rootNode.attributes._uid) : "";
      if (!rootUid) {
        return {
          uid: "",
          nodeName: rootNode?.title || selectedTree?.node?.title || "root",
          snapshotStatus: "",
          lastTransition: null
        };
      }
      let lastTransition = null;
      (log.transitions || []).forEach((transition) => {
        if (
          String(transition.uid) === rootUid &&
          transition.frameIndex >= startFrameIndex &&
          transition.frameIndex <= endFrameIndex
        ) {
          lastTransition = transition;
        }
      });
      return {
        uid: rootUid,
        nodeName: rootNode?.title || `uid ${rootUid}`,
        snapshotStatus: anchorSnapshot?.statusByUid?.[rootUid] || "",
        lastTransition
      };
    }

    function findTraceExecutionRootNode(node) {
      if (!node) {
        return null;
      }
      if (node.attributes?._uid) {
        return node;
      }
      const children = node.children || [];
      for (const child of children) {
        const match = findTraceExecutionRootNode(child);
        if (match) {
          return match;
        }
      }
      return node;
    }

    function assessTraceBtlogAbnormality(errorKeys, failureCandidates, distanceAnomalies, rootStatus, knownError) {
      const hasErrorBlackboard = errorKeys.some((entry) => entry.present && !isMissingTraceValue(entry.value));
      const hasConfirmedFailureChain = failureCandidates.some((candidate) => candidate.chain.confirmed);
      const hasDistanceAnomaly = distanceAnomalies.length > 0;
      const rootTerminalStatus = rootStatus?.lastTransition?.status || rootStatus?.snapshotStatus || "";
      if (knownError || hasErrorBlackboard || hasConfirmedFailureChain || rootTerminalStatus === "FAILURE") {
        return "Potential btlog error. Give the most likely failure conclusion first, then core evidence only.";
      }
      if (isTraceNonTerminalStatus(rootTerminalStatus)) {
        return "Btlog is incomplete or inconclusive because the final/root status is non-terminal and no concrete error evidence was found. Do not conclude success or failure. Put intermediate failures, distance anomalies, and missing external context only in evidence or guess.";
      }
      if (rootTerminalStatus === "SUCCESS") {
        return "Btlog evidence shows normal successful completion because the root returned SUCCESS near the final frame and no concrete error evidence was found. Do not infer behavior abnormality from missing external context.";
      }
      if (hasDistanceAnomaly) {
        return "No confirmed btlog failure chain, but distance anomaly exists. Treat distance as the primary clue and ask for external behavior context if needed.";
      }
      return "No clear btlog error from the provided context. If the user expects behavior-abnormality analysis, ask for expected behavior, observed symptom, task/order context, and relevant robot state as next checks.";
    }

    function isTraceNonTerminalStatus(status) {
      const normalized = String(status || "").toUpperCase();
      return normalized === "RUNNING" || normalized === "IDLE" || normalized === "SKIPPED";
    }

    function evaluateTraceFailureChain(log, transitionIndex, parentByUid, endFrameIndex) {
      const transition = log.transitions?.[transitionIndex] || null;
      if (!transition) {
        return { confirmed: false, evidence: [] };
      }
      const ancestorUids = [];
      let parentUid = parentByUid[String(transition.uid)];
      while (parentUid) {
        ancestorUids.push(parentUid);
        parentUid = parentByUid[parentUid];
      }
      const evidence = ancestorUids.map((uid) => findNextTraceStatusForUid(log, uid, transitionIndex + 1, endFrameIndex));
      const directParentFailed = evidence[0]?.status === "FAILURE";
      const hasRetryOrSuccessBeforeFailure = evidence.some((entry) => entry.status === "RUNNING" || entry.status === "SUCCESS");
      const ancestorsWithStatus = evidence.filter((entry) => entry.status);
      const allObservedAncestorsFailed = ancestorsWithStatus.length > 0 && ancestorsWithStatus.every((entry) => entry.status === "FAILURE");
      return {
        confirmed: directParentFailed && allObservedAncestorsFailed && !hasRetryOrSuccessBeforeFailure,
        evidence
      };
    }

    function findNextTraceStatusForUid(log, uid, startTransitionIndex, endFrameIndex) {
      const transitions = log.transitions || [];
      for (let index = startTransitionIndex; index < transitions.length; index += 1) {
        const transition = transitions[index];
        if (transition.frameIndex > endFrameIndex) {
          break;
        }
        if (String(transition.uid) === String(uid)) {
          return {
            uid,
            frameIndex: transition.frameIndex,
            status: transition.status,
            nodeName: resolvePlaybackNodeName(log, transition)
          };
        }
      }
      return { uid, frameIndex: null, status: "", nodeName: `uid ${uid}` };
    }

    function collectTraceDistanceAnomalies(log, startFrameIndex, endFrameIndex) {
      const anomalies = [];
      const seen = new Set();
      for (let frameIndex = startFrameIndex; frameIndex <= endFrameIndex; frameIndex += 1) {
        const snapshot = runtime.playbackData?.buildPlaybackSnapshot
          ? runtime.playbackData.buildPlaybackSnapshot(log, frameIndex)
          : null;
        const entries = flattenTraceBlackboardEntries(snapshot?.blackboardValues || {});
        entries.forEach((entry) => {
          if (!isTraceDistanceKey(entry.key) && !isTraceDistanceKey(entry.sourceKey)) {
            return;
          }
          const numeric = parseTraceNumericValue(entry.value);
          if (!Number.isFinite(numeric) || !isTraceDistanceAnomaly(numeric)) {
            return;
          }
          const key = `${frameIndex}:${entry.sourceKey}:${numeric}`;
          if (seen.has(key)) {
            return;
          }
          seen.add(key);
          anomalies.push({ frameIndex, key: entry.key, sourceKey: entry.sourceKey, value: numeric });
        });
        if (anomalies.length >= 30) {
          break;
        }
      }
      return anomalies;
    }

    function classifyTraceKnownError(errorKeys) {
      const combined = errorKeys
        .map((entry) => `${entry.key}=${formatTraceValue(entry.value)}`)
        .join(" ");
      const patterns = [
        {
          name: "603008 initial_less_than_ready / 初始距离小于准备距离",
          markers: ["603008", "initial_less_than_ready"]
        },
        {
          name: "603011 fork_abnormal_before_ready_point / 未达准备点前叉齿异常",
          markers: ["603011", "fork_abnormal_before_ready_point"]
        },
        {
          name: "603012 fork_abnormal_past_ready_point / 越过准备点叉齿异常",
          markers: ["603012", "fork_abnormal_past_ready_point"]
        },
        {
          name: "603036 has_no_goods_before_unloading / 卸货前检测无货",
          markers: ["603036", "has_no_goods_before_unloading"]
        },
        {
          name: "603037 goods_stuck / 货物卡住卸载失败",
          markers: ["603037", "goods_stuck"]
        },
        {
          name: "603331 no_cargo_check_failed / 无货检测失败",
          markers: ["603331", "no_cargo_check_failed"]
        },
        {
          name: "carrier_ctrl task execute failed / 载具控制任务失败",
          markers: ["carrier_ctrl", "task_excute_failed", "task_execute_failed", "载具控制"]
        },
        {
          name: "No dock_scene / 对接场景参数缺失",
          markers: ["No dock_scene", "dock_scene"]
        }
      ];
      const lowerCombined = combined.toLowerCase();
      const match = patterns.find((pattern) =>
        pattern.markers.some((marker) => lowerCombined.includes(String(marker).toLowerCase()))
      );
      return match ? { name: match.name, evidence: combined } : null;
    }

    function collectTraceBlackboardSignals(entries, keys) {
      const normalizedKeys = keys.map((key) => String(key).toLowerCase());
      return entries
        .filter((entry) => {
          const key = `${entry.key} ${entry.sourceKey}`.toLowerCase();
          return normalizedKeys.some((needle) => key.includes(needle));
        })
        .slice(0, 20);
    }

    function buildTraceParentByUid(log) {
      const childrenByUid = runtime.playbackData?.getPlaybackCache?.(log)?.nodeIndex?.childrenByUid || {};
      const parentByUid = {};
      Object.entries(childrenByUid).forEach(([parentUid, childUids]) => {
        (childUids || []).forEach((childUid) => {
          parentByUid[String(childUid)] = String(parentUid);
        });
      });
      return parentByUid;
    }

    function flattenTraceBlackboardEntries(values) {
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        return [];
      }
      const entries = [];
      Object.entries(values).forEach(([scope, scopedValues]) => {
        if (scopedValues && typeof scopedValues === "object" && !Array.isArray(scopedValues)) {
          Object.entries(scopedValues).forEach(([key, value]) => {
            entries.push({
              key: getTraceDisplayKey(key),
              sourceKey: scope ? `${scope}/${key}` : key,
              value
            });
          });
          return;
        }
        entries.push({
          key: getTraceDisplayKey(scope),
          sourceKey: scope,
          value: scopedValues
        });
      });
      entries.sort((left, right) => left.key.localeCompare(right.key));
      return entries;
    }

    function getTraceDisplayKey(key) {
      const text = String(key || "");
      const parts = text.split("/").filter(Boolean);
      return parts[parts.length - 1] || text || "(value)";
    }

    function isMissingTraceValue(value) {
      if (value === null || value === undefined) {
        return true;
      }
      if (typeof value === "string") {
        return value.trim() === "";
      }
      if (Array.isArray(value)) {
        return value.length === 0;
      }
      if (typeof value === "object") {
        return Object.keys(value).length === 0;
      }
      return false;
    }

    function isTraceDistanceKey(key) {
      const text = String(key || "").toLowerCase();
      return (
        /(^|[^a-z0-9])dist([^a-z0-9]|$)/i.test(text) ||
        text.includes("endpointdis") ||
        text.includes("current_dist") ||
        text.includes("prepare_dist") ||
        text.includes("dist_to_target") ||
        text.includes("dist_to_start") ||
        text.includes("task_starting_dist_data") ||
        text.includes("task_ending_dist_data")
      );
    }

    function parseTraceNumericValue(value) {
      if (typeof value === "number") {
        return value;
      }
      if (typeof value === "string") {
        const match = value.trim().match(/^-?\d+(?:\.\d+)?$/);
        return match ? Number(match[0]) : NaN;
      }
      return NaN;
    }

    function isTraceDistanceAnomaly(value) {
      return value === -1 || value === 99999 || value < 0 || value > 100;
    }

    function formatTraceSection(title, lines) {
      return [`${title}:`, ...(lines.length ? lines.map((line) => `- ${line}`) : ["- None found"])].join("\n");
    }

    function formatTraceBlackboardKey(entry) {
      const state = entry.present && !isMissingTraceValue(entry.value) ? "present" : entry.present ? "empty" : "missing";
      return `${entry.key}: ${state}${entry.present ? ` (${formatTraceValue(entry.value)})` : ""}`;
    }

    function formatTraceBlackboardEntry(entry) {
      return `${entry.sourceKey}: ${formatTraceValue(entry.value)}`;
    }

    function formatTraceFailureCandidate(candidate) {
      const transition = candidate.transition;
      const chainState = candidate.chain.confirmed ? "chain-confirmed" : "needs-review";
      const evidence = candidate.chain.evidence
        .map((entry) => `${entry.nodeName}#${entry.uid}${entry.status ? ` -> ${entry.status} @ frame ${entry.frameIndex}` : " -> no observed parent status"}`)
        .join("; ");
      const attributes = formatTraceNodeAttributes(getTraceNodeByUid(candidate.transition.uid));
      return `frame ${transition.frameIndex}, ${candidate.nodeName}#${transition.uid} ${transition.prevStatus}->${transition.status}: ${chainState}${attributes ? `; node attributes: ${attributes}` : ""}${evidence ? `; ancestors: ${evidence}` : ""}`;
    }

    function formatTraceDistanceAnomaly(entry) {
      return `frame ${entry.frameIndex}, ${entry.sourceKey}: ${entry.value}`;
    }

    function formatTraceRootStatus(rootStatus) {
      if (!rootStatus?.uid) {
        return "unknown root uid";
      }
      const transition = rootStatus.lastTransition;
      if (transition) {
        return `${rootStatus.nodeName}#${rootStatus.uid} ${transition.prevStatus}->${transition.status} @ frame ${transition.frameIndex}`;
      }
      return `${rootStatus.nodeName}#${rootStatus.uid} snapshot=${rootStatus.snapshotStatus || "unknown"}`;
    }

    function getTraceNodeByUid(uid) {
      const nodesByUid = runtime.playbackData?.getPlaybackCache?.(runtime.state.playbackLog)?.nodeIndex?.nodesByUid || {};
      return nodesByUid[String(uid)] || null;
    }

    function formatTraceNodeAttributes(node) {
      const attributes = node?.attributes || {};
      const keys = [
        "error_id",
        "error_name",
        "error_details",
        "error_level",
        "if",
        "else",
        "failure_count",
        "success_count",
        "mode",
        "prepare_dist",
        "target_position",
        "action_cmd"
      ];
      return keys
        .filter((key) => attributes[key] !== undefined && attributes[key] !== "")
        .map((key) => `${key}=${formatTraceValue(attributes[key])}`)
        .join(", ");
    }

    function formatTraceValue(value) {
      if (value === undefined) {
        return "<undefined>";
      }
      if (typeof value === "string") {
        return truncateTraceText(value || "<empty>");
      }
      try {
        return truncateTraceText(JSON.stringify(value));
      } catch (_error) {
        return truncateTraceText(String(value));
      }
    }

    function truncateTraceText(value, maxLength = 180) {
      const text = String(value);
      return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
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
