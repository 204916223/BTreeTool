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
      language: "Language",
      theme: "Theme",
      simplifyView: "Simplify View",
      configFile: "Config File",
      importPresets: "Import Presets",
      openConfig: "Open Config",
      settingsFileAutoHint: "The settings file will be created automatically.",
      simplifyHint: "Choose which sections are hidden when Simplify is enabled.",
      simplifyOptions: {
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
        language: "语言",
        theme: "主题",
        simplifyView: "简化视图",
        configFile: "配置文件",
        importPresets: "导入预设",
        openConfig: "打开配置",
        settingsFileAutoHint: "设置文件会在首次保存时自动创建。",
        simplifyHint: "选择简化模式开启后要隐藏的内容块。",
        simplifyOptions: {
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

  function getCatalogCopy(language = getCurrentLanguage()) {
    const base = {
      eyebrow: "Node Palette",
      summary: "Built-in nodes, model-backed actions, and SubTree entries available in this XML.",
      searchPlaceholder: "Search nodes",
      addModelTitle: "Add TreeNodesModel node definition",
      editXml: "Edit XML",
      emptyCatalog: "No node definitions are available for this XML file yet.",
      emptySearch: (query) => `No nodes matched "${query}".`,
      editModelTitle: (title) => `Edit node model ${title}`
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
        editModelTitle: (title) => `编辑节点模型 ${title}`
      },
      language
    );
  }

  function getInspectorCopy(language = getCurrentLanguage()) {
    const base = {
      eyebrow: "Node Inspector",
      emptyTitle: "No node selected",
      emptySummary: "Select a node in the canvas to inspect and edit its XML attributes.",
      unavailableTitle: "Unavailable",
      unresolvedNode: "The selected node could not be resolved in the current tree.",
      parseErrorSummary: "Fix the XML parse error before editing node attributes.",
      noPreviewSummary: "No preview data is available for this file.",
      emptyFileSummary: "The current XML file is empty.",
      noBehaviorTreeSummary: "No BehaviorTree nodes were found in this XML file.",
      missingTreeSummary: "The selected tree could not be found in this document.",
      subtreeSummary: (targetTreeId) =>
        `This SubTree node is a jump reference to ${targetTreeId || "another tree"}. Open that tree and edit its internal nodes there.`,
      defaultSummary: "Edit the XML attributes below. Saving will rewrite this file using BTreeTool's normalized format.",
      attributePlaceholder: "attribute",
      valuePlaceholder: "value",
      apply: "Apply",
      selectedTreeUnavailable: "The selected tree is no longer available.",
      readOnlyNode: "This node is read-only here. Open the target SubTree to edit its contents.",
      missingAttributeKey: "Every attribute value needs a non-empty key.",
      requiredAttributeValue: (key) => `Attribute "${key}" requires a value.`,
      duplicateAttribute: (key) => `Attribute "${key}" is duplicated in the inspector.`,
      applying: "Applying node attributes..."
    };

    return localize(
      base,
      {
        eyebrow: "节点检查器",
        emptyTitle: "未选择节点",
        emptySummary: "在画布中选择一个节点，即可查看并编辑它的 XML 属性。",
        unavailableTitle: "当前不可用",
        unresolvedNode: "当前树中无法定位所选节点。",
        parseErrorSummary: "请先修复 XML 解析错误，再编辑节点属性。",
        noPreviewSummary: "当前文件没有可用的预览数据。",
        emptyFileSummary: "当前 XML 文件为空。",
        noBehaviorTreeSummary: "当前 XML 文件中没有找到 BehaviorTree 节点。",
        missingTreeSummary: "当前文档里找不到所选行为树。",
        subtreeSummary: (targetTreeId) =>
          `这个 SubTree 节点引用的是 ${targetTreeId || "另一个行为树"}。请打开目标树后再编辑其内部节点。`,
        defaultSummary: "在下方编辑 XML 属性。保存后会用 BTreeTool 的规范化格式回写文件。",
        attributePlaceholder: "属性名",
        valuePlaceholder: "属性值",
        apply: "应用",
        selectedTreeUnavailable: "所选行为树已不可用。",
        readOnlyNode: "这个节点在这里是只读的。请打开目标 SubTree 后再编辑其内容。",
        missingAttributeKey: "每个属性值都需要一个非空属性名。",
        requiredAttributeValue: (key) => `属性“${key}”必须填写值。`,
        duplicateAttribute: (key) => `检查器里存在重复属性“${key}”。`,
        applying: "正在应用节点属性..."
      },
      language
    );
  }

  function getOverlayCopy(language = getCurrentLanguage()) {
    const base = {
      addBefore: "Add Before",
      addAfter: "Add After",
      addChild: "Add Child",
      deleteNode: "Delete Node",
      addNodeBeforeTitle: (nodeTitle) => `Add node before "${nodeTitle || "node"}"`,
      addNodeAfterTitle: (nodeTitle) => `Add node after "${nodeTitle || "node"}"`,
      addChildTitle: (nodeTitle) => `Add child to "${nodeTitle || "node"}"`,
      cancel: "Cancel",
      delete: "Delete",
      deleteConfirm: (title) => `Delete "${title || "this node"}"? This only removes the current node instance.`,
      nodePickerTitle: "Add node",
      close: "Close",
      nodePickerSearchPlaceholder: "Search nodes",
      nodePickerEmpty: "No nodes matched the current search."
    };

    return localize(
      base,
      {
        addBefore: "前面插入",
        addAfter: "后面插入",
        addChild: "添加子节点",
        deleteNode: "删除节点",
        addNodeBeforeTitle: (nodeTitle) => `在“${nodeTitle || "节点"}”前插入节点`,
        addNodeAfterTitle: (nodeTitle) => `在“${nodeTitle || "节点"}”后插入节点`,
        addChildTitle: (nodeTitle) => `给“${nodeTitle || "节点"}”添加子节点`,
        cancel: "取消",
        delete: "删除",
        deleteConfirm: (title) => `删除“${title || "当前节点"}”？这只会移除当前节点实例。`,
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
      startupHint: "Open an XML file and run the preview command."
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
        startupHint: "打开一个 XML 文件并运行预览命令。"
      },
      language
    );
  }

  function getChromeCopy(language = getCurrentLanguage()) {
    const base = {
      saveXmlTitle: "Save XML",
      saveXmlDirtyTitle: "Unsaved XML changes. Save now",
      saveXmlConfirm: "Save the current XML file now?",
      toggleCatalogTitle: "Show or hide the node palette",
      toggleInspectorTitle: "Show or hide the node inspector",
      toggleSimplifyTitle: "Show a simplified tree flow with only node names and descriptions",
      openSettingsTitle: "Open BTreeTool settings"
    };

    return localize(
      base,
      {
        saveXmlTitle: "保存 XML",
        saveXmlDirtyTitle: "XML 有未保存修改。立即保存",
        saveXmlConfirm: "现在保存当前 XML 文件吗？",
        toggleCatalogTitle: "显示或隐藏节点面板",
        toggleInspectorTitle: "显示或隐藏节点检查器",
        toggleSimplifyTitle: "切换简化树视图，只显示节点名称和描述",
        openSettingsTitle: "打开 BTreeTool 设置"
      },
      language
    );
  }

  runtime.i18n = {
    getCurrentLanguage,
    getChromeCopy,
    getCatalogCopy,
    getInspectorCopy,
    getOverlayCopy,
    getNodeEditorCopy,
    getAppCopy,
    getSettingsCopy,
    getThemeOptions,
    getTreeNodesModelCopy
  };
})();
