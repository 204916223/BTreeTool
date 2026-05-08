(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});
  const overlayRuntime = (runtime.overlayRuntime = runtime.overlayRuntime || {});
  const overlayState = (overlayRuntime.state = overlayRuntime.state || {});
  overlayRuntime.parts = overlayRuntime.parts || {};
  overlayRuntime.api = overlayRuntime.api || {};

  function setBlockingOverlay(active) {
    document.body.classList.toggle("has-blocking-overlay", active);
  }

  function syncBlockingOverlay() {
    const active = [
      overlayState.deleteConfirmBar?.element,
      overlayState.nodePicker?.element,
      overlayState.settingsDialog?.element,
      overlayState.behaviorTreeDialog?.element,
      overlayState.treeNodesModelDialog?.element,
      overlayState.nodeEditorDialog?.element
    ].some((element) => element && !element.hidden);
    setBlockingOverlay(active);
  }

  function createMenuButton(label, onClick, tone = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = tone ? `node-context-menu-item ${tone}` : "node-context-menu-item";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
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
    setMenuButtonDisabled,
    createSettingsField,
    safeParseJson
  };
})();
