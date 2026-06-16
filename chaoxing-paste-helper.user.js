// ==UserScript==
// @name         超星粘贴助手
// @namespace    http://tampermonkey.net/
// @version      1.3.1
// @description  绕过粘贴检测，支持代码题(CodeMirror)和作业题(UEditor)
// @author       muqy1818
// @match        *://*.chaoxing.com/*
// @match        *://*.cx.com/*
// @grant        none
// @license      MIT
// @run-at       document-idle
// @homepage     https://github.com/muqy1818/ChaoXing_Code
// @supportURL   https://github.com/muqy1818/ChaoXing_Code/issues
// ==/UserScript==

(function() {
    'use strict';

    let pasteHelper = null;
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    const orderedImageDropDocs = new WeakSet();
    const editorCursorListeners = new Set();
    const editorCursorState = new Map();
    const imageNameCollator = new Intl.Collator('zh-CN', {
        numeric: true,
        sensitivity: 'variant'
    });
    const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
    let isInitialized = false; // 初始化状态标记

    // 等待页面加载完成，返回是否检测到编辑器
    function waitForEditors() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 20; // 最多等待10秒

            const checkForEditors = () => {
                attempts++;

                // 减少日志输出频率，避免卡顿
                if (attempts % 5 === 0) {
                    console.log(`[粘贴助手] 第${attempts}次检测编辑器...`);
                }

                let hasEditor = false;

                // 检查 CodeMirror 编辑器
                if (typeof window.codeEditors !== 'undefined' && window.codeEditors) {
                    const editorKeys = Object.keys(window.codeEditors);
                    if (editorKeys.length > 0) {
                        console.log('[粘贴助手] 检测到CodeMirror编辑器:', editorKeys.length, '个');
                        hasEditor = true;
                    }
                }

                // 检查 UEditor 编辑器
                if (typeof window.UE !== 'undefined' && window.UE.instants) {
                    const ueKeys = Object.keys(window.UE.instants);
                    let validCount = 0;
                    ueKeys.forEach(key => {
                        const editor = window.UE.instants[key];
                        if (editor && editor.ready) {
                            // 检查编辑器是否可见
                            // 必须有容器，且容器有尺寸
                            if (!editor.container || (editor.container.offsetWidth === 0 && editor.container.offsetHeight === 0)) {
                                return;
                            }
                            validCount++;
                        }
                    });
                    if (validCount > 0) {
                        console.log('[粘贴助手] 检测到UEditor编辑器:', validCount, '个');
                        hasEditor = true;
                    }
                }

                // 注意: 不检测textarea，因为超星的答题框都是UEditor接管的
                // textarea只是占位元素，会被UEditor初始化为富文本编辑器

                if (hasEditor) {
                    resolve(true);
                    return;
                }

                if (attempts >= maxAttempts) {
                    console.log('[粘贴助手] 检测超时，未找到编辑器');
                    resolve(false);
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
            .paste-helper-image-panel {
                margin-top: 12px;
                padding-top: 10px;
                border-top: 1px solid #eee;
            }
            .paste-helper-image-row {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
            }
            .paste-helper-image-title {
                flex: 1;
                font-size: 12px;
                color: #333;
                font-weight: bold;
            }
            .paste-helper-button.image {
                background: #2196F3;
                color: white;
            }
            .paste-helper-image-input {
                display: none;
            }
            .paste-helper-dropzone {
                padding: 10px;
                border: 1px dashed #9cc8f5;
                border-radius: 4px;
                background: #f7fbff;
                color: #4a6f95;
                font-size: 12px;
                text-align: center;
                user-select: none;
            }
            .paste-helper-dropzone.dragover {
                border-color: #2196F3;
                background: #eaf4ff;
                color: #0d65b7;
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
                <span class="paste-helper-title">超星粘贴助手</span>
                <button class="paste-helper-minimize" title="最小化">−</button>
            </div>
            <div class="paste-helper-content">
                <div class="paste-helper-info">
                    检测到编辑器: <span id="editor-count">0</span> 个
                </div>
                <textarea class="paste-helper-textarea" placeholder="在此输入要粘贴的内容(代码/作业答案等)..."></textarea>
                <div class="paste-helper-controls">
                    <label>选择编辑器:</label>
                    <select class="paste-helper-select">
                        <option value="">请选择编辑器</option>
                    </select>
                    <button class="paste-helper-button primary">粘贴</button>
                    <button class="paste-helper-button secondary">清空</button>
                </div>
                <div class="paste-helper-image-panel">
                    <div class="paste-helper-image-row">
                        <span class="paste-helper-image-title">图片按文件名自然排序上传</span>
                        <button class="paste-helper-button image" type="button">选择图片</button>
                        <input class="paste-helper-image-input" type="file" accept=".jpg,.jpeg,.png,.gif,image/jpeg,image/png,image/gif" multiple>
                    </div>
                    <div class="paste-helper-dropzone">也可以把多张图片拖到这里</div>
                </div>
                <div class="paste-helper-status">就绪</div>
            </div>
        `;

        document.body.appendChild(container);
        return container;
    }

    // 更新编辑器列表
    function updateEditorList() {
        let allEditors = [];

        // 检测 CodeMirror 编辑器
        if (typeof window.codeEditors !== 'undefined' && window.codeEditors) {
            const cmKeys = Object.keys(window.codeEditors);
            cmKeys.forEach(key => {
                allEditors.push({
                    type: 'codemirror',
                    id: key,
                    name: `代码编辑器 (${key})`
                });
            });
            console.log('[粘贴助手] 检测到CodeMirror编辑器:', cmKeys.length, '个');
        }

        // 检测 UEditor 编辑器
        if (typeof window.UE !== 'undefined' && window.UE.instants) {
            const ueKeys = Object.keys(window.UE.instants);
            ueKeys.forEach(key => {
                const editor = window.UE.instants[key];
                // 只添加有效的编辑器实例
                if (editor && editor.ready) {
                    // 检查编辑器是否可见
                    // 必须有容器，且容器有尺寸
                    if (!editor.container || (editor.container.offsetWidth === 0 && editor.container.offsetHeight === 0)) {
                        return;
                    }

                    // 检查是否为只读编辑器
                    if (editor.options && editor.options.readonly) {
                        return;
                    }
                    if (editor.body && editor.body.getAttribute('contenteditable') === 'false') {
                        return;
                    }

                    allEditors.push({
                        type: 'ueditor',
                        id: key,
                        name: `作业编辑器 (${key})`
                    });
                }
            });
            console.log('[粘贴助手] 检测到UEditor编辑器:', ueKeys.length, '个');
        }

        // 注意: 超星的所有答题框都是UEditor，不存在纯textarea
        // textarea元素只是占位符，会被UEditor接管并隐藏

        // 处理编辑器数量变化
        if (allEditors.length === 0) {
            if (pasteHelper) {
                hideHelper();
            }
            return;
        } else {
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
        allEditors.forEach((editor, index) => {
            const option = document.createElement('option');
            option.value = JSON.stringify({ type: editor.type, id: editor.id });
            option.textContent = editor.name;
            select.appendChild(option);
        });

        countSpan.textContent = allEditors.length;

        // 如果只有一个编辑器，自动选择
        if (allEditors.length === 1) {
            select.value = JSON.stringify({ type: allEditors[0].type, id: allEditors[0].id });
        }

        setupOrderedImageDropHandlers(allEditors);
        setupEditorCursorTracking(allEditors);
    }

    function setHelperStatus(message, color) {
        if (!pasteHelper) return;
        const status = pasteHelper.querySelector('.paste-helper-status');
        if (!status) return;
        status.textContent = message;
        status.style.color = color || '#666';
    }

    function getSelectedEditorInfo() {
        if (!pasteHelper) return null;
        const select = pasteHelper.querySelector('.paste-helper-select');
        if (!select || !select.value) return null;

        try {
            return JSON.parse(select.value);
        } catch (e) {
            return null;
        }
    }

    function setSelectedEditorInfo(editorInfo) {
        if (!pasteHelper || !editorInfo) return;
        const select = pasteHelper.querySelector('.paste-helper-select');
        if (!select) return;

        const value = JSON.stringify({ type: editorInfo.type, id: editorInfo.id });
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === value) {
                select.value = value;
                return;
            }
        }
    }

    function getEditorFromInfo(editorInfo) {
        if (!editorInfo) return null;

        if (editorInfo.type === 'ueditor') {
            if (typeof window.UE === 'undefined' || !window.UE.instants) return null;
            return window.UE.instants[editorInfo.id] || null;
        }

        if (editorInfo.type === 'codemirror') {
            if (typeof window.codeEditors === 'undefined') return null;
            return window.codeEditors[editorInfo.id] || null;
        }

        return null;
    }

    function getEditorKey(editorInfo) {
        return editorInfo ? `${editorInfo.type}:${editorInfo.id}` : '';
    }

    function rememberEditorCursor(editorInfo, cursorData) {
        const key = getEditorKey(editorInfo);
        if (!key) return;
        editorCursorState.set(key, cursorData || true);
    }

    function rememberCodeMirrorCursor(editorInfo, editor) {
        if (!editor || typeof editor.getCursor !== 'function') return;

        try {
            const from = editor.getCursor('from');
            const to = editor.getCursor('to');
            rememberEditorCursor(editorInfo, { from, to });
        } catch (e) {
            rememberEditorCursor(editorInfo, true);
        }
    }

    function rememberUEditorCursor(editorInfo, editor) {
        if (!editor) return;

        try {
            if (editor.selection && typeof editor.selection.getRange === 'function') {
                const range = editor.selection.getRange();
                if (range && typeof range.cloneRange === 'function') {
                    rememberEditorCursor(editorInfo, range.cloneRange());
                    return;
                }
            }
        } catch (e) {
            // 光标记录失败时仍保留一个可用标记，后续由UEditor自行使用当前selection。
        }

        rememberEditorCursor(editorInfo, true);
    }

    function setupEditorCursorTracking(allEditors) {
        allEditors.forEach(editorInfo => {
            const key = getEditorKey(editorInfo);
            if (!key || editorCursorListeners.has(key)) return;

            const editor = getEditorFromInfo(editorInfo);
            if (!editor) return;

            if (editorInfo.type === 'codemirror') {
                const remember = () => rememberCodeMirrorCursor(editorInfo, editor);
                if (typeof editor.on === 'function') {
                    editor.on('cursorActivity', remember);
                    editor.on('focus', remember);
                    editorCursorListeners.add(key);
                }
                return;
            }

            if (editorInfo.type === 'ueditor') {
                const remember = () => rememberUEditorCursor(editorInfo, editor);
                if (typeof editor.addListener === 'function') {
                    editor.addListener('selectionchange', remember);
                    editor.addListener('focus', remember);
                    editorCursorListeners.add(key);
                }

                if (editor.body && !editorCursorListeners.has(`${key}:body`)) {
                    ['mouseup', 'keyup', 'focus'].forEach(eventName => {
                        editor.body.addEventListener(eventName, remember, true);
                    });
                    editorCursorListeners.add(`${key}:body`);
                }
            }
        });
    }

    function isUsableUEditor(editor) {
        if (!editor || typeof editor.setContent !== 'function') return false;
        if (editor.options && editor.options.readonly) return false;
        if (editor.body && editor.body.getAttribute('contenteditable') === 'false') return false;
        return true;
    }

    function getImageTargetEditor(preferredEditorInfo) {
        const selectedInfo = preferredEditorInfo || getSelectedEditorInfo();
        const selectedEditor = getEditorFromInfo(selectedInfo);

        if (selectedInfo && selectedInfo.type === 'ueditor' && isUsableUEditor(selectedEditor)) {
            return { info: selectedInfo, editor: selectedEditor };
        }

        if (typeof window.UE === 'undefined' || !window.UE.instants) {
            return null;
        }

        const editors = Object.keys(window.UE.instants)
            .map(id => ({ info: { type: 'ueditor', id }, editor: window.UE.instants[id] }))
            .filter(item => isUsableUEditor(item.editor));

        return editors.length === 1 ? editors[0] : null;
    }

    function insertIntoCodeMirror(editorInfo, editor, content) {
        if (typeof editor.replaceRange === 'function' && typeof editor.getCursor === 'function') {
            const savedCursor = editorCursorState.get(getEditorKey(editorInfo));
            let from = null;
            let to = null;

            if (savedCursor && savedCursor.from && savedCursor.to) {
                from = savedCursor.from;
                to = savedCursor.to;
            } else if (typeof editor.hasFocus === 'function' && editor.hasFocus()) {
                from = editor.getCursor('from');
                to = editor.getCursor('to');
            }

            if (from && to) {
                editor.replaceRange(content, from, to);
                return;
            }
        }

        if (typeof editor.replaceRange === 'function' && typeof editor.posFromIndex === 'function' && typeof editor.getValue === 'function') {
            editor.replaceRange(content, editor.posFromIndex(editor.getValue().length));
        } else if (typeof editor.getValue === 'function') {
            editor.setValue(editor.getValue() + content);
        } else {
            editor.setValue(content);
        }
    }

    function insertHtmlIntoUEditor(editorInfo, editor, html) {
        const savedRange = editorCursorState.get(getEditorKey(editorInfo));

        try {
            if (savedRange && typeof savedRange.select === 'function') {
                savedRange.select();
            }
        } catch (e) {
            // 恢复失败时退回追加。
        }

        if (savedRange && typeof savedRange.select === 'function' && typeof editor.execCommand === 'function') {
            editor.execCommand('insertHTML', html);
        } else {
            editor.setContent(html, true);
        }

        notifyUEditorChanged(editor);
    }

    function getImageFiles(fileList) {
        return Array.from(fileList || []).filter(file => {
            if (!file) return false;
            const name = file.name || '';
            const type = file.type || '';
            return /\.(jpe?g|png|gif)$/i.test(name) || (!name && /^image\/(jpeg|png|gif)$/i.test(type));
        });
    }

    function sortFilesByNaturalName(files) {
        return files
            .map((file, index) => ({ file, index }))
            .sort((a, b) => {
                const byName = imageNameCollator.compare(a.file.name || '', b.file.name || '');
                return byName || (a.index - b.index);
            })
            .map(item => item.file);
    }

    function hasImageFileItems(dataTransfer) {
        if (!dataTransfer) return false;
        const items = Array.from(dataTransfer.items || []);
        if (items.length > 0) {
            return items.some(item => {
                if (item.kind !== 'file') return false;
                if (/^image\//i.test(item.type || '')) return true;

                const file = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
                return getImageFiles(file ? [file] : []).length > 0;
            });
        }
        return getImageFiles(dataTransfer.files).length > 0;
    }

    function getInputValue(id) {
        const input = document.getElementById(id);
        return input ? input.value : '';
    }

    function getOrderedImageUploadUrl(editor) {
        let uploadUrl = '';
        if (editor && typeof editor.getOpt === 'function') {
            uploadUrl = editor.getOpt('fileUrl') || editor.getOpt('imageUrl') || '';
        }
        if (!uploadUrl && window.UEDITOR_CONFIG) {
            uploadUrl = window.UEDITOR_CONFIG.fileUrl || window.UEDITOR_CONFIG.imageUrl || '';
        }
        if (!uploadUrl) {
            throw new Error('未找到学习通上传地址');
        }

        const url = new URL(uploadUrl, window.location.href);
        const params = {
            source: '1',
            enc2: getInputValue('uploadEnc') || window.uploadEnc,
            t: getInputValue('uploadTimeStamp') || window.currentTime,
            uid: getInputValue('userId') || window.uid
        };

        Object.keys(params).forEach(key => {
            if (params[key] && !url.searchParams.has(key)) {
                url.searchParams.set(key, params[key]);
            }
        });

        return url.toString();
    }

    function parseUploadResponse(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            throw new Error('上传响应不是有效 JSON');
        }
    }

    async function uploadImageFile(file, uploadUrl) {
        const formData = new FormData();
        formData.append('upfile', file, file.name);

        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        const text = await response.text();

        if (!response.ok) {
            throw new Error(`上传失败 HTTP ${response.status}`);
        }

        const result = parseUploadResponse(text);
        if (result.state !== 'SUCCESS') {
            throw new Error(result.message || result.state || '上传失败');
        }

        result.original = result.original || file.name;
        result.size = result.size || file.size;
        result.fileType = result.fileType || ((file.name.match(/\.[^.]+$/) || [''])[0]);
        return result;
    }

    function escapeAttr(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function getUploadedImageUrl(uploadResult) {
        const rawUrl = uploadResult.url || '';
        let objectId = uploadResult.objectId || uploadResult.objectid || '';
        const objectMatch = rawUrl.match(/[?&]objectId=([^&]+)/i) || rawUrl.match(/[?&]objectid=([^&]+)/i);
        const originMatch = rawUrl.match(/\/star3\/origin\/([^/?#]+)/i);

        if (!objectId && objectMatch) {
            objectId = decodeURIComponent(objectMatch[1]);
        }
        if (!objectId && originMatch) {
            objectId = decodeURIComponent(originMatch[1]);
        }
        if (objectId) {
            const purl = (window.ServerHost && window.ServerHost.purl) || 'https://p.ananas.chaoxing.com';
            return purl.replace(/\/$/, '') + '/star3/origin/' + encodeURIComponent(objectId);
        }
        if (/^https?:\/\//i.test(rawUrl)) {
            return rawUrl;
        }

        throw new Error('上传成功但未找到图片 objectId');
    }

    function buildImagesHtml(uploadResults) {
        return uploadResults
            .map(result => `<img class="ans-ued-img" src="${escapeAttr(getUploadedImageUrl(result))}">`)
            .join('');
    }

    function notifyUEditorChanged(editor) {
        try {
            if (editor && typeof editor.fireEvent === 'function') {
                editor.fireEvent('contentChange');
            }
        } catch (e) {
            console.warn('[粘贴助手] fireEvent失败:', e);
        }

        try {
            if (typeof window.answerContentChange === 'function') {
                window.answerContentChange();
            }
        } catch (e) {
            console.warn('[粘贴助手] 状态更新失败（不影响插入）:', e);
        }
    }

    function insertImagesToUEditor(editorInfo, editor, html) {
        if (typeof editor.focus === 'function') {
            editor.focus();
        }
        insertHtmlIntoUEditor(editorInfo, editor, html);
    }

    async function uploadOrderedImages(fileList, preferredEditorInfo) {
        const files = sortFilesByNaturalName(getImageFiles(fileList));
        if (files.length === 0) {
            setHelperStatus('请选择 JPG / PNG / GIF 图片文件', '#f44336');
            return;
        }

        const invalidFile = files.find(file => file.size <= 0 || file.size > MAX_IMAGE_SIZE);
        if (invalidFile) {
            setHelperStatus(`图片大小异常或超过 20MB: ${invalidFile.name}`, '#f44336');
            return;
        }

        const target = getImageTargetEditor(preferredEditorInfo);
        if (!target) {
            setHelperStatus('请先选择一个作业编辑器再上传图片', '#f44336');
            return;
        }

        setSelectedEditorInfo(target.info);
        rememberUEditorCursor(target.info, target.editor);

        try {
            const uploadUrl = getOrderedImageUploadUrl(target.editor);
            const results = [];

            for (let i = 0; i < files.length; i++) {
                setHelperStatus(`正在上传 ${i + 1}/${files.length}: ${files[i].name}`, '#2196F3');
                results.push(await uploadImageFile(files[i], uploadUrl));
            }

            insertImagesToUEditor(target.info, target.editor, buildImagesHtml(results));
            setHelperStatus(`已按文件名自然排序插入 ${files.length} 张图片`, '#4CAF50');
            console.log('[粘贴助手] 图片插入顺序:', files.map(file => file.name));
        } catch (error) {
            console.error('[粘贴助手] 图片上传失败:', error);
            setHelperStatus('图片上传失败: ' + error.message, '#f44336');
        }
    }

    function bindOrderedImageDrop(doc, editorInfo) {
        if (!doc || orderedImageDropDocs.has(doc)) return;
        orderedImageDropDocs.add(doc);

        doc.addEventListener('dragover', (e) => {
            if (pasteHelper && pasteHelper.contains(e.target)) return;
            if (!hasImageFileItems(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
        }, true);

        doc.addEventListener('drop', (e) => {
            if (pasteHelper && pasteHelper.contains(e.target)) return;
            const files = getImageFiles(e.dataTransfer && e.dataTransfer.files);
            if (files.length === 0) return;
            e.preventDefault();
            e.stopPropagation();
            uploadOrderedImages(files, editorInfo);
        }, true);
    }

    function setupOrderedImageDropHandlers(allEditors) {
        bindOrderedImageDrop(document, null);

        allEditors
            .filter(editorInfo => editorInfo.type === 'ueditor')
            .forEach(editorInfo => {
                const editor = getEditorFromInfo(editorInfo);
                const editorDoc = editor && (editor.document || (editor.body && editor.body.ownerDocument));
                bindOrderedImageDrop(editorDoc, editorInfo);
            });
    }

    // 粘贴内容到编辑器
    function pasteCode() {
        const textarea = pasteHelper.querySelector('.paste-helper-textarea');
        const select = pasteHelper.querySelector('.paste-helper-select');
        const status = pasteHelper.querySelector('.paste-helper-status');

        const content = textarea.value;
        const selectedEditorStr = select.value;

        if (!content) {
            status.textContent = '请输入要粘贴的内容';
            status.style.color = '#f44336';
            return;
        }

        if (!selectedEditorStr) {
            status.textContent = '请选择目标编辑器';
            status.style.color = '#f44336';
            return;
        }

        try {
            const editorInfo = JSON.parse(selectedEditorStr);
            const { type, id } = editorInfo;

            console.log('[粘贴助手] 开始粘贴到:', type, id);
            console.log('[粘贴助手] 内容长度:', content.length);

            let success = false;

            // 根据编辑器类型选择粘贴方法
            if (type === 'codemirror') {
                // CodeMirror 编辑器
                if (typeof window.codeEditors === 'undefined' || !window.codeEditors[id]) {
                    throw new Error('CodeMirror编辑器不存在');
                }
                const editor = window.codeEditors[id];
                if (!editor || typeof editor.setValue !== 'function') {
                    throw new Error('编辑器对象无效或缺少setValue方法');
                }
                insertIntoCodeMirror(editorInfo, editor, content);
                success = true;

            } else if (type === 'ueditor') {
                // UEditor 编辑器
                if (typeof window.UE === 'undefined' || !window.UE.instants || !window.UE.instants[id]) {
                    throw new Error('UEditor编辑器不存在');
                }
                const editor = window.UE.instants[id];
                if (!editor || typeof editor.setContent !== 'function') {
                    throw new Error('UEditor对象无效或缺少setContent方法');
                }

                // 使用setContent绕过粘贴检测
                const htmlContent = content
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
                insertHtmlIntoUEditor(editorInfo, editor, htmlContent);

                success = true;
            }

            if (success) {
                status.textContent = `内容已成功粘贴到 ${type === 'codemirror' ? '代码编辑器' : type === 'ueditor' ? '作业编辑器' : '答题框'}`;
                status.style.color = '#4CAF50';
                console.log('[粘贴助手] 粘贴成功');

                // 保存内容到localStorage
                localStorage.setItem('paste-helper-last-code', content);
            }

        } catch (error) {
            console.error('[粘贴助手] 粘贴失败:', error);
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

        const imageBtn = pasteHelper.querySelector('.paste-helper-button.image');
        const imageInput = pasteHelper.querySelector('.paste-helper-image-input');
        const dropzone = pasteHelper.querySelector('.paste-helper-dropzone');

        if (imageBtn && imageInput) {
            imageBtn.addEventListener('click', () => {
                imageInput.click();
            });

            imageInput.addEventListener('change', () => {
                uploadOrderedImages(imageInput.files);
                imageInput.value = '';
            });
        }

        if (dropzone) {
            dropzone.addEventListener('dragover', (e) => {
                if (!hasImageFileItems(e.dataTransfer)) return;
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('dragover');
                e.dataTransfer.dropEffect = 'copy';
            });

            dropzone.addEventListener('dragleave', () => {
                dropzone.classList.remove('dragover');
            });

            dropzone.addEventListener('drop', (e) => {
                const files = getImageFiles(e.dataTransfer && e.dataTransfer.files);
                if (files.length === 0) return;
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('dragover');
                uploadOrderedImages(files);
            });
        }

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
            console.log('[粘贴助手] 显示助手窗口');
        }
    }

    function hideHelper() {
        if (pasteHelper) {
            pasteHelper.style.display = 'none';
            console.log('[粘贴助手] 隐藏助手窗口');
        }
    }

    function removeHelper() {
        if (pasteHelper) {
            pasteHelper.remove();
            pasteHelper = null;
            console.log('[粘贴助手] 移除助手窗口');
        }
    }

    function createHelperIfNeeded() {
        if (!pasteHelper) {
            createStyles();
            pasteHelper = createPasteHelper();
            setupDragging();
            setupEventListeners();
            restoreLastCode();
            console.log('[粘贴助手] 创建助手窗口');
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
                console.log('[粘贴助手] 已经初始化过，跳过重复初始化');
                return;
            }

            // 检查窗口大小，如果太小（如在小的iframe中），则不初始化
            if (window.innerWidth < 300 || window.innerHeight < 300) {
                console.log('[粘贴助手] 窗口尺寸过小，跳过初始化');
                return;
            }

            // 检查URL，排除UEditor的弹窗页面（更宽松的匹配）
            const currentUrl = window.location.href;
            if (currentUrl.includes('/dialogs/') ||
                currentUrl.includes('image.html') ||
                currentUrl.includes('attachment.html') ||
                currentUrl.includes('video.html') ||
                currentUrl.includes('file.html')) {
                console.log('[粘贴助手] 检测到UEditor弹窗页面(URL)，跳过初始化');
                return;
            }

            // 检查是否加载了 UEditor 的 dialogs 内部脚本 (internal.js)
            // 这是最准确的判断方式，因为所有UEditor标准弹窗都会加载这个文件
            const scripts = document.getElementsByTagName('script');
            for (let i = 0; i < scripts.length; i++) {
                if (scripts[i].src && scripts[i].src.includes('internal.js')) {
                    console.log('[粘贴助手] 检测到 internal.js，判定为UEditor弹窗，跳过初始化');
                    return;
                }
            }

            // 检查 iframe ID (如果有权限访问)
            try {
                if (window.frameElement && window.frameElement.id && window.frameElement.id.startsWith('edui_iframe_')) {
                    console.log('[粘贴助手] 检测到UEditor iframe ID，跳过初始化');
                    return;
                }
            } catch (e) {
                // 忽略跨域错误
            }

            console.log('[粘贴助手] 开始初始化...');

            // 等待编辑器加载
            const hasEditors = await waitForEditors();

            if (hasEditors) {
                // 只在检测到编辑器时才创建界面
                createHelperIfNeeded();
                updateEditorList();
                setupMutationObserver();

                console.log('[粘贴助手] 超星粘贴助手已成功加载');

                // 定期更新编辑器列表（降低频率）
                setInterval(() => {
                    updateEditorList();
                }, 5000);
            } else {
                console.log('[粘贴助手] 当前页面无编辑器，等待后续检测');
                // 启动监听器，等待编辑器出现
                setupMutationObserver();
            }

            isInitialized = true;

        } catch (error) {
            console.error('[粘贴助手] 初始化失败:', error);
        }
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
