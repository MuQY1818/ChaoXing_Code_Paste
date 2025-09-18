# 超星代码粘贴助手

一个用于绕过超星网站代码编辑器粘贴检测的油猴脚本。

## 功能特性

- 绕过粘贴检测，直接向CodeMirror编辑器插入代码
- 可拖拽的浮动窗口界面
- 支持多行代码输入
- 自动检测页面上的代码编辑器
- 代码内容自动保存恢复
- 快捷键支持（Ctrl+Enter快速粘贴）
- 响应式设计，适配不同屏幕

## 技术原理

超星平台通过监听CodeMirror编辑器的`beforeChange`事件来检测粘贴操作：

```javascript
editor.on('beforeChange', function (cm, change) {
    if (change.origin === 'paste') {
        change.cancel(); // 取消粘贴操作
        return editorPaste(null, change);
    }
});
```

本脚本通过直接调用`editor.setValue()`方法绕过这一检测机制，因为该方法的`origin`为`setValue`而非`paste`。

详细的技术分析和实现原理请参考：[超星平台代码粘贴限制的技术分析与绕过方案](https://zhuanlan.zhihu.com/p/1951953890875540004)

## 安装方法

### 1. 安装Tampermonkey
- [Chrome浏览器](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- [Firefox浏览器](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
- [Edge浏览器](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

### 2. 安装脚本
点击下面的链接自动安装：

**[直接安装脚本](https://raw.githubusercontent.com/MuQY1818/ChaoXing_Code_Paste/main/chaoxing-paste-helper.user.js)**

或者手动安装：
1. 打开Tampermonkey管理面板
2. 点击"添加新脚本"
3. 复制粘贴脚本内容
4. 保存并启用

## 使用方法

1. 打开超星网站的作业页面
2. 等待右上角出现"代码粘贴助手"浮动窗口
3. 在文本框中输入要粘贴的代码
4. 选择目标编辑器
5. 点击"粘贴"按钮或使用快捷键Ctrl+Enter

## 兼容性

- 超星学习通平台 (*.chaoxing.com)
- 超星网站 (*.cx.com)
- 支持CodeMirror编辑器
- Chrome、Firefox、Edge浏览器

## 安全说明

- 脚本在Tampermonkey沙盒环境中运行
- 数据仅保存在用户本地浏览器中
- 开源代码，可审计安全性
- 建议仅用于调试和测试自己的代码

## 更新日志

### v1.0.0 (2025-09-18)
- 初始版本发布
- 基础代码粘贴功能
- 浮动助手窗口界面
- CodeMirror编辑器自动检测
- 数据持久化存储
- 快捷键支持

## 开发说明

技术栈：
- 纯原生JavaScript
- MutationObserver API
- LocalStorage存储
- CSS3样式

核心文件：
- `chaoxing-paste-helper.user.js` - 主脚本文件
- `description.html` - 详细功能介绍

## 贡献指南

欢迎贡献代码和提出建议：

1. Fork本仓库
2. 创建feature分支
3. 提交你的改动
4. 发起Pull Request

问题反馈请提交Issue。

## 许可证

MIT License - 详见LICENSE文件

## 作者

[@MuQY1818](https://github.com/MuQY1818)

如有疑问，欢迎在GitHub Issues中交流讨论。