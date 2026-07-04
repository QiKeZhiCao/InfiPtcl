// ui.js - UI 控制与事件绑定
(function() {
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

        // 背景色
        const bgPicker = document.getElementById('bgColorPicker');
        const bgPreview = document.getElementById('bgPreview');
        if (bgPicker && bgPreview) {
            bgPreview.addEventListener('click', () => bgPicker.click());
            bgPicker.addEventListener('input', (e) => {
                window._particleParams.backgroundColor = e.target.value;
                bgPreview.style.backgroundColor = e.target.value;
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
                const cx = canvas.width / 2;
                const cy = canvas.height / 2;
                window._setEmitterPos(cx, cy);
            });
        }

        // 清除粒子
        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                window._clearParticles();
            });
        }

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
            textureUpload.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                if (files.length === 0) return;
                let loadedCount = 0;
                const imgs = [];
                const fileNames = [];
                files.forEach(file => {
                    fileNames.push(file.name);
                    const img = new Image();
                    img.onload = () => {
                        imgs.push(img);
                        loadedCount++;
                        if (loadedCount === files.length) {
                            window._particleTextures = imgs;
                            window._textureFileNames = fileNames;
                            updateTextureOrderList();
                            if (textureFileNameSpan) textureFileNameSpan.innerText = fileNames.join(', ');
                            const maxDim = Math.max(imgs[0].width, imgs[0].height);
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
                        }
                    };
                    img.src = URL.createObjectURL(file);
                });
            });
        }

        const resetTextureBtn = document.getElementById('resetTextureBtn');
        if (resetTextureBtn) {
            resetTextureBtn.addEventListener('click', () => {
                window._resetDefaultTexture();
                window._textureFileNames = [];
                updateTextureOrderList();
                if (textureFileNameSpan) textureFileNameSpan.innerText = '默认纹理（1张）';
            });
        }

        // ---- 图片动画模式 ----
        window._particleAnimMode = 0;
        window._particleAnimFps = 10;
        window._textureFileNames = [];

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
            const texs = window._particleTextures || [];

            if (texs.length < 2) {
                if (animGroup) animGroup.style.display = 'none';
                return;
            }

            if (animGroup) animGroup.style.display = '';

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

            texs.forEach((img, i) => {
                const item = document.createElement('div');
                item.className = 'texture-order-item';
                item.draggable = true;
                item.dataset.index = i;

                const canvas = document.createElement('canvas');
                canvas.width = 80;
                canvas.height = 80;
                const c = canvas.getContext('2d');
                c.drawImage(img, 0, 0, 80, 80);
                const thumb = document.createElement('img');
                thumb.className = 'thumb';
                thumb.src = canvas.toDataURL();
                thumb.alt = '';

                const idxBadge = document.createElement('span');
                idxBadge.className = 'item-idx';
                idxBadge.textContent = i + 1;

                item.appendChild(thumb);
                item.appendChild(idxBadge);

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
                        const arr = window._particleTextures || [];
                        const nameArr = window._textureFileNames || [];
                        const [movedImg] = arr.splice(_dragFromIdx, 1);
                        const [movedName] = nameArr.splice(_dragFromIdx, 1);
                        const targetIdx = _dragFromIdx < _placeholderIdx ? _placeholderIdx - 1 : _placeholderIdx;
                        arr.splice(targetIdx, 0, movedImg);
                        nameArr.splice(targetIdx, 0, movedName);
                        window._particleTextures = arr;
                        window._textureFileNames = nameArr;
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
        window._updateTextureOrderList = updateTextureOrderList;

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
                textStyleRow.style.display = 'flex';
                window._particleTextMode = true;
            }
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
                } catch (err) {
                    console.error('字体导入失败:', err);
                    alert('字体导入失败: ' + err.message);
                }
                fontFileInput.value = '';
            });
        }

        // 字体样式
        const fontItalic = document.getElementById('fontItalic');
        const fontUnderline = document.getElementById('fontUnderline');
        const fontStrike = document.getElementById('fontStrike');
        const fontLetterSpacing = document.getElementById('fontLetterSpacing');

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
        const lightMin = document.getElementById('lightMin');
        const lightMinVal = document.getElementById('lightMinVal');
        const lightMax = document.getElementById('lightMax');
        const lightMaxVal = document.getElementById('lightMaxVal');
        const paletteColorInput = document.getElementById('paletteColorInput');

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
            const mode = paletteMode ? paletteMode.value : 'off';
            if (paletteRangeSection) paletteRangeSection.style.display = mode === 'range' ? '' : 'none';
            if (paletteListSection) paletteListSection.style.display = mode === 'list' ? '' : 'none';
            window._paletteParams.mode = mode;
            if (mode === 'list') syncTextareaFromColors();
        }
        if (paletteMode) {
            paletteMode.addEventListener('change', updatePaletteUI);
            updatePaletteUI();
        }

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
        bindPaletteRange('lightMin', 'lightMax', 'lightMin', 'lightMax', 0, 100);

        if (paletteColorInput) {
            paletteColorInput.addEventListener('change', () => {
                window._paletteParams.colors = parseColorSet(paletteColorInput.value);
            });
        }

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
            }
            contentEl.addEventListener('scroll', onScroll);
            return onScroll;
        }

        function activateNavGroup(groupEl, contentEl) {
            fusedNav.querySelectorAll('.fn-group').forEach(g => { g.style.display = 'none'; });
            groupEl.style.display = '';

            const tabs = groupEl.querySelectorAll('.fn-tab');
            tabs.forEach(t => t.classList.remove('active'));
            if (tabs.length) tabs[0].classList.add('active');

            // 滚动到顶部，保留模式切换区可见
            contentEl.scrollTop = 0;

            setTimeout(() => {
                fusedNav.style.top = (panel.getBoundingClientRect().top + 80) + 'px';
                positionFusedNav();
                contentEl.dispatchEvent(new Event('scroll'));
            }, 50);
        }

        // Init both scroll listeners once
        if (designGroup && panelContent) setupNavScroll(panelContent, designGroup);
        if (fileGroup && panelFile) setupNavScroll(panelFile, fileGroup);

        // Start with design group
        if (designGroup && panelContent) activateNavGroup(designGroup, panelContent);
        else if (fileGroup && panelFile) { fileGroup.style.display = ''; }

        const ro = new ResizeObserver(() => positionFusedNav());
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();