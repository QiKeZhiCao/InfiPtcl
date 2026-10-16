// render.js - 渲染PNG序列（修复第一帧空白问题，补充 canvas 定义）
(function() {
    const exportBtn = document.getElementById('exportBtn');
    const cancelBtn = document.getElementById('cancelExportBtn');
    const exportProgressRow = document.getElementById('exportProgressRow');
    const exportProgress = document.getElementById('exportProgress');
    const exportProgressText = document.getElementById('exportProgressText');
    const exportStatusMsg = document.getElementById('exportStatusMsg');
    const exportFpsSlider = document.getElementById('exportFps');
    const exportFpsVal = document.getElementById('exportFpsVal');
    const exportDurationSlider = document.getElementById('exportDuration');
    const exportDurationVal = document.getElementById('exportDurationVal');
    const clearBeforeRender = document.getElementById('clearBeforeRender');
    const resolutionScaleSlider = document.getElementById('resolutionScale');
    const resolutionScaleVal = document.getElementById('resolutionScaleVal');
    
    const playbackBar = document.getElementById('playbackBarContainer');
    const seqPlayPauseBtn = document.getElementById('seqPlayPauseBtn');
    const currentTimeInput = document.getElementById('currentTimeInput');
    const progressSlider = document.getElementById('progressSlider');
    const timelineInput = document.getElementById('timelineInput');
    const burstCountSlider = document.getElementById('burstCount');
    
    let isExporting = false;
    let exportCancel = false;
    let dirHandle = null;
    let totalFrames = 0;
    let capturedFrames = 0;
    let originalBg = '#000000';
    let fps = 30;
    let durationSec = 0;
    let originalOnFrameCaptured = null;
    let exportOriginalState = null;

    function bindNumericSync(slider, input) {
        if (!slider || !input) return;
        slider.addEventListener('input', () => { input.value = slider.value; });
        input.addEventListener('change', () => {
            let v = parseFloat(input.value);
            v = Math.min(parseFloat(slider.max), Math.max(parseFloat(slider.min), v));
            slider.value = v;
            input.value = v;
        });
    }
    bindNumericSync(exportFpsSlider, exportFpsVal);
    bindNumericSync(exportDurationSlider, exportDurationVal);
    bindNumericSync(resolutionScaleSlider, resolutionScaleVal);
    bindNumericSync(document.getElementById('webpQuality'), document.getElementById('webpQualityVal'));
    
    // 导出时长滑块最大值：序列模式=序列总时长，连续模式=300s
    window._updateExportDurationMax = function() {
        if (!exportDurationSlider) return;
        const isSeq = window._isContinuousMode === false;
        const seqTotal = window._sequenceTotal || 0;
        const newMax = isSeq && seqTotal > 0 ? seqTotal : 300;
        exportDurationSlider.max = newMax;
        const cur = parseFloat(exportDurationSlider.value);
        if (!isNaN(cur)) {
            const v = Math.min(newMax, Math.max(parseFloat(exportDurationSlider.min), cur));
            if (v !== cur) {
                exportDurationSlider.value = v;
                if (exportDurationVal) exportDurationVal.value = v;
            }
        }
    };
    
    function setPlaybackEnabled(enabled) {
        if (!playbackBar) return;
        if (seqPlayPauseBtn) seqPlayPauseBtn.disabled = !enabled;
        if (currentTimeInput) currentTimeInput.disabled = !enabled;
        if (progressSlider) progressSlider.disabled = !enabled;
    }

    // 动图模式隐藏「生成方式」：动图只支持单文件下载
    function isAnimFormat(fmt) {
        return fmt === 'animation' || fmt === 'png-animation';
    }
    function isPngFormat(fmt) {
        return fmt === 'png-sequence' || fmt === 'png-animation';
    }
    window._isAnimFormat = isAnimFormat;
    window._syncExportMethodVisibility = function() {
        const fmt = document.getElementById('exportFormat');
        const row = document.getElementById('exportMethodRow');
        const qRow = document.getElementById('webpQualityRow');
        if (!fmt) return;
        if (row) row.style.display = isAnimFormat(fmt.value) ? 'none' : '';
        if (qRow) qRow.style.display = isPngFormat(fmt.value) ? 'none' : '';
    };

    // 工程文件名清洗：去除路径/非法字符，兜底默认名
    function sanitizeFileName(name) {
        const base = String(name || '').replace(/[\\/:*?"<>|\r\n]+/g, '_').replace(/\s+/g, ' ').trim();
        return base || '未命名项目';
    }
    function projectName() {
        const el = document.getElementById('projectName');
        return sanitizeFileName(el ? el.value : '');
    }

    // 解析 PNG chunk 列表（Length+Type+Data+CRC，大端）
    function parsePngChunks(u8) {
        const chunks = [];
        const dv = new DataView(u8.buffer, u8.byteOffset);
        let o = 8;
        while (o + 12 <= u8.length) {
            const len = dv.getUint32(o, false);
            const tag = String.fromCharCode(u8[o+4], u8[o+5], u8[o+6], u8[o+7]);
            if (len < 0 || o + 12 + len > u8.length) break;
            chunks.push({ tag, data: u8.slice(o + 8, o + 8 + len) });
            o += 12 + len;
        }
        return chunks;
    }

    // 组装 PNG chunk（含 CRC）
    function buildPngChunk(tag, data) {
        function crc32(u) {
            let table = [];
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
                table[n] = c;
            }
            let crc = 0xffffffff;
            for (let i = 0; i < u.length; i++) crc = table[(crc ^ u[i]) & 0xff] ^ (crc >>> 8);
            return (crc ^ 0xffffffff) >>> 0;
        }
        const out = new ArrayBuffer(12 + data.length);
        const dv = new DataView(out);
        dv.setUint32(0, data.length, false);
        for (let i = 0; i < 4; i++) dv.setUint8(4 + i, tag.charCodeAt(i));
        for (let i = 0; i < data.length; i++) dv.setUint8(8 + i, data[i]);
        const full = new ArrayBuffer(4 + data.length);
        const fdv = new DataView(full);
        for (let i = 0; i < 4; i++) fdv.setUint8(i, tag.charCodeAt(i));
        for (let i = 0; i < data.length; i++) fdv.setUint8(4 + i, data[i]);
        dv.setUint32(8 + data.length, crc32(new Uint8Array(full)), false);
        return new Uint8Array(out);
    }

    // 用 PNG 帧 Blob 列表封装 APNG 动图（loop=0 无限循环，整帧覆盖）
    async function buildAnimatedPNG(frameBlobs, fps, loop) {
        function u32(v) { const a = new ArrayBuffer(4); new DataView(a).setUint32(0, v, false); return new Uint8Array(a); }
        function u16(v) { const a = new ArrayBuffer(2); new DataView(a).setUint16(0, v, false); return new Uint8Array(a); }
        const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        const first = parsePngChunks(new Uint8Array(await frameBlobs[0].arrayBuffer()));
        const ihdr = first.find(c => c.tag === 'IHDR');
        if (!ihdr) throw new Error('PNG 帧缺少 IHDR');
        const width = new DataView(ihdr.data.buffer, ihdr.data.byteOffset).getUint32(0, false);
        const height = new DataView(ihdr.data.buffer, ihdr.data.byteOffset).getUint32(4, false);
        const ihdrChunk = buildPngChunk('IHDR', ihdr.data);
        const delayNum = Math.max(1, Math.round(1000 / fps));
        const acTL = buildPngChunk('acTL', new Uint8Array([...u32(frameBlobs.length), ...u32(loop || 0)]));
        const parts = [sig, ihdrChunk, acTL];
        let seq = 0;
        for (let f = 0; f < frameBlobs.length; f++) {
            const fctl = new Uint8Array(26);
            fctl.set(u32(seq++), 0);
            fctl.set(u32(width), 4);
            fctl.set(u32(height), 8);
            fctl.set(u32(0), 12);
            fctl.set(u32(0), 16);
            fctl.set(u16(delayNum), 20);
            fctl.set(u16(1000), 22);
            fctl[24] = 0; // dispose_op: none
            fctl[25] = 0; // blend_op: source（整帧覆盖）
            parts.push(buildPngChunk('fcTL', fctl));
            const chunks = parsePngChunks(new Uint8Array(await frameBlobs[f].arrayBuffer()));
            const idatAll = [];
            for (const c of chunks) if (c.tag === 'IDAT') idatAll.push(...c.data);
            if (f === 0) {
                parts.push(buildPngChunk('IDAT', new Uint8Array(idatAll)));
            } else {
                parts.push(buildPngChunk('fdAT', new Uint8Array([...u32(seq++), ...idatAll])));
            }
        }
        parts.push(buildPngChunk('IEND', new Uint8Array(0)));
        const total = parts.reduce((s, p) => s + p.length, 0);
        const full = new Uint8Array(total);
        let off = 0;
        for (const p of parts) { full.set(p, off); off += p.length; }
        return { blob: new Blob([full], { type: 'image/png' }), width, height };
    }

    // 解析 WebP 的 RIFF chunk 列表（含奇长 padding）
    function parseWebPChunks(buf) {
        const u = new Uint8Array(buf);
        const chunks = [];
        let o = 12;
        while (o + 8 <= u.length) {
            const tag = String.fromCharCode(u[o], u[o+1], u[o+2], u[o+3]);
            const size = u[o+4] | (u[o+5] << 8) | (u[o+6] << 16) | (u[o+7] << 24);
            if (size < 0 || o + 8 + size > u.length) break;
            chunks.push({ tag, size, dataOff: o + 8 });
            o += 8 + size + (size % 2);
        }
        return chunks;
    }

    // 从静态 WebP 字节中提取子 chunk（含 4CC + size 头，奇长补 0）
    function extractSubChunk(u8, tag) {
        const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
        const ch = parseWebPChunks(buf).find(c => c.tag === tag);
        if (!ch) return null;
        const out = new Uint8Array(8 + ch.size + (ch.size % 2));
        out[0] = tag.charCodeAt(0); out[1] = tag.charCodeAt(1); out[2] = tag.charCodeAt(2); out[3] = tag.charCodeAt(3);
        out[4] = ch.size & 0xff; out[5] = (ch.size >> 8) & 0xff; out[6] = (ch.size >> 16) & 0xff; out[7] = (ch.size >> 24) & 0xff;
        out.set(new Uint8Array(buf, ch.dataOff, ch.size), 8);
        return out;
    }

    // 读取 VP8X 画布尺寸（3 字节 LE -1 编码）
    function readCanvasSize(u8) {
        const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
        const vpx = parseWebPChunks(buf).find(c => c.tag === 'VP8X');
        if (!vpx) return null;
        const o = vpx.dataOff + 4;
        return {
            w: (u8[o] | (u8[o+1] << 8) | (u8[o+2] << 16)) + 1,
            h: (u8[o+3] | (u8[o+4] << 8) | (u8[o+5] << 16)) + 1
        };
    }

    // 拼接单帧动画 WebP（ANMF：X/Y/W-1/H-1/Duration 均为 24 位）
    function buildAnimatedWebP(frameChunks, canvasW, canvasH, fps, loop) {
        const L24 = v => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff];
        const dur = Math.max(10, Math.round(1000 / fps));
        let hasAlpha = false;
        const anmfParts = [];
        for (const fc of frameChunks) {
            if (fc.alph || fc.vp8l) hasAlpha = true;
            // 尾字节：B=1(no blend) + D=0，整帧覆盖消除透明残影
            const head = [...L24(0), ...L24(0), ...L24(canvasW - 1), ...L24(canvasH - 1), ...L24(dur), 0x02];
            const body = [];
            if (fc.vp8l) {
                // VP8L 无损帧：透明随位流本身，直接整体内嵌，不带 ALPH
                body.push(fc.vp8l);
            } else {
                if (fc.alph) body.push(fc.alph);
                if (fc.vp8) body.push(fc.vp8);
            }
            const bodyLen = body.reduce((s, b) => s + b.length, 0);
            const payload = new Uint8Array(head.length + bodyLen);
            payload.set(new Uint8Array(head), 0);
            let bp = head.length;
            for (const b of body) { payload.set(b, bp); bp += b.length; }
            const bl = payload.length;
            const anmf = new Uint8Array(8 + bl);
            anmf[0] = 0x41; anmf[1] = 0x4e; anmf[2] = 0x4d; anmf[3] = 0x46;
            anmf[4] = bl & 0xff; anmf[5] = (bl >> 8) & 0xff; anmf[6] = (bl >> 16) & 0xff; anmf[7] = (bl >> 24) & 0xff;
            anmf.set(payload, 8);
            anmfParts.push(anmf);
        }
        // VP8X flags：bit1=animation(0x02)，含 alpha 时 bit4=0x10
        const vp8x = new Uint8Array(18);
        vp8x[0]=0x56; vp8x[1]=0x50; vp8x[2]=0x38; vp8x[3]=0x58;
        vp8x[4]=10; vp8x[5]=0; vp8x[6]=0; vp8x[7]=0;
        vp8x[8] = 0x02 | (hasAlpha ? 0x10 : 0x00);
        vp8x[9]=0; vp8x[10]=0; vp8x[11]=0;
        const wl = L24(canvasW - 1), hl = L24(canvasH - 1);
        vp8x[12]=wl[0]; vp8x[13]=wl[1]; vp8x[14]=wl[2];
        vp8x[15]=hl[0]; vp8x[16]=hl[1]; vp8x[17]=hl[2];
        // ANIM：背景色(BGRA)+loop(2)
        const anim = new Uint8Array(14);
        anim[0]=0x41; anim[1]=0x4e; anim[2]=0x49; anim[3]=0x4d;
        anim[4]=6; anim[5]=0; anim[6]=0; anim[7]=0;
        anim[8]=0; anim[9]=0; anim[10]=0; anim[11]=0;
        anim[12]=loop & 0xff; anim[13]=(loop >> 8) & 0xff;
        const full = new Uint8Array(vp8x.length + anim.length + anmfParts.reduce((s,a)=>s+a.length,0));
        let p = 0;
        full.set(vp8x, p); p += vp8x.length;
        full.set(anim, p); p += anim.length;
        for (const a of anmfParts) { full.set(a, p); p += a.length; }
        // RIFF 头：File Size = 4 + full.length
        const file = new Uint8Array(12 + full.length);
        file[0]=0x52; file[1]=0x49; file[2]=0x46; file[3]=0x46;
        const rsize = 4 + full.length;
        file[4]=rsize & 0xff; file[5]=(rsize>>8)&0xff; file[6]=(rsize>>16)&0xff; file[7]=(rsize>>24)&0xff;
        file[8]=0x57; file[9]=0x45; file[10]=0x42; file[11]=0x50;
        file.set(full, 12);
        return new Blob([file], { type: 'image/webp' });
    }

    // 校验导出尺寸可用：表面绘制验证 + WebP 编码输出尺寸验证（WebP/VP8 上限 16383）
    async function checkExportSize(w, h) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        try {
            if (c.width !== w || c.height !== h) return false;
            const ctx = c.getContext('2d');
            if (!ctx) return false;
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(0, 0, 1, 1);
            const d = ctx.getImageData(0, 0, 1, 1).data;
            if (d[0] !== 255) return false;
        } catch (e) {
            return false;
        }
        try {
            const blob = await new Promise(res => c.toBlob(res, 'image/webp', 0.92));
            if (!blob) return false;
            const bmp = await createImageBitmap(blob);
            const ok = bmp.width === w && bmp.height === h;
            if (bmp.close) bmp.close();
            return ok;
        } catch (e) {
            return false;
        }
    }
    
    // 等待所有纹理完全解码
    async function waitForTextures() {
        const textures = window._particleTextures || [];
        const units = window._textureUnits || [];
        const all = [];
        for (const t of textures) all.push(t);
        for (const u of units) for (const t of u.frames) all.push(t);
        if (all.length === 0) return;
        const promises = all.map(img => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            if (img.decode) return img.decode();
            return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
            });
        });
        await Promise.all(promises);
    }
    
    async function startExport() {
        if (isExporting) {
            exportCancel = true;
            await new Promise(resolve => setTimeout(resolve, 200));
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        exportCancel = false;
        capturedFrames = 0;
        isExporting = false;
        
        fps = parseFloat(exportFpsSlider.value);
        if (isNaN(fps)) fps = 30;
        let rawDuration = parseFloat(exportDurationSlider.value);
        if (isNaN(rawDuration)) rawDuration = 1;
        if (window._updateExportDurationMax) window._updateExportDurationMax();
        
        const isSequenceMode = window._isContinuousMode === false;
        let seqTotal = 0;
        let currentTime = 0;
        let pulseTimes = [];
        
        if (isSequenceMode) {
            try {
                const raw = timelineInput.value.trim();
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    pulseTimes = parsed.filter(t => typeof t === 'number').sort((a,b)=>a-b);
                }
            } catch(e) { console.warn(e); }
            if (pulseTimes.length > 0) {
                seqTotal = pulseTimes[pulseTimes.length-1];
                currentTime = parseFloat(currentTimeInput.value);
                if (isNaN(currentTime)) currentTime = 0;
                currentTime = Math.min(seqTotal, Math.max(0, currentTime));
                
                const fadeStartMax = parseFloat(document.getElementById('fadeStartMax').value);
                const fadeDurationMax = parseFloat(document.getElementById('fadeDurationMax').value);
                const maxParticleLife = fadeStartMax + fadeDurationMax;
                
                const userEnd = currentTime + rawDuration;
                let actualEnd;
                if (userEnd > seqTotal) {
                    actualEnd = seqTotal + maxParticleLife;
                } else {
                    actualEnd = userEnd;
                }
                durationSec = actualEnd - currentTime;
                if (durationSec <= 0.01) {
                    Toast.error('导出时长为零或已超出序列结束。');
                    return;
                }
            } else {
                Toast.error('时间戳数组无效，无法渲染序列模式。');
                return;
            }
        } else {
            durationSec = rawDuration;
        }
        
        totalFrames = Math.ceil(fps * durationSec);
        if (totalFrames <= 0) return;
        
        const exportFormatEl = document.getElementById('exportFormat');
        const exportMethodEl = document.getElementById('exportMethod');
        const exportFormat = exportFormatEl ? exportFormatEl.value : 'sequence';
        // 动图模式强制单文件下载
        let exportMethod = isAnimFormat(exportFormat) ? 'single' : (exportMethodEl ? exportMethodEl.value : 'folder');
        
        // 收集帧数据（动图模式在渲染结束后统一封装）
        const capturedFrameBlobs = [];
        let zip = null;
        if (exportMethod === 'zip') {
            if (typeof JSZip === 'undefined') {
                Toast.error('JSZip 未加载，无法打包 ZIP。');
                return;
            }
            zip = new JSZip();
        } else if (exportMethod === 'folder') {
            if (!('showDirectoryPicker' in window)) {
                Toast.error('当前浏览器不支持文件夹导出。');
                return;
            }
        }
        
        if (exportMethod === 'folder') {
            try {
                dirHandle = await window.showDirectoryPicker();
            } catch (err) {
                Toast.info('未选择文件夹，渲染已取消。');
                return;
            }
        }
        
        const baseName = projectName();
        
        isExporting = true;
        exportBtn.style.display = 'none';
        const cancelRow = document.getElementById('cancelExportRow');
        if (cancelRow) cancelRow.style.display = 'flex';
        exportProgressRow.style.display = 'flex';
        exportProgress.value = 0;
        exportProgressText.innerText = `0/${totalFrames} 0%`;
        setPlaybackEnabled(false);
        Toast.info('开始渲染...');
        
        originalBg = window.params?.backgroundColor || '#000000';
        if (window.params) window.params.backgroundColor = 'transparent';
        
        originalOnFrameCaptured = window._onFrameCaptured;
        window._onFrameCaptured = null;
        
        window._exporting = true;
        if (window._setRngSeed) window._setRngSeed(window._INITIAL_SEED || 12345);
        if (window._syncEmitterCrosshair) window._syncEmitterCrosshair();
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        // 【修复】粒子清空移至模拟逻辑之前
        if (clearBeforeRender && clearBeforeRender.checked && window._clearParticles) {
            window._clearParticles();
        }
        exportOriginalState = window._cloneParticleState();

        // 分辨率倍率：离屏 canvas 渲染（不动主画布）
        const qualitySlider = document.getElementById('webpQuality');
        const webpQuality = qualitySlider ? parseFloat(qualitySlider.value) : 0.92;
        const scale = resolutionScaleSlider ? parseFloat(resolutionScaleSlider.value) : 1;
        const mainCanvas = document.getElementById('particleCanvas');
        // 导出始终使用独立画布：预览画布保持降采样，导出不受预览位图影响。
        // 尺寸基于「逻辑尺寸 × 分辨倍率」，与预览位图尺寸无关。
        const logicalSize = window._getLogicalSize ? window._getLogicalSize() : { w: mainCanvas.width, h: mainCanvas.height };
        const outW = Math.max(1, Math.round(logicalSize.w * scale));
        const outH = Math.max(1, Math.round(logicalSize.h * scale));
        if (!await checkExportSize(outW, outH)) {
            Toast.warn(`分辨率超限，请降低倍率`);
            setPlaybackEnabled(true);
            exportBtn.style.display = 'inline-block';
            if (cancelRow) cancelRow.style.display = 'none';
            exportProgressRow.style.display = 'none';
            window._exporting = false;
            return;
        }
        let exportCanvas = document.createElement('canvas');
        exportCanvas.width = outW;
        exportCanvas.height = outH;
        window._setExportTarget(exportCanvas);
        if (scale !== 1) {
            const p = window._particleParams;
            if (p) {
                p.sizeMin *= scale; p.sizeMax *= scale;
                p.speedMin *= scale; p.speedMax *= scale;
                p.emitRadius *= scale;
                p.gravityX *= scale; p.gravityY *= scale;
            }
            if (window._clearParticles) window._clearParticles();
            if (window._scaleEmitterPos) window._scaleEmitterPos(scale);
        }
        
        const burstCount = burstCountSlider ? parseInt(burstCountSlider.value) : 12;
        let simulatedTime = 0;
        const step = 1 / fps;
        let nextPulseIdx = 0;
        
        function getForceHsl(idx) {
            const pitches = window._sequencePitches || [];
            const pitchColorMap = window._pitchColorMap || {};
            const pitch = pitches[idx];
            if (pitch != null && pitchColorMap[pitch]) {
                const hsl = window._hexToHsl(pitchColorMap[pitch]);
                return { h: hsl.h, s: hsl.s, l: hsl.l };
            }
            return undefined;
        }
        
        // 统一推进模拟至目标时刻：脉冲到达时先发射，再继续模拟渲染
        function advanceTo(targetTime) {
            while (simulatedTime < targetTime - 1e-6) {
                let nextStep = step;
                if (isSequenceMode && nextPulseIdx < pulseTimes.length) {
                    const t = pulseTimes[nextPulseIdx];
                    if (t <= simulatedTime + nextStep) {
                        const dt = Math.max(0, t - simulatedTime);
                        if (dt > 0) {
                            window._stepSimulation(dt);
                            simulatedTime += dt;
                        }
                        window.burstEmit(burstCount, getForceHsl(nextPulseIdx), nextPulseIdx * 10000);
                        nextPulseIdx++;
                        continue;
                    }
                }
                window._stepSimulation(nextStep);
                simulatedTime += nextStep;
            }
        }
        
        await waitForTextures();
        // 推进到起始时间（0s 脉冲会在首帧前发射并渲染，保证第一帧有粒子）
        advanceTo(currentTime);
        // 连续模式：保证第一帧发射至少一个粒子（低速时累加器可能不足）
        if (!isSequenceMode) {
            window.burstEmit(Math.max(1, Math.floor(window._particleParams.emitRate * step)));
        }
        
        // 在截图前把离屏内容实时预览到主画布
        function previewExport() {
            if (exportCanvas) {
                const mctx = mainCanvas.getContext('2d');
                mctx.setTransform(1, 0, 0, 1, 0, 0);
                mctx.imageSmoothingEnabled = !window._noTextureSmoothing;
                mctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
                mctx.drawImage(exportCanvas, 0, 0, mainCanvas.width, mainCanvas.height);
            }
        }
        
        const renderStart = isSequenceMode ? currentTime : 0;
        const renderEnd = renderStart + durationSec;
        
        // 【核心】所有帧统一：按目标时刻推进模拟（含脉冲发射）→ 截图
        let canvasSize = null;
        const exportT0 = performance.now();
        const frameTimes = [];
        const SPEED_WINDOW = 10;
        for (let frame = 0; frame < totalFrames; frame++) {
            if (exportCancel) break;
            const target = renderStart + (frame + 1) * step;
            advanceTo(target);
            if (window._renderTerminated) { exportCancel = true; break; }

            // 异步渲染等待，避免偶发截图空白
            await new Promise(resolve => requestAnimationFrame(resolve));
            previewExport();

            const frameMime = isPngFormat(exportFormat) ? 'image/png' : 'image/webp';
            const frameExt = isPngFormat(exportFormat) ? '.png' : '.webp';
            const blob = await new Promise(resolve => (exportCanvas || mainCanvas).toBlob(resolve, frameMime, webpQuality));
            if (!blob) continue;
            if (!canvasSize) {
                if (isPngFormat(exportFormat)) {
                    const size = await new Promise(resolve => {
                        const img = new Image();
                        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
                        img.onerror = () => resolve(null);
                        img.src = URL.createObjectURL(blob);
                    });
                    if (size) canvasSize = size;
                } else {
                    // 优先从 VP8X 读画布尺寸；无 VP8X（简单格式）时回退解码读取
                    let size = readCanvasSize(new Uint8Array(await blob.arrayBuffer()));
                    if (!size) {
                        try {
                            const bmp = await createImageBitmap(blob);
                            size = { w: bmp.width, h: bmp.height };
                            if (bmp.close) bmp.close();
                        } catch(e) { size = null; }
                    }
                    if (size) canvasSize = size;
                }
            }
            
            if (isAnimFormat(exportFormat)) {
                capturedFrameBlobs.push(blob);
            } else if (exportMethod === 'zip') {
                zip.file(`frame_${frame + 1}${frameExt}`, blob);
            } else {
                const fileName = `${frame+1}${frameExt}`;
                try {
                    try { await dirHandle.removeEntry(fileName); } catch(e) {}
                    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    try {
                        await writable.write(blob);
                    } finally {
                        await writable.close().catch(() => {});
                    }
                } catch (err) {
                    console.error('保存失败', err);
                    Toast.error(`保存失败: ${err.message}`);
                    cancelExport();
                    break;
                }
            }
            capturedFrames++;
            exportProgress.value = (capturedFrames / totalFrames) * 100;
            const pct = ((capturedFrames / totalFrames) * 100).toFixed(1);
            exportProgressText.innerText = `${capturedFrames}/${totalFrames} ${pct}%`;
            const elapsedSec = (performance.now() - exportT0) / 1000;
            frameTimes.push(performance.now());
            if (frameTimes.length > SPEED_WINDOW) frameTimes.shift();
            let speedFps = 0;
            if (frameTimes.length >= 2) {
                const win = (frameTimes[frameTimes.length - 1] - frameTimes[0]) / 1000;
                speedFps = win > 0 ? (frameTimes.length - 1) / win : 0;
            }
            const remainSec = speedFps > 0 ? (totalFrames - capturedFrames) / speedFps : 0;
            const fmtDur = (s) => {
                s = Math.max(0, Math.round(s));
                const m = Math.floor(s / 60), sec = s % 60;
                return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
            };
            exportStatusMsg.innerText =
                `渲染区间：${fmtDur(renderStart)} → ${fmtDur(renderEnd)}\n` +
                `速度：${speedFps.toFixed(2)} 帧/秒\n` +
                `已用：${fmtDur(elapsedSec)}\n` +
                `剩余：${fmtDur(remainSec)}`;
        }
        
        // 动图模式：用所有帧封装动画（WebP/APNG，loop=0 无限循环）
        if (!exportCancel && isAnimFormat(exportFormat) && capturedFrameBlobs.length > 0) {
            let animBlob = null;
            let animName = '';
            if (isPngFormat(exportFormat)) {
                const apng = await buildAnimatedPNG(capturedFrameBlobs, fps, 0);
                animBlob = apng.blob;
                animName = baseName + '.png';
            } else {
                if (!canvasSize) canvasSize = readCanvasSize(new Uint8Array(await capturedFrameBlobs[0].arrayBuffer()));
                if (canvasSize) {
                    const frameData = [];
                    for (const b of capturedFrameBlobs) {
                        const u8 = new Uint8Array(await b.arrayBuffer());
                        // 优先无损（VP8L），否则有损（VP8 + 可选 ALPH）
                        const vp8l = extractSubChunk(u8, 'VP8L');
                        frameData.push({
                            vp8l,
                            vp8: vp8l ? null : extractSubChunk(u8, 'VP8 '),
                            alph: vp8l ? null : extractSubChunk(u8, 'ALPH')
                        });
                    }
                    animBlob = buildAnimatedWebP(frameData, canvasSize.w, canvasSize.h, fps, 0);
                    animName = baseName + '.webp';
                }
            }
            if (animBlob && animName) {
                if (exportMethod === 'zip') {
                    zip.file(animName, animBlob);
                } else if (exportMethod === 'single') {
                    try {
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(animBlob);
                        a.download = animName;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
                    } catch (err) {
                        console.error('下载失败', err);
                        Toast.error(`下载失败: ${err.message}`);
                        exportCancel = true;
                    }
                } else {
                    try {
                        try { await dirHandle.removeEntry(animName); } catch(e) {}
                        const fileHandle = await dirHandle.getFileHandle(animName, { create: true });
                        const writable = await fileHandle.createWritable();
                        try { await writable.write(animBlob); } finally { await writable.close().catch(() => {}); }
                    } catch (err) {
                        console.error('保存失败', err);
                        Toast.error(`保存失败: ${err.message}`);
                        exportCancel = true;
                    }
                }
            }
        }
        
        // ZIP 生成：生成压缩包并触发下载（静帧序列）
        if (!exportCancel && exportMethod === 'zip' && zip && !isAnimFormat(exportFormat)) {
            try {
                const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(zipBlob);
                a.download = baseName + '.zip';
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            } catch (err) {
                console.error('ZIP 打包失败', err);
                Toast.error(`ZIP 打包失败: ${err.message}`);
                exportCancel = true;
            }
        }
        
        // 恢复渲染目标（分辨率倍率时切回主画布）
        if (window._setExportTarget) window._setExportTarget(null);
        // 恢复所有原始状态（参数由 _restoreParticleState 恢复）
        if (exportOriginalState && window._restoreParticleState) {
            window._restoreParticleState(exportOriginalState);
            exportOriginalState = null;
        }
        if (window.params) window.params.backgroundColor = originalBg;
        window._exporting = false;
        window._onFrameCaptured = originalOnFrameCaptured;
        setPlaybackEnabled(true);
        exportBtn.style.display = 'inline-block';
        if (cancelRow) cancelRow.style.display = 'none';
        exportProgressRow.style.display = 'none';
        if (exportStatusMsg) exportStatusMsg.innerText = '';
        
        if (window._renderTerminated) {
            // 终止错误已在 particle.js 检测点提示
        } else if (exportCancel) {
            Toast.warn('渲染已取消');
        } else {
            Toast.success('渲染完成');
        }
        isExporting = false;
    }
    
    function cancelExport() {
        exportCancel = true;
        if (window._setExportTarget) window._setExportTarget(null);
        if (window.params) window.params.backgroundColor = originalBg;
        window._exporting = false;
        if (originalOnFrameCaptured) window._onFrameCaptured = originalOnFrameCaptured;
        setPlaybackEnabled(true);
        exportBtn.style.display = 'inline-block';
        const cancelRow = document.getElementById('cancelExportRow');
        if (cancelRow) cancelRow.style.display = 'none';
        exportProgressRow.style.display = 'none';
        if (exportStatusMsg) exportStatusMsg.innerText = '';
        if (exportOriginalState && window._restoreParticleState) {
            window._restoreParticleState(exportOriginalState);
            exportOriginalState = null;
        }
        isExporting = false;
    }
    
    exportBtn.addEventListener('click', startExport);
    cancelBtn.addEventListener('click', cancelExport);

    // 动图模式隐藏「生成方式」
    const formatEl = document.getElementById('exportFormat');
    if (formatEl) {
        formatEl.addEventListener('change', () => window._syncExportMethodVisibility());
        window._syncExportMethodVisibility();
    }
})();