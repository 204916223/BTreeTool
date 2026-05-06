# BTreeTool

BTreeTool 是一个在 VS Code 里查看、定位和轻量编辑 `BehaviorTree.CPP / Groot2` XML 的可视化工具。

它适合在不切换到 Groot2 的情况下快速检查行为树结构、调整节点、编辑属性、定位 SubTree 关系，并把修改保存回 XML。

## 适合做什么

- 预览 `BehaviorTree.CPP` / Groot2 XML 的行为树结构
- 在多个 `<BehaviorTree ID="...">` 之间快速切换
- 通过 MainTree 定位图确认当前子树在主树里的位置
- 编辑节点属性、描述、脚本代码和常见端口字段
- 拖拽调整同一棵树里的节点顺序和层级
- 从节点目录新增内建节点、模型节点和 SubTree 引用
- 编辑 `TreeNodesModel` 节点定义
- 导入回放日志，查看节点运行状态

## 安装

如果你拿到的是 `.vsix` 文件：

1. 在 VS Code 中打开命令面板
2. 执行 `Extensions: Install from VSIX...`
3. 选择 `btree-tool-v*.vsix`
4. 安装完成后重新加载 VS Code

如果你需要从源码打包一个 `.vsix`：

```bash
npm install
npm run package:vsix
```

生成的 `.vsix` 会出现在仓库根目录。

## 打开预览

打开一个行为树 XML 后，可以通过这些入口打开预览：

- 编辑器右上角的 BTreeTool 图标
- 编辑器右键菜单
- 文件标签右键菜单
- 资源管理器右键菜单
- 命令面板：`BTreeTool: Open Preview`

预览窗口会绑定当前 XML 文件。XML 有改动时，预览会自动刷新。

## 界面说明

### 顶部工具栏

- `Edit`：编辑模式，可修改 XML
- `Playback`：回放模式，可导入日志查看节点状态
- 保存按钮：把预览里的修改保存回当前 XML
- 子树列表：切换当前 XML 中的不同 `BehaviorTree`
- 设置按钮：打开 BTreeTool 设置

### 画布

- 滚轮缩放
- 拖动画布平移
- 点击节点选中
- 双击节点打开节点编辑窗口
- 右键节点打开新增、复制、粘贴、删除菜单
- 拖动节点到插槽可调整结构

如果开启了虚拟 root，画布顶部会显示一个 `root` 节点。当前树是从某个 SubTree 打开的情况下，点击这个 root 会回到它的上一级行为树。

### MainTree 定位图

当你打开的不是 MainTree 时，右侧小窗口会显示 MainTree 的缩略结构，并高亮当前所在的子树关系。

- 点击定位图里的 SubTree 节点，会跳转到对应目标子树
- 当前打开的是更深层子树时，也会高亮它在 MainTree 链路上的上级 SubTree
- 可以在设置里关闭这个小窗口

### Node Palette

左侧节点目录包含：

- 内建节点
- `TreeNodesModel` 导出的自定义节点
- 当前 XML 中已有的 SubTree
- 用户配置里的预设节点

你可以搜索节点，也可以把节点拖到画布插槽中创建新节点。

### Node Inspector

右侧 Inspector 用于查看和编辑当前选中节点的 XML 属性。

- 常见端口会按输入、输出、参数分类展示
- `_description` 会作为描述单独显示
- `Script` / `ScriptCondition` 的 `code` 会单独显示
- SubTree 引用节点本身是跳转引用，内部内容需要打开目标子树后编辑

### 搜索

在预览窗口内按 `Cmd/Ctrl + F` 可以搜索节点。

搜索默认匹配节点名、类型、实例名和摘要。展开筛选后，也可以搜索描述和属性。

### 回放模式

切换到 `Playback` 后，可以导入行为树运行日志。当前支持常见的 `btlog`、`json`、`jsonl`、`gz`、`log`、`txt` 文件。

导入后，画布会用状态颜色标记节点执行结果。

## 设置

点击右上角设置按钮可以修改用户配置。配置会保存到当前用户的 `user-settings.json`。

常用设置：

- `Language`：切换界面语言
- `Theme`：切换主题
- `MainTree Locator`：显示或隐藏 MainTree 定位图，默认开启
- `BehaviorTree Root`：显示或隐藏虚拟 root，默认开启
- `Node Details`：控制简化视图里隐藏哪些节点详情
- `Import Presets`：导入推荐节点预设
- `Open Config`：直接打开配置文件

用户预设节点会参与 Node Palette、右键新增、Inspector 字段约束和新建节点默认值。

## XML 兼容性

BTreeTool 面向 `BehaviorTree.CPP` / Groot2 风格 XML，当前支持：

- 多棵 `<BehaviorTree ID="...">`
- `main_tree_to_execute`
- `TreeNodesModel`
- 顶层 `<include ... />`
- `BTCPP_format="4"`
- 常见模型附加属性

预览会尽量宽松读取 XML。轻微人工改动、未知属性和部分未知节点通常会保留下来，并以 warning 的形式显示在 VS Code `Problems` 里。

## 保存时需要注意

BTreeTool 保存 XML 时会使用自己的规范化格式，因此：

- 不保留 XML 注释
- 不保留原始缩进和换行风格
- 不保证字节级接近 Groot2 输出
- Groot2 再次打开和保存后，可能会恢复成 Groot2 自己的排版风格

建议在重要文件上使用 Git 或其他版本管理，方便对比和回退。

## 常见问题

### 预览打不开或显示解析失败

先看预览里的错误信息和 VS Code `Problems`。常见原因包括 XML 不完整、缺少 `<root>`、缺少 `<BehaviorTree>`、`SubTree` 目标不存在，或节点子节点数量不符合类型约束。

### 为什么 SubTree 节点不能直接编辑内部内容？

SubTree 节点只是一个引用。要编辑它指向的内容，请点击 SubTree 跳转到目标行为树后再编辑。

### 为什么保存后 XML 格式变了？

这是预期行为。BTreeTool 会把 XML 序列化成统一格式，以便稳定编辑和保存。
