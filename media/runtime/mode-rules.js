(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  const ACTION_RULES = {
    dragCanvasNode: (state, context) =>
      isEditingEnabled(state) &&
      context.parentPath !== null &&
      Number.isInteger(context.siblingIndex) &&
      !state.isSpacePressed,
    dragPaletteNode: (state, context) => isEditingEnabled(state) && Boolean(context.treeId),
    openNodeContextMenu: isEditingEnabled,
    openNodeEditor: isEditingEnabled,
    openNodePicker: isEditingEnabled,
    requestNodeDelete: isEditingEnabled,
    applyInspectorAttributes: (state, context) =>
      isEditingEnabled(state) && Boolean(context.hasEditableFields),
    createBehaviorTree: (state, context) => isEditingEnabled(state) && Boolean(context.hasPreview),
    deleteBehaviorTree: (state, context) => isEditingEnabled(state) && Boolean(context.treeId),
    createNodeModel: isEditingEnabled,
    openNodeModelEditor: isEditingEnabled,
    revealNodeModelSource: isEditingEnabled,
    saveNodeModel: isEditingEnabled,
    deleteNodeModel: isEditingEnabled,
    saveNodeEditor: isEditingEnabled
  };

  function getMode(state = runtime.state) {
    return state?.editModeEnabled === false ? "playback" : "edit";
  }

  function isEditingEnabled(state = runtime.state) {
    return getMode(state) === "edit";
  }

  function isPlaybackMode(state = runtime.state) {
    return getMode(state) === "playback";
  }

  function isMonitorMode(state = runtime.state) {
    return isPlaybackMode(state);
  }

  function can(action, context = {}) {
    const rule = ACTION_RULES[action];
    if (!rule) {
      return isEditingEnabled(context.state || runtime.state);
    }

    return Boolean(rule(context.state || runtime.state, context));
  }

  runtime.modeRules = {
    ACTION_RULES,
    getMode,
    isEditingEnabled,
    isPlaybackMode,
    isMonitorMode,
    can
  };
})();
