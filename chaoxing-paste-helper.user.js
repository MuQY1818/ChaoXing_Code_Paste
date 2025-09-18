// ==UserScript==
// @name         超星代码粘贴助手
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  绕过粘贴检测，智能显示/隐藏助手窗口，避免重复创建
// @author       muqy1818
// @match        *://*.chaoxing.com/*
// @match        *://*.cx.com/*
// @grant        none
// @license      MIT
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    let pasteHelper = null;
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let isInitialized = false; // 初始化状态标记

    // 等待页面加载完成，返回是否检测到编辑器
    function waitForCodeEditors() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 20; // 最多等待10秒

            const checkForEditors = () => {
                attempts++;

                // 减少日志输出频率，避免卡顿
                if (attempts % 5 === 0) {
                    console.log(`[代码助手] 第${attempts}次检测 codeEditors...`);
                }

                // 检查 codeEditors 是否存在且有内容
                if (typeof window.codeEditors !== 'undefined' && window.codeEditors) {
                    const editorKeys = Object.keys(window.codeEditors);
                    if (editorKeys.length > 0) {
                        console.log('[代码助手] CodeMirror编辑器检测成功，找到', editorKeys.length, '个编辑器');
                        resolve(true); // 找到编辑器
                        return;
                    }
                }

                if (attempts >= maxAttempts) {
                    console.log('[代码助手] 检测超时，未找到编辑器');
                    resolve(false); // 未找到编辑器
                    return;
                }

                setTimeout(checkForEditors, 500);
            };

            // 延迟启动，避免阻塞页面加载
            setTimeout(checkForEditors, 1000);
        });
    }

    // 创建样式
    function createStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .paste-helper-container {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 400px;
                background: #ffffff;
                border: 2px solid #4CAF50;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                z-index: 10000;
                font-family: Arial, sans-serif;
                font-size: 14px;
            }
            .paste-helper-header {
                background: #4CAF50;
                color: white;
                padding: 10px 15px;
                cursor: move;
                user-select: none;
                border-radius: 6px 6px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .paste-helper-title {
                font-weight: bold;
            }
            .paste-helper-minimize {
                background: none;
                border: none;
                color: white;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .paste-helper-minimize:hover {
                background: rgba(255,255,255,0.2);
                border-radius: 3px;
            }
            .paste-helper-content {
                padding: 15px;
                display: block;
            }
            .paste-helper-content.collapsed {
                display: none;
            }
            .paste-helper-textarea {
                width: 100%;
                height: 150px;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                resize: vertical;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                font-size: 12px;
                box-sizing: border-box;
            }
            .paste-helper-controls {
                margin-top: 10px;
                display: flex;
                gap: 10px;
                align-items: center;
            }
            .paste-helper-select {
                padding: 5px 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                background: white;
            }
            .paste-helper-button {
                padding: 8px 15px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: bold;
            }
            .paste-helper-button.primary {
                background: #4CAF50;
                color: white;
            }
            .paste-helper-button.secondary {
                background: #f44336;
                color: white;
            }
            .paste-helper-button:hover {
                opacity: 0.9;
            }
            .paste-helper-status {
                margin-top: 8px;
                padding: 5px;
                font-size: 11px;
                color: #666;
                background: #f5f5f5;
                border-radius: 3px;
            }
            .paste-helper-info {
                margin-bottom: 10px;
                font-size: 12px;
                color: #666;
            }
        `;
        document.head.appendChild(style);
    }

    // 创建主界面
    function createPasteHelper() {
        const container = document.createElement('div');
        container.className = 'paste-helper-container';

        // 从localStorage恢复位置
        const savedPosition = localStorage.getItem('paste-helper-position');
        if (savedPosition) {
            const pos = JSON.parse(savedPosition);
            container.style.top = pos.top + 'px';
            container.style.right = pos.right + 'px';
        }

        container.innerHTML = `
            <div class="paste-helper-header">
                <span class="paste-helper-title">代码粘贴助手</span>
                <button class="paste-helper-minimize" title="最小化">−</button>
            </div>
            <div class="paste-helper-content">
                <div class="paste-helper-info">
                    检测到编辑器: <span id="editor-count">0</span> 个
                </div>
                <textarea class="paste-helper-textarea" placeholder="在此输入要粘贴的代码..."></textarea>
                <div class="paste-helper-controls">
                    <label>选择编辑器:</label>
                    <select class="paste-helper-select">
                        <option value="">请选择编辑器</option>
                    </select>
                    <button class="paste-helper-button primary">粘贴</button>
                    <button class="paste-helper-button secondary">清空</button>
                </div>
                <div class="paste-helper-status">就绪</div>
            </div>
        `;

        document.body.appendChild(container);
        return container;
    }

    // 更新编辑器列表
    function updateEditorList() {
        let editorKeys = [];

        // 检测编辑器
        if (typeof window.codeEditors !== 'undefined' && window.codeEditors) {
            editorKeys = Object.keys(window.codeEditors);
            console.log('[代码助手] 更新编辑器列表:', editorKeys);
        }

        // 处理编辑器数量变化
        if (editorKeys.length === 0) {
            // 没有编辑器时隐藏窗口
            if (pasteHelper) {
                hideHelper();
            }
            return;
        } else {
            // 有编辑器时确保窗口可见
            if (!pasteHelper) {
                createHelperIfNeeded();
            } else {
                showHelper();
            }
        }

        // 更新UI
        const select = pasteHelper.querySelector('.paste-helper-select');
        const countSpan = pasteHelper.querySelector('#editor-count');

        if (!select || !countSpan) return;

        // 清空现有选项
        select.innerHTML = '<option value="">请选择编辑器</option>';

        // 添加编辑器选项
        editorKeys.forEach((key, index) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `编辑器 ${index + 1} (${key})`;
            select.appendChild(option);
        });

        countSpan.textContent = editorKeys.length;

        // 如果只有一个编辑器，自动选择
        if (editorKeys.length === 1) {
            select.value = editorKeys[0];
        }
    }

    // 粘贴代码到编辑器
    function pasteCode() {
        const textarea = pasteHelper.querySelector('.paste-helper-textarea');
        const select = pasteHelper.querySelector('.paste-helper-select');
        const status = pasteHelper.querySelector('.paste-helper-status');

        const code = textarea.value.trim();
        const selectedEditor = select.value;

        if (!code) {
            status.textContent = '请输入要粘贴的代码';
            status.style.color = '#f44336';
            return;
        }

        if (!selectedEditor) {
            status.textContent = '请选择目标编辑器';
            status.style.color = '#f44336';
            return;
        }

        if (typeof window.codeEditors === 'undefined' || !window.codeEditors[selectedEditor]) {
            status.textContent = '目标编辑器不存在';
            status.style.color = '#f44336';
            return;
        }

        try {
            const editor = window.codeEditors[selectedEditor];
            console.log('[代码助手] 开始粘贴代码到编辑器:', selectedEditor);
            console.log('[代码助手] 编辑器对象:', editor);
            console.log('[代码助手] 代码长度:', code.length);

            if (!editor || typeof editor.setValue !== 'function') {
                throw new Error('编辑器对象无效或缺少setValue方法');
            }

            // 使用setValue方法绕过粘贴检测
            editor.setValue(code);

            status.textContent = `代码已成功粘贴到编辑器 ${selectedEditor}`;
            status.style.color = '#4CAF50';

            console.log('[代码助手] 代码粘贴成功');

            // 保存代码到localStorage
            localStorage.setItem('paste-helper-last-code', code);
        } catch (error) {
            console.error('[代码助手] 粘贴失败:', error);
            status.textContent = '粘贴失败: ' + error.message;
            status.style.color = '#f44336';
        }
    }

    // 清空文本框
    function clearCode() {
        const textarea = pasteHelper.querySelector('.paste-helper-textarea');
        const status = pasteHelper.querySelector('.paste-helper-status');

        textarea.value = '';
        status.textContent = '已清空';
        status.style.color = '#666';
    }

    // 设置拖拽功能
    function setupDragging() {
        const header = pasteHelper.querySelector('.paste-helper-header');

        header.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('paste-helper-minimize')) return;

            isDragging = true;
            const rect = pasteHelper.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;

            document.addEventListener('mousemove', handleDrag);
            document.addEventListener('mouseup', handleDragEnd);

            e.preventDefault();
        });
    }

    function handleDrag(e) {
        if (!isDragging) return;

        const x = e.clientX - dragOffset.x;
        const y = e.clientY - dragOffset.y;

        pasteHelper.style.left = Math.max(0, Math.min(window.innerWidth - pasteHelper.offsetWidth, x)) + 'px';
        pasteHelper.style.top = Math.max(0, Math.min(window.innerHeight - pasteHelper.offsetHeight, y)) + 'px';
        pasteHelper.style.right = 'auto';
    }

    function handleDragEnd() {
        if (isDragging) {
            isDragging = false;
            document.removeEventListener('mousemove', handleDrag);
            document.removeEventListener('mouseup', handleDragEnd);

            // 保存位置
            const rect = pasteHelper.getBoundingClientRect();
            const position = {
                top: rect.top,
                right: window.innerWidth - rect.right
            };
            localStorage.setItem('paste-helper-position', JSON.stringify(position));
        }
    }

    // 设置事件监听器
    function setupEventListeners() {
        // 粘贴按钮
        const pasteBtn = pasteHelper.querySelector('.paste-helper-button.primary');
        pasteBtn.addEventListener('click', pasteCode);

        // 清空按钮
        const clearBtn = pasteHelper.querySelector('.paste-helper-button.secondary');
        clearBtn.addEventListener('click', clearCode);

        // 最小化按钮
        const minimizeBtn = pasteHelper.querySelector('.paste-helper-minimize');
        const content = pasteHelper.querySelector('.paste-helper-content');
        let isMinimized = false;

        minimizeBtn.addEventListener('click', () => {
            isMinimized = !isMinimized;
            content.classList.toggle('collapsed', isMinimized);
            minimizeBtn.textContent = isMinimized ? '+' : '−';
            minimizeBtn.title = isMinimized ? '展开' : '最小化';
        });

        // 快捷键支持
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                const textarea = pasteHelper.querySelector('.paste-helper-textarea');
                if (document.activeElement === textarea) {
                    pasteCode();
                    e.preventDefault();
                }
            }
        });

        // 编辑器选择变化时重置状态
        const select = pasteHelper.querySelector('.paste-helper-select');
        select.addEventListener('change', () => {
            const status = pasteHelper.querySelector('.paste-helper-status');
            status.textContent = '就绪';
            status.style.color = '#666';
        });
    }

    // 恢复上次的代码
    function restoreLastCode() {
        const lastCode = localStorage.getItem('paste-helper-last-code');
        if (lastCode) {
            const textarea = pasteHelper.querySelector('.paste-helper-textarea');
            textarea.value = lastCode;
        }
    }

    // 窗口管理函数
    function showHelper() {
        if (pasteHelper) {
            pasteHelper.style.display = 'block';
            console.log('[代码助手] 显示助手窗口');
        }
    }

    function hideHelper() {
        if (pasteHelper) {
            pasteHelper.style.display = 'none';
            console.log('[代码助手] 隐藏助手窗口');
        }
    }

    function removeHelper() {
        if (pasteHelper) {
            pasteHelper.remove();
            pasteHelper = null;
            console.log('[代码助手] 移除助手窗口');
        }
    }

    function createHelperIfNeeded() {
        if (!pasteHelper) {
            createStyles();
            pasteHelper = createPasteHelper();
            setupDragging();
            setupEventListeners();
            restoreLastCode();
            console.log('[代码助手] 创建助手窗口');
        }
        showHelper();
    }

    // 监听页面变化，更新编辑器列表（防抖处理）
    function setupMutationObserver() {
        let updateTimeout;

        const observer = new MutationObserver(() => {
            // 防抖处理，避免频繁更新
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }
            updateTimeout = setTimeout(() => {
                updateEditorList();
            }, 1000); // 1秒后更新
        });

        observer.observe(document.body, {
            childList: true,
            subtree: false // 只监听直接子元素变化
        });

        return observer;
    }

    // 初始化
    async function init() {
        try {
            // 避免重复初始化
            if (isInitialized) {
                console.log('[代码助手] 已经初始化过，跳过重复初始化');
                return;
            }

            console.log('[代码助手] 开始初始化...');

            // 等待编辑器加载
            const hasEditors = await waitForCodeEditors();

            if (hasEditors) {
                // 只在检测到编辑器时才创建界面
                createHelperIfNeeded();
                updateEditorList();
                setupMutationObserver();

                console.log('[代码助手] 超星代码粘贴助手已成功加载');

                // 定期更新编辑器列表（降低频率）
                setInterval(() => {
                    updateEditorList();
                }, 5000);
            } else {
                console.log('[代码助手] 当前页面无编辑器，等待后续检测');
                // 启动监听器，等待编辑器出现
                setupMutationObserver();
            }

            isInitialized = true;

        } catch (error) {
            console.error('[代码助手] 初始化失败:', error);
        }
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();