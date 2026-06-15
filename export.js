// export.js - 渲染PNG序列（支持序列模式自动延长至粒子消失）
(function() {
    const exportBtn = document.getElementById('exportBtn');
    const cancelRow = document.getElementById('cancelExportRow');
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
                
                // 计算最大粒子寿命（从UI滑块获取）
                const fadeStartMax = parseFloat(document.getElementById('fadeStartMax').value);
                const fadeDurationMax = parseFloat(document.getElementById('fadeDurationMax').value);
                const maxParticleLife = fadeStartMax + fadeDurationMax;
                
                const userEnd = currentTime + rawDuration;
                let actualEnd;
                if (userEnd > seqTotal) {
                    // 用户设定超出序列结束时间，自动延长到粒子完全消失
                    actualEnd = seqTotal + maxParticleLife;
                    exportStatusMsg.innerText = `导出时长超出序列结束，自动延长至粒子完全消失（${actualEnd.toFixed(2)}s）`;
                } else {
                    actualEnd = userEnd;
                }
                durationSec = actualEnd - currentTime;
                if (durationSec <= 0.01) {
                    exportStatusMsg.innerText = '导出时长为零或已超出序列结束。';
                    return;
                }
                exportStatusMsg.innerText = `序列模式：将从 ${currentTime.toFixed(2)}s 渲染 ${durationSec.toFixed(2)}s 片段（至 ${actualEnd.toFixed(2)}s）`;
            } else {
                exportStatusMsg.innerText = '时间戳数组无效，无法渲染序列模式。';
                return;
            }
        } else {
            durationSec = rawDuration;
        }
        
        totalFrames = Math.ceil(fps * durationSec);
        if (totalFrames <= 0) return;
        
        if (!('showDirectoryPicker' in window)) {
            exportStatusMsg.innerText = '错误：当前浏览器不支持文件夹导出。请使用 Chrome/Edge 86+ 并确保在 HTTPS 或 localhost 下运行。';
            return;
        }
        
        let pickedDir = null;
        try {
            pickedDir = await window.showDirectoryPicker();
        } catch (err) {
            exportStatusMsg.innerText = '未选择文件夹，渲染已取消。';
            return;
        }
        
        isExporting = true;
        dirHandle = pickedDir;
        exportBtn.style.display = 'none';
        cancelRow.style.display = 'flex';
        exportProgressRow.style.display = 'flex';
        exportProgress.value = 0;
        exportProgressText.innerText = '0.00%';
        setPlaybackEnabled(false);
        
        originalBg = window.params?.backgroundColor || '#000000';
        if (window.params) window.params.backgroundColor = 'transparent';
        
        originalOnFrameCaptured = window._onFrameCaptured;
        window._onFrameCaptured = null;
        window._exporting = true;
        
        // 保存原始状态
        const originalState = window._cloneParticleState();
        
        // 清空粒子（如果需要）
        if (clearBeforeRender && clearBeforeRender.checked && window._clearParticles) {
            window._clearParticles();
        }
        
        // 获取脉冲数量
        const burstCount = burstCountSlider ? parseInt(burstCountSlider.value) : 12;
        
        // 重置模拟时间
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
        
        // 模拟到起始时间 currentTime
        if (isSequenceMode && currentTime > 0) {
            simulateTo(currentTime);
            if (Math.abs(simulatedTime - currentTime) > 1e-6) {
                const dt = currentTime - simulatedTime;
                if (dt > 0) {
                    window._stepSimulation(dt);
                    simulatedTime = currentTime;
                }
            }
        } else if (!isSequenceMode && currentTime > 0) {
            // 连续模式不支持从非零开始，忽略
        }
        
        const canvas = document.getElementById('particleCanvas');
        exportStatusMsg.innerText = `预计算完成，开始渲染 ${totalFrames} 帧...`;
        
        for (let frame = 0; frame < totalFrames; frame++) {
            if (exportCancel) break;
            // 捕获当前帧
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
                exportStatusMsg.innerText = `保存失败: ${err.message}`;
                cancelExport();
                break;
            }
            capturedFrames++;
            const progress = (capturedFrames / totalFrames) * 100;
            exportProgress.value = progress;
            exportProgressText.innerText = `${progress.toFixed(2)}%`;
            exportStatusMsg.innerText = `渲染中 ${capturedFrames}/${totalFrames}`;
            
            if (frame < totalFrames - 1) {
                simulateTo(simulatedTime + step);
            }
        }
        
        // 恢复原始状态
        window._restoreParticleState(originalState);
        if (window.params) window.params.backgroundColor = originalBg;
        window._exporting = false;
        window._onFrameCaptured = originalOnFrameCaptured;
        setPlaybackEnabled(true);
        exportBtn.style.display = 'inline-block';
        cancelRow.style.display = 'none';
        exportProgressRow.style.display = 'none';
        
        if (!exportCancel) {
            exportStatusMsg.innerText = `渲染完成！共 ${capturedFrames} 帧 PNG 已保存至所选文件夹。`;
        } else {
            exportStatusMsg.innerText = '渲染已取消。';
        }
        isExporting = false;
    }
    
    function cancelExport() {
        exportCancel = true;
        if (window.params) window.params.backgroundColor = originalBg;
        window._exporting = false;
        if (originalOnFrameCaptured) window._onFrameCaptured = originalOnFrameCaptured;
        setPlaybackEnabled(true);
        exportBtn.style.display = 'inline-block';
        cancelRow.style.display = 'none';
        exportProgressRow.style.display = 'none';
        exportStatusMsg.innerText = '渲染已取消。';
        isExporting = false;
    }
    
    exportBtn.addEventListener('click', startExport);
    // cancelBtn 不再直接存在，通过 cancelRow 内的按钮获取
    const cancelBtn = document.getElementById('cancelExportBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', cancelExport);
})();