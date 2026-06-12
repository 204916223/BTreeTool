# BTT 工具介绍文档

## 1. 工具定位

BTT 是一个运行在 VS Code 内的行为树查看、编辑和日志回放工具，面向 `BehaviorTree.CPP / Groot2` 风格 XML，以及机器人现场排障中常见的 `btlog` 回放分析场景。

工具的核心目标是让开发和调试人员不必频繁切换到 Groot2，也能在 VS Code 中完成行为树结构检查、节点属性编辑、SubTree 跳转、节点库管理、日志回放。

## 2. 适用场景

- 快速查看行为树 XML 的整体结构和当前执行入口。
- 在多棵 `<BehaviorTree ID="...">` 之间切换和定位 SubTree 引用关系。
- 修改节点属性、端口字段、脚本代码和节点描述，并保存回 XML。
- 调整节点顺序和层级，新增、复制、粘贴或删除节点。
- 导入自定义节点模型，让业务节点出现在节点目录中。
- 打开 `btlog` 文件，按时间线回放行为树状态变化。

## 3. 安装和启动

工具以 VS Code 扩展形式分发，产物是 `btree-tool-v*.vsix`。

安装方式：

1. 打开 VS Code。
2. 执行 `Extensions: Install from VSIX...`。
3. 选择 `btree-tool-v*.vsix`。
4. 安装完成后重新加载 VS Code。

打开行为树 XML 后，可以通过以下入口启动预览：

- 命令面板：`BTreeTool: Open Preview`
- XML 编辑器右上角预览图标
- 编辑器右键菜单
- 文件标签右键菜单
- 资源管理器右键菜单
- 状态栏预览入口

如果没有当前 XML 文档，工具也可以打开独立面板，用于直接进入 `btlog` 回放入口。

## 4. 行为树预览能力

### 4.1 XML 解析

工具支持 `BehaviorTree.CPP / Groot2` 常见 XML 结构：

- `<root>` 根节点
- `BTCPP_format="4"`
- `main_tree_to_execute`
- 多个 `<BehaviorTree ID="...">`
- `<TreeNodesModel>`
- 顶层 `<include ... />`
- 常见节点属性和端口定义

解析时会尽量宽松处理未知节点和未知属性。无法完全识别但不影响展示的内容会尽量保留；明显结构问题会在预览或 VS Code Problems 中提示。

### 4.2 画布操作

预览画布支持：

- 鼠标滚轮缩放
- 拖动画布平移
- 点击节点选中
- 双击节点打开编辑窗口
- 右键节点打开上下文菜单
- 拖拽节点调整父子关系和顺序
- 按节点插槽新增节点

画布顶部会显示一个 `root` 节点。当前视图位于某个 SubTree 内部时，可以通过 root 回到上级行为树。

### 4.3 多树切换和 SubTree 定位

对于包含多棵行为树的 XML，工具提供行为树切换器，可以在不同 `<BehaviorTree ID="...">` 之间跳转。

MainTree 定位图用于查看当前子树在主树中的位置。打开非 MainTree 时，左侧小窗口会显示主树缩略结构，并高亮当前 SubTree 路径。点击定位图中的 SubTree 节点可以跳转到对应目标树。

## 5. 编辑能力

### 5.1 节点编辑

节点编辑窗口支持修改：

- 节点 ID 或实例名等基础属性
- 输入端口、输出端口和双向端口字段
- 参数字段
- 节点描述
- 脚本类节点代码
- 自定义属性

字段展示会结合内置节点库、XML 中的 `TreeNodesModel` 和用户导入节点库生成。

### 5.2 结构编辑

工具支持以下结构变更：

- 新建节点
- 删除节点
- 复制节点
- 粘贴为子节点
- 粘贴到目标节点前后
- 拖拽移动节点
- 新建 BehaviorTree
- 重命名 BehaviorTree
- 删除非入口且未被引用的 BehaviorTree

部分操作会做语义校验，例如不允许删除被 SubTree 引用的行为树，不允许删除入口行为树。

### 5.3 保存行为

保存时，工具会把当前编辑结果序列化回 XML 文件。

需要注意：

- 保存后 XML 会被规范化格式化。
- 不保证保留原始缩进、空行和注释。
- 不保证保存结果与 Groot2 的字节级格式一致。
- 建议重要 XML 文件使用 Git 或其他版本管理方式保留历史。

## 6. 节点目录和节点库

### 6.1 Node Palette

左侧 Node Palette 会显示可创建节点，来源包括：

- BT.CPP 内置基础节点
- 当前 XML 的 `TreeNodesModel`
- 当前 XML 中已有的 SubTree
- 用户配置中的推荐节点
- 用户导入的自定义节点

用户可以在节点目录中搜索节点，也可以把节点拖到画布插槽中创建。

### 6.2 内置节点库

扩展自带基础节点库位于扩展安装目录的 `node-library` 中。该目录只随 VSIX 发布，运行时不应被修改。

内置节点库主要包含 BT.CPP 常见基础节点，例如：

- `Sequence`
- `Fallback`
- `Parallel`
- `Switch`
- `ForceSuccess`
- `ForceFailure`
- `RetryUntilSuccessful`
- `Timeout`
- `Script`
- `AlwaysSuccess`
- `AlwaysFailure`

### 6.3 自定义节点导入

工具支持从 `.btt` 文件中导入 `TreeNodesModel`，批量生成节点定义。

导入后的自定义节点会写入当前用户的 VS Code globalStorage 下的 `node-library`，不会写入扩展安装目录。

加载时，工具会合并：

1. 扩展自带基础节点库。
2. 用户 globalStorage 中的导入节点库。

同名节点以用户导入版本为准。清除导入节点只会删除 globalStorage 中的自定义节点，不会改动扩展自带节点。

