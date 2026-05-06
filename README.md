# BTreeTool

`BTreeTool` 是一个面向 `BehaviorTree.CPP / Groot2` XML 工作流的 VS Code 可视化编辑插件。

它的目标不是复刻 Groot2，而是在 VS Code 内提供一套可用的 XML 预览、校验和可视化编辑闭环。

当前版本已经不再是“插件骨架”，而是一个可以直接用于日常 XML 编辑和结构调整的原型工具。

## 当前能力

### XML 解析与保存

- 解析 `BehaviorTree.CPP` 风格 XML
- 支持多棵 `<BehaviorTree ID="...">`
- 识别 `main_tree_to_execute`
- 支持 `TreeNodesModel`
- 支持顶层 `<include ... />`
- 保留 `BTCPP_format="4"`、XML 声明、常见模型附加属性
- 支持从预览直接保存 XML

### 容错与诊断

- 语法错误会在预览中直接报出
- 解析 warning 会同步进 VS Code `Problems`
- 支持“宽读严写”思路：
  - 轻微人工改动后尽量仍可打开
  - 未知属性尽量保留
  - 未知节点/结构问题会给 warning，而不是直接拒绝加载
- 当前会检查的典型问题包括：
  - 缺 `main_tree_to_execute`
  - 缺 `BehaviorTree ID`
  - 未知节点类型
  - `SubTree` 目标缺失
  - 子节点数量与节点类型不匹配
  - `TreeNodesModel` 未声明属性

### 预览与导航

- Webview 里展示行为树结构图
- 顶部可切换当前 XML 中的不同子树
- 支持缩放、平移、居中适配
- 支持简化视图：
  - 只显示节点名和描述
  - 隐藏输入/输出/参数，便于梳理整体逻辑
- 左侧 `Node Palette` 可显示/隐藏
- 右侧 `Node Inspector` 可显示/隐藏
- 右上角提供设置入口，可管理用户配置文件

### 节点可视化编辑

- 选中节点后在右侧直接编辑属性值
- Inspector 现在只负责改值，不负责删字段
- `_description` 会被收成统一的描述区显示
- `Script` / `ScriptCondition` 的 `code` 单独显示
- 内建节点和 `TreeNodesModel` 节点会按 schema 展示输入、输出、参数

### 结构编辑

- 支持同树内拖拽移动节点
- 支持前插、后插、追加为子节点
- `Simplify` 模式下仍可调整左右顺序，但不会追加为子节点
- 支持从 `Node Palette` 拖新节点进树
- 支持右键节点：
  - `Add Before`
  - `Add After`
  - `Add Child`
  - `Delete Node`
- 支持把节点拖到左侧 `Node Palette` 删除
- 删除带轻确认，避免误删

### 节点目录与新增

- 左侧 `Node Palette` 来源于统一 `nodeCatalog`
- 当前目录包含三类节点：
  - 内建节点
  - `TreeNodesModel` 导出的自定义节点
  - 当前 XML 中的 `SubTree`
- 支持搜索节点
- 右键新增时会弹出节点选择面板，也支持搜索
- 新增节点的初始值来自节点定义默认值，但每次新增都是独立实例，不会互相污染

### 用户设置与预设

- 每个用户都有独立的 `user-settings.json`
- 当前已接入的设置项包括：
  - 界面语言偏好
  - 主题预设
  - 节点预设目录 `presetNodes`
- 设置面板支持：
  - 保存当前设置
  - 打开配置文件
  - 导入推荐节点预设
- 用户预设节点会参与：
  - `Node Palette`
  - 右键新增节点
  - Inspector 固定字段约束
  - 新建节点默认值初始化

## 命令入口

当前提供 1 个命令：

- `BTreeTool: Open Preview`

入口位置：

- 编辑器右上角
- 编辑器右键菜单
- 标签页右键菜单
- 资源管理器右键菜单
- 命令面板
## 当前交互说明

### 顶部子树列表

- 点击切换子树
- 支持左右滚动按钮
- 支持按住子树标题左右拖动列表

### 画布

- 滚轮缩放
- 拖动画布平移
- 点击节点选中
- 拖节点到槽位可调整结构

### 删除

- 右键节点删除
- 或拖到左侧 `Node Palette` 删除
- 删除前会出现确认

## XML 兼容边界

当前版本已经针对 `servo-behavior-tree` 中的多份真实 Groot2 / BT4 XML 做过 round-trip 检查，并确认：

