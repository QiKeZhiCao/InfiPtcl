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
    
    function setPlaybackEnabled(enabled) {
        if (!playbackBar) return;
        if (seqPlayPauseBtn) seqPlayPauseBtn.disabled = !enabled;
        if (currentTimeInput) currentTimeInput.disabled = !enabled;
        if (progressSlider) progressSlider.disabled = !enabled;
    }
    
    // 等待所有纹理完全解码
    async function waitForTextures() {
        const textures = window._particleTextures || [];
        if (textures.length === 0) return;
        const promises = textures.map(img => {
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
                    exportStatusMsg.innerText = `导出时长超出序列结束，自动延长至粒子完全消失（${actualEnd.toFixed(2)}s）`;
                } else {
                    actualEnd = userEnd;
                }
                durationSec = actualEnd - currentTime;
                if (durationSec <= 0.01) {
                    Toast.error('导出时长为零或已超出序列结束。');
                    return;
                }
                exportStatusMsg.innerText = `序列模式：将从 ${currentTime.toFixed(2)}s 渲染 ${durationSec.toFixed(2)}s 片段（至 ${actualEnd.toFixed(2)}s）`;
            } else {
                Toast.error('时间戳数组无效，无法渲染序列模式。');
                return;
            }
        } else {
            durationSec = rawDuration;
        }
        
        totalFrames = Math.ceil(fps * durationSec);
        if (totalFrames <= 0) return;
        
        if (!('showDirectoryPicker' in window)) {
            Toast.error('当前浏览器不支持文件夹导出。');
            return;
        }
        
        let pickedDir = null;
        try {
            pickedDir = await window.showDirectoryPicker();
        } catch (err) {
            Toast.info('未选择文件夹，渲染已取消。');
            return;
        }
        
        isExporting = true;
        dirHandle = pickedDir;
        exportBtn.style.display = 'none';
        const cancelRow = document.getElementById('cancelExportRow');
        if (cancelRow) cancelRow.style.display = 'flex';
        exportProgressRow.style.display = 'flex';
        exportProgress.value = 0;
        exportProgressText.innerText = '0.00%';
        setPlaybackEnabled(false);
        
        originalBg = window.params?.backgroundColor || '#000000';
        if (window.params) window.params.backgroundColor = 'transparent';
        
        originalOnFrameCaptured = window._onFrameCaptured;
        window._onFrameCaptured = null;
        
        window._exporting = true;
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        // 【修复】粒子清空移至模拟逻辑之前
        if (clearBeforeRender && clearBeforeRender.checked && window._clearParticles) {
            window._clearParticles();
        }
        const originalState = window._cloneParticleState();
        
        const burstCount = burstCountSlider ? parseInt(burstCountSlider.value) : 12;
        let simulatedTime = 0;
        const step = 1 / fps;
        let nextPulseIdx = 0;
        
        function simulateTo(targetTime) {
            while (simulatedTime < targetTime - 1e-6) {
                let nextStep = step;
                if (isSequenceMode && nextPulseIdx < pulseTimes.length) {
                    const nextPulseTime = pulseTimes[nextPulseIdx];
                    if (nextPulseTime <= simulatedTime + step) {
                        const dt = nextPulseTime - simulatedTime;
                        if (dt > 0) {
                            window._stepSimulation(dt);
                            simulatedTime += dt;
                        }
                        for (let i=0; i<burstCount; i++) {
                            window.burstEmit(1);
                        }
                        nextPulseIdx++;
                        continue;
                    }
                }
                window._stepSimulation(step);
                simulatedTime += step;
            }
        }
        
        // 模拟到起始时间
        if (isSequenceMode && currentTime > 0) {
            simulateTo(currentTime);
            if (Math.abs(simulatedTime - currentTime) > 1e-6) {
                const dt = currentTime - simulatedTime;
                if (dt > 0) {
                    window._stepSimulation(dt);
                    simulatedTime = currentTime;
                }
            }
        }
        
        await waitForTextures();
        // 连续模式：保证第一帧发射至少一个粒子（低速时累加器可能不足）
        if (!isSequenceMode) {
            window.burstEmit(Math.max(1, Math.floor(window._particleParams.emitRate * step)));
        }

        window._stepSimulation(step);
        await waitForTextures();
        
        // 获取 canvas 元素（修复未定义错误）
        const canvas = document.getElementById('particleCanvas');
        
        exportStatusMsg.innerText = `预计算完成，开始渲染 ${totalFrames} 帧...`;
        
        // 【核心修复】所有帧统一：先模拟 → 后截图
        for (let frame = 0; frame < totalFrames; frame++) {
            if (exportCancel) break;
            window._stepSimulation(step);
            // 异步渲染等待，避免偶发截图空白
            await new Promise(resolve => requestAnimationFrame(resolve));

            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob) continue;
            const fileName = `${frame+1}.png`;
            try {
                const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
            } catch (err) {
                console.error('保存失败', err);
                Toast.error(`保存失败: ${err.message}`);
                cancelExport();
                break;
            }
            capturedFrames++;
            const progress = (capturedFrames / totalFrames) * 100;
            exportProgress.value = progress;
            exportProgressText.innerText = `${progress.toFixed(2)}%`;
            exportStatusMsg.innerText = `渲染中 ${capturedFrames}/${totalFrames}`;
        }
        
        // 恢复所有原始状态
        window._restoreParticleState(originalState);
        if (window.params) window.params.backgroundColor = originalBg;
        window._exporting = false;
        window._onFrameCaptured = originalOnFrameCaptured;
        setPlaybackEnabled(true);
        exportBtn.style.display = 'inline-block';
        if (cancelRow) cancelRow.style.display = 'none';
        exportProgressRow.style.display = 'none';
        
        exportStatusMsg.innerText = exportCancel ? '渲染已取消。' : `渲染完成！共 ${capturedFrames} 帧 PNG 已保存至所选文件夹。`;
        isExporting = false;
    }
    
    function cancelExport() {
        exportCancel = true;
        if (window.params) window.params.backgroundColor = originalBg;
        window._exporting = false;
        if (originalOnFrameCaptured) window._onFrameCaptured = originalOnFrameCaptured;
        setPlaybackEnabled(true);
        exportBtn.style.display = 'inline-block';
        const cancelRow = document.getElementById('cancelExportRow');
        if (cancelRow) cancelRow.style.display = 'none';
        exportProgressRow.style.display = 'none';
        exportStatusMsg.innerText = '渲染已取消。';
        isExporting = false;
    }
    
    exportBtn.addEventListener('click', startExport);
    cancelBtn.addEventListener('click', cancelExport);
})();