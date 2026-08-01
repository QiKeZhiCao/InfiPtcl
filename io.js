// io.js - 项目导入/导出
(function() {
    function bindImportExport() {
        const importFileInput = document.getElementById('importFileInput');
        const importBtn = document.getElementById('importBtn');
        const exportBtn = document.getElementById('configExportBtn');
        const exportType = document.getElementById('exportType');
        if (!exportBtn || !exportType) return;

        function formatFileSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1048576).toFixed(1) + ' MB';
        }

        // ====== Helpers ======
        async function textureToBlob(img) {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth || img.width;
            c.height = img.naturalHeight || img.height;
            c.getContext('2d').drawImage(img, 0, 0);
            return new Promise(r => c.toBlob(r, 'image/png'));
        }
        function blobToBase64(blob) {
            return new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
        }
        function arrayBufferToBase64(buf) {
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
        }

        // ====== Collect project state ======
        function collectState() {
            const params = JSON.parse(JSON.stringify(window._particleParams || {}));
            return {
                version: "1.0",
                projectName: document.getElementById('projectName')?.value || '未命名项目',
                particleParams: params,
                emitter: {
                    followMouse: !!window._particleFollowMouse,
                    pos: window._particleEmitterPos ? { x: window._particleEmitterPos.x, y: window._particleEmitterPos.y } : null,
                    x: parseInt(document.getElementById('emitterX')?.value) || 0,
                    y: parseInt(document.getElementById('emitterY')?.value) || 0
                },
                textMode: {
                    enabled: !!window._particleTextMode,
                    content: window._particleTextContent || '',
                    font: window._particleSelectedFont || '',
                    styles: window._particleFontStyles ? { ...window._particleFontStyles } : null
                },
                animation: {
                    mode: window._particleAnimMode != null ? window._particleAnimMode : 0,
                    fps: window._particleAnimFps || 10,
                    multiTex: !!window._particleMultiTex
                },
                sequence: {
                    continuous: window._isContinuousMode !== false,
                    timeline: document.getElementById('timelineInput')?.value || '',
                    burstCount: parseInt(document.getElementById('burstCount')?.value) || 1,
                    precision: parseInt(document.getElementById('precisionSelect')?.value) || 4
                },
                randomRate: !!window._randomRateMode,
                seqLoop: document.getElementById('loopSeqCheckbox')?.checked ?? false,
                clearBeforeRender: document.getElementById('clearBeforeRender')?.checked ?? false,
                palette: window._paletteParams ? { ...window._paletteParams, tintIntensity: window._tintIntensity ?? 100, colors: [...(window._paletteParams.colors || [])] } : { mode: 'list', hueMin: 0, hueMax: 360, satMin: 60, satMax: 100, colors: [], tintIntensity: 100 },
                pitchColorMap: window._pitchColorMap ? { ...window._pitchColorMap } : {},
                timelineSource: document.getElementById('timelineSource')?.value || 'manual',
                canvasWidth: parseInt(document.getElementById('canvasWidth')?.value) || 1920,
                canvasHeight: parseInt(document.getElementById('canvasHeight')?.value) || 1080,
                resolutionScale: parseFloat(document.getElementById('resolutionScale')?.value) || 1,
                webpQuality: parseFloat(document.getElementById('webpQuality')?.value) || 0.92,
                exportFps: parseFloat(document.getElementById('exportFps')?.value) || 30,
                exportDuration: parseFloat(document.getElementById('exportDuration')?.value) || 30,
                exportFormat: document.getElementById('exportFormat')?.value || 'sequence',
                exportMethod: document.getElementById('exportMethod')?.value || 'folder',
                autoFit: document.getElementById('canvasSizeAutoBtn')?.classList.contains('active') ?? true,
                viewZoom: window._viewZoom || 1,
                viewPanX: window._viewPanX || 0,
                viewPanY: window._viewPanY || 0
            };
        }

        // ====== Restore state to DOM ======
        function restoreState(state) {
            if (!state) return;
            // Project name
            const pn = document.getElementById('projectName');
            if (pn && state.projectName) pn.value = state.projectName;

            // Background color
            const bg = document.getElementById('bgColorPicker');
            const bp = document.getElementById('bgPreview');
            if (bg && state.particleParams && state.particleParams.backgroundColor) {
                bg.value = state.particleParams.backgroundColor;
                if (bp) bp.style.backgroundColor = state.particleParams.backgroundColor;
            }

            // Particle params
            if (state.particleParams) {
                Object.assign(window._particleParams, state.particleParams);
                // Sync sliders
                const sliderIds = [
                    ['emitRate','emitRate',false],['sizeMin','sizeMin',false],['sizeMax','sizeMax',false],
                    ['speedMin','speedMin',false],['speedMax','speedMax',false],['gravityX','gravityX',false],
                    ['gravityY','gravityY',false],['damping','damping',true],['emitRadius','emitRadius',false],
                    ['maxParticles','maxParticles',false],['fadeStartMin','fadeStartMin',true],['fadeStartMax','fadeStartMax',true],
                    ['fadeDurationMin','fadeDurationMin',true],['fadeDurationMax','fadeDurationMax',true],
                    ['alphaMin','alphaMin',false],['alphaMax','alphaMax',false]
                ];
                for (const [id, prop, isFloat] of sliderIds) {
                    const slider = document.getElementById(id);
                    const span = document.getElementById(id + 'Val');
                    if (slider && state.particleParams[prop] !== undefined) {
                        slider.value = state.particleParams[prop];
                        if (span) span.value = isFloat ? parseFloat(state.particleParams[prop]).toFixed(2) : parseInt(state.particleParams[prop]);
                    }
                }
                // Angle sliders
                const angleIds = ['baseAngle','angleSpread','initRotAngle','initRotSpread'];
                for (const id of angleIds) {
                    const slider = document.getElementById(id);
                    const span = document.getElementById(id + 'Val');
                    if (slider && state.particleParams[id] !== undefined) {
                        slider.value = state.particleParams[id];
                        if (span) span.value = state.particleParams[id];
                    }
                }
                // Rotation speed
                const rotMin = document.getElementById('rotSpeedMin');
                const rotMax = document.getElementById('rotSpeedMax');
                if (rotMin && state.particleParams.rotSpeedMin !== undefined) {
                    const degMin = Math.round(state.particleParams.rotSpeedMin * 180 / Math.PI);
                    rotMin.value = degMin;
                    const v = document.getElementById('rotSpeedMinVal');
                    if (v) v.value = degMin;
                }
                if (rotMax && state.particleParams.rotSpeedMax !== undefined) {
                    const degMax = Math.round(state.particleParams.rotSpeedMax * 180 / Math.PI);
                    rotMax.value = degMax;
                    const v = document.getElementById('rotSpeedMaxVal');
                    if (v) v.value = degMax;
                }
            }

            // Emitter mode
            if (state.emitter) {
                window._particleFollowMouse = state.emitter.followMouse;
                const followBtn = document.getElementById('followMouseBtn');
                const fixedBtn = document.getElementById('fixedModeBtn');
                const centerBtn = document.getElementById('centerPointBtn');
                if (followBtn && fixedBtn) {
                    if (state.emitter.followMouse) {
                        followBtn.classList.add('active'); fixedBtn.classList.remove('active');
                        if (centerBtn) centerBtn.style.display = 'none';
                    } else {
                        fixedBtn.classList.add('active'); followBtn.classList.remove('active');
                        if (centerBtn) centerBtn.style.display = 'inline-block';
                    }
                }
                const ex = document.getElementById('emitterX');
                const ey = document.getElementById('emitterY');
                if (ex) ex.value = state.emitter.x || 0;
                if (ey) ey.value = state.emitter.y || 0;
                if (window._setEmitterPos) window._setEmitterPos(state.emitter.x || 0, state.emitter.y || 0);
            }

            // Text mode
            if (state.textMode) {
                window._particleTextMode = state.textMode.enabled;
                window._particleTextContent = state.textMode.content;
                window._particleSelectedFont = state.textMode.font;
                if (state.textMode.styles) {
                    Object.assign(window._particleFontStyles, state.textMode.styles);
                }
                const styles = state.textMode.styles || {};
                const fi = document.getElementById('fontItalic');
                if (fi) fi.checked = !!styles.italic;
                const fu = document.getElementById('fontUnderline');
                if (fu) fu.checked = !!styles.underline;
                const fs2 = document.getElementById('fontStrike');
                if (fs2) fs2.checked = !!styles.strike;
                const fls = document.getElementById('fontLetterSpacing');
                if (fls) fls.value = Math.min(100, Math.max(0, styles.letterSpacing ?? 0));
                const flr = document.getElementById('fontLetterSpacingRange');
                if (flr) flr.value = fls ? fls.value : 0;
                const fws = document.getElementById('fontWeightSelect');
                if (fws) fws.value = styles.weight || 'normal';
                const am = document.getElementById('appearanceMode');
                if (am) { am.value = state.textMode.enabled ? 'text' : 'image'; am.dispatchEvent(new Event('change')); }
                const tc = document.getElementById('textContentInput');
                if (tc) tc.value = state.textMode.content;
                const fs = document.getElementById('fontSelect');
                if (fs && state.textMode.font) fs.value = state.textMode.font;
            }

            // Animation
            if (state.animation) {
                window._particleAnimMode = state.animation.mode;
                window._particleAnimFps = state.animation.fps;
                if (state.animation.multiTex !== undefined && window._setMultiTex) {
                    window._setMultiTex(state.animation.multiTex);
                }
                const ams = document.getElementById('animModeSelect');
                if (ams) ams.value = state.animation.mode;
                const afs = document.getElementById('animFps');
                const afv = document.getElementById('animFpsVal');
                if (afs) afs.value = state.animation.fps;
                if (afv) afv.value = state.animation.fps;
            }

            // Sequence
            if (state.sequence) {
                window._isContinuousMode = state.sequence.continuous;
                const tl = document.getElementById('timelineInput');
                if (tl) tl.value = state.sequence.timeline;
                const bc = document.getElementById('burstCount');
                const bcv = document.getElementById('burstCountVal');
                if (bc) bc.value = state.sequence.burstCount;
                if (bcv) bcv.value = state.sequence.burstCount;
                if (bc) bc.dispatchEvent(new Event('input'));
                const ps = document.getElementById('precisionSelect');
                if (ps) ps.value = state.sequence.precision;
                if (window._setSequenceMode) window._setSequenceMode(state.sequence.continuous);
            }

            // Random rate
            if (state.randomRate !== undefined) {
                window._randomRateMode = state.randomRate;
                const rrs = document.getElementById('randomRateSwitch');
                if (rrs) rrs.checked = state.randomRate;
                if (window._setRandomRateMode) window._setRandomRateMode(state.randomRate);
            }

            // Loop sequence
            if (state.seqLoop !== undefined) {
                if (window._setSeqLoop) window._setSeqLoop(state.seqLoop);
            }

            // Clear before render
            if (state.clearBeforeRender !== undefined) {
                const cbr = document.getElementById('clearBeforeRender');
                if (cbr) cbr.checked = state.clearBeforeRender;
            }

            // Palette
            if (state.palette) {
                const p = state.palette;
                window._paletteParams.mode = p.mode || 'list';
                window._paletteParams.hueMin = p.hueMin ?? 0;
                window._paletteParams.hueMax = p.hueMax ?? 360;
                window._paletteParams.sat = p.sat ?? 80;
                window._paletteParams.light = p.light ?? 65;
                window._paletteParams.colors = Array.isArray(p.colors) ? [...p.colors] : [];
                // Sync DOM
                const pm = document.getElementById('paletteMode');
                if (pm) { pm.value = window._paletteParams.mode; pm.dispatchEvent(new Event('change')); }
                const hm = document.getElementById('hueMin');
                const hmv = document.getElementById('hueMinVal');
                if (hm) hm.value = window._paletteParams.hueMin;
                if (hmv) hmv.value = window._paletteParams.hueMin;
                const hm2 = document.getElementById('hueMax');
                const hmv2 = document.getElementById('hueMaxVal');
                if (hm2) hm2.value = window._paletteParams.hueMax;
                if (hmv2) hmv2.value = window._paletteParams.hueMax;
                const sm = document.getElementById('satMin');
                const smv = document.getElementById('satMinVal');
                if (sm) sm.value = window._paletteParams.satMin;
                if (smv) smv.value = window._paletteParams.satMin;
                const sm2 = document.getElementById('satMax');
                const smv2 = document.getElementById('satMaxVal');
                if (sm2) sm2.value = window._paletteParams.satMax;
                if (smv2) smv2.value = window._paletteParams.satMax;
                // Sync textarea
                const pci = document.getElementById('paletteColorInput');
                if (pci) {
                    const colors = window._paletteParams.colors || [];
                    pci.value = colors.length > 0 ? '{' + colors.join(', ') + '}' : '';
                }
                // Restore tint intensity
                window._tintIntensity = p.tintIntensity ?? 100;
                const tiS = document.getElementById('tintIntensity');
                const tiV = document.getElementById('tintIntensityVal');
                if (tiS) tiS.value = window._tintIntensity;
                if (tiV) tiV.value = window._tintIntensity;
            }

            // Auto fit & viewport state (must set before resizeCanvas)
            const autoBtn = document.getElementById('canvasSizeAutoBtn');
            if (state.autoFit === false) {
                if (window._setAutoFitFlag) window._setAutoFitFlag(false);
                if (autoBtn) autoBtn.classList.remove('active');
            } else {
                if (window._setAutoFitFlag) window._setAutoFitFlag(true);
                if (autoBtn) autoBtn.classList.add('active');
                window._viewZoom = 1;
                window._viewPanX = 0;
                window._viewPanY = 0;
            }

            // Canvas size & resolution scale
            const cw = document.getElementById('canvasWidth');
            const ch = document.getElementById('canvasHeight');
            if (cw && state.canvasWidth) cw.value = state.canvasWidth;
            if (ch && state.canvasHeight) ch.value = state.canvasHeight;
            if (window._resizeCanvas) window._resizeCanvas();
            const rs = document.getElementById('resolutionScale');
            const rsv = document.getElementById('resolutionScaleVal');
            if (rs && state.resolutionScale) { rs.value = state.resolutionScale; if (rsv) rsv.value = state.resolutionScale; }
            const wq = document.getElementById('webpQuality');
            const wqv = document.getElementById('webpQualityVal');
            if (wq && state.webpQuality) { wq.value = state.webpQuality; if (wqv) wqv.value = state.webpQuality; }
            const efps = document.getElementById('exportFps');
            const efpsv = document.getElementById('exportFpsVal');
            if (efps && state.exportFps) { efps.value = state.exportFps; if (efpsv) efpsv.value = state.exportFps; }
            const edur = document.getElementById('exportDuration');
            const edurv = document.getElementById('exportDurationVal');
            if (edur && state.exportDuration) { edur.value = state.exportDuration; if (edurv) edurv.value = state.exportDuration; }
            const ef = document.getElementById('exportFormat');
            if (ef && state.exportFormat) ef.value = state.exportFormat;
            const em = document.getElementById('exportMethod');
            if (em && state.exportMethod) em.value = state.exportMethod;
            if (window._syncExportMethodVisibility) window._syncExportMethodVisibility();

            // Viewport state (only restore when not in autoFit)
            if (state.autoFit === false) {
                window._viewZoom = state.viewZoom || 1;
                window._viewPanX = state.viewPanX || 0;
                window._viewPanY = state.viewPanY || 0;
                if (window._applyViewTransform) window._applyViewTransform();
            }

            // Update UI: input disabled state & pan button disabled
            const panBtn = document.getElementById('panModeBtn');
            if (state.autoFit) {
                if (cw) cw.disabled = true;
                if (ch) ch.disabled = true;
                if (panBtn) panBtn.disabled = true;
            } else {
                if (cw) cw.disabled = false;
                if (ch) ch.disabled = false;
                if (panBtn) panBtn.disabled = false;
            }
            if (window.StepperSelect) window.StepperSelect.rebuildAll();
        }

        // ====== Import ======
        if (importBtn && importFileInput) {
            importBtn.addEventListener('click', () => importFileInput.click());
            importFileInput.addEventListener('change', async () => {
                const file = importFileInput.files[0];
                if (!file) return;
                try {
                    let state, textures, fonts, midiData;
                    if (file.name.endsWith('.json')) {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        if (!data || typeof data !== 'object' || !data.particleParams) {
                            Toast.error('无效的项目文件');
                            importFileInput.value = '';
                            return;
                        }
                        state = data;
                        textures = data.textures || [];
                        fonts = data.fonts || [];
                        midiData = data.midi || null;
                    } else if (file.name.endsWith('.zip')) {
                        if (typeof JSZip === 'undefined') { console.error('[IE] JSZip not loaded'); return; }
                        const zip = await JSZip.loadAsync(file);
                        const cfgFile = zip.file('config.json');
                        if (!cfgFile) { Toast.error('ZIP 中缺少 config.json'); return; }
                        state = JSON.parse(await cfgFile.async('string'));
                        // Textures
                        textures = [];
                        for (const path of Object.keys(zip.files)) {
                            if (path.startsWith('textures/') && !zip.files[path].dir) {
                                const blob = await zip.files[path].async('blob');
                                textures.push({ name: path.replace('textures/', ''), blob });
                            }
                        }
                        // Restore texture order
                        if (state.textureNames && state.textureNames.length > 0) {
                            const orderMap = {};
                            state.textureNames.forEach((n, i) => orderMap[n] = i);
                            textures.sort((a, b) => (orderMap[a.name] ?? 999) - (orderMap[b.name] ?? 999));
                        }
                        // Fonts
                        fonts = [];
                        for (const path of Object.keys(zip.files)) {
                            if (path.startsWith('fonts/') && !zip.files[path].dir) {
                                const buf = await zip.files[path].async('arraybuffer');
                                const name = path.replace('fonts/', '');
                                fonts.push({ name, data: buf });
                            }
                        }
                        // MIDI tracks
                        const mt = zip.file('midi/tracks.json');
                        if (mt) midiData = JSON.parse(await mt.async('string'));
                    } else {
                        return;
                    }

                    // Restore settings
                    restoreState(state);

                    // Restore textures
                    if (textures.length > 0) {
                        const imgs = [];
                        const names = [];
                        for (const tex of textures) {
                            let url;
                            if (tex.data) url = tex.data; // base64 from JSON
                            else if (tex.blob) url = URL.createObjectURL(tex.blob); // blob from ZIP
                            else continue;
                            const img = await new Promise((resolve, reject) => {
                                const i = new Image();
                                i.onload = () => resolve(i);
                                i.onerror = reject;
                                i.src = url;
                            });
                            imgs.push(img);
                            names.push(tex.name || `texture_${imgs.length-1}.png`);
                        }
                        window._particleTextures = imgs;
                        window._textureFileNames = names;
                        // 新格式：含 textureUnits 元数据 → 重建纹理单元；旧格式 → 保持扁平、开关关闭
                        const unitsMeta = state.textureUnits;
                        if (Array.isArray(unitsMeta) && unitsMeta.length > 0) {
                            const units = [];
                            for (const meta of unitsMeta) {
                                const start = meta.start || 0;
                                const count = Math.max(1, meta.count || 1);
                                const frames = [];
                                const frameNames = [];
                                for (let i = 0; i < count && (start + i) < imgs.length; i++) {
                                    frames.push(imgs[start + i]);
                                    frameNames.push(names[start + i]);
                                }
                                if (frames.length > 0) {
                                    const anim = meta.isAnim ? { mode: (meta.mode != null ? meta.mode : 2), fps: (meta.fps > 0 ? meta.fps : 10) } : null;
                                    units.push({ name: meta.name || `纹理${units.length+1}`, isAnim: !!meta.isAnim, fps: meta.fps || 0, anim, frames, frameNames });
                                }
                            }
                            if (units.length > 0) {
                                window._textureUnits = units;
                                if (window._rebuildFlatFromUnits) window._rebuildFlatFromUnits();
                                if (state.animation && state.animation.multiTex !== undefined && window._setMultiTex) {
                                    window._setMultiTex(state.animation.multiTex);
                                }
                            }
                        }
                        if (window._updateTextureOrderList) window._updateTextureOrderList();
                        const tf = document.getElementById('textureFileName');
                        if (tf) tf.innerText = (window._displayTextureNames ? window._displayTextureNames() : names.join(', '));
                    }

                    // Restore fonts
                    for (const f of fonts) {
                        let fontData;
                        if (f.data) {
                            if (typeof f.data === 'string' && f.data.startsWith('data:')) {
                                // base64 string from JSON
                                const resp = await fetch(f.data);
                                fontData = await resp.arrayBuffer();
                            } else {
                                fontData = f.data; // ArrayBuffer from ZIP
                            }
                        } else continue;
                        try {
                            const ff = new FontFace(f.name, fontData);
                            await ff.load();
                            document.fonts.add(ff);
                            if (!window._importedFonts) window._importedFonts = {};
                            window._importedFonts[f.name] = fontData;
                            const fs = document.getElementById('fontSelect');
                            if (fs) {
                                const opt = document.createElement('option');
                                opt.value = f.name;
                                opt.textContent = f.name + '（导入）';
                                fs.appendChild(opt);
                                if (state.textMode && state.textMode.font === f.name) fs.value = f.name;
                            }
                        } catch(e) { console.warn('Font restore failed:', f.name, e); }
                    }

                    // Restore MIDI
                    if (midiData && midiData.tracks && midiData.tracks.length > 0) {
                        const tracks = midiData.tracks.map(t => ({ name: t.name, noteCount: t.noteCount, timestamps: t.timestamps, notes: t.notes }));
                        if (window._setMidiTracks) window._setMidiTracks(tracks);
                        const mts = document.getElementById('midiTrackSelect');
                        if (mts) {
                            mts.innerHTML = '<option value="all">&lt; 所有轨道合并 &gt;</option>';
                            tracks.forEach((t, i) => {
                                const opt = document.createElement('option');
                                opt.value = i;
                                opt.textContent = `${t.name} （${t.noteCount}个音符）`;
                                mts.appendChild(opt);
                            });
                            if (midiData.selectedTrack != null) mts.value = midiData.selectedTrack;
                        }
                        const mfn = document.getElementById('midiFileName');
                        if (mfn) mfn.innerText = midiData.fileName || '导入的MIDI文件';
                        // Restore pitchColorMap before loading timeline
                        if (state.pitchColorMap && window._pitchColorMap) {
                            Object.assign(window._pitchColorMap, state.pitchColorMap);
                        }
                        const ts = document.getElementById('timelineSource');
                        if (ts && state.timelineSource) {
                            ts.value = state.timelineSource;
                            if (window._timelineSource !== undefined) window._timelineSource = state.timelineSource;
                        }
                        if (window._updateTimelineFromSelectedTrack) window._updateTimelineFromSelectedTrack(true);
                        window._updateMidiOptionState?.();
                    }

                    window._updateMidiOptionState?.();

                    // Update info panel
                    const fileName = file.name;
                    const ext = fileName.endsWith('.json') ? 'json' : 'zip';
                    document.getElementById('fileNameExt').innerText = '.' + ext;
                    document.getElementById('fileSize').innerText = formatFileSize(file.size);
                    document.getElementById('fileType').innerText = ext === 'json'
                        ? 'JSON数据包（Base64）'
                        : 'ZIP压缩包';
                    document.getElementById('exportType').value = ext;

                    window.StepperSelect?.rebuildAll();

                    Toast.success('工程导入成功');
                    console.log('[IE] Import complete');
                } catch (err) {
                    console.error('[IE] Import error:', err);
                    Toast.error('导入失败: ' + err.message);
                }
                importFileInput.value = '';
            });
        }

        // ====== Export ======
        exportBtn.addEventListener('click', async () => {
            const state = collectState();
            const projectName = state.projectName || '未命名项目';

            try {
                // Textures
                const texs = window._particleTextures || [];
                const texNames = window._textureFileNames || [];
                const textureBlobs = [];
                for (let i = 0; i < texs.length; i++) {
                    const blob = await textureToBlob(texs[i]);
                    textureBlobs.push({ name: texNames[i] || `texture_${i}.png`, blob });
                }
                // 纹理单元元数据（新格式分组信息）
                let textureUnitsMeta = null;
                const units = window._textureUnits;
                if (Array.isArray(units) && units.length > 0 && texs.length === (window._textureFileNames || []).length) {
                    let cursor = 0;
                    textureUnitsMeta = units.map(u => {
                        const anim = u.anim || {};
                        const meta = { name: u.name || `纹理${cursor + 1}`, isAnim: !!u.isAnim, fps: (u.anim && u.anim.fps > 0) ? u.anim.fps : (u.fps || 0), mode: u.isAnim ? ((anim.mode != null ? anim.mode : 2)) : undefined, start: cursor, count: u.frames.length };
                        cursor += u.frames.length;
                        return meta;
                    });
                }

                // Fonts
                const fontEntries = Object.entries(window._importedFonts || {});

                // MIDI
                const midiTracks = window._currentMidiTracks || [];
                const midiFileName = document.getElementById('midiFileName')?.innerText || '';
                const midiSelectedTrack = parseInt(document.getElementById('midiTrackSelect')?.value) || 0;

                if (exportType.value === 'json') {
                    // Convert binary to base64
                    const texArr = await Promise.all(textureBlobs.map(async t => ({ name: t.name, data: await blobToBase64(t.blob) })));
                    const fontArr = await Promise.all(fontEntries.map(async ([name, buf]) => ({
                        name,
                        data: 'data:font/ttf;base64,' + arrayBufferToBase64(buf)
                    })));
                    const exportData = {
                        ...state,
                        textures: texArr,
                        textureUnits: textureUnitsMeta,
                        fonts: fontArr,
                        midi: midiTracks.length > 0 ? {
                            fileName: midiFileName,
                            selectedTrack: midiSelectedTrack,
                            tracks: midiTracks.map(t => ({ name: t.name, noteCount: t.noteCount, timestamps: t.timestamps, notes: t.notes }))
                        } : null
                    };
                    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = projectName + '.json';
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } else {
                    // ZIP
                    if (typeof JSZip === 'undefined') { Toast.error('JSZip 库未加载'); return; }
                    const zip = new JSZip();
                    state.textureNames = (window._textureFileNames || []).slice();
                    state.textureUnits = textureUnitsMeta;
                    zip.file('config.json', JSON.stringify(state, null, 2));
                    delete state.textureNames;
                    delete state.textureUnits;
                    const texFolder = zip.folder('textures');
                    for (const t of textureBlobs) texFolder.file(t.name, t.blob);
                    const fontFolder = zip.folder('fonts');
                    for (const [name, buf] of fontEntries) fontFolder.file(name, buf);
                    if (midiTracks.length > 0) {
                        const mf = zip.folder('midi');
                        mf.file('tracks.json', JSON.stringify({
                            fileName: midiFileName,
                            selectedTrack: midiSelectedTrack,
                            tracks: midiTracks.map(t => ({ name: t.name, noteCount: t.noteCount, timestamps: t.timestamps, notes: t.notes }))
                        }, null, 2));
                    }
                    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = projectName + '.zip';
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
            } catch (err) {
                console.error('[IE] Export error:', err);
                Toast.error('导出失败: ' + err.message);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindImportExport);
    } else {
        bindImportExport();
    }
})();
