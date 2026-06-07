// sequence.js - 序列脉冲模式，自动创建循环复选框，修复播放按钮文字，移除加载按钮，脉冲数量自动重载，进度时间可编辑
(function(){
    let loopSeqCheckbox = document.getElementById('loopSeqCheckbox');
    if (!loopSeqCheckbox) {
        const sequencePanel = document.getElementById('sequencePanel');
        if (sequencePanel) {
            const row = document.createElement('div');
            row.className = 'param-row';
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '6px';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = 'loopSeqCheckbox';
            cb.checked = false;
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' 🔁 循环'));
            row.appendChild(label);
            // 不再有 loadTimelineBtn，插入到第一个 param-row 之后
            const firstRow = document.querySelector('#sequencePanel .param-row');
            if (firstRow) {
                firstRow.insertAdjacentElement('afterend', row);
            } else {
                sequencePanel.appendChild(row);
            }
            loopSeqCheckbox = cb;
        } else {
            loopSeqCheckbox = { checked: false };
        }
    }

    const continuousModeBtn = document.getElementById('continuousModeBtn');
    const sequenceModeBtn = document.getElementById('sequenceModeBtn');
    const timelineInput = document.getElementById('timelineInput');
    const seqStatusMsg = document.getElementById('seqStatusMsg');
    const burstCountSlider = document.getElementById('burstCount');
    const burstCountVal = document.getElementById('burstCountVal');
    const midiUpload = document.getElementById('midiUpload');
    const midiTrackSelect = document.getElementById('midiTrackSelect');
    const precisionSelect = document.getElementById('precisionSelect');
    
    const playbackBar = document.getElementById('playbackBarContainer');
    const seqPlayPauseBtn = document.getElementById('seqPlayPauseBtn');
    const progressSlider = document.getElementById('progressSlider');
    const currentTimeInput = document.getElementById('currentTimeInput');
    const totalTimeSpan = document.getElementById('totalTimeDisplay');
    
    if (!seqPlayPauseBtn || !progressSlider) {
        console.error('Missing required elements for sequence control');
        return;
    }
    
    let burstCount = 12;
    if (burstCountSlider) {
        burstCountSlider.addEventListener('input', () => {
            burstCount = parseInt(burstCountSlider.value);
            if (burstCountVal) burstCountVal.value = burstCount;
            // 自动重载序列
            if (sequenceEvents.length) loadTimeline();
        });
        if (burstCountVal) burstCountVal.value = burstCount;
    }
    
    let currentMidiTracks = [];
    let sequenceEvents = [];
    let seqPlaybackActive = false;
    let seqPaused = false;
    let seqStartRealTime = 0;
    let seqPausedTime = 0;
    let seqNextIndex = 0;
    let seqLoop = false;
    let totalDuration = 0;
    
    const burstEmit = window.burstEmit;
    
    function parseTimelineToEvents(arr) {
        let events = [];
        for(let t of arr){
            if(typeof t === 'number' && !isNaN(t)){
                events.push({ time: t, count: burstCount });
            }
        }
        events.sort((a,b)=>a.time-b.time);
        return events;
    }
    
    function updateTotalDuration() {
        if (sequenceEvents.length === 0) totalDuration = 0;
        else totalDuration = sequenceEvents[sequenceEvents.length-1].time;
        if (totalTimeSpan) totalTimeSpan.innerText = totalDuration.toFixed(2);
        if (progressSlider) progressSlider.max = totalDuration;
        if (progressSlider) progressSlider.value = seqPausedTime;
        if (currentTimeInput) currentTimeInput.value = seqPausedTime.toFixed(2);
    }
    
    function loadTimeline() {
        try {
            let raw = timelineInput ? timelineInput.value.trim() : '';
            if(!raw) throw new Error('请输入时间戳数组');
            let parsed = JSON.parse(raw);
            if(!Array.isArray(parsed)) throw new Error('必须是数组格式');
            let events = parseTimelineToEvents(parsed);
            if(events.length === 0) throw new Error('没有有效数字时间戳');
            sequenceEvents = events;
            updateTotalDuration();
            if (seqStatusMsg) seqStatusMsg.innerText = `✅ 已加载 ${events.length} 个脉冲 （每次${burstCount}粒子）`;
            stopSequence();
            return true;
        } catch(e){
            if (seqStatusMsg) seqStatusMsg.innerText = `❌ 解析失败: ${e.message}`;
            return false;
        }
    }
    
    function formatTimestamps(timestampsRaw, precision) {
        if (!timestampsRaw || timestampsRaw.length === 0) return "[]";
        const rounded = timestampsRaw.map(t => parseFloat(t.toFixed(precision)));
        return JSON.stringify(rounded, null, 2);
    }
    
    function updateTimelineFromSelectedTrack() {
        if (!midiTrackSelect || !precisionSelect || !timelineInput) return;
        const selected = midiTrackSelect.value;
        const precision = parseInt(precisionSelect.value);
        let timestamps = [];
        if (selected === "all") {
            for (let track of currentMidiTracks) timestamps.push(...track.timestamps);
            timestamps.sort((a,b)=>a-b);
        } else {
            const idx = parseInt(selected);
            if (!isNaN(idx) && currentMidiTracks[idx]) timestamps = currentMidiTracks[idx].timestamps;
        }
        if (timestamps.length === 0) {
            if (seqStatusMsg) seqStatusMsg.innerText = '⚠️ 所选轨道无音符事件';
            timelineInput.value = "[]";
            return;
        }
        const jsonStr = formatTimestamps(timestamps, precision);
        timelineInput.value = jsonStr;
        if (seqStatusMsg) seqStatusMsg.innerText = `🎵 已加载轨道: ${midiTrackSelect.options[midiTrackSelect.selectedIndex].text} | 共 ${timestamps.length} 个音符 | 精度: ${precision} 位小数`;
        loadTimeline();
    }
    
    function updateProgressDisplay(currentSec) {
        if (totalDuration > 0) {
            if (progressSlider) progressSlider.value = currentSec;
            if (currentTimeInput) currentTimeInput.value = currentSec.toFixed(2);
        } else {
            if (progressSlider) progressSlider.value = 0;
            if (currentTimeInput) currentTimeInput.value = "0.00";
        }
    }
    
    function seekTo(targetTime) {
        if (!sequenceEvents.length) {
            if (seqStatusMsg) seqStatusMsg.innerText = '⚠️ 请先加载时间戳序列';
            return;
        }
        targetTime = Math.min(Math.max(0, targetTime), totalDuration);
        let newIndex = 0;
        while (newIndex < sequenceEvents.length && sequenceEvents[newIndex].time < targetTime) newIndex++;
        seqNextIndex = newIndex;
        if (seqPlaybackActive && !seqPaused) {
            const now = performance.now() / 1000;
            seqStartRealTime = now - targetTime;
            updateProgressDisplay(targetTime);
        } else if (seqPaused) {
            seqPausedTime = targetTime;
            updateProgressDisplay(targetTime);
        } else {
            seqPausedTime = targetTime;
            updateProgressDisplay(targetTime);
        }
        if (seqStatusMsg) seqStatusMsg.innerText = `🎯 跳转至 ${targetTime.toFixed(3)} 秒`;
    }
    
    function playSequence() {
        if (!sequenceEvents.length) {
            if (seqStatusMsg) seqStatusMsg.innerText = '⚠️ 请先加载有效时间戳序列';
            return;
        }
        if (seqPlaybackActive && !seqPaused) return;
        
        const now = performance.now() / 1000;
        if (seqPaused) {
            const resumeTime = seqPausedTime;
            seqStartRealTime = now - resumeTime;
            seqPlaybackActive = true;
            seqPaused = false;
            if (seqStatusMsg) seqStatusMsg.innerText = `▶️ 播放中 从 ${resumeTime.toFixed(3)} 秒继续`;
        } else {
            let startOffset = seqPausedTime;
            if (isNaN(startOffset)) startOffset = 0;
            startOffset = Math.min(Math.max(0, startOffset), totalDuration);
            let startIndex = 0;
            while (startIndex < sequenceEvents.length && sequenceEvents[startIndex].time < startOffset) startIndex++;
            seqNextIndex = startIndex;
            seqPlaybackActive = true;
            seqPaused = false;
            seqStartRealTime = now - startOffset;
            seqLoop = loopSeqCheckbox ? loopSeqCheckbox.checked : false;
            if (seqStatusMsg) seqStatusMsg.innerText = `🎵 播放中 从 ${startOffset.toFixed(3)} 秒开始 | 共${sequenceEvents.length}个脉冲 | 循环:${seqLoop?'开':'关'}`;
        }
        window._isContinuousMode = false;
        if (seqPlayPauseBtn) seqPlayPauseBtn.innerHTML = '⏸️ 暂停 （空格）';
        if (playbackBar) playbackBar.style.display = 'flex';
    }
    
    function pauseSequence() {
        if (seqPlaybackActive && !seqPaused) {
            const now = performance.now() / 1000;
            const currentProgress = now - seqStartRealTime;
            seqPausedTime = Math.min(Math.max(0, currentProgress), totalDuration);
            seqPlaybackActive = false;
            seqPaused = true;
            if (seqPlayPauseBtn) seqPlayPauseBtn.innerHTML = '▶️ 播放 （空格）';
            updateProgressDisplay(seqPausedTime);
            if (seqStatusMsg) seqStatusMsg.innerText = `⏸️ 已暂停于 ${seqPausedTime.toFixed(3)} 秒`;
        }
    }
    
    function stopSequence() {
        if (!seqPlaybackActive && !seqPaused && seqPausedTime === 0) return;
        seqPlaybackActive = false;
        seqPaused = false;
        seqNextIndex = 0;
        seqPausedTime = 0;
        updateProgressDisplay(0);
        if (seqPlayPauseBtn) seqPlayPauseBtn.innerHTML = '▶️ 播放 （空格）';
        if (seqStatusMsg) seqStatusMsg.innerText = '⏹️ 序列已停止 （按空格或播放按钮开始）';
        if(window._isContinuousMode === false && continuousModeBtn && continuousModeBtn.classList.contains('mode-active')){
            window._isContinuousMode = true;
        }
        if (playbackBar) playbackBar.style.display = 'flex';
    }
    
    function updateSequence(currentRealSec) {
        if (!seqPlaybackActive || seqPaused) return;
        const elapsed = currentRealSec - seqStartRealTime;
        updateProgressDisplay(elapsed);
        if (seqLoop && sequenceEvents.length > 0) {
            const maxTime = sequenceEvents[sequenceEvents.length-1].time;
            if (elapsed > maxTime && maxTime > 0) {
                const remainder = elapsed % maxTime;
                seqStartRealTime = currentRealSec - remainder;
                let newIdx = 0;
                while (newIdx < sequenceEvents.length && sequenceEvents[newIdx].time < remainder) newIdx++;
                seqNextIndex = newIdx;
                updateProgressDisplay(remainder);
            }
        }
        const currentElapsed = currentRealSec - seqStartRealTime;
        while (seqNextIndex < sequenceEvents.length && currentElapsed >= sequenceEvents[seqNextIndex].time) {
            if(burstEmit) burstEmit(sequenceEvents[seqNextIndex].count);
            seqNextIndex++;
        }
        if (!seqLoop && seqNextIndex >= sequenceEvents.length) {
            stopSequence();
        }
    }
    
    window._onSequenceUpdate = updateSequence;
    
    function setMode(continuous) {
        window._isContinuousMode = continuous;
        if(continuous){
            if (continuousModeBtn) continuousModeBtn.classList.add('mode-active');
            if (sequenceModeBtn) sequenceModeBtn.classList.remove('mode-active');
            if (seqPlaybackActive || seqPaused) stopSequence();
            if (playbackBar) playbackBar.style.display = 'none';
            if (seqStatusMsg) seqStatusMsg.innerText = '🎛️ 连续发射模式 （可调节速率）';
        } else {
            if (sequenceModeBtn) sequenceModeBtn.classList.add('mode-active');
            if (continuousModeBtn) continuousModeBtn.classList.remove('mode-active');
            if (playbackBar) playbackBar.style.display = 'flex';
            if (seqStatusMsg) seqStatusMsg.innerText = currentMidiTracks.length ? `⏱️ 序列模式 当前轨道已加载` : '⏱️ 序列模式 请先上传MIDI或手动输入时间戳';
            if (!seqPlaybackActive && !seqPaused && seqPlayPauseBtn) seqPlayPauseBtn.innerHTML = '▶️ 播放 （空格）';
        }
    }
    
    if (continuousModeBtn) continuousModeBtn.addEventListener('click', () => setMode(true));
    if (sequenceModeBtn) sequenceModeBtn.addEventListener('click', () => setMode(false));
    if (seqPlayPauseBtn) {
        seqPlayPauseBtn.addEventListener('click', () => {
            if (seqPaused) playSequence();
            else if (seqPlaybackActive) pauseSequence();
            else playSequence();
        });
    }
    if (progressSlider) {
        progressSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && sequenceEvents.length) {
                if (currentTimeInput) currentTimeInput.value = val.toFixed(2);
                if (!seqPlaybackActive || seqPaused) {
                    seqPausedTime = val;
                    let newIdx = 0;
                    while (newIdx < sequenceEvents.length && sequenceEvents[newIdx].time < val) newIdx++;
                    seqNextIndex = newIdx;
                } else {
                    seekTo(val);
                }
            }
        });
        progressSlider.addEventListener('change', (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) seekTo(val);
        });
    }
    if (currentTimeInput) {
        currentTimeInput.addEventListener('change', () => {
            let val = parseFloat(currentTimeInput.value);
            if (!isNaN(val)) seekTo(val);
        });
    }
    
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !window._isContinuousMode) {
            e.preventDefault();
            if (seqPaused) playSequence();
            else if (seqPlaybackActive) pauseSequence();
            else playSequence();
        }
    });
    
    // MIDI 上传与文件名显示
    const midiFileName = document.getElementById('midiFileName');
    if (midiUpload) {
        midiUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (midiFileName) midiFileName.innerText = file.name;
            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const arrayBuffer = evt.target.result;
                    const midiData = window.MidiParser.parse(arrayBuffer);
                    currentMidiTracks = midiData.tracks;
                    if (midiTrackSelect) {
                        midiTrackSelect.innerHTML = '<option value="all">所有轨道合并</option>';
                        for (let i=0; i<currentMidiTracks.length; i++) {
                            const tr = currentMidiTracks[i];
                            const option = document.createElement('option');
                            option.value = i;
                            option.textContent = `${tr.name} （${tr.noteCount}个音符）`;
                            midiTrackSelect.appendChild(option);
                        }
                    }
                    if (currentMidiTracks.length === 0) {
                        if (seqStatusMsg) seqStatusMsg.innerText = '❌ MIDI文件中未检测到任何音符轨道';
                        return;
                    }
                    if (midiTrackSelect) midiTrackSelect.value = "0";
                    updateTimelineFromSelectedTrack();
                } catch(err) {
                    if (seqStatusMsg) seqStatusMsg.innerText = `❌ MIDI解析失败: ${err.message}`;
                    console.error(err);
                }
            };
            reader.onerror = () => { if (seqStatusMsg) seqStatusMsg.innerText = '❌ 文件读取失败'; };
            reader.readAsArrayBuffer(file);
        });
    }
    
    if (midiTrackSelect) midiTrackSelect.addEventListener('change', () => {
        if (currentMidiTracks.length > 0) updateTimelineFromSelectedTrack();
    });
    if (precisionSelect) precisionSelect.addEventListener('change', () => {
        if (currentMidiTracks.length > 0) updateTimelineFromSelectedTrack();
    });
    
    if (timelineInput) {
        timelineInput.value = '[0.0, 0.3, 0.6, 0.6, 1.0, 1.5]';
        loadTimeline();
    }
    setMode(true);
})();