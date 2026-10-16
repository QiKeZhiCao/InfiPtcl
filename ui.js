// ui.js - UI 控制与事件绑定
(function() {
    // ====== 纹理 object URL 注册表（替换/重置/导入项目时统一 revoke，防累积泄漏）======
    window._textureURLRegistry = (() => {
        const urls = new Set();
        return {
            add(url) { if (url && url.indexOf('blob:') === 0) urls.add(url); },
            revoke() { urls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} }); urls.clear(); },
            size() { return urls.size; }
        };
    })();

    // ====== 面板拖拽调整宽度 ======
    const panel = document.querySelector('.control-panel');
    const tabs = document.querySelector('.panel-tabs');
    const handle = document.querySelector('.resize-handle');
    if (panel && handle) {
        let startX, startWidth;
        function onMouseMove(e) {
            const dx = e.clientX - startX;
            let newWidth = startWidth - dx;
            newWidth = Math.min(500, Math.max(320, newWidth));
            panel.style.width = newWidth + 'px';
            if (tabs) tabs.style.width = newWidth + 'px';
        }
        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.classList.remove('resizing');
            if (window._updateFusedNav) window._updateFusedNav();
        }
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startX = e.clientX;
            startWidth = panel.offsetWidth;
            document.body.classList.add('resizing');
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        const hSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        hSvg.setAttribute('class', 'handle-svg');
        hSvg.setAttribute('width', '100%');
        hSvg.setAttribute('height', '100%');
        handle.prepend(hSvg);
    }
    function initUI() {
        // 初始化随机模式为关闭
        window._randomRateMode = false;
        window._setRandomRateMode = function(enabled) {
            window._randomRateMode = enabled;
        };

        // 基本滑块绑定（同时绑定数值输入框）
        const mappings = [
            ['emitRate', 'emitRate', false],
            ['sizeMin', 'sizeMin', false],
            ['sizeMax', 'sizeMax', false],
            ['speedMin', 'speedMin', false],
            ['speedMax', 'speedMax', false],
            ['gravityX', 'gravityX', false],
            ['gravityY', 'gravityY', false],
            ['damping', 'damping', true],
            ['emitRadius', 'emitRadius', false],
            ['maxParticles', 'maxParticles', false]
        ];
        for (let [id, prop, isFloat] of mappings) {
            const slider = document.getElementById(id);
            const span = document.getElementById(id + 'Val');
            if (!slider) continue;
            
            const update = () => {
                let val = isFloat ? parseFloat(slider.value) : parseInt(slider.value);
                window._particleParams[prop] = val;
                if (span) span.value = isFloat ? val.toFixed(2) : val;
            };
            slider.addEventListener('input', update);
            
            // 数值输入框变化时同步
            if (span) {
                span.addEventListener('change', () => {
                    let val = isFloat ? parseFloat(span.value) : parseInt(span.value);
                    if (isNaN(val)) return;
                    val = Math.min(parseFloat(slider.max), Math.max(parseFloat(slider.min), val));
                    slider.value = val;
                    window._particleParams[prop] = val;
                    span.value = isFloat ? val.toFixed(2) : val;
                });
            }
            update();
        }

        // 范围参数绑定
        function bindRange(minId, maxId, paramMin, paramMax, isFloat, step) {
            const minSlider = document.getElementById(minId);
            const maxSlider = document.getElementById(maxId);
            const minSpan = document.getElementById(minId + 'Val');
            const maxSpan = document.getElementById(maxId + 'Val');
            if (!minSlider || !maxSlider) return;
            const sync = (source) => {
                let minVal = isFloat ? parseFloat(minSlider.value) : parseInt(minSlider.value);
                let maxVal = isFloat ? parseFloat(maxSlider.value) : parseInt(maxSlider.value);
                if (minVal > maxVal) {
                    if (source === 'min') {
                        maxVal = minVal;
                        maxSlider.value = maxVal;
                    } else {
                        minVal = maxVal;
                        minSlider.value = minVal;
                    }
                }
                window._particleParams[paramMin] = minVal;
                window._particleParams[paramMax] = maxVal;
                if (minSpan) minSpan.value = minVal;
                if (maxSpan) maxSpan.value = maxVal;
            };
            minSlider.addEventListener('input', () => sync('min'));
            maxSlider.addEventListener('input', () => sync('max'));
            if (minSpan) {
                minSpan.addEventListener('change', () => {
                    let v = isFloat ? parseFloat(minSpan.value) : parseInt(minSpan.value);
                    if (isNaN(v)) return;
                    v = Math.min(parseFloat(minSlider.max), Math.max(parseFloat(minSlider.min), v));
                    minSlider.value = v;
                    sync('min');
                });
            }
            if (maxSpan) {
                maxSpan.addEventListener('change', () => {
                    let v = isFloat ? parseFloat(maxSpan.value) : parseInt(maxSpan.value);
                    if (isNaN(v)) return;
                    v = Math.min(parseFloat(maxSlider.max), Math.max(parseFloat(maxSlider.min), v));
                    maxSlider.value = v;
                    sync('max');
                });
            }
            sync();
        }

        bindRange('fadeStartMin', 'fadeStartMax', 'fadeStartMin', 'fadeStartMax', true, 0.1);
        bindRange('fadeDurationMin', 'fadeDurationMax', 'fadeDurationMin', 'fadeDurationMax', true, 0.1);
        ['fadeStartMin', 'fadeStartMax', 'fadeDurationMin', 'fadeDurationMax'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => {
                if (window._refreshTotalDuration) window._refreshTotalDuration();
            });
        });
        bindRange('sizeMin', 'sizeMax', 'sizeMin', 'sizeMax', false, 1);
        bindRange('speedMin', 'speedMax', 'speedMin', 'speedMax', false, 5);

        // 旋转速度
        const rotSpeedMinSlider = document.getElementById('rotSpeedMin');
        const rotSpeedMaxSlider = document.getElementById('rotSpeedMax');
        const rotSpeedMinVal = document.getElementById('rotSpeedMinVal');
        const rotSpeedMaxVal = document.getElementById('rotSpeedMaxVal');
        if (rotSpeedMinSlider && rotSpeedMaxSlider) {
            const updateRotSpeed = (source) => {
                let minDeg = parseInt(rotSpeedMinSlider.value);
                let maxDeg = parseInt(rotSpeedMaxSlider.value);
                if (minDeg > maxDeg) {
                    if (source === 'min') {
                        maxDeg = minDeg;
                        rotSpeedMaxSlider.value = maxDeg;
                    } else {
                        minDeg = maxDeg;
                        rotSpeedMinSlider.value = minDeg;
                    }
                }
                window._particleParams.rotSpeedMin = minDeg * Math.PI / 180;
                window._particleParams.rotSpeedMax = maxDeg * Math.PI / 180;
                if (rotSpeedMinVal) rotSpeedMinVal.value = minDeg;
                if (rotSpeedMaxVal) rotSpeedMaxVal.value = maxDeg;
            };
            rotSpeedMinSlider.addEventListener('input', () => updateRotSpeed('min'));
            rotSpeedMaxSlider.addEventListener('input', () => updateRotSpeed('max'));
            if (rotSpeedMinVal) {
                rotSpeedMinVal.addEventListener('change', () => {
                    let v = parseInt(rotSpeedMinVal.value);
                    v = Math.min(parseInt(rotSpeedMinSlider.max), Math.max(parseInt(rotSpeedMinSlider.min), v));
                    rotSpeedMinSlider.value = v;
                    updateRotSpeed('min');
                });
            }
            if (rotSpeedMaxVal) {
                rotSpeedMaxVal.addEventListener('change', () => {
                    let v = parseInt(rotSpeedMaxVal.value);
                    v = Math.min(parseInt(rotSpeedMaxSlider.max), Math.max(parseInt(rotSpeedMaxSlider.min), v));
                    rotSpeedMaxSlider.value = v;
                    updateRotSpeed('max');
                });
            }
            updateRotSpeed();
        }

        // 单值角度
        const singleSliders = ['baseAngle', 'angleSpread', 'initRotAngle', 'initRotSpread'];
        singleSliders.forEach(id => {
            const slider = document.getElementById(id);
            const span = document.getElementById(id + 'Val');
            if (!slider) return;
            const update = () => {
                const val = parseInt(slider.value);
                window._particleParams[id] = val;
                if (span) span.value = val;
            };
            slider.addEventListener('input', update);
            if (span) {
                span.addEventListener('change', () => {
                    let v = parseInt(span.value);
                    v = Math.min(parseInt(slider.max), Math.max(parseInt(slider.min), v));
                    slider.value = v;
                    window._particleParams[id] = v;
                });
            }
            update();
        });

        // 背景色改色同步到整个绘制区域（画布容器留边同色，而非仅画布内部）
        window._setCanvasAreaBg = function(color) {
            const box = document.querySelector('.canvas-container');
            if (box) box.style.backgroundColor = color;
        };
        window._setCanvasAreaBg(window._particleParams.backgroundColor || '#000000');

        // 背景色
        const bgPreview = document.getElementById('bgPreview');
        if (bgPreview) {
            bgPreview.addEventListener('click', () => {
                if (window._openColorPicker) window._openColorPicker(bgPreview, {
                    initial: window._particleParams.backgroundColor || '#000000',
                    onPick: (c) => {
                        window._particleParams.backgroundColor = c;
                        bgPreview.style.backgroundColor = c;
                        if (window._setCanvasAreaBg) window._setCanvasAreaBg(c);
                    }
                });
            });
        }

        // 发射模式
        const followBtn = document.getElementById('followMouseBtn');
        const fixedBtn = document.getElementById('fixedModeBtn');
        const centerBtn = document.getElementById('centerPointBtn');
        if (followBtn && fixedBtn) {
            followBtn.classList.add('active');
            fixedBtn.classList.remove('active');
            if (centerBtn) centerBtn.style.display = 'none';
            followBtn.addEventListener('click', () => {
                window._particleFollowMouse = true;
                followBtn.classList.add('active');
                fixedBtn.classList.remove('active');
                if (centerBtn) centerBtn.style.display = 'none';
            });
            fixedBtn.addEventListener('click', () => {
                window._particleFollowMouse = false;
                fixedBtn.classList.add('active');
                followBtn.classList.remove('active');
                if (centerBtn) centerBtn.style.display = 'inline-block';
            });
        }
        if (centerBtn) {
            centerBtn.addEventListener('click', () => {
                const canvas = document.getElementById('particleCanvas');
                const L = window._getLogicalSize ? window._getLogicalSize() : { w: canvas.width, h: canvas.height };
                window._setEmitterPos(Math.round(L.w / 2), Math.round(L.h / 2));
            });
        }

        // 平移模式
        const panBtn = document.getElementById('panModeBtn');
        if (panBtn && window._setPanMode) {
            let panActive = false;
            panBtn.addEventListener('click', () => {
                panActive = !panActive;
                panBtn.classList.toggle('active', panActive);
                window._setPanMode(panActive);
            });
        }

        // 清除粒子
        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                window._clearParticles();
            });
        }

        // ---------- 画布宽高输入绑定 ----------
        const cwInput = document.getElementById('canvasWidth');
        const chInput = document.getElementById('canvasHeight');
        const canvasSizeAuto = document.getElementById('canvasSizeAutoBtn');
        function initCanvasSize() {
            const container = document.querySelector('.canvas-container');
            if (cwInput && container) cwInput.value = container.clientWidth;
            if (chInput && container) chInput.value = container.clientHeight;
            if (window._setAutoFit) window._setAutoFit(true);
            if (canvasSizeAuto) canvasSizeAuto.classList.add('active');
        }
        if (cwInput) {
            cwInput.addEventListener('input', () => {
                if (window._setAutoFit) window._setAutoFit(false);
                if (canvasSizeAuto) canvasSizeAuto.classList.remove('active');
                if (window._resizeCanvas) window._resizeCanvas();
            });
        }
        if (chInput) {
            chInput.addEventListener('input', () => {
                if (window._setAutoFit) window._setAutoFit(false);
                if (canvasSizeAuto) canvasSizeAuto.classList.remove('active');
                if (window._resizeCanvas) window._resizeCanvas();
            });
        }
        if (canvasSizeAuto) {
            canvasSizeAuto.addEventListener('click', () => {
                const active = canvasSizeAuto.classList.toggle('active');
                if (active) {
                    const container = document.querySelector('.canvas-container');
                    if (cwInput && container) cwInput.value = container.clientWidth;
                    if (chInput && container) chInput.value = container.clientHeight;
                    if (window._setAutoFit) window._setAutoFit(true);
                } else {
                    if (window._setAutoFit) window._setAutoFit(false);
                    if (window._resizeCanvas) window._resizeCanvas();
                }
            });
        }
        initCanvasSize();

        // 随机速率开关
        const randomRateSwitch = document.getElementById('randomRateSwitch');
        if (randomRateSwitch) {
            randomRateSwitch.checked = false;
            randomRateSwitch.addEventListener('change', (e) => {
                window._setRandomRateMode(e.target.checked);
            });
            window._setRandomRateMode(randomRateSwitch.checked);
        }

        // 纹理上传
        const textureUpload = document.getElementById('textureUpload');
        const textureFileNameSpan = document.getElementById('textureFileName');
        if (textureUpload) {
            // 判断文件是否为 gif/webp/apng 动图（PNG 需含 acTL chunk）
            async function looksAnimated(name, buf) {
                if (/\.(gif|webp|apng)$/i.test(name)) return true;
                if (!/\.png$/i.test(name)) return false;
                try {
                    const u8 = new Uint8Array(buf);
                    const dv = new DataView(u8.buffer, u8.byteOffset);
                    let o = 8;
                    while (o + 12 <= u8.length) {
                        const len = dv.getUint32(o, false);
                        const tag = String.fromCharCode(u8[o+4], u8[o+5], u8[o+6], u8[o+7]);
                        if (len < 0 || o + 12 + len > u8.length) break;
                        if (tag === 'acTL') return true;
                        o += 12 + len;
                    }
                } catch (e) {}
                return false;
            }
            // 用 WebCodecs ImageDecoder 分解动图帧
            async function splitAnimated(file, buf) {
                let mime;
                if (file.type === 'image/gif' || /\.gif$/i.test(file.name)) mime = 'image/gif';
                else if (/\.webp$/i.test(file.name)) mime = 'image/webp';
                else mime = 'image/apng';
                const dec = new ImageDecoder({ data: buf, type: mime });
                await dec.tracks.ready;
                const track = dec.tracks.selectedTrack;
                const count = track.frameCount;
                if (count <= 1) { dec.close(); return null; }
                const frames = [];
                const names = [];
                const durations = [];
                const isPngSrc = mime === 'image/apng';
                const frameMime = isPngSrc ? 'image/png' : 'image/webp';
                const frameExt = isPngSrc ? '.png' : '.webp';
                const base = file.name.replace(/\.(gif|webp|png|apng)$/i, '');
                for (let i = 0; i < count; i++) {
                    const { image } = await dec.decode({ frameIndex: i });
                    durations.push(image.duration || 0);
                    const c = document.createElement('canvas');
                    c.width = image.displayWidth;
                    c.height = image.displayHeight;
                    c.getContext('2d').drawImage(image, 0, 0);
                    if (image.close) image.close();
                    const img = new Image();
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = c.toDataURL(frameMime);
                    });
                    frames.push(img);
                    names.push(`${base}_${i + 1}${frameExt}`);
                }
                dec.close();
                let fps = 0;
                const validDurs = durations.filter(d => d > 0);
                if (validDurs.length > 0) {
                    const avgUs = validDurs.reduce((a, b) => a + b, 0) / validDurs.length;
                    fps = Math.round(1e6 / avgUs);
                    if (fps < 1) fps = 1;
                    if (fps > 120) fps = 120;
                }
                return { frames, names, count, fps };
            }
            // 从纹理单元数组派生扁平帧数组（供旧逻辑/导出兼容）
            function rebuildFlatFromUnits() {
                const units = window._textureUnits || [];
                const imgs = [];
                const fileNames = [];
                for (const u of units) {
                    for (let i = 0; i < u.frames.length; i++) {
                        imgs.push(u.frames[i]);
                        fileNames.push(u.frameNames ? u.frameNames[i] : (u.name + '_' + (i + 1)));
                    }
                }
                window._particleTextures = imgs;
                window._textureFileNames = fileNames;
            }
            window._rebuildFlatFromUnits = rebuildFlatFromUnits;
            // 导入纹理按钮旁显示的文件名：优先显示原始文件名（单元级），旧格式回退到帧名
            window._displayTextureNames = function() {
                const units = window._textureUnits || [];
                if (units.length > 0) return units.map(u => u.name || '纹理').join(', ');
                return (window._textureFileNames || []).join(', ');
            };
            textureUpload.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                if (files.length === 0) return;
                if (window._textureURLRegistry) window._textureURLRegistry.revoke();
                const units = [];
                let animSplitCount = 0;
                for (const file of files) {
                    const buf = await file.arrayBuffer();
                    if (typeof ImageDecoder !== 'undefined' && await looksAnimated(file.name, buf)) {
                        try {
                            const split = await splitAnimated(file, buf);
                            if (split) {
                                units.push({ name: file.name, isAnim: true, fps: split.fps || 0, anim: { mode: 2, fps: split.fps || 10 }, frames: split.frames, frameNames: split.names });
                                animSplitCount += split.count;
                                if (window.Toast) window.Toast.info(`已分解动图「${file.name}」为 ${split.count} 帧`);
                                continue;
                            }
                        } catch (err) {
                            console.warn('动图分解失败，按静态图处理：', file.name, err);
                        }
                    }
                    const img = new Image();
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        const texUrl = URL.createObjectURL(file);
                        if (window._textureURLRegistry) window._textureURLRegistry.add(texUrl);
                        img.src = texUrl;
                    });
                    units.push({ name: file.name, isAnim: false, fps: 0, anim: null, frames: [img], frameNames: [file.name] });
                }
                if (units.length === 0) return;
                window._textureUnits = units;
                window._selectedUnitIdx = null;
                const ue = document.getElementById('unitAnimEditor');
                if (ue) ue.style.display = 'none';
                rebuildFlatFromUnits();
                updateTextureOrderList();
                if (window._syncNoSmoothingVisibility) window._syncNoSmoothingVisibility();
                if (textureFileNameSpan) textureFileNameSpan.innerText = (window._displayTextureNames ? window._displayTextureNames() : (window._textureFileNames || []).join(', '));
                const allImgs = window._particleTextures || [];
                const maxDim = Math.max(allImgs[0].width, allImgs[0].height);
                let newMin = Math.min(80, Math.max(8, Math.floor(maxDim * 0.5)));
                let newMax = Math.min(120, Math.max(16, Math.floor(maxDim * 1.2)));
                if (newMin > newMax) newMin = newMax;
                window._particleParams.sizeMin = newMin;
                window._particleParams.sizeMax = newMax;
                const sizeMinSlider = document.getElementById('sizeMin');
                const sizeMinVal = document.getElementById('sizeMinVal');
                const sizeMaxSlider = document.getElementById('sizeMax');
                const sizeMaxVal = document.getElementById('sizeMaxVal');
                if (sizeMinSlider) sizeMinSlider.value = newMin;
                if (sizeMinVal) sizeMinVal.value = newMin;
                if (sizeMaxSlider) sizeMaxSlider.value = newMax;
                if (sizeMaxVal) sizeMaxVal.value = newMax;
            });
        }

        const resetTextureBtn = document.getElementById('resetTextureBtn');
        if (resetTextureBtn) {
            resetTextureBtn.addEventListener('click', () => {
                if (window._textureURLRegistry) window._textureURLRegistry.revoke();
                window._resetDefaultTexture();
                window._textureFileNames = [];
                window._textureUnits = [];
                window._selectedUnitIdx = null;
                const ue = document.getElementById('unitAnimEditor');
                if (ue) ue.style.display = 'none';
                updateTextureOrderList();
                if (textureFileNameSpan) textureFileNameSpan.innerText = '默认纹理（1张）';
                if (window._syncNoSmoothingVisibility) window._syncNoSmoothingVisibility();
            });
        }

        // ---- 图片动画模式 ----
        window._particleAnimMode = 0;
        window._particleAnimFps = 10;
        window._particleMultiTex = false;
        window._textureFileNames = [];
        window._textureUnits = [];

        const animModeSelect = document.getElementById('animModeSelect');
        const animGroup = document.getElementById('animGroup');
        const animFpsSlider = document.getElementById('animFps');
        const animFpsVal = document.getElementById('animFpsVal');

        if (animModeSelect) {
            function syncAnimMode() {
                window._particleAnimMode = parseInt(animModeSelect.value);
            }
            animModeSelect.addEventListener('change', syncAnimMode);
            syncAnimMode();
        }

        if (animFpsSlider && animFpsVal) {
            const updateAnimFps = () => {
                const v = parseInt(animFpsSlider.value);
                window._particleAnimFps = v;
                animFpsVal.value = v;
            };
            animFpsSlider.addEventListener('input', updateAnimFps);
            animFpsVal.addEventListener('change', () => {
                let v = parseInt(animFpsVal.value);
                v = Math.min(parseInt(animFpsSlider.max), Math.max(parseInt(animFpsSlider.min), v));
                animFpsSlider.value = v;
                window._particleAnimFps = v;
            });
            updateAnimFps();
        }

        const multiTexSwitch = document.getElementById('multiTexSwitch');
        if (multiTexSwitch) {
            const animModeRow = animModeSelect ? animModeSelect.closest('.param-row') : null;
            const animFpsRow = document.getElementById('animFpsRow');
            const unitAnimEditor = document.getElementById('unitAnimEditor');
            window._syncAnimControls = function() {
                const on = window._particleMultiTex;
                if (animModeRow) animModeRow.style.display = on ? 'none' : '';
                if (animFpsRow) animFpsRow.style.display = on ? 'none' : '';
                if (unitAnimEditor) {
                    if (on && window._selectedUnitIdx != null) {
                        const u = (window._textureUnits || [])[window._selectedUnitIdx];
                        unitAnimEditor.style.display = (u && u.isAnim) ? '' : 'none';
                    } else {
                        unitAnimEditor.style.display = 'none';
                    }
                }
            };
            window._setMultiTex = function(v) {
                window._particleMultiTex = !!v;
                multiTexSwitch.checked = !!v;
                if (window._syncAnimControls) window._syncAnimControls();
                updateTextureOrderList();
            };
            multiTexSwitch.addEventListener('change', () => {
                window._particleMultiTex = multiTexSwitch.checked;
                if (window._syncAnimControls) window._syncAnimControls();
                updateTextureOrderList();
            });
            multiTexSwitch.checked = !!window._particleMultiTex;
        }

        // Drag-reorder state (persists across updateTextureOrderList calls)
        let _dragFromIdx = -1;
        let _placeholderIdx = -1;
        let _overItem = false;

        function _resetDragState() {
            _placeholderIdx = -1;
            _dragFromIdx = -1;
            _overItem = false;
        }

        function updateTextureOrderList() {
            const container = document.getElementById('textureOrderList');
            if (!container) return;
            const multiTex = !!window._particleMultiTex;
            const units = window._textureUnits && window._textureUnits.length > 0 ? window._textureUnits : null;

            // 显示条件：有动画或多张图时才显示动画区
            let showGroup = false;
            if (units) {
                const hasAnim = units.some(u => u.isAnim);
                showGroup = hasAnim || units.length >= 2;
            } else if ((window._particleTextures || []).length >= 2) {
                showGroup = true;
            }
            if (!showGroup) {
                if (animGroup) animGroup.style.display = 'none';
                const tor = document.getElementById('textureOrderRow');
                if (tor) tor.style.display = 'none';
                return;
            }
            if (animGroup) animGroup.style.display = '';
            const tor = document.getElementById('textureOrderRow');
            if (tor) tor.style.display = '';
            const orderLabel = document.getElementById('textureOrderLabel');
            if (orderLabel) orderLabel.textContent = multiTex ? '预览' : '排序';

            // 构建显示条目
            // 多图开：每图一格；多图关：全部分解为帧，总格数 = 总帧数
            const items = [];
            const operateUnits = multiTex && !!units;
            if (operateUnits) {
                units.forEach((u, i) => {
                    items.push({ img: u.frames[0], name: u.name || `纹理${i + 1}`, isAnim: !!u.isAnim, frameCount: u.frames.length, unitIdx: i, unit: u });
                });
            } else if (units) {
                const flatNames = window._textureFileNames || [];
                let k = 0;
                units.forEach(u => {
                    for (let i = 0; i < u.frames.length; i++, k++) {
                        items.push({ img: u.frames[i], name: flatNames[k] || (u.frameNames ? u.frameNames[i] : (u.name + '_' + (i + 1))), isAnim: false, unit: null });
                    }
                });
            } else {
                const flat = window._particleTextures || [];
                const names = window._textureFileNames || [];
                for (let i = 0; i < flat.length; i++) items.push({ img: flat[i], name: names[i] || `纹理${i + 1}`, isAnim: false, unit: null });
            }

            container.innerHTML = '';

            // Add container drag handlers once
            if (!container._hasDragHandlers) {
                container._hasDragHandlers = true;

                container.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (_overItem) { _overItem = false; return; }
                    // Only enter gap mode if cursor is directly on container
                    if (e.target !== container) return;
                    if (_placeholderIdx === -1) return;
                    container.querySelector('.texture-order-placeholder')?.remove();
                    _placeholderIdx = -1;
                });

                container.addEventListener('dragleave', (e) => {
                    if (!container.contains(e.relatedTarget)) _resetDragState();
                });
            }

            items.forEach((it, i) => {
                const item = document.createElement('div');
                item.className = 'texture-order-item';
                item.draggable = !operateUnits;
                if (operateUnits) item.classList.add('preview-mode');
                item.dataset.index = i;

                const canvas = document.createElement('canvas');
                canvas.width = 80;
                canvas.height = 80;
                const c = canvas.getContext('2d');
                c.drawImage(it.img, 0, 0, 80, 80);
                const thumb = document.createElement('img');
                thumb.className = 'thumb';
                thumb.draggable = false;
                thumb.src = canvas.toDataURL();
                thumb.alt = '';

                const idxBadge = document.createElement('span');
                idxBadge.className = 'item-idx';
                idxBadge.textContent = (i + 1);

                const nameEl = document.createElement('span');
                nameEl.className = 'item-name';
                nameEl.textContent = it.name + (it.isAnim ? `（${it.frameCount}帧）` : '');

                item.appendChild(thumb);
                item.appendChild(idxBadge);
                item.appendChild(nameEl);

                if (operateUnits) {
                    if (window._selectedUnitIdx === it.unitIdx) item.classList.add('selected');
                    item.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleUnitSelect(it.unitIdx);
                    });
                }

                if (it.isAnim && operateUnits) {
                    const dot = document.createElement('span');
                    dot.className = 'item-select-dot';
                    dot.title = '点击选中/取消';
                    if (window._selectedUnitIdx === it.unitIdx) dot.classList.add('active');
                    dot.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleUnitSelect(it.unitIdx);
                    });
                    item.appendChild(dot);
                }

                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    _dragFromIdx = i;
                    item.classList.add('dragging');
                    requestAnimationFrame(() => { item.style.display = 'none'; });
                });

                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    _overItem = true;
                    _placeholderIdx = i;

                    let ph = container.querySelector('.texture-order-placeholder');
                    if (!ph) {
                        ph = document.createElement('div');
                        ph.className = 'texture-order-placeholder';
                        container.appendChild(ph);
                    }
                    const iRect = item.getBoundingClientRect();
                    const cRect = container.getBoundingClientRect();
                    const sTop = container.scrollTop;
                    const sLeft = container.scrollLeft;
                    ph.style.cssText = `left:${iRect.left - cRect.left + sLeft}px;top:${iRect.top - cRect.top + sTop}px;width:${iRect.width}px;height:${iRect.height}px`;
                });

                item.addEventListener('dragleave', (e) => {
                    if (!container.contains(e.relatedTarget)) _resetDragState();
                });

                item.addEventListener('drop', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (_placeholderIdx >= 0 && _dragFromIdx >= 0) {
                        if (operateUnits) {
                            const [moved] = units.splice(_dragFromIdx, 1);
                            const targetIdx = _dragFromIdx < _placeholderIdx ? _placeholderIdx - 1 : _placeholderIdx;
                            units.splice(targetIdx, 0, moved);
                            window._textureUnits = units;
                            if (window._rebuildFlatFromUnits) window._rebuildFlatFromUnits();
                        } else {
                            const flat = window._particleTextures || [];
                            const nameArr = window._textureFileNames || [];
                            const [movedImg] = flat.splice(_dragFromIdx, 1);
                            const [movedName] = nameArr.splice(_dragFromIdx, 1);
                            const targetIdx = _dragFromIdx < _placeholderIdx ? _placeholderIdx - 1 : _placeholderIdx;
                            flat.splice(targetIdx, 0, movedImg);
                            nameArr.splice(targetIdx, 0, movedName);
                            window._particleTextures = flat;
                            window._textureFileNames = nameArr;
                        }
                    }
                    _resetDragState();
                    updateTextureOrderList();
                });

                item.addEventListener('dragend', () => {
                    _resetDragState();
                    updateTextureOrderList();
                });

                container.appendChild(item);
            });
        }

        // ---- 选中单元动画编辑 ----
        window._selectedUnitIdx = null;
        const unitAnimEditor = document.getElementById('unitAnimEditor');
        const unitAnimTarget = document.getElementById('unitAnimTarget');
        const unitAnimModeSelect = document.getElementById('unitAnimModeSelect');
        const unitAnimFpsSlider = document.getElementById('unitAnimFps');
        const unitAnimFpsVal = document.getElementById('unitAnimFpsVal');

        function fillUnitTarget(i) {
            const units = window._textureUnits || [];
            const animUnits = [];
            units.forEach((u, idx) => {
                if (u.isAnim) animUnits.push({ idx, label: (u.name || `纹理${idx + 1}`) + `（${u.frames.length}帧）` });
            });
            if (unitAnimTarget) {
                unitAnimTarget.innerHTML = '';
                animUnits.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.idx;
                    opt.textContent = u.label;
                    unitAnimTarget.appendChild(opt);
                });
                if (i >= 0) unitAnimTarget.value = i;
                if (window.StepperSelect) window.StepperSelect.rebuild('unitAnimTarget');
            }
        }

        function toggleUnitSelect(idx) {
            const units = window._textureUnits || [];
            if (idx < 0 || idx >= units.length) return;
            if (window._selectedUnitIdx === idx) {
                window._selectedUnitIdx = null;
                unitAnimEditor.style.display = 'none';
                if (window._syncAnimControls) window._syncAnimControls();
                updateTextureOrderList();
                return;
            }
            const unit = units[idx];
            if (unit.isAnim) {
                selectUnitAnim(idx);
            } else {
                window._selectedUnitIdx = idx;
                unitAnimEditor.style.display = 'none';
                if (window._syncAnimControls) window._syncAnimControls();
                updateTextureOrderList();
            }
        }

        window.selectUnitAnim = function(i) {
            const units = window._textureUnits || [];
            if (!unitAnimEditor || i < 0 || i >= units.length) return;
            const unit = units[i];
            if (!unit.isAnim) return;
            window._selectedUnitIdx = i;
            const anim = unit.anim || { mode: 2, fps: unit.fps || 10 };
            unit.anim = anim;
            fillUnitTarget(i);
            if (unitAnimModeSelect) unitAnimModeSelect.value = anim.mode;
            if (window.StepperSelect) window.StepperSelect.rebuild('unitAnimModeSelect');
            if (unitAnimFpsSlider) unitAnimFpsSlider.value = anim.fps;
            if (unitAnimFpsVal) unitAnimFpsVal.value = anim.fps;
            unitAnimEditor.style.display = '';
            if (window._syncAnimControls) window._syncAnimControls();
            updateTextureOrderList();
        };

        if (unitAnimTarget) {
            unitAnimTarget.addEventListener('change', () => {
                const idx = parseInt(unitAnimTarget.value);
                if (!isNaN(idx)) selectUnitAnim(idx);
            });
        }

        if (unitAnimModeSelect) {
            unitAnimModeSelect.addEventListener('change', () => {
                const units = window._textureUnits || [];
                if (window._selectedUnitIdx == null || !units[window._selectedUnitIdx]) return;
                const anim = units[window._selectedUnitIdx].anim || {};
                anim.mode = parseInt(unitAnimModeSelect.value);
                units[window._selectedUnitIdx].anim = anim;
            });
        }
        if (unitAnimFpsSlider && unitAnimFpsVal) {
            const syncUnitFps = () => {
                const v = parseInt(unitAnimFpsSlider.value);
                unitAnimFpsVal.value = v;
                const units = window._textureUnits || [];
                if (window._selectedUnitIdx == null || !units[window._selectedUnitIdx]) return;
                const anim = units[window._selectedUnitIdx].anim || {};
                anim.fps = v;
                units[window._selectedUnitIdx].anim = anim;
            };
            unitAnimFpsSlider.addEventListener('input', syncUnitFps);
            unitAnimFpsVal.addEventListener('change', () => {
                let v = parseInt(unitAnimFpsVal.value);
                v = Math.min(parseInt(unitAnimFpsSlider.max), Math.max(parseInt(unitAnimFpsSlider.min), v));
                unitAnimFpsSlider.value = v;
                syncUnitFps();
            });
        }

        window._updateTextureOrderList = updateTextureOrderList;
        updateTextureOrderList();

        // 外观下拉菜单
        const appearanceMode = document.getElementById('appearanceMode');
        const imageSettings = document.getElementById('imageSettings');
        const textSettings = document.getElementById('textSettings');
        const textFontRow = document.getElementById('textFontRow');
        const textStyleRow = document.getElementById('textStyleRow');
        const textContentInput = document.getElementById('textContentInput');
        const fontSelect = document.getElementById('fontSelect');
        const fontFileInput = document.getElementById('fontFileInput');
        const fontWeightSelect = document.getElementById('fontWeightSelect');

        function updateAppearance() {
            const mode = appearanceMode.value;
            if (mode === 'image') {
                imageSettings.style.display = 'block';
                textSettings.style.display = 'none';
                textFontRow.style.display = 'none';
                textStyleRow.style.display = 'none';
                window._particleTextMode = false;
            } else {
                imageSettings.style.display = 'none';
                textSettings.style.display = 'flex';
                textFontRow.style.display = 'flex';
                textStyleRow.style.display = 'block';
                window._particleTextMode = true;
            }
            if (window._syncNoSmoothingVisibility) window._syncNoSmoothingVisibility();
        }

        if (appearanceMode) {
            appearanceMode.addEventListener('change', updateAppearance);
            updateAppearance();
        }

        // 文字内容
        if (textContentInput) {
            textContentInput.addEventListener('input', (e) => {
                window._particleTextContent = e.target.value;
            });
            window._particleTextContent = textContentInput.value || '粒子';
        }

        // 字体选择
        if (fontSelect) {
            fontSelect.addEventListener('change', (e) => {
                window._particleSelectedFont = e.target.value;
            });
            window._particleSelectedFont = fontSelect.value;
        }

        // 字体导入
        window._importedFonts = {};
        if (fontFileInput) {
            fontFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const fontName = file.name.replace(/\.[^.]+$/, '');
                    const fontData = await file.arrayBuffer();
                    window._importedFonts[fontName] = fontData;
                    const fontFace = new FontFace(fontName, fontData);
                    await fontFace.load();
                    document.fonts.add(fontFace);
                    const option = document.createElement('option');
                    option.value = fontName;
                    option.textContent = fontName + '（导入）';
                    fontSelect.appendChild(option);
                    fontSelect.value = fontName;
                    window._particleSelectedFont = fontName;
                    window.StepperSelect?.rebuildAll();
                } catch (err) {
                    console.error('字体导入失败:', err);
                    Toast.error('字体导入失败: ' + err.message);
                }
                fontFileInput.value = '';
            });
        }

        // 字体样式
        const fontItalic = document.getElementById('fontItalic');
        const fontUnderline = document.getElementById('fontUnderline');
        const fontStrike = document.getElementById('fontStrike');
        const fontLetterSpacing = document.getElementById('fontLetterSpacing');
        const fontLetterSpacingRange = document.getElementById('fontLetterSpacingRange');

        function updateFontStyles() {
            window._particleFontStyles = {
                italic: fontItalic ? fontItalic.checked : false,
                underline: fontUnderline ? fontUnderline.checked : false,
                strike: fontStrike ? fontStrike.checked : false,
                letterSpacing: parseFloat(fontLetterSpacing ? fontLetterSpacing.value : 0) || 0,
                weight: fontWeightSelect ? fontWeightSelect.value : 'normal'
            };
        }

        if (fontItalic) fontItalic.addEventListener('change', updateFontStyles);
        if (fontUnderline) fontUnderline.addEventListener('change', updateFontStyles);
        if (fontStrike) fontStrike.addEventListener('change', updateFontStyles);
        if (fontLetterSpacing) fontLetterSpacing.addEventListener('input', updateFontStyles);
        if (fontWeightSelect) fontWeightSelect.addEventListener('change', updateFontStyles);

        if (fontLetterSpacingRange && fontLetterSpacing) {
            fontLetterSpacingRange.addEventListener('input', () => {
                fontLetterSpacing.value = fontLetterSpacingRange.value;
                updateFontStyles();
            });
            fontLetterSpacing.addEventListener('change', () => {
                let v = parseFloat(fontLetterSpacing.value);
                if (isNaN(v)) return;
                v = Math.min(parseFloat(fontLetterSpacingRange.max), Math.max(parseFloat(fontLetterSpacingRange.min), v));
                fontLetterSpacing.value = v;
                fontLetterSpacingRange.value = v;
                updateFontStyles();
            });
            fontLetterSpacingRange.value = fontLetterSpacing.value;
        }

        updateFontStyles();

        // ---- 透明度区间 ----
        bindRange('alphaMin', 'alphaMax', 'alphaMin', 'alphaMax', true, 1);

        // ---- 随机调色器 ----
        const paletteMode = document.getElementById('paletteMode');
        const paletteRangeSection = document.getElementById('paletteRangeSection');
        const paletteListSection = document.getElementById('paletteListSection');
        const hueMin = document.getElementById('hueMin');
        const hueMinVal = document.getElementById('hueMinVal');
        const hueMax = document.getElementById('hueMax');
        const hueMaxVal = document.getElementById('hueMaxVal');
        const satMin = document.getElementById('satMin');
        const satMinVal = document.getElementById('satMinVal');
        const satMax = document.getElementById('satMax');
        const satMaxVal = document.getElementById('satMaxVal');
        const paletteColorInput = document.getElementById('paletteColorInput');
        const paletteMidiSection = document.getElementById('paletteMidiSection');

        function parseColorSet(str) {
            str = str.trim();
            if (!str.startsWith('{') || !str.endsWith('}')) return [];
            const inner = str.slice(1, -1).trim();
            if (!inner) return [];
            return inner.split(',').map(s => {
                let hex = s.trim();
                if (!hex.startsWith('#')) hex = '#' + hex;
                return hex;
            }).filter(h => /^#[0-9a-f]{6}$/i.test(h));
        }
        function syncTextareaFromColors() {
            if (!paletteColorInput) return;
            const colors = window._paletteParams.colors || [];
            paletteColorInput.value = colors.length > 0 ? '{' + colors.join(', ') + '}' : '';
        }

        function updatePaletteUI() {
            const mode = paletteMode ? paletteMode.value : 'list';
            if (paletteRangeSection) paletteRangeSection.style.display = mode === 'range' ? '' : 'none';
            if (paletteListSection) paletteListSection.style.display = mode === 'list' ? '' : 'none';
            if (paletteMidiSection) paletteMidiSection.style.display = mode === 'midi' ? '' : 'none';
            window._paletteParams.mode = mode;
            if (mode === 'list') syncTextareaFromColors();
            if (mode === 'midi') {
                window._renderPitchColorRows?.();
                const tracks = window._currentMidiTracks;
                if (tracks && tracks.length > 0) {
                    const notes = window._midiNotes;
                    if (!notes || notes.length === 0) {
                        Toast.warn('所选轨道无音符事件');
                    }
                }
            }

        }
        if (paletteMode) {
            paletteMode.addEventListener('change', updatePaletteUI);
            updatePaletteUI();
        }

        function updateMidiOptionState() {
            const opt = paletteMode?.querySelector('option[value="midi"]');
            if (!opt) return;
            const hasMidi = window._currentMidiTracks && window._currentMidiTracks.length > 0;
            opt.disabled = !hasMidi;
            if (!hasMidi && paletteMode.value === 'midi') {
                paletteMode.value = 'list';
                paletteMode.dispatchEvent(new Event('change'));
            }
            // Also disable timelineSource MIDI option
            const tsOpt = document.querySelector('#timelineSource option[value="midi"]');
            if (tsOpt) tsOpt.disabled = !hasMidi;
            window.StepperSelect?.rebuildAll();
        }
        window._updateMidiOptionState = updateMidiOptionState;
        updateMidiOptionState();

        function bindPaletteRange(minId, maxId, minKey, maxKey, absMin, absMax) {
            const minSlider = document.getElementById(minId);
            const maxSlider = document.getElementById(maxId);
            const minSpan = document.getElementById(minId + 'Val');
            const maxSpan = document.getElementById(maxId + 'Val');
            if (!minSlider || !maxSlider) return;
            const sync = (source) => {
                let minVal = parseFloat(minSlider.value);
                let maxVal = parseFloat(maxSlider.value);
                if (minVal > maxVal) {
                    if (source === 'min') {
                        maxVal = minVal;
                        maxSlider.value = maxVal;
                    } else {
                        minVal = maxVal;
                        minSlider.value = minVal;
                    }
                }
                window._paletteParams[minKey] = minVal;
                window._paletteParams[maxKey] = maxVal;
                if (minSpan) minSpan.value = minVal;
                if (maxSpan) maxSpan.value = maxVal;
            };
            minSlider.addEventListener('input', () => sync('min'));
            maxSlider.addEventListener('input', () => sync('max'));
            if (minSpan) {
                minSpan.addEventListener('change', () => {
                    let v = parseFloat(minSpan.value);
                    if (isNaN(v)) return;
                    v = Math.min(absMax, Math.max(absMin, v));
                    minSlider.value = v;
                    sync('min');
                });
            }
            if (maxSpan) {
                maxSpan.addEventListener('change', () => {
                    let v = parseFloat(maxSpan.value);
                    if (isNaN(v)) return;
                    v = Math.min(absMax, Math.max(absMin, v));
                    maxSlider.value = v;
                    sync('max');
                });
            }
            sync();
        }
        bindPaletteRange('hueMin', 'hueMax', 'hueMin', 'hueMax', 0, 360);
        bindPaletteRange('satMin', 'satMax', 'satMin', 'satMax', 0, 100);

        if (paletteColorInput) {
            paletteColorInput.addEventListener('change', () => {
                window._paletteParams.colors = parseColorSet(paletteColorInput.value);
            });
        }

        window._tintIntensity = 100;
        const tiSlider = document.getElementById('tintIntensity');
        const tiVal = document.getElementById('tintIntensityVal');
        if (tiSlider && tiVal) {
            tiSlider.addEventListener('input', () => {
                window._tintIntensity = parseInt(tiSlider.value);
                tiVal.value = window._tintIntensity;
            });
            tiVal.addEventListener('change', () => {
                let v = parseInt(tiVal.value);
                if (isNaN(v)) v = 100;
                v = Math.min(100, Math.max(0, v));
                tiSlider.value = v;
                window._tintIntensity = v;
                tiVal.value = v;
            });
            window._tintIntensity = parseInt(tiSlider.value);
        }

        const noSmoothingSwitch = document.getElementById('noSmoothingSwitch');
        const noSmoothingRow = document.getElementById('noSmoothingRow');
        window._setNoTextureSmoothing = function(v) {
            window._noTextureSmoothing = !!v;
            if (window._clearTintCache) window._clearTintCache();
            if (noSmoothingSwitch) noSmoothingSwitch.checked = !!v;
        };
        if (noSmoothingSwitch) {
            noSmoothingSwitch.addEventListener('change', () => {
                window._noTextureSmoothing = noSmoothingSwitch.checked;
                if (window._clearTintCache) window._clearTintCache();
            });
            noSmoothingSwitch.checked = !!window._noTextureSmoothing;
        }
        // 全矢量图（SVG）或文字模式时，关闭并隐藏「无插值」
        window._syncNoSmoothingVisibility = function() {
            if (!noSmoothingRow) return;
            if (noSmoothingSwitch) {
                const textModeOn = !!window._particleTextMode;
                let allSvg = false;
                const units = window._textureUnits || [];
                if (units.length > 0) {
                    allSvg = units.every(u => {
                        const names = (u.frameNames && u.frameNames.length > 0) ? u.frameNames : [u.name];
                        return names.some(n => /\.svg$/i.test(n));
                    });
                }
                const hide = textModeOn || allSvg;
                noSmoothingRow.style.display = hide ? 'none' : '';
                if (hide && window._noTextureSmoothing) {
                    window._noTextureSmoothing = false;
                    if (window._clearTintCache) window._clearTintCache();
                }
                noSmoothingSwitch.checked = !!window._noTextureSmoothing;
            }
        };
        if (window._syncNoSmoothingVisibility) window._syncNoSmoothingVisibility();

        if (window._updateCoordDisplay) window._updateCoordDisplay();
        const exInput = document.getElementById('emitterX');
        const eyInput = document.getElementById('emitterY');
        if (exInput && eyInput) {
            function onCoordInput() {
                const x = parseInt(exInput.value) || 0;
                const y = parseInt(eyInput.value) || 0;
                if (window._setEmitterPos) window._setEmitterPos(x, y);
            }
            exInput.addEventListener('input', onCoordInput);
            eyInput.addEventListener('input', onCoordInput);
        }

        // ---- Fused navigation tabs ----
        const fusedNav = document.querySelector('.fused-nav');
        const panel = document.querySelector('.control-panel');
        const panelContent = document.querySelector('.panel-content');
        const panelFile = document.querySelector('.panel-file');
        if (!fusedNav || !panel) return;

        const designGroup = fusedNav.querySelector('.fn-group[data-panel="design"]');
        const fileGroup = fusedNav.querySelector('.fn-group[data-panel="file"]');

        function positionFusedNav() {
            const panelRect = panel.getBoundingClientRect();
            fusedNav.style.right = (window.innerWidth - panelRect.left - 1) + 'px';
        }

        // Scroll-to-section click handler via delegation
        fusedNav.addEventListener('click', (e) => {
            const tab = e.target.closest('.fn-tab');
            if (!tab) return;
            const group = tab.closest('.fn-group');
            if (!group) return;
            const contentEl = group.dataset.panel === 'design' ? panelContent : panelFile;
            if (!contentEl) return;
            const h4s = contentEl.querySelectorAll('h4');
            const idx = parseInt(tab.dataset.idx);
            const target = h4s[idx];
            if (target && target.getBoundingClientRect().height > 0) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setTimeout(() => updateSvgBorderFromActiveTab(), 150);
            }
        });

        // Setup one scroll listener per content panel
        function setupNavScroll(contentEl, groupEl) {
            const tabs = groupEl.querySelectorAll('.fn-tab');
            const h4s = contentEl.querySelectorAll('h4');
            function onScroll() {
                const containerRect = contentEl.getBoundingClientRect();
                const threshold = containerRect.top + 55;
                let activeIdx = 0;
                h4s.forEach((h4, i) => {
                    if (h4.getBoundingClientRect().height > 0 && h4.getBoundingClientRect().top < threshold) activeIdx = i;
                });
                tabs.forEach((tab, i) => tab.classList.toggle('active', i === activeIdx));
                updateSvgBorderFromActiveTab();
            }
            contentEl.addEventListener('scroll', onScroll);
            return onScroll;
        }

        function activateNavGroup(groupEl, contentEl) {
            fusedNav.querySelectorAll('.fn-group').forEach(g => { g.style.display = 'none'; });
            groupEl.style.display = '';

            fusedNav.querySelectorAll('.fn-tab').forEach(t => t.classList.remove('active'));
            const tabs = groupEl.querySelectorAll('.fn-tab');
            if (tabs.length) tabs[0].classList.add('active');

            // 滚动到顶部，保留模式切换区可见
            contentEl.scrollTop = 0;

            setTimeout(() => {
                fusedNav.style.top = (panel.getBoundingClientRect().top + 80) + 'px';
                positionFusedNav();
                contentEl.dispatchEvent(new Event('scroll'));
                updateSvgBorderFromActiveTab();
            }, 50);
        }

        // Init both scroll listeners once
        if (designGroup && panelContent) setupNavScroll(panelContent, designGroup);
        if (fileGroup && panelFile) setupNavScroll(panelFile, fileGroup);

        // Start with design group
        if (designGroup && panelContent) activateNavGroup(designGroup, panelContent);
        else if (fileGroup && panelFile) { fileGroup.style.display = ''; }

        // ---- SVG panel border ----
        const panelBorderSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        panelBorderSvg.setAttribute('class', 'panel-border-svg');
        panel.prepend(panelBorderSvg);

        let _lastSvgKey = null;

        function updateSvgBorder(opts) {
            const w = panel.clientWidth, h = panel.clientHeight;
            if (!w || !h) return;
            const R = 12;

            const lgFrom = opts?.leftGapFrom ?? 0;
            const lgTo   = opts?.leftGapTo   ?? 0;
            const tgFrom = opts?.topGapFrom  ?? w;
            const tgTo   = opts?.topGapTo    ?? w;

            const key = `2|${lgFrom}|${lgTo}|${tgFrom}|${tgTo}|${w}|${h}`;
            if (key === _lastSvgKey) return;
            _lastSvgKey = key;

            const borderStyle = 'fill="none" stroke="rgba(102,204,255,0.50)" stroke-width="2"';

            let topPaths = [];
            if (tgFrom > R) topPaths.push(`M ${R},0 L ${tgFrom},0`);
            if (tgTo < w - R) topPaths.push(`M ${tgTo},0 L ${w-R},0`);
            if (!topPaths.length) topPaths.push(`M ${R},0 L ${w-R},0`);

            let leftPaths = [];
            if (lgTo < h - R) leftPaths.push(`M 0,${h-R} L 0,${lgTo}`);
            if (lgFrom > R) leftPaths.push(`M 0,${lgFrom} L 0,${R}`);
            if (!leftPaths.length) leftPaths.push(`M 0,${h-R} L 0,${R}`);

            panelBorderSvg.innerHTML = `
                ${topPaths.map(d => `<path d="${d}" ${borderStyle} />`).join('')}
                <path d="M 0,${R} A ${R},${R} 0 0,1 ${R},0" ${borderStyle} />
                <path d="M ${w-R},0 A ${R},${R} 0 0,1 ${w},${R}" ${borderStyle} />
                <path d="M ${w},${R} L ${w},${h-R}" ${borderStyle} />
                <path d="M ${w},${h-R} A ${R},${R} 0 0,1 ${w-R},${h}" ${borderStyle} />
                <path d="M ${w-R},${h} L ${R},${h}" ${borderStyle} />
                <path d="M ${R},${h} A ${R},${R} 0 0,1 0,${h-R}" ${borderStyle} />
                ${leftPaths.map(d => `<path d="${d}" ${borderStyle} />`).join('')}
            `;

            if (handle) {
                const hSvg = handle.querySelector('.handle-svg');
                if (hSvg) {
                    hSvg.textContent = '';
                    const topH = Math.max(0, lgFrom);
                    if (topH > 0) {
                        const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        r.setAttribute('x', '0'); r.setAttribute('y', '0');
                        r.setAttribute('width', '100%'); r.setAttribute('height', String(topH));
                        hSvg.appendChild(r);
                    }
                    const botH = Math.max(0, h - lgTo);
                    if (botH > 0) {
                        const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        r.setAttribute('x', '0'); r.setAttribute('y', String(lgTo));
                        r.setAttribute('width', '100%'); r.setAttribute('height', String(botH));
                        hSvg.appendChild(r);
                    }
                }
            }
        }

        function updateSvgBorderFromActiveTab() {
            const activePt = document.querySelector('.panel-tab.active');
            const pr = panel.getBoundingClientRect();
            let leftGapFrom = 0, leftGapTo = 0;
            let topGapFrom, topGapTo;
            if (activePt) {
                const tr = activePt.getBoundingClientRect();
                topGapFrom = Math.max(0, tr.left - pr.left);
                topGapTo   = Math.min(panel.clientWidth, tr.right - pr.left);
            }

            let activeFn = fusedNav.querySelector('.fn-tab.active');
            if (!activeFn) {
                const firstTab = fusedNav.querySelector('.fn-tab');
                if (firstTab) activeFn = firstTab;
            }
            if (activeFn) {
                const tr = activeFn.getBoundingClientRect();
                leftGapFrom = Math.max(0, tr.top - pr.top);
                leftGapTo   = Math.min(panel.clientHeight, tr.bottom - pr.top);
            }

            updateSvgBorder({ leftGapFrom, leftGapTo, topGapFrom, topGapTo });
        }

        updateSvgBorderFromActiveTab();

        const ro = new ResizeObserver(() => {
            positionFusedNav();
            updateSvgBorderFromActiveTab();
        });
        ro.observe(panel);
        window._updateFusedNav = positionFusedNav;

        // ---- 横向一级选项卡切换 ----
        const panelTabs = document.querySelectorAll('.panel-tab');
        if (panelTabs.length && panelContent && panelFile) {
            panelTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    if (tab.classList.contains('active')) return;
                    panelTabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');

                    if (tab.dataset.panel === 'design') {
                        panelContent.style.display = '';
                        panelFile.style.display = 'none';
                        if (fusedNav) fusedNav.style.display = '';
                        if (designGroup) activateNavGroup(designGroup, panelContent);
                    } else {
                        panelContent.style.display = 'none';
                        panelFile.style.display = '';
                        if (fusedNav) fusedNav.style.display = '';
                        if (fileGroup && panelFile) activateNavGroup(fileGroup, panelFile);
                    }
                });
            });
        }

        // ---- 顶栏标题宽度（供工具区左侧避让） ----
        const titleEl = document.querySelector('.title');
        if (titleEl) {
            const setTitleW = () => {
                const ml = parseFloat(getComputedStyle(titleEl).marginLeft) || 0;
                document.documentElement.style.setProperty('--title-w', (titleEl.getBoundingClientRect().width + ml) + 'px');
            };
            setTitleW();
        }

        // ---- 顶栏高度（换行后控制面板/标签随之下移，保持始终在顶栏底边以下） ----
        const toolbarEl = document.querySelector('.toolbar');
        const syncToolbarH = () => {
            if (!toolbarEl) return;
            document.documentElement.style.setProperty('--toolbar-h', toolbarEl.getBoundingClientRect().height + 'px');
            if (fusedNav && panel) fusedNav.style.top = (panel.getBoundingClientRect().top + 80) + 'px';
        };
        if (toolbarEl) {
            syncToolbarH();
            requestAnimationFrame(syncToolbarH);
            requestAnimationFrame(() => requestAnimationFrame(syncToolbarH));
            window.addEventListener('resize', syncToolbarH);
        }

        // ---- 发射模式组内分隔符：换行后隐藏 ----
        const divEl = document.querySelector('.emitter-divider');
        const xyEl = document.querySelector('.emitter-xy');
        const whaEl = document.querySelector('.emitter-wha');
        const syncEmitterDivider = () => {
            if (!divEl || !xyEl || !whaEl) return;
            const sameRow = Math.round(xyEl.getBoundingClientRect().top) === Math.round(whaEl.getBoundingClientRect().top);
            divEl.style.visibility = sameRow ? 'visible' : 'hidden';
        };
        if (divEl && xyEl && whaEl) {
            requestAnimationFrame(syncEmitterDivider);
            requestAnimationFrame(() => requestAnimationFrame(syncEmitterDivider));
            window.addEventListener('resize', syncEmitterDivider);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();