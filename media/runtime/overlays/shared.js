(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const overlayRuntime = (runtime.overlayRuntime = runtime.overlayRuntime || {});
  const overlayState = (overlayRuntime.state = overlayRuntime.state || {});
  overlayRuntime.parts = overlayRuntime.parts || {};
  overlayRuntime.api = overlayRuntime.api || {};
  const openChoiceControls = new Set();
  let choiceOutsideListenerBound = false;

  function setBlockingOverlay(active) {
    document.body.classList.toggle("has-blocking-overlay", active);
  }

  function syncBlockingOverlay() {
    const active = [
      overlayState.deleteConfirmBar?.element,
      overlayState.confirmDialog?.element,
      overlayState.nodePicker?.element,
      overlayState.settingsDialog?.element,
      overlayState.assistantWhitelistDialog?.element,
      overlayState.nodeAtlasDialog?.element,
      overlayState.behaviorTreeDialog?.element,
      overlayState.treeNodesModelDialog?.element,
      overlayState.nodeEditorDialog?.element
    ].some((element) => element && !element.hidden);
    setBlockingOverlay(active);
  }

  function createMenuButton(label, onClick, tone = "", shortcut = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = tone ? `node-context-menu-item ${tone}` : "node-context-menu-item";
    setMenuButtonLabel(button, label, shortcut);
    button.addEventListener("click", onClick);
    return button;
  }

  function setMenuButtonLabel(button, label, shortcut = "") {
    const text = document.createElement("span");
    text.className = "node-context-menu-label";
    text.textContent = label;
    button.replaceChildren(text);
    if (shortcut) {
      const shortcutText = document.createElement("span");
      shortcutText.className = "node-context-menu-shortcut";
      shortcutText.textContent = shortcut;
      button.appendChild(shortcutText);
    }
  }

  function setMenuButtonDisabled(button, disabled) {
    button.disabled = disabled;
    button.classList.toggle("is-disabled", disabled);
  }

  function createSettingsField(label) {
    const element = document.createElement("label");
    element.className = "settings-field";
    const text = document.createElement("span");
    text.className = "settings-field-label";
    text.textContent = label;
    const control = document.createElement("div");
    control.className = "settings-field-control";
    element.appendChild(text);
    element.appendChild(control);
    return { element, control, text };
  }

  function createModalShell(options = {}) {
    const element = document.createElement("div");
    element.className = ["node-picker", "app-modal", options.rootClass || ""].filter(Boolean).join(" ");
    element.hidden = true;

    const backdrop = document.createElement("div");
    backdrop.className = "node-picker-backdrop app-modal-backdrop";
    if (options.closeOnBackdrop !== false && typeof options.onClose === "function") {
      backdrop.addEventListener("click", options.onClose);
    }

    const dialog = document.createElement("div");
    dialog.className = ["node-picker-dialog", "app-modal-panel", options.dialogClass || ""].filter(Boolean).join(" ");
    dialog.setAttribute("role", options.role || "dialog");
    dialog.setAttribute("aria-modal", "true");

    const header = document.createElement("div");
    header.className = "node-picker-header app-modal-header";

    const title = document.createElement("strong");
    title.className = "node-picker-title app-modal-title";
    title.textContent = options.title || "";

    header.appendChild(title);
    dialog.appendChild(header);
    element.appendChild(backdrop);
    element.appendChild(dialog);

    return {
      element,
      backdrop,
      dialog,
      header,
      title
    };
  }

  function createChoiceControl(options = {}) {
    const element = document.createElement("div");
    element.className = ["choice-control", options.className || ""].filter(Boolean).join(" ");
    element.dataset.choiceControl = "true";
    element.tabIndex = -1;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-control-button";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    if (options.ariaLabel) {
      button.setAttribute("aria-label", options.ariaLabel);
    }

    const label = document.createElement("span");
    label.className = "choice-control-label";
    const arrow = document.createElement("span");
    arrow.className = "choice-control-arrow";
    setArrowIcon("chevronDown");
    button.appendChild(label);
    button.appendChild(arrow);

    const menu = document.createElement("div");
    menu.className = "choice-control-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;

    element.appendChild(button);
    (document.body || element).appendChild(menu);

    let currentOptions = normalizeChoiceOptions(options.options || []);
    let currentValue = options.value ?? currentOptions[0]?.value ?? "";
    let disabled = options.disabled === true;
    let menuPositionListenersBound = false;

    Object.defineProperty(element, "value", {
      get() {
        return currentValue;
      },
      set(value) {
        setValue(value, false);
      }
    });
    Object.defineProperty(element, "disabled", {
      get() {
        return disabled;
      },
      set(value) {
        setDisabled(Boolean(value));
      }
    });

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled) {
        return;
      }
      menu.hidden ? openMenu() : closeMenu();
    });
    button.addEventListener("keydown", (event) => {
      if (disabled) {
        return;
      }
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMenu();
        focusOption(currentValue);
      } else if (event.key === "Escape") {
        closeMenu();
      }
    });

    let control = null;

    function setOptions(nextOptions, nextValue = currentValue) {
      currentOptions = normalizeChoiceOptions(nextOptions || []);
      renderOptions();
      setValue(nextValue, false);
    }

    function setValue(value, notify = false) {
      const nextValue = String(value ?? "");
      currentValue = currentOptions.some((option) => option.value === nextValue)
        ? nextValue
        : currentOptions[0]?.value || "";
      syncLabel();
      syncSelectedOption();
      if (notify && typeof options.onChange === "function") {
        options.onChange(currentValue);
      }
    }

    function setDisabled(nextDisabled) {
      disabled = Boolean(nextDisabled);
      button.disabled = disabled;
      element.classList.toggle("is-disabled", disabled);
      if (disabled) {
        closeMenu();
      }
    }

    function setTitle(nextTitle) {
      element.title = nextTitle || "";
      button.title = nextTitle || "";
    }

    function openMenu() {
      ensureChoiceOutsideListener();
      openChoiceControls.forEach((entry) => {
        if (entry !== control) {
          entry.closeMenu();
        }
      });
      menu.hidden = false;
      positionMenu();
      bindMenuPositionListeners();
      element.classList.add("is-open");
      button.setAttribute("aria-expanded", "true");
      setArrowIcon("chevronUp");
      if (control) {
        openChoiceControls.add(control);
      }
    }

    function closeMenu() {
      menu.hidden = true;
      unbindMenuPositionListeners();
      element.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
      setArrowIcon("chevronDown");
      if (control) {
        openChoiceControls.delete(control);
      }
    }

    function setArrowIcon(name) {
      arrow.replaceChildren();
      const icon = runtime.icons?.createIcon?.(name);
      if (icon) {
        arrow.appendChild(icon);
        return;
      }
      arrow.textContent = name === "chevronUp" ? "⌃" : "⌄";
    }

    function positionMenu() {
      if (typeof button.getBoundingClientRect !== "function") {
        return;
      }

      const rect = button.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 1024;
      const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 768;
      const menuWidth = Math.max(rect.width, Math.min(menu.offsetWidth || rect.width, 320));
      const left = Math.min(Math.max(12, rect.left), Math.max(12, viewportWidth - menuWidth - 12));
      const belowTop = rect.bottom + 4;
      const belowSpace = Math.max(0, viewportHeight - belowTop - 12);
      const aboveSpace = Math.max(0, rect.top - 16);

      menu.style.maxHeight = "";
      const naturalHeight = menu.offsetHeight || menu.scrollHeight || 120;
      const openAbove = belowSpace < Math.min(260, naturalHeight) && aboveSpace > belowSpace;
      const availableSpace = openAbove ? aboveSpace : belowSpace;
      const maxHeight = Math.min(260, availableSpace);
      menu.style.maxHeight = `${maxHeight}px`;

      const renderedHeight = Math.min(naturalHeight, maxHeight);
      const top = openAbove ? Math.max(12, rect.top - renderedHeight - 4) : belowTop;
      menu.style.minWidth = `${Math.max(0, rect.width)}px`;
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    }

    function bindMenuPositionListeners() {
      if (menuPositionListenersBound) {
        return;
      }
      menuPositionListenersBound = true;
      window.addEventListener("resize", positionMenu);
      window.addEventListener("scroll", positionMenu, true);
    }

    function unbindMenuPositionListeners() {
      if (!menuPositionListenersBound) {
        return;
      }
      menuPositionListenersBound = false;
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    }

    function renderOptions() {
      menu.replaceChildren();
      currentOptions.forEach((option) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "choice-control-option";
        item.setAttribute("role", "option");
        item.dataset.choiceValue = option.value;
        item.textContent = option.label;
        item.disabled = option.disabled === true;
        item.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (item.disabled) {
            return;
          }
          setValue(option.value, true);
          closeMenu();
          button.focus?.();
        });
        item.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeMenu();
            button.focus?.();
          }
        });
        menu.appendChild(item);
      });
      syncSelectedOption();
    }

    function syncLabel() {
      const option = currentOptions.find((entry) => entry.value === currentValue);
      label.textContent = option?.label || options.placeholder || "";
    }

    function syncSelectedOption() {
      Array.from(menu.querySelectorAll?.(".choice-control-option") || []).forEach((item) => {
        const selected = item.dataset.choiceValue === currentValue;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-selected", selected ? "true" : "false");
      });
    }

    function focusOption(value) {
      const items = Array.from(menu.querySelectorAll?.(".choice-control-option") || []);
      const target = items.find((item) => item.dataset.choiceValue === value && !item.disabled) || items.find((item) => !item.disabled);
      target?.focus?.();
    }

    renderOptions();
    setValue(currentValue, false);
    setDisabled(disabled);
    setTitle(options.title || "");

    control = {
      element,
      button,
      menu,
      get value() {
        return currentValue;
      },
      set value(value) {
        setValue(value, false);
      },
      get disabled() {
        return disabled;
      },
      set disabled(value) {
        setDisabled(Boolean(value));
      },
      getValue: () => currentValue,
      setValue,
      setOptions,
      setDisabled,
      setTitle,
      closeMenu
    };
    element.__choiceControl = control;
    return control;
  }

  function ensureChoiceOutsideListener() {
    if (choiceOutsideListenerBound || !document?.addEventListener) {
      return;
    }
    choiceOutsideListenerBound = true;
    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      const clickedInsideOpenControl = Array.from(openChoiceControls).some((control) =>
        isInsideElement(target, control.element) || isInsideElement(target, control.menu)
      );
      if (clickedInsideOpenControl) {
        return;
      }
      Array.from(openChoiceControls).forEach((control) => control.closeMenu());
    });
  }

  function normalizeChoiceOptions(options) {
    return (Array.isArray(options) ? options : []).map((option) => {
      if (Array.isArray(option)) {
        return { value: String(option[0] ?? ""), label: String(option[1] ?? option[0] ?? "") };
      }
      return {
        value: String(option?.value ?? ""),
        label: String(option?.label ?? option?.value ?? ""),
        disabled: option?.disabled === true
      };
    });
  }

  function isInsideElement(target, element) {
    let cursor = target || null;
    while (cursor) {
      if (cursor === element) {
        return true;
      }
      cursor = cursor.parentElement || null;
    }
    return false;
  }

  function createConfirmDialog() {
    const shell = createModalShell({
      rootClass: "confirm-dialog",
      dialogClass: "confirm-dialog-panel",
      onClose: () => resolveConfirm(false)
    });
    const { element, dialog, header, title } = shell;
    header.classList.add("confirm-dialog-header");
    title.classList.add("confirm-dialog-title");

    const message = document.createElement("div");
    message.className = "confirm-dialog-message";

    const actions = document.createElement("div");
    actions.className = "settings-actions confirm-dialog-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "canvas-btn subtle";
    cancelButton.addEventListener("click", () => resolveConfirm(false));

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "canvas-btn accent";
    confirmButton.addEventListener("click", () => resolveConfirm(true));

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);
    dialog.appendChild(message);
    dialog.appendChild(actions);

    element.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        resolveConfirm(false);
      }
    });

    return {
      element,
      title,
      message,
      cancelButton,
      confirmButton,
      state: {
        resolve: null
      }
    };
  }

  function showConfirmDialog(options = {}) {
    const dialog = overlayState.confirmDialog;
    if (!dialog) {
      return Promise.resolve(false);
    }

    const overlayCopy = runtime.i18n.getOverlayCopy();
    resolveConfirm(false, { silent: true });

    dialog.title.textContent = options.title || overlayCopy.confirmTitle;
    dialog.message.textContent = options.message || "";
    dialog.cancelButton.textContent = options.cancelText || overlayCopy.cancel;
    dialog.confirmButton.textContent = options.confirmText || overlayCopy.confirm;
    dialog.confirmButton.className = options.tone === "danger" ? "canvas-btn danger" : "canvas-btn accent";
    dialog.element.hidden = false;
    syncBlockingOverlay();

    return new Promise((resolve) => {
      dialog.state.resolve = resolve;
      requestAnimationFrame(() => {
        dialog.confirmButton.focus?.();
      });
    });
  }

  function resolveConfirm(result, options = {}) {
    const dialog = overlayState.confirmDialog;
    if (!dialog) {
      return;
    }

    const resolve = dialog.state.resolve;
    dialog.state.resolve = null;
    dialog.element.hidden = true;
    syncBlockingOverlay();

    if (!options.silent && resolve) {
      resolve(Boolean(result));
    }
  }

  function hideConfirmDialog() {
    resolveConfirm(false);
  }

  function safeParseJson(value) {
    try {
      return value ? JSON.parse(value) : {};
    } catch (_error) {
      return {};
    }
  }

  overlayRuntime.shared = {
    setBlockingOverlay,
    syncBlockingOverlay,
    createMenuButton,
    setMenuButtonLabel,
    setMenuButtonDisabled,
    createSettingsField,
    createModalShell,
    createChoiceControl,
    safeParseJson
  };
  overlayRuntime.parts.confirmDialog = {
    createConfirmDialog,
    showConfirmDialog,
    hideConfirmDialog
  };
})();