### 6.4 SBT 节点模型

项目源码中的 `Tools/buildtnm.sh` 可从 `async-service` 仓库扫描注册节点和 `providedPorts()`，生成 `Tools/TNM.btt`。

这些文件是源码侧辅助工具，不属于插件运行时内容，已经通过 `.vscodeignore` 排除，不会打包进 VSIX。需要使用 SBT 节点时，应通过工具生成 `TNM.btt`，再在设置窗口中作为自定义节点库导入。

## 7. 搜索能力

预览窗口中支持 `Cmd/Ctrl + F` 搜索节点。

默认搜索范围包括：

- 节点名
- 节点类型
- 实例名
- 摘要信息

展开筛选后，还可以搜索：

- 节点描述
- 节点属性
- 输入输出端口字段

搜索结果用于快速定位大型行为树中的关键节点。

## 8. btlog 回放能力

回放模式面向 `btlog` 文件，可以独立于当前 XML 使用。

主要能力：

- 导入 `btlog`
- 播放和暂停
- 拖动时间线跳转
- 前后逐步跳转
- 调整播放倍速
- 查看 transition 列表
- 过滤 transition
- 查看当前帧黑板数据
- 根据日志状态同步更新行为树节点显示

支持倍速：

- `0.1x`
- `0.5x`
- `1.0x`
- `1.5x`
- `2.0x`
- `3.0x`

如果启用相关设置，回放时可以自动跳转到当前事件对应的行为树。

## 9. Trace AI 能力

Trace 面板用于结合回放日志和上下文向 AI 提问，辅助分析失败原因。

支持能力：

- 选择 Trace 配置
- 添加或切换 Trace Provider
- 选择外部上下文文件
- 基于当前 btlog、帧位置、问题和上下文发起提问
- 流式显示回答
- 取消正在进行的请求
- 对回答进行反馈

学习反馈默认只写入本机 VS Code globalStorage。开启学习增强后，工具会尝试向内网学习增强服务上传反馈样本，并在后续问题中检索相似案例。网络失败、超时或服务不可用不会影响本次分析结果，失败样本会进入本地 pending 文件等待后续重试。

Trace AI 适合做辅助推理，不应替代对行为树 XML、btlog、异步日志和现场事实的最终核对。

## 10. 用户设置

设置面板支持调整：

- 语言：中文或英文
- 主题预设和自定义颜色
- 节点属性布局：行内或堆叠
- 编辑模式树展示方式
- 回放模式树展示方式
- MainTree 定位图显示开关
- 虚拟 BehaviorTree root 显示开关
- 删除节点确认开关
- 复制节点时是否包含子树
- 回放时是否自动跳转行为树
- 回放面板布局
- 回放面板透明度
- 简化视图中隐藏的节点信息区块
- Trace Learning 和学习增强
- 推荐节点预设导入
- 自定义节点库导入和清除

设置会保存到当前用户的 VS Code globalStorage 中，文件名为 `user-settings.json`。

## 11. 快捷键和命令

扩展提供以下命令：

- `btreeTool.openPreview`：打开行为树预览
- `btreeTool.copyNode`：复制当前节点
- `btreeTool.pasteNodeSmart`：智能粘贴
- `btreeTool.undoEdit`：撤销当前编辑
- `btreeTool.pasteNodeAsChild`：粘贴为子节点
- `btreeTool.pasteNodeBefore`：粘贴到节点前
- `btreeTool.pasteNodeAfter`：粘贴到节点后

Webview 内快捷键：

- `c c`：复制节点
- `c v`：智能粘贴节点
- `z z`：撤销编辑

## 12. 打包内容边界

VSIX 运行时主要包含：

- `dist/`：扩展后端编译产物
- `media/`：Webview 前端运行时代码、样式和图标
- `node-library/`：内置基础节点库
- `package.json` 和本地化文案
- `README.md` 和许可证

不会打包：

- `src/`
- `tests/`
- `scripts/`
- `Tools/`
- `node_modules/`
- 非白名单的自定义 `.btt` 节点

因此，SBT 等业务节点不会作为默认节点随插件发布，而是由用户按需导入。

## 13. 限制和注意事项

- 工具面向 BehaviorTree.CPP / Groot2 风格 XML，非该格式 XML 可能只能部分解析。
- 保存 XML 会产生规范化格式，不适合要求保留原始注释和排版的场景。
- 未知节点可以展示，但端口提示和字段约束依赖节点模型或节点库。
- 自定义节点库按当前用户存储，不随 VSIX 发布。
- Trace AI 依赖配置的 Provider 和可用网络环境，分析结果需要结合日志证据复核。
- btlog 回放依赖日志内容完整性；对于截断日志，工具会按设置尽量容错读取。

## 14. 推荐使用流程

### 查看和编辑 XML

1. 在 VS Code 中打开行为树 XML。
2. 执行 `BTreeTool: Open Preview`。
3. 在预览面板中检查结构和 SubTree 关系。
4. 使用搜索定位目标节点。
5. 双击节点修改属性或端口。
6. 保存回 XML。
7. 使用 Git 对比保存前后的差异。

### 导入业务节点

1. 使用业务仓库或辅助脚本生成包含 `TreeNodesModel` 的 `.btt` 或 `.xml`。
2. 打开 BTT 设置窗口。
3. 选择导入自定义节点。
4. 导入后重新查看 Node Palette。
5. 如需恢复，只清除导入节点即可。

### 回放日志

1. 打开 BTT 面板。
2. 切换到 Playback 模式。
3. 导入 `btlog` 文件。
4. 使用时间线和 transition 列表定位异常帧。
5. 查看节点状态和 blackboard。
6. 必要时结合 Trace AI 和异步日志继续分析。
