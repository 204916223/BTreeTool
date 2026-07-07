(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function getCurrentLanguage() {
    return runtime.state?.currentSettings?.language === "zh-CN" ? "zh-CN" : "en-US";
  }

  function localize(base, overrides, language = getCurrentLanguage()) {
    if (language !== "zh-CN") {
      return base;
    }
    return {
      ...base,
      ...(overrides || {})
    };
  }

  function getSettingsCopy(language = getCurrentLanguage()) {
    const base = {
      title: "Settings",
      close: "Close",
      generalMode: "General Settings",
      editMode: "Edit Settings",
      playbackMode: "Playback Settings",
      traceMode: "AI Assistant Settings",
      language: "Language",
      theme: "Theme",
      customTheme: "Custom Theme",
      themeGroups: {
        dark: "Dark backgrounds",
        light: "Light backgrounds",
        custom: "Custom"
      },
      nodeAttributeLayout: "Node Layout",
      nodeAttributeLayoutOptions: {
        inline: "Left-right layout",
        stacked: "Top-bottom layout"
      },
      nodeSectionTitle: "Titles",
      nodeSectionTitleOptions: {
        hidden: "Hidden",
        regular: "Regular",
        emphasis: "Emphasis"
      },
      treeRenderMode: "Tree Render",
      treeRenderModeOptions: {
        paged: "Tree tabs",
        expanded: "Full tree"
      },
      playbackPanelLayout: "Playback Layout",
      playbackPanelLayoutOptions: {
        classic: "Panels",
        dashboard: "Timeline"
      },
      playbackPanelOpacity: "Panel Opacity",
      locatorShort: "Locator",
      rootShort: "ROOT",
      deleteConfirmShort: "Delete confirm",
      copyDescendantsShort: "Copy descendants",
      playbackAutoNavigateShort: "Auto jump tree",
      playbackAllowUnclosedLogShort: "Allow unclosed log",
      traceLearningShort: "Learning",
      traceLearningEnhancementShort: "Learning enhancement",
      traceConfigDirectory: "AI assistant config directory",
      traceConfigDirectoryUnavailable: "AI assistant config directory is not ready.",
      traceOpenConfig: "Open config file",
      nodeDisplay: "Node Display",
      nodeDetailOptions: {
        description: "Description",
        code: "Code",
        inputs: "Inputs",
        outputs: "Outputs",
        params: "Params",
        subtreeJump: "SubTree Button"
      },
      languageOptions: {
        english: "English",
        chinese: "Chinese"
      },
      clearImportedNodes: "Clear Imported",
      importNodes: "Import Nodes",
      save: "Save"
    };

    return localize(
      base,
      {
        title: "设置",
        close: "关闭",
        generalMode: "通用设置",
        editMode: "编辑设置",
        playbackMode: "回放设置",
        traceMode: "AI助手设置",
        language: "语言",
        theme: "主题",
        customTheme: "自定义主题",
        themeGroups: {
          dark: "深色背景",
          light: "浅色背景",
          custom: "自定义"
        },
        nodeAttributeLayout: "节点布局类型",
        nodeAttributeLayoutOptions: {
          inline: "左右布局",
          stacked: "上下布局"
        },
        nodeSectionTitle: "标题",
        nodeSectionTitleOptions: {
          hidden: "隐藏",
          regular: "常规",
          emphasis: "强调"
        },
        treeRenderMode: "树渲染方式",
        treeRenderModeOptions: {
          paged: "分树渲染",
          expanded: "完整展开"
        },
        playbackPanelLayout: "回放布局",
        playbackPanelLayoutOptions: {
          classic: "面板布局",
          dashboard: "时间轴布局"
        },
        playbackPanelOpacity: "面板透明度",
        locatorShort: "定位图",
        rootShort: "ROOT",
        deleteConfirmShort: "删除前确认",
        copyDescendantsShort: "复制子节点",
        playbackAutoNavigateShort: "自动跳转树",
        playbackAllowUnclosedLogShort: "允许读取未闭合日志",
        traceLearningShort: "学习",
        traceLearningEnhancementShort: "学习增强",
        traceConfigDirectory: "AI助手配置目录",
        traceConfigDirectoryUnavailable: "AI助手配置目录尚未就绪。",
        traceOpenConfig: "打开配置文件",
        nodeDisplay: "节点显示",
        nodeDetailOptions: {
          description: "描述",
          code: "代码",
          inputs: "输入",
          outputs: "输出",
          params: "参数",
          subtreeJump: "子树按钮"
        },
        languageOptions: {
          english: "英文",
          chinese: "中文"
        },
        clearImportedNodes: "清除导入",
        importNodes: "导入节点",
        save: "保存"
      },
      language
    );
  }

  function getThemeOptions(language = getCurrentLanguage()) {
    const themes =
      language === "zh-CN"
        ? [
            { value: "midnight", label: "午夜蓝" },
            { value: "graphite", label: "石墨灰" },
            { value: "ocean", label: "深海蓝" },
            { value: "forest", label: "深林绿" },
            { value: "paper", label: "纸白" },
            { value: "sand", label: "暖沙" },
            { value: "mist", label: "雾灰" },
            { value: "rose", label: "浅玫" },
            { value: "default", label: "暖金" },
            { value: "custom", label: "自定义" }
          ]
        : [
            { value: "midnight", label: "Midnight" },
            { value: "graphite", label: "Graphite" },
            { value: "ocean", label: "Ocean" },
            { value: "forest", label: "Forest" },
            { value: "paper", label: "Paper" },
            { value: "sand", label: "Sand" },
            { value: "mist", label: "Mist" },
            { value: "rose", label: "Rose" },
            { value: "default", label: "Warm Gold" },
            { value: "custom", label: "Custom" }
          ];

    return themes.map((theme) => ({
      value: theme.value,
      label: theme.label
    }));
  }

  function getTreeNodesModelCopy(language = getCurrentLanguage()) {
    const base = {
      title: "TreeNodesModel",
      summary: "Edit one node model at a time. Saving rewrites the current XML file.",
      openXml: "Open XML",
      close: "Close",
      addModel: "Add Model",
      save: "Save",
      saving: "Saving TreeNodesModel...",
      deleting: "Deleting node model...",
      saveFinished: "TreeNodesModel edit finished.",
      modelId: "Name",
      modelKind: "Type",
      addPort: "Add Port",
      deleteModel: "Delete Model",
      inputPort: "Input",
      outputPort: "Output",
      inoutPort: "InOut",
      modelNamePlaceholder: "Name",
      portNamePlaceholder: "port_name",
      unavailable: "Open a valid BehaviorTree XML file before editing TreeNodesModel.",
      missingModelId: "Every model needs a non-empty ID.",
      duplicateModelId: (id) => `Model ID "${id}" is duplicated.`,
      missingPortName: (id) => `Every port in model "${id}" needs a non-empty name.`,
      duplicatePortName: (id, portName) => `Port "${portName}" is duplicated in model "${id}".`,
      unavailableEditor: "TreeNodesModel editor is not available.",
      tableColumns: {
        portName: "Port Name",
        portType: "Type",
        portDirection: "Direction",
        portDefaultValue: "Default Value",
        portDescription: "Description",
        actions: ""
      }
    };

    return localize(
      base,
      {
        title: "节点模型",
        summary: "每次编辑一个节点模型。保存后会直接回写当前 XML。",
        openXml: "打开 XML",
        close: "关闭",
        addModel: "新增模型",
        save: "保存",
        saving: "正在保存 TreeNodesModel...",
        deleting: "正在删除节点模型...",
        saveFinished: "TreeNodesModel 编辑完成。",
        modelId: "名称",
        modelKind: "模型类型",
        addPort: "新增端口",
        deleteModel: "删除模型",
        inputPort: "输入",
        outputPort: "输出",
        inoutPort: "双向",
        modelNamePlaceholder: "名称",
        portNamePlaceholder: "端口名",
        unavailable: "请先打开一个可解析的 BehaviorTree XML 文件，再编辑 TreeNodesModel。",
        missingModelId: "每个模型都需要非空 ID。",
        duplicateModelId: (id) => `模型 ID“${id}”重复。`,
        missingPortName: (id) => `模型“${id}”里的每个端口都需要非空名称。`,
        duplicatePortName: (id, portName) => `模型“${id}”里的端口“${portName}”重复。`,
        unavailableEditor: "TreeNodesModel 编辑器当前不可用。",
        tableColumns: {
          portName: "端口名",
          portType: "类型",
          portDirection: "方向",
          portDefaultValue: "默认值",
          portDescription: "描述",
          actions: ""
        }
      },
      language
    );
  }

  function getBehaviorTreeDialogCopy(language = getCurrentLanguage()) {
    const base = {
      title: "Add BehaviorTree",
      close: "Close",
      name: "BehaviorTree ID",
      placeholder: "SubTreeName",
      cancel: "Cancel",
      create: "Create",
      creating: "Creating BehaviorTree...",
      deleteTitle: "Remove BehaviorTree",
      delete: "Remove",
      deleting: "Removing BehaviorTree...",
      deleteConfirm: (treeId) => `Remove BehaviorTree "${treeId}"?`,
      deleteBlockedTitle: "Cannot remove BehaviorTree",
      deleteBlockedMessage: (treeId) =>
        `BehaviorTree "${treeId}" is still referenced by other trees. Remove those SubTree nodes before deleting it.`,
      relatedTrees: "Related BehaviorTrees",
      saveFinished: "BehaviorTree edit finished.",
      emptyName: "BehaviorTree ID cannot be empty.",
      duplicateName: (treeId) => `BehaviorTree "${treeId}" already exists.`
    };

    return localize(
      base,
      {
        title: "新增子树",
        close: "关闭",
        name: "子树名称",
        placeholder: "子树名称",
        cancel: "取消",
        create: "确定",
        creating: "正在创建 BehaviorTree...",
        deleteTitle: "移除子树",
        delete: "移除",
        deleting: "正在移除 BehaviorTree...",
        deleteConfirm: (treeId) => `确定移除子树“${treeId}”？`,
        deleteBlockedTitle: "无法移除子树",
        deleteBlockedMessage: (treeId) =>
          `子树“${treeId}”仍被其他行为树引用。请先删除这些 SubTree 节点，再移除该子树。`,
        relatedTrees: "关联的子树",
        saveFinished: "BehaviorTree 编辑完成。",
        emptyName: "子树名称不能为空。",
        duplicateName: (treeId) => `子树“${treeId}”已经存在。`
      },
      language
    );
  }

  function getCatalogCopy(language = getCurrentLanguage()) {
    const base = {
      eyebrow: "Node Palette",
      summary: "Built-in nodes, model-backed actions, and SubTree entries available in this XML.",
      searchPlaceholder: "Search nodes",
      openAtlasTitle: "Open node atlas",
      atlasDialogTitle: "Node Atlas",
      atlasDialogSummary: "Node atlas generated from the current TreeNodesModel export.",
      atlasEmpty: "No atlas JSON is available.",
      atlasParamsTitle: "Parameters",
      atlasFunctionTitle: "Function",
      atlasFunctionDescriptionTitle: "Description",
      atlasFunctionRulesTitle: "Rules",
      atlasFunctionExamplesTitle: "Examples",
      atlasFunctionParamsTitle: "Key parameters",
      atlasFunctionNotesTitle: "Notes",
      atlasNoDescription: "No semantic description is available yet.",
      atlasNoParams: "No parameters are available.",
      atlasNoFunctionIntro: "No function introduction is available yet.",
      atlasInvalidJson: "Invalid atlas JSON",
      atlasSearchPlaceholder: "Search name / author / department",
      atlasSearchTitle: "Search",
      atlasShowUsageFlowTitle: "Show usage flow",
      atlasShowNodeStyleTitle: "Show node style",
      atlasFlowRootTitle: "Usage sequence",
      atlasFlowRootDescription: "Typical behavior-tree context for this node.",
      atlasFlowConditionTitle: "Precondition",
      atlasFlowConditionDescription: "Checks whether the flow should continue.",
      atlasFlowActionTitle: "Next action",
      atlasFlowActionDescription: "Represents the following step in the flow.",
      atlasFlowDecoratedActionTitle: "Decorated action",
      atlasFlowDecoratedActionDescription: "The action controlled by this decorator.",
      atlasNoFilterResults: "No matching nodes.",
      addModelTitle: "Add TreeNodesModel node definition",
      deleteDropHint: "Drop this area to delete",
      emptyCatalog: "No node definitions are available for this XML file yet.",
      emptySearch: (query) => `No nodes matched "${query}".`,
      editModelTitle: (title) => `Edit node model ${title}`,
      detachedSubTreeTitle: (title) => `SubTree ${title} is not connected to any other tree`,
      removeSubTreeTitle: (title) => `Remove SubTree ${title}`
    };

    return localize(
      base,
      {
        eyebrow: "节点面板",
        summary: "当前 XML 中可用的内建节点、模型节点和 SubTree 引用。",
        searchPlaceholder: "搜索节点",
        openAtlasTitle: "打开节点图鉴",
        atlasDialogTitle: "节点图鉴",
        atlasDialogSummary: "按当前 TreeNodesModel 导出生成的节点图鉴。",
        atlasEmpty: "暂无可用的图鉴 JSON。",
        atlasParamsTitle: "参数",
        atlasFunctionTitle: "功能介绍",
        atlasFunctionDescriptionTitle: "功能说明",
        atlasFunctionRulesTitle: "规则",
        atlasFunctionExamplesTitle: "示例",
        atlasFunctionParamsTitle: "关键参数",
        atlasFunctionNotesTitle: "备注",
        atlasNoDescription: "暂未补充语义说明。",
        atlasNoParams: "暂无参数。",
        atlasNoFunctionIntro: "暂未补充功能介绍。",
        atlasInvalidJson: "图鉴 JSON 格式无效",
        atlasSearchPlaceholder: "按名称 / 作者 / 部门搜索",
        atlasSearchTitle: "搜索",
        atlasShowUsageFlowTitle: "显示使用流程",
        atlasShowNodeStyleTitle: "显示节点样式",
        atlasFlowRootTitle: "使用流程",
        atlasFlowRootDescription: "该节点在行为树中的典型使用上下文。",
        atlasFlowConditionTitle: "前置条件",
        atlasFlowConditionDescription: "判断流程是否继续执行。",
        atlasFlowActionTitle: "后续动作",
        atlasFlowActionDescription: "表示流程中的下一步动作。",
        atlasFlowDecoratedActionTitle: "被装饰动作",
        atlasFlowDecoratedActionDescription: "由当前装饰器控制的动作节点。",
        atlasNoFilterResults: "没有匹配的节点。",
        addModelTitle: "新增 TreeNodesModel 节点定义",
        deleteDropHint: "拖动至该区域删除",
        emptyCatalog: "当前 XML 里还没有可用的节点定义。",
        emptySearch: (query) => `没有匹配“${query}”的节点。`,
        editModelTitle: (title) => `编辑节点模型 ${title}`,
        detachedSubTreeTitle: (title) => `子树 ${title} 未与其他行为树相连`,
        removeSubTreeTitle: (title) => `移除子树 ${title}`
      },
      language
    );
  }

  function getAttributeCopy(language = getCurrentLanguage()) {
    const base = {
      unresolvedNode: "The selected node could not be resolved in the current tree.",
      attributePlaceholder: "attribute",
      valuePlaceholder: "value",
      selectedTreeUnavailable: "The selected tree is no longer available.",
      missingAttributeKey: "Every attribute value needs a non-empty key.",
      requiredAttributeValue: (key) => `Attribute "${key}" requires a value.`,
      duplicateAttribute: (key) => `Attribute "${key}" is duplicated.`
    };

    return localize(
      base,
      {
        unresolvedNode: "当前树中无法定位所选节点。",
        attributePlaceholder: "属性名",
        valuePlaceholder: "属性值",
        selectedTreeUnavailable: "所选行为树已不可用。",
        missingAttributeKey: "每个属性值都需要一个非空属性名。",
        requiredAttributeValue: (key) => `属性“${key}”必须填写值。`,
        duplicateAttribute: (key) => `存在重复属性“${key}”。`
      },
      language
    );
  }

  function getOverlayCopy(language = getCurrentLanguage()) {
    const base = {
      copyNode: "Copy Node",
      addNewBefore: "Add New Before",
      addNewAfter: "Add New After",
      addNewChild: "Add New Child",
      pasteCopyBefore: "Paste Copy Before",
      pasteCopyAfter: "Paste Copy After",
      pasteCopyAsChild: "Paste Copy As Child",
      deleteNode: "Delete Node",
      addNodeBeforeTitle: (nodeTitle) => `Add node before "${nodeTitle || "node"}"`,
      addNodeAfterTitle: (nodeTitle) => `Add node after "${nodeTitle || "node"}"`,
      addChildTitle: (nodeTitle) => `Add child to "${nodeTitle || "node"}"`,
      cancel: "Cancel",
      confirmTitle: "Confirm action",
      confirm: "Confirm",
      delete: "Delete",
      deleteConfirm: (title) => `Delete "${title || "this node"}"? This only removes the current node instance.`,
      hideAllNodeDetails: "Hide All Node Display Items",
      showConfiguredNodeDetails: "Show Configured Node Display Items",
      nodePickerTitle: "Add node",
      close: "Close",
      nodePickerSearchPlaceholder: "Search nodes",
      nodePickerEmpty: "No nodes matched the current search."
    };

    return localize(
      base,
      {
        copyNode: "复制节点",
        addNewBefore: "前面新增节点",
        addNewAfter: "后面新增节点",
        addNewChild: "新增子节点",
        pasteCopyBefore: "前面粘贴复制",
        pasteCopyAfter: "后面粘贴复制",
        pasteCopyAsChild: "作为子节点粘贴复制",
        deleteNode: "删除节点",
        addNodeBeforeTitle: (nodeTitle) => `在“${nodeTitle || "节点"}”前插入节点`,
        addNodeAfterTitle: (nodeTitle) => `在“${nodeTitle || "节点"}”后插入节点`,
        addChildTitle: (nodeTitle) => `给“${nodeTitle || "节点"}”添加子节点`,
        cancel: "取消",
        confirmTitle: "确认操作",
        confirm: "确认",
        delete: "删除",
        deleteConfirm: (title) => `删除“${title || "当前节点"}”？这只会移除当前节点实例。`,
        hideAllNodeDetails: "隐藏所有节点显示项",
        showConfiguredNodeDetails: "恢复配置的节点显示项",
        nodePickerTitle: "添加节点",
        close: "关闭",
        nodePickerSearchPlaceholder: "搜索节点",
        nodePickerEmpty: "当前搜索没有匹配的节点。"
      },
      language
    );
  }

  function getNodeEditorCopy(language = getCurrentLanguage()) {
    const base = {
      title: "Node Editor",
      close: "Close",
      save: "Save",
      saving: "Saving node...",
      nodeType: "Node Type",
      modelName: "Model Name",
      instanceName: "Instance Name",
      preConditions: "Pre Conditions",
      postConditions: "Post Conditions",
      description: "Description",
      descriptionPlaceholder: "Describe this node",
      saveFinished: "Node edit finished."
    };

    return localize(
      base,
      {
        title: "节点编辑器",
        close: "关闭",
        save: "保存",
        saving: "正在保存节点...",
        nodeType: "节点类型",
        modelName: "模型名称",
        instanceName: "实例名称",
        preConditions: "前置条件",
        postConditions: "后置条件",
        description: "描述",
        descriptionPlaceholder: "填写节点描述",
        saveFinished: "节点编辑已完成。"
      },
      language
    );
  }

  function getAppCopy(language = getCurrentLanguage()) {
    const base = {
      noActiveDocument: "No active document",
      nodeEditFinished: "Node edit finished.",
      openBehaviorTreeFile: "Open a BehaviorTree XML file to see a parsed outline here.",
      parseFailed: (message) => `XML parse failed: ${message}`,
      noPreview: "No preview data is available for this file.",
      emptyFileOutline: "This file is empty. Add a <root> element and at least one <BehaviorTree> to visualize it.",
      noBehaviorTreeOutline: "The file is valid XML, but no <BehaviorTree> nodes were found yet.",
      selectedTreeNotFound: "The selected tree could not be found in this document.",
      startupHint: "Open an XML file and run the preview command.",
      startupTitle: "No XML document open",
      startupSummary: "Choose an action to start working.",
      createNewXml: "New BehaviorTree XML",
      openExistingXml: "Open existing XML",
      importPlaybackLog: "Import Log",
      importPlaybackSummary: "Choose a btlog file to select it.",
      importPlaybackOpening: "Opening btlog...",
      newXmlNameTitle: "Confirm the new XML name"
    };

    return localize(
      base,
      {
        noActiveDocument: "没有活动文档",
        nodeEditFinished: "节点编辑已完成。",
        openBehaviorTreeFile: "打开一个 BehaviorTree XML 文件后，这里会显示解析后的结构。",
        parseFailed: (message) => `XML 解析失败：${message}`,
        noPreview: "当前文件没有可用的预览数据。",
        emptyFileOutline: "这个文件是空的。请添加一个 <root> 元素和至少一个 <BehaviorTree>。",
        noBehaviorTreeOutline: "文件是合法 XML，但还没有找到任何 <BehaviorTree> 节点。",
        selectedTreeNotFound: "当前文档里找不到所选行为树。",
        startupHint: "打开一个 XML 文件并运行预览命令。",
        startupTitle: "当前没有打开 XML 文档",
        startupSummary: "请选择一个动作继续。",
        createNewXml: "新建行为树 XML",
        openExistingXml: "打开已有 XML",
        importPlaybackLog: "导入日志",
        importPlaybackSummary: "选择一个 btlog 文件进行导入。",
        importPlaybackOpening: "正在打开 btlog...",
        newXmlNameTitle: "确认新 XML 的名称"
      },
      language
    );
  }

  function getMainTreeLocatorCopy(language = getCurrentLanguage()) {
    const base = {
      ariaLabel: "MainTree locator",
      currentTree: (treeId) => `Current: ${treeId}`,
      openSubTree: (treeId) => `Open ${treeId}`,
      focusNode: (treeId, nodeTitle) => `Show ${nodeTitle} in ${treeId}`
    };

    return localize(
      base,
      {
        ariaLabel: "MainTree 定位图",
        currentTree: (treeId) => `当前：${treeId}`,
        openSubTree: (treeId) => `打开 ${treeId}`,
        focusNode: (treeId, nodeTitle) => `在 ${treeId} 中定位 ${nodeTitle}`
      },
      language
    );
  }

  function getPlaybackCopy(language = getCurrentLanguage()) {
    const base = {
      transitions: "Transitions",
      blackboard: "Blackboard",
      trace: "AI Assistant",
      filterByNodeName: "Filter by Node Name or UID",
      applyTransitionFilter: "Apply transition filter",
      currentTasks: "Current tasks",
      showCurrentTasks: "Show current tasks",
      hideCurrentTasks: "Hide current tasks",
      noCurrentTasks: "No task at current time",
      filterBlackboard: "Filter blackboard",
      transitionColumns: {
        time: "Time",
        nodeName: "Node Name",
        prev: "Prev",
        status: "Status"
      },
      blackboardColumns: {
        key: "Key",
        value: "Value"
      },
      noMatchingBlackboardValues: "No matching blackboard values.",
      noBlackboardValuesBeforeFrame: "No blackboard values before this frame.",
      tree: "Tree",
      frame: "Frame",
      transition: "Transition",
      providerNotConfigured: "Provider: not configured.",
      traceConfigTitle: "Configure AI Assistant",
      traceConfigDescription: "The AI assistant uses API providers only. Add a custom provider or edit the local config file.",
      traceConfigLoading: "Loading AI assistant config...",
      traceNoAvailableProviders: "No available services.",
      traceAddProvider: "Add provider",
      traceProviderReady: (model) => `Ready · ${model}`,
      traceProviderMissing: (fields) => `Missing ${fields}`,
      traceAskPlaceholder: "Ask about the current btlog frame...",
      traceNoLog: "Open a btlog before asking the AI assistant.",
      traceAttachLog: "Attach async log",
      traceClearLog: "Clear",
      traceAttachedLog: (fileName, lineCount, truncated) =>
        `${fileName} · ${lineCount} lines${truncated ? " · truncated" : ""}`,
      traceSend: "Ask",
      traceStop: "Stop",
      traceThinking: "AI assistant is thinking...",
      traceCurrentProvider: (provider, model) => `${provider} · ${model}`,
      traceEmpty: "Ask the AI assistant to investigate the current btlog frame.",
      traceQuestion: "You",
      traceAnswer: "AI Assistant",
      traceRequestCancelled: "AI assistant request cancelled.",
      traceRequestFailed: (message) => `Request failed: ${message}`,
      playbackSpeed: "Playback speed",
      previousNodeStatusChange: "Previous node status change",
      nextNodeStatusChange: "Next node status change",
      noFrames: "No frames",
      pausePlayback: "Pause playback",
      playPlayback: "Play playback",
      showHideTransitions: "Show or hide transitions",
      showHideRightPanel: "Show or hide right panel",
      collapseValue: "Collapse value",
      expandValue: "Expand value",
      noActiveTransition: "No active transition",
      noTransition: "None",
      blackboardEntries: (count) => `${count} entries`,
      promptIntro: "Analyze this behavior tree playback frame and summarize the first likely failure chain.",
      promptBlackboardEntries: (count) => `Blackboard entries: ${count}`,
      promptSelectedNodePath: (path) => `Selected node path: ${path}`,
      promptFocus: "Focus on the first meaningful error, not just the final failure line."
    };

    return localize(
      base,
      {
        transitions: "状态流",
        blackboard: "黑板",
        trace: "AI助手",
        filterByNodeName: "按节点名或 UID 筛选",
        applyTransitionFilter: "应用状态变化筛选",
        currentTasks: "当前任务",
        showCurrentTasks: "显示当前任务",
        hideCurrentTasks: "隐藏当前任务",
        noCurrentTasks: "当前时间点没有任务",
        filterBlackboard: "筛选黑板",
        transitionColumns: {
          time: "时间",
          nodeName: "节点",
          prev: "之前",
          status: "状态"
        },
        blackboardColumns: {
          key: "键",
          value: "值"
        },
        noMatchingBlackboardValues: "没有匹配的黑板值。",
        noBlackboardValuesBeforeFrame: "当前帧之前没有黑板值。",
        tree: "树",
        frame: "帧",
        transition: "状态变化",
        providerNotConfigured: "服务：未配置",
        traceConfigTitle: "配置AI助手",
        traceConfigDescription: "AI助手只通过 API 调用服务商。添加自定义服务或编辑本地配置文件即可。",
        traceConfigLoading: "正在读取AI助手配置...",
        traceNoAvailableProviders: "当前无可用的服务。",
        traceAddProvider: "添加服务商",
        traceProviderReady: (model) => `可用 · ${model}`,
        traceProviderMissing: (fields) => `缺少 ${fields}`,
        traceAskPlaceholder: "询问当前 btlog 帧的问题...",
        traceNoLog: "先打开一个 btlog，再向AI助手提问。",
        traceAttachLog: "附加 async 日志",
        traceClearLog: "清除",
        traceAttachedLog: (fileName, lineCount, truncated) =>
          `${fileName} · ${lineCount} 行${truncated ? " · 已截断" : ""}`,
        traceSend: "提问",
        traceStop: "停止",
        traceThinking: "AI助手正在分析...",
        traceCurrentProvider: (provider, model) => `${provider} · ${model}`,
        traceEmpty: "向AI助手提问，排查当前 btlog 帧。",
        traceQuestion: "你",
        traceAnswer: "AI助手",
        traceRequestCancelled: "AI助手请求已取消。",
        traceRequestFailed: (message) => `请求失败：${message}`,
        playbackSpeed: "回放速度",
        previousNodeStatusChange: "上一条节点状态变化",
        nextNodeStatusChange: "下一条节点状态变化",
        noFrames: "无帧",
        pausePlayback: "暂停回放",
        playPlayback: "开始回放",
        showHideTransitions: "显示或隐藏状态流",
        showHideRightPanel: "显示或隐藏右侧面板",
        collapseValue: "收起值",
        expandValue: "展开值",
        noActiveTransition: "无当前状态变化",
        noTransition: "无",
        blackboardEntries: (count) => `${count} 项`,
        promptIntro: "分析当前行为树回放帧，并总结最早的可能失败链路。",
        promptBlackboardEntries: (count) => `黑板项数量：${count}`,
        promptSelectedNodePath: (path) => `选中节点路径：${path}`,
        promptFocus: "重点关注第一个有意义的错误，不要只看最终 failure。"
      },
      language
    );
  }

  function getChromeCopy(language = getCurrentLanguage()) {
    const base = {
      editModeTitle: "Edit mode",
      playbackModeTitle: "Playback mode",
      saveXmlHealthyTitle: "Behavior tree is complete",
      saveXmlDirtyTitle: "Behavior tree changed and is ready to save",
      saveXmlErrorTitle: "Behavior tree has blocking issues. Fix them before saving",
      saveXmlConfirm: "Save the current XML file now?",
      toggleCatalogTitle: "Show or hide the node palette",
      addBehaviorTreeTitle: "Add BehaviorTree",
      splitViewTitle: "Split tree view",
      openSettingsTitle: "Open BTreeTool settings"
    };

    return localize(
      base,
      {
        editModeTitle: "编辑模式",
        playbackModeTitle: "回放模式",
        saveXmlHealthyTitle: "当前行为树完整",
        saveXmlDirtyTitle: "行为树已修改，等待保存",
        saveXmlErrorTitle: "行为树存在阻断性问题，修复后才能保存",
        saveXmlConfirm: "现在保存当前 XML 文件吗？",
        toggleCatalogTitle: "显示或隐藏节点面板",
        addBehaviorTreeTitle: "新增子树",
        splitViewTitle: "左右分栏",
        openSettingsTitle: "打开 BTreeTool 设置"
      },
      language
    );
  }

  function getSearchCopy(language = getCurrentLanguage()) {
    const base = {
      title: "Node Search",
      placeholder: "Search nodes",
      close: "Close",
      filters: "Filters",
      searchAction: "Search",
      searchNode: "Node",
      searchDescription: "Description",
      searchAttributes: "Attributes",
      noQuery: "Type to search the current XML.",
      noResults: "No nodes matched the current search.",
      prev: "Previous",
      next: "Next",
      matchNode: "Node",
      matchDescription: "Description",
      matchAttributes: "Attributes"
    };

    return localize(
      base,
      {
        title: "节点搜索",
        placeholder: "搜索节点",
        close: "关闭",
        filters: "筛选",
        searchAction: "搜索",
        searchNode: "节点",
        searchDescription: "描述",
        searchAttributes: "属性",
        noQuery: "输入关键字后搜索当前 XML。",
        noResults: "当前搜索没有匹配的节点。",
        prev: "上一条",
        next: "下一条",
        matchNode: "节点",
        matchDescription: "描述",
        matchAttributes: "属性"
      },
      language
    );
  }

  function getEditAssistantCopy(language = getCurrentLanguage()) {
    const base = {
      title: "Tree Assistant",
      hidePanel: "Hide assistant",
      configure: "Warning whitelist",
      configNotReady: "AI configuration is not implemented yet.",
      discardPendingTitle: "Collapse assistant?",
      discardPendingConfirm: "The assistant has pending edits. Collapse it without applying them?",
      discardPendingAction: "Collapse",
      queueTitle: "Queue",
      errorLabel: "Errors",
      warningLabel: "Warnings",
      ignoredLabel: "Ignored",
      ignoredWarningValue: (count) => `Warnings ${count}`,
      scanTree: "Scan current tree",
      addCurrentTree: "Add current subtree",
      removeCurrentTree: "Remove current subtree",
      messages: "Assistant",
      empty: "Ask for a scan or an edit plan. Rule checks and AI planning will be added here.",
      placeholder: "Describe what to check or what logic to add...",
      localProvider: "Local",
      send: "Ask",
      you: "You",
      assistant: "Assistant",
      none: "None",
      notReady: "The edit assistant backend is ready for wiring. Rule checks and AI planning are not enabled yet.",
      scanQueueEmpty: "Queue is empty. Add a subtree with + before scanning.",
      scanNoIssues: (trees) => `Scan finished for ${trees}; no issues found.`,
      scanSummary: (trees, total, counts) =>
        `Scan finished for ${trees}; found ${total} issue(s): ${counts.error} error, ${counts.warning} warning, ${counts.info} info.`,
      scanScopeDocument: "Current XML",
      scanGroupTitle: (scope, trees, count) => `${scope}: ${trees} (${count})`,
      scanGroupNoIssues: "No issues in this scope.",
      jumpToIssue: "Jump to this node",
      explainSelectedNodePrompt: (node) => {
        if (!node || typeof node === "string") {
          return `Explain selected node: ${node || ""}`;
        }
        const uid = node.uid ? ` (${node.uid})` : "";
        return `Explain selected ${node.type || "node"}: ${node.title || "node"}${uid}`;
      },
      whitelistTitle: "Warning whitelist",
      whitelistSummary: "Select custom nodes whose empty parameters should not produce warnings.",
      whitelistSearchPlaceholder: "Search custom nodes...",
      whitelistEmpty: "No custom TreeNodesModel nodes are available in the current XML.",
      whitelistNoSearchResults: "No matching custom nodes.",
      whitelistOptionMeta: (modelKind) => modelKind || "Custom",
      closeWhitelist: "Close whitelist",
      cancelWhitelist: "Cancel",
      saveWhitelist: "Save",
      treeAttached: (treeId) => `Added "${treeId}" to the assistant tree queue.`,
      treeDetached: (treeId) => `Removed "${treeId}" from the assistant tree queue.`
    };

    return localize(
      base,
      {
        title: "行为树助手",
        hidePanel: "隐藏助手",
        configure: "警告白名单",
        configNotReady: "AI 配置入口已预留，功能尚未实现。",
        discardPendingTitle: "收起助手？",
        discardPendingConfirm: "助手中有尚未应用的修改，确定收起吗？",
        discardPendingAction: "收起",
        queueTitle: "队列",
        errorLabel: "异常",
        warningLabel: "警告",
        ignoredLabel: "已忽略",
        ignoredWarningValue: (count) => `警告${count}`,
        scanTree: "扫描当前树",
        addCurrentTree: "加入当前子树",
        removeCurrentTree: "移出当前子树",
        messages: "助手",
        empty: "可以先请求扫描或编辑计划。规则检查和 AI 规划会继续接到这里。",
        placeholder: "描述要检查的问题，或要追加的行为树逻辑...",
        localProvider: "本地",
        send: "发送",
        you: "你",
        assistant: "助手",
        none: "无",
        notReady: "编辑助手后端通道已预留，规则检查和 AI 规划尚未启用。",
        scanQueueEmpty: "队列为空，请先用 + 加入需要扫描的子树。",
        scanNoIssues: (trees) => `已扫描 ${trees}，未发现问题。`,
        scanSummary: (trees, total, counts) =>
          `已扫描 ${trees}，发现 ${total} 个问题：${counts.error} 个错误，${counts.warning} 个警告，${counts.info} 个提示。`,
        scanScopeDocument: "当前窗口",
        scanGroupTitle: (scope, trees, count) => `${scope}：${trees}（${count}）`,
        scanGroupNoIssues: "这个范围内未发现问题。",
        jumpToIssue: "跳转到该节点",
        explainSelectedNodePrompt: (node) => {
          if (!node || typeof node === "string") {
            return `解释选中节点：${node || ""}`;
          }
          const uid = node.uid ? `（${node.uid}）` : "";
          return `解释选中${node.type || "节点"}：${node.title || "节点"}${uid}`;
        },
        whitelistTitle: "警告白名单",
        whitelistSummary: "选择允许空参数不产生警告的自定义节点。",
        whitelistSearchPlaceholder: "搜索自定义节点...",
        whitelistEmpty: "当前 XML 中没有可选择的自定义 TreeNodesModel 节点。",
        whitelistNoSearchResults: "没有匹配的自定义节点。",
        whitelistOptionMeta: (modelKind) => modelKind || "自定义",
        closeWhitelist: "关闭白名单",
        cancelWhitelist: "取消",
        saveWhitelist: "保存",
        treeAttached: (treeId) => `已将 "${treeId}" 加入助手树队列。`,
        treeDetached: (treeId) => `已将 "${treeId}" 从助手树队列移出。`
      },
      language
    );
  }

  runtime.i18n = {
    getCurrentLanguage,
    getChromeCopy,
    getSearchCopy,
    getEditAssistantCopy,
    getCatalogCopy,
    getAttributeCopy,
    getOverlayCopy,
    getNodeEditorCopy,
    getMainTreeLocatorCopy,
    getPlaybackCopy,
    getAppCopy,
    getSettingsCopy,
    getThemeOptions,
    getTreeNodesModelCopy,
    getBehaviorTreeDialogCopy
  };
})();