- 可被 Groot2 打开
- 可在 Groot2 中再次编辑并保存
- Groot2 保存后会恢复成 Groot2 自己的排版风格

但仍有这些边界：

- 不保留 XML 注释
- 不保留原始缩进/换行风格
- 插件保存后使用的是插件的规范化格式，不保证字节级接近 Groot2 输出

## 当前结构

```text
BTreeTool/
  media/
    main.js
    styles/
      tokens.css
      chrome.css
      tree-surface.css
      ...
    runtime/
      canvas.js
      catalog.js
      inspector.js
      overlays.js
      overlays/
        shared.js
        context-menus.js
        delete-confirm.js
        node-picker.js
        settings-dialog.js
        tree-model-dialog.js
        node-editor-dialog.js
      tree-navigation.js
      tree-switcher.js
      main-tree-locator.js
      search.js
      workspace-panels.js
      playback.js
      viewport-layout.js
  src/
    core/
      btAst.ts
      edit.ts
      nodeCatalog.ts
      parse.ts
      serialize.ts
      validate.ts
      viewModel.ts
    extension.ts
    panel.ts
  scripts/
  package.json
  tsconfig.json
```

### 代码职责

- `src/core/parse.ts`
  `XML -> AST + warnings`
- `src/core/serialize.ts`
  `AST -> 规范化 XML`
- `src/core/edit.ts`
  结构编辑操作，如移动/新增/删除/属性替换
- `src/core/nodeCatalog.ts`
  统一节点定义目录
- `src/core/viewModel.ts`
  `AST -> Webview preview model`
- `src/panel.ts`
  Webview 宿主、消息处理、统一 XML mutation pipeline
- `media/runtime/*.js`
  Webview 运行时拆分模块：
  - `canvas`
  - `catalog`
  - `inspector`
  - `overlays`
  - `viewport-layout`

## 开发方式

### 方案 A：本机 VS Code 直装源码目录

这是当前推荐方式。适合高频开发，不需要反复打开 `F5` 调试宿主窗口。

1. 安装 Node.js 18+
2. 在仓库根目录执行 `npm install`
3. 执行 `npm run dev:link`
4. 执行 `npm run compile`
5. 回到你日常使用的 VS Code，执行 `Developer: Reload Window`

后续开发时：

1. 修改 `src/` 或 `media/`
2. 执行 `npm run dev:refresh`
3. 执行 `Developer: Reload Window`

如果扩展目录不是默认的 `~/.vscode/extensions/`，可以先设置：

## 打包与分发

当前插件是纯 TypeScript / JavaScript 实现，没有平台相关二进制依赖。

这意味着：

- 生成的 `.vsix` 可以同时给 macOS 和 Windows 用户安装
- 不需要分别打两份包

### 本地打包

1. 执行 `npm install`
2. 执行 `npm run package:vsix`

执行完成后，仓库根目录会生成：

- `btree-tool-v0.0.1.vsix`

### 其他用户安装

让其他用户拿到 `.vsix` 后，在 VS Code 中任选一种方式安装：

1. 命令面板执行 `Extensions: Install from VSIX...`
2. 选择生成的 `btree-tool-v0.0.1.vsix`

安装完成后重新加载 VS Code 即可。

```bash
VSCODE_EXTENSIONS_DIR="/your/extensions/path" npm run dev:link
```

### 方案 B：F5 调试宿主

适合隔离测试，但日常迭代不如方案 A 顺手。

1. 安装 Node.js 18+
2. 在仓库根目录执行 `npm install`
3. 执行 `npm run compile`
4. 在 VS Code 中按 `F5`

## 当前更适合做什么

当前版本更适合：

- 编辑和整理现有 BT XML
- 调整节点顺序和层级
- 规范化 XML
- 做 Groot2 不方便在 macOS 上完成的轻量 XML 编辑

还没做的更大块内容包括：

- `TreeNodesModel` 的可视化编辑器
- 更完整的端口/模型定义管理
- 自动化 UI 回归测试
- 更细粒度的撤销/重做体验

## 现阶段建议

如果继续迭代，下一阶段最值得做的是：

1. 把 `TreeNodesModel` 本身做成可视化编辑窗口
2. 补一层 UI 行为回归测试或最小手测清单
3. 继续收敛节点布局与交互细节，而不是继续堆更多表层功能
