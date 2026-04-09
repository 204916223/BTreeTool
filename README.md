# BTreeTool

`BTreeTool` 是一个面向 BehaviorTree XML 的 VS Code 插件骨架。

当前这一版先完成最小闭环：

- 注册命令 `BTreeTool: Open Preview`
- 在 XML 编辑器右上角显示预览图标
- 在状态栏显示 `Visualize BT` 按钮
- 支持从资源管理器或编辑器右键打开可视化
- 打开一个 Webview 预览面板
- 读取当前活动编辑器中的 XML 文本
- 在 Webview 中做一个非常轻量的行为树层级展示

这不是 Groot 的移植版，而是一个为后续实现 VS Code 内行为树编辑器打底的起点。

## 当前结构

```text
BTreeTool/
  .vscode/
  media/
  src/
  package.json
  tsconfig.json
```

## 运行方式

1. 安装 Node.js 18+。
2. 在仓库根目录执行 `npm install`。
3. 执行 `npm run compile`。
4. 在 VS Code 中按 `F5` 启动扩展调试宿主。
5. 打开一个 BehaviorTree XML 文件后，点击编辑器右上角图标或底部 `Visualize BT` 按钮。
6. 也可以从命令面板运行 `BTreeTool: Open Preview`。
7. 或者在资源管理器、编辑器正文、标签页上右键后选择 `BTreeTool: Open Preview`。

## 下一步建议

- 把 XML 解析从“层级预览”升级为真正的节点图模型
- 增加 `Custom Editor`，直接接管 `.xml` 或特定后缀文件
- 支持节点拖拽、连线、属性编辑和保存回 XML
- 参考 Groot 的 `TreeNodesModel`、`BehaviorTree`、端口映射和子树结构
