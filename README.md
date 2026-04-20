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

## 开发方式

### 方案 A：本机 VS Code 直装源码目录

适合日常开发。不会反复打开 `F5` 调试宿主窗口。

1. 安装 Node.js 18+。
2. 在仓库根目录执行 `npm install`。
3. 执行 `npm run dev:link`，把当前仓库软链接到 `~/.vscode/extensions/`。
4. 执行 `npm run compile`。
5. 重启一次 VS Code，或运行 `Developer: Reload Window`。
6. 打开一个 BehaviorTree XML 文件后，点击编辑器右上角图标或底部 `Visualize BT` 按钮。
7. 也可以从命令面板运行 `BTreeTool: Open Preview`。
8. 或者在资源管理器、编辑器正文、标签页上右键后选择 `BTreeTool: Open Preview`。

后续迭代时：

1. 修改 `src/` 后执行 `npm run dev:refresh`。
2. 回到你平时使用的 VS Code 窗口，运行 `Developer: Reload Window`。
3. 如果只改了 `media/` 资源，通常直接 `Developer: Reload Window` 即可。

如果你的扩展目录不是默认的 `~/.vscode/extensions/`，可以先设置环境变量：

```bash
VSCODE_EXTENSIONS_DIR="/your/extensions/path" npm run dev:link
```

### 方案 B：F5 调试宿主

适合隔离测试，但会额外打开一个扩展开发宿主窗口。

1. 安装 Node.js 18+。
2. 在仓库根目录执行 `npm install`。
3. 执行 `npm run compile`。
4. 在 VS Code 中按 `F5` 启动扩展调试宿主。

## 下一步建议

- 把 XML 解析从“层级预览”升级为真正的节点图模型
- 增加 `Custom Editor`，直接接管 `.xml` 或特定后缀文件
- 支持节点拖拽、连线、属性编辑和保存回 XML
- 参考 Groot 的 `TreeNodesModel`、`BehaviorTree`、端口映射和子树结构
