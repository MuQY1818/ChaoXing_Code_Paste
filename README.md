# 超星粘贴助手

一个用于超星学习通作业场景的油猴脚本，支持代码题与 UEditor 作业题中的文本插入、图片有序上传等辅助操作。

## 功能特性

- **极速粘贴**：智能绕过平台限制，一键注入代码，支持CodeMirror和UEditor编辑器。
- **智能插入**：有编辑器光标时插入到光标处，否则追加到已有答案末尾，避免覆盖已输入内容。
- **图片有序上传**：支持按文件名自然排序批量上传图片，避免多图并发上传导致顺序错乱。
- **智能防扰**：自动识别作业环境，排除弹窗干扰，仅在需要时出现。
- **优雅界面**：现代化的悬浮窗设计，可拖拽、可折叠，记忆位置，不遮挡视线。
- **多功能支持**：
  - 支持多行内容输入
  - 自动检测页面上的所有编辑器
  - 内容自动保存恢复
  - 支持JPG/JPEG/PNG/GIF图片批量上传
  - 快捷键支持（Ctrl+Enter快速粘贴）
  - 响应式设计，适配不同屏幕

## 技术原理

### CodeMirror编辑器（代码题）
超星平台通过监听CodeMirror编辑器的`beforeChange`事件来检测粘贴操作：

```javascript
editor.on('beforeChange', function (cm, change) {
    if (change.origin === 'paste') {
        change.cancel(); // 取消粘贴操作
        return editorPaste(null, change);
    }
});
```

本脚本优先通过`editor.replaceRange()`在当前光标或选区处插入内容；没有可用光标时回退到文末追加，从而绕过粘贴检测且不覆盖原有内容。

### UEditor编辑器（作业题）
超星平台通过监听UEditor的`beforepaste`事件来拦截粘贴：

```javascript
editor.addListener('beforepaste', function(o, html) {
    html.html = "";  // 清空粘贴内容
    $.toast({ type: 'notice', content: "只能录入不能粘贴！" });
    return false;
});
```

本脚本优先通过`editor.execCommand('insertHTML', htmlContent)`在当前光标处插入内容；没有可用光标时回退到`editor.setContent(htmlContent, true)`追加内容。

详细的技术分析和实现原理请参考：[超星平台代码粘贴限制的技术分析与绕过方案](https://zhuanlan.zhihu.com/p/1951953890875540004)

## 安装方法

### 1. 安装Tampermonkey
- [Chrome浏览器](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- [Firefox浏览器](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
- [Edge浏览器](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

### 2. 安装脚本
点击下面的链接自动安装：

**[从Greasy Fork安装](https://greasyfork.org/zh-CN/scripts/549900)**

或者其他安装方式：
- [从GitHub直接安装](https://raw.githubusercontent.com/MuQY1818/ChaoXing_Code_Paste/master/chaoxing-paste-helper.user.js)
- 手动安装：打开Tampermonkey管理面板 → 添加新脚本 → 复制粘贴脚本内容 → 保存并启用

## 使用方法

1. **打开作业页面**：进入超星网站的作业或考试页面。
2. **等待助手出现**：助手会自动检测编辑器，并显示在页面右上角。
3. **输入内容**：在悬浮窗文本框中输入要插入的内容（代码、作业答案等）。
4. **选择目标编辑器**：
   - 代码编辑器：代码题
   - 作业编辑器：简答题、填空题等
5. **一键插入**：点击"粘贴"按钮或使用快捷键 Ctrl+Enter；若编辑器中有光标，会插入到光标处，否则追加到末尾。
6. **有序上传图片**：点击"选择图片"批量选择图片，或将多张图片拖到助手拖拽区/作业编辑器中；脚本会按文件名自然排序后逐张上传并按顺序插入。
7. **保存提交**：内容插入或图片上传成功后，记得点击页面的"暂时保存"或"提交"按钮。

## 界面预览

<img width="1368" height="707" alt="image" src="https://github.com/user-attachments/assets/066e986e-8f64-4eeb-93ec-615a4cec6e91" />


## 兼容性

- 超星学习通平台 (*.chaoxing.com)
- 超星网站 (*.cx.com)
- 支持CodeMirror编辑器（代码题）
- 支持UEditor编辑器（作业题）
- Chrome、Firefox、Edge浏览器

## 安全说明

- 脚本在Tampermonkey沙盒环境中运行
- 数据仅保存在用户本地浏览器中
- 开源代码，可审计安全性
- 请遵守课程与平台规则，建议仅用于整理、调试和提交自己的内容

## 更新日志

### v1.3.1 (2026-06-15)
- 粘贴和图片插入优先使用编辑器当前光标或选区
- 未记录到可用光标时继续追加到答案末尾

### v1.3.0 (2026-06-11)
- 新增智能插入模式，CodeMirror和UEditor优先插入到光标处，无光标时追加到末尾
- 新增图片按文件名自然排序上传，支持`Docker (9).png`排在`Docker (10).png`前
- 支持从助手面板选择多张图片，或拖拽图片到助手/作业编辑器中有序插入
- 图片上传复用学习通原生上传接口，插入原生`ans-ued-img`图片HTML

### v1.2.2 (2025-12-03)
- 优化编辑器可见性检测，彻底解决隐藏编辑器误判问题
- 新增只读编辑器过滤，避免在查看模式下误触发
- 智能排除UEditor弹窗页面（如图片/附件上传），防止助手在弹窗中出现
- 性能优化，减少不必要的DOM操作

### v1.2.1 (2025-10-09)
- 修复粘贴后创建多余编辑器实例的问题
- 移除对textarea的独立检测（超星所有答题框都是UEditor）
- 改进编辑器检测逻辑，只显示已就绪的实例
- 不再调用可能创建新实例的页面函数

### v1.2.0 (2025-10-09)
- 支持UEditor富文本编辑器（作业题）
- 支持多种编辑器类型
- 脚本名称改为"超星粘贴助手"
- 改进的错误处理
- 更准确的编辑器分类显示

### v1.1.0 (2025-09-18)
- 智能显示/隐藏助手窗口
- 避免重复创建窗口
- 性能优化

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
