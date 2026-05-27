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
      generalMode: "General Mode",
      editMode: "Edit Mode",
      playbackMode: "Playback Mode",
      language: "Language",
      theme: "Theme",
      nodeAttributeLayout: "Node Layout",
      nodeAttributeLayoutOptions: {
        inline: "Key left, value right",
        stacked: "Key top, value bottom"
      },
      locatorShort: "Locator",
      rootShort: "ROOT",
      deleteConfirmShort: "Delete confirm",
      nodeDetails: "Node Details",
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
      save: "Save"
    };

    return localize(
      base,
      {
        title: "设置",
        close: "关闭",
        generalMode: "通用模式",
        editMode: "编辑模式",
        playbackMode: "回放模式",
        language: "语言",
        theme: "主题",
        nodeAttributeLayout: "节点布局类型",
        nodeAttributeLayoutOptions: {
          inline: "左 key，右 value",
          stacked: "上 key，下 value"
        },
        locatorShort: "定位图",
        rootShort: "ROOT",
        deleteConfirmShort: "删除前确认",
        nodeDetails: "节点详情",
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
            { value: "rose", label: "浅玫" }
          ]
        : [
            { value: "midnight", label: "Midnight" },
            { value: "graphite", label: "Graphite" },
            { value: "ocean", label: "Ocean" },
            { value: "forest", label: "Forest" },
            { value: "paper", label: "Paper" },
            { value: "sand", label: "Sand" },
            { value: "mist", label: "Mist" },
            { value: "rose", label: "Rose" }
          ];

    return themes.map((theme) => {
      const option = document.createElement("option");
      option.value = theme.value;
      option.textContent = theme.label;
      return option;
    });
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
      addModelTitle: "Add TreeNodesModel node definition",
      editXml: "Edit XML",
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
        addModelTitle: "新增 TreeNodesModel 节点定义",
        editXml: "编辑 XML",
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
      delete: "Delete",
      deleteConfirm: (title) => `Delete "${title || "this node"}"? This only removes the current node instance.`,
      hideAllNodeDetails: "Hide All Node Details",
      showConfiguredNodeDetails: "Show Configured Node Details",
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
        delete: "删除",
        deleteConfirm: (title) => `删除“${title || "当前节点"}”？这只会移除当前节点实例。`,
        hideAllNodeDetails: "隐藏所有节点详情",
        showConfiguredNodeDetails: "恢复配置的节点详情",
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
      placeholder: "Search node names",
      close: "Close",
      filters: "Filters",
      searchDescription: "Description",
      searchAttributes: "Attributes",
      noQuery: "Type to search the current XML.",
      noResults: "No nodes matched the current search.",
      prev: "Previous",
      next: "Next",
      matchName: "Name",
      matchDescription: "Description",
      matchAttributes: "Attributes"
    };

    return localize(
      base,
      {
        title: "节点搜索",
        placeholder: "按节点名称搜索",
        close: "关闭",
        filters: "筛选",
        searchDescription: "描述",
        searchAttributes: "属性",
        noQuery: "输入关键字后搜索当前 XML。",
        noResults: "当前搜索没有匹配的节点。",
        prev: "上一条",
        next: "下一条",
        matchName: "名称",
        matchDescription: "描述",
        matchAttributes: "属性"
      },
      language
    );
  }

  runtime.i18n = {
    getCurrentLanguage,
    getChromeCopy,
    getSearchCopy,
    getCatalogCopy,
    getAttributeCopy,
    getOverlayCopy,
    getNodeEditorCopy,
    getMainTreeLocatorCopy,
    getAppCopy,
    getSettingsCopy,
    getThemeOptions,
    getTreeNodesModelCopy,
    getBehaviorTreeDialogCopy
  };
})();
