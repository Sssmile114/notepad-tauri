# 记事本（notepad-tauri）

一个支持窗口置顶与行列统计的简易记事本，基于 Tauri 2 构建，体积小、启动快。

## 功能

- 新建、打开、保存、另存为
- 最近打开的文件快速访问
- 查找与替换
- 深色 / 浅色主题切换
- 窗口置顶
- 状态栏实时显示行数与字数
- 自动保存，意外退出不丢内容
- 自动识别文件编码（UTF-8 / GBK 等）
- 字体大小调整
- 拖拽文件到窗口即可打开
- 关闭时最小化到系统托盘
- 记住窗口位置与大小

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+N | 新建 |
| Ctrl+O | 打开 |
| Ctrl+S | 保存 |
| Ctrl+Shift+S | 另存为 |
| Ctrl+F | 查找/替换 |
| Ctrl+T | 窗口置顶 |

## 开发

```bash
npm install
npm run tauri dev
```

## 构建

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/`。

## 技术栈

- Tauri 2（Rust）
- Vite
- 原生 JavaScript
