// sequence.js - 最终版，整合横线控制、MIDI导入重置等
(function(){
    const loopSeqCheckbox = document.getElementById('loopSeqCheckbox') || { checked: false };
    const continuousModeBtn = document.getElementById('continuousModeBtn');
    const sequenceModeBtn = document.getElementById('sequenceModeBtn');
    const timelineInput = document.getElementById('timelineInput');
    const burstCountSlider = document.getElementById('burstCount');
    const burstCountVal = document.getElementById('burstCountVal');
    const midiUpload = document.getElementById('midiUpload');
    const midiTrackSelect = document.getElementById('midiTrackSelect');
    const precisionSelect = document.getElementById('precisionSelect');
    const sequencePanel = document.getElementById('sequencePanel');
    const midiSection = document.getElementById('midiSection');
    const modeSeparator = document.getElementById('modeSeparator');
    
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
            if (sequenceEvents.length) loadTimeline(false);
        });
        if (burstCountVal) burstCountVal.value = burstCount;
    }
    
    let currentMidiTracks = [];
    window._currentMidiTracks = currentMidiTracks;
    window._setMidiTracks = function(tracks) { currentMidiTracks = tracks; window._currentMidiTracks = tracks; };
    let sequenceEvents = [];
    let seqPlaybackActive = false;
    let seqPaused = false;
    let seqStartRealTime = 0;
    let seqPausedTime = 0;
    let seqNextIndex = 0;
    let seqLoop = false;
    let totalDuration = 0;

    let timelineSource = 'manual';
    window._timelineSource = timelineSource;
    
    // MIDI pitch → color mapping
    const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    function pitchToNoteName(p) {
        const octave = Math.floor(p / 12) - 1;
        return NOTE_NAMES[p % 12] + octave;
    }
    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return '#' + f(0) + f(8) + f(4);
    }
    let midiNotes = [];
    let sequencePitches = [];
    let pitchColorMap = {};
    window._midiNotes = midiNotes;
    window._sequencePitches = sequencePitches;
    window._pitchColorMap = pitchColorMap;
    
    function updateMidiNotes() {
        if (!midiTrackSelect) return;
        const selected = midiTrackSelect.value;
        if (selected === "all") {
            const all = [];
            for (const track of currentMidiTracks) {
                if (track.notes) all.push(...track.notes);
            }
            all.sort((a,b) => a.time - b.time);
            midiNotes = all;
        } else {
            const idx = parseInt(selected);
            if (!isNaN(idx) && currentMidiTracks[idx]) {
                midiNotes = currentMidiTracks[idx].notes || [];
            } else {
                midiNotes = [];
            }
        }
        window._midiNotes = midiNotes;
    }
    
    function renderPitchColorRows() {
        const container = document.getElementById('paletteMidiSection');
        const rows = document.getElementById('midiPitchRows');
        if (!container || !rows) return;
        const modeEl = document.getElementById('paletteMode');
        if (modeEl && modeEl.value !== 'midi') return;
        if (!midiNotes || !midiNotes.length) {
            rows.innerHTML = '<div class="pitch-empty">（空）</div>';
            return;
        }
        const uniq = [...new Set(midiNotes.map(n => n.pitch))].sort((a,b) => a-b);
        for (const p of uniq) {
            if (!(p in pitchColorMap)) {
                const hue = (p / 127) * 360;
                pitchColorMap[p] = hslToHex(hue, 80, 60);
            }
        }
        rows.innerHTML = '';
        for (const p of uniq) {
            const hex = pitchColorMap[p];
            const row = document.createElement('div');
            row.className = 'pitch-row';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'pitch-name';
            nameSpan.textContent = pitchToNoteName(p);
            const numSpan = document.createElement('span');
            numSpan.className = 'pitch-num';
            numSpan.textContent = '(' + p + ')';
            const nameNum = document.createElement('span');
            nameNum.className = 'pitch-name-num';
            nameNum.appendChild(nameSpan);
            nameNum.appendChild(numSpan);
            const swatch = document.createElement('span');
            swatch.className = 'pitch-swatch';
            swatch.style.background = hex;
            const hexSpan = document.createElement('span');
            hexSpan.className = 'pitch-hex';
            hexSpan.textContent = hex;
            swatch.addEventListener('click', () => {
                if (window._openColorPicker) window._openColorPicker(swatch, {
                    initial: pitchColorMap[p] || hex,
                    onPick: (c) => {
                        swatch.style.background = c;
                        pitchColorMap[p] = c;
                        hexSpan.textContent = c;
                    }
                });
            });
            row.appendChild(nameNum);
            row.appendChild(swatch);
            row.appendChild(hexSpan);
            rows.appendChild(row);
        }
    }
    window._renderPitchColorRows = renderPitchColorRows;
    
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
        else {
            const p = window._particleParams || {};
            const maxLife = (p.fadeStartMax || 2) + (p.fadeDurationMax || 1);
            totalDuration = sequenceEvents[sequenceEvents.length-1].time + maxLife;
        }
        window._sequenceTotal = totalDuration;
        if (totalTimeSpan) totalTimeSpan.innerText = totalDuration.toFixed(2) + 's';
        if (progressSlider) progressSlider.max = totalDuration;
        if (!seqPlaybackActive) {
            if (progressSlider) progressSlider.value = seqPausedTime;
            if (currentTimeInput) currentTimeInput.value = seqPausedTime.toFixed(2);
        }
        if (window._updateExportDurationMax) window._updateExportDurationMax();
    }
    window._refreshTotalDuration = updateTotalDuration;
    
    function loadTimeline(resetProgress = true) {
        try {
            let raw = timelineInput ? timelineInput.value.trim() : '';
            if(!raw) throw new Error('请输入时间戳数组');
            let parsed = JSON.parse(raw);
            if(!Array.isArray(parsed)) throw new Error('必须是数组格式');
            let events = parseTimelineToEvents(parsed);
            if(events.length === 0) throw new Error('没有有效数字时间戳');
            sequenceEvents = events;
            sequencePitches = [];
            window._sequencePitches = sequencePitches;
            updateTotalDuration();
            if (resetProgress) {
                stopSequence();
            } else {
                if (seqPlaybackActive || seqPaused) {
                    let currentTime = seqPaused ? seqPausedTime : (performance.now() / 1000 - seqStartRealTime);
                    let newIndex = 0;
                    while (newIndex < sequenceEvents.length && sequenceEvents[newIndex].time < currentTime) newIndex++;
                    seqNextIndex = newIndex;
                    if (!seqPaused && seqPlaybackActive) {
                        const now = performance.now() / 1000;
                        seqStartRealTime = now - currentTime;
                    }
                }
            }
            return true;
        } catch(e){
            Toast.error(`解析失败: ${e.message}`);
            return false;
        }
    }
    
    function formatTimestamps(timestampsRaw, precision) {
        if (!timestampsRaw || timestampsRaw.length === 0) return "[]";
        const rounded = timestampsRaw.map(t => parseFloat(t.toFixed(precision)));
        return JSON.stringify(rounded, null, 2);
    }
    
    function updateTimelineFromSelectedTrack(resetProgress = true, showCountToast = false) {
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
            Toast.warn('所选轨道无音符事件');
            timelineInput.value = "[]";
            updateMidiNotes();
            renderPitchColorRows();
            return;
        }
        const jsonStr = formatTimestamps(timestamps, precision);
        timelineInput.value = jsonStr;
        loadTimeline(resetProgress);
        if (showCountToast) {
            Toast.success(`已应用${timestamps.length}个时间戳`);
        }
        
        // Update midi pitch mapping
        updateMidiNotes();
        sequencePitches = midiNotes.map(n => n.pitch);
        window._sequencePitches = sequencePitches;
        renderPitchColorRows();
    }
    window._updateTimelineFromSelectedTrack = updateTimelineFromSelectedTrack;
    
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
            Toast.warn('请先加载时间戳序列');
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
        if (window._seekSequence) {
            window._seekSequence(targetTime, sequenceEvents, getForceHslForIndex);
        }
    }
    
    function playSequence() {
        if (!sequenceEvents.length) {
            Toast.warn('请先加载有效时间戳序列');
            return;
        }
        if (seqPlaybackActive && !seqPaused) return;
        
        const now = performance.now() / 1000;
        if (seqPaused) {
            const resumeTime = seqPausedTime;
            seqStartRealTime = now - resumeTime;
            seqPlaybackActive = true;
            seqPaused = false;
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
        }
        window._isContinuousMode = false;
        if (seqPlayPauseBtn) seqPlayPauseBtn.innerHTML = '暂停 （空格）';
        if (playbackBar) playbackBar.style.display = 'flex';
    }
    
    function pauseSequence() {
        if (seqPlaybackActive && !seqPaused) {
            const now = performance.now() / 1000;
            const currentProgress = now - seqStartRealTime;
            seqPausedTime = Math.min(Math.max(0, currentProgress), totalDuration);
            seqPlaybackActive = false;
            seqPaused = true;
            if (seqPlayPauseBtn) seqPlayPauseBtn.innerHTML = '播放 （空格）';
            updateProgressDisplay(seqPausedTime);
        }
    }
    
    function stopSequence() {
        if (!seqPlaybackActive && !seqPaused && seqPausedTime === 0) return;
        seqPlaybackActive = false;
        seqPaused = false;
        seqNextIndex = 0;
        seqPausedTime = 0;
        updateProgressDisplay(0);
        if (window._seekSequence) {
            window._seekSequence(0, sequenceEvents, getForceHslForIndex);
        }
        if (seqPlayPauseBtn) seqPlayPauseBtn.innerHTML = '播放 （空格）';
        if(window._isContinuousMode === false && continuousModeBtn && continuousModeBtn.classList.contains('mode-active')){
            window._isContinuousMode = true;
        }
        if (playbackBar) playbackBar.style.display = 'flex';
    }
    
    function getForceHslForIndex(idx) {
        const paletteMode = document.getElementById('paletteMode')?.value;
        const pitch = sequencePitches[idx];
        if (paletteMode === 'midi' && pitch != null && pitchColorMap[pitch]) {
            const hsl = window._hexToHsl(pitchColorMap[pitch]);
            return { h: hsl.h, s: hsl.s, l: hsl.l };
        }
        return undefined;
    }

    window._isSeqPlaying = function() { return seqPlaybackActive && !seqPaused; };

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
            if (window.burstEmit) window.burstEmit(sequenceEvents[seqNextIndex].count, getForceHslForIndex(seqNextIndex), seqNextIndex * 10000);
            seqNextIndex++;
        }
        if (!seqLoop && seqNextIndex >= sequenceEvents.length) {
            stopSequence();
        }
    }
    
    window._onSequenceUpdate = updateSequence;
    
    function seqTabDisabled(disabled) {
        for (const idx of ['4', '5']) {
            const tab = document.querySelector(`.fn-tab[data-idx="${idx}"]`);
            if (tab) tab.classList.toggle('disabled', disabled);
        }
    }

    function setMode(continuous) {
        window._isContinuousMode = continuous;
        if (window._updateExportDurationMax) window._updateExportDurationMax();
        if(continuous){
            if (continuousModeBtn) continuousModeBtn.classList.add('mode-active');
            if (sequenceModeBtn) sequenceModeBtn.classList.remove('mode-active');
            if (seqPlaybackActive || seqPaused) stopSequence();
            if (playbackBar) playbackBar.style.display = 'none';
            if (sequencePanel) sequencePanel.style.display = 'none';
            if (midiSection) midiSection.style.display = 'none';
            const ms = document.getElementById('midiSectionSeparator');
            if (ms) ms.style.display = 'none';
            if (modeSeparator) modeSeparator.style.display = 'none';
            seqTabDisabled(true);
            const pm = document.getElementById('paletteMode');
            if (pm) {
                const midiOpt = pm.querySelector('option[value="midi"]');
                if (midiOpt) midiOpt.disabled = true;
                if (pm.value === 'midi') {
                    pm.value = 'list';
                    pm.dispatchEvent(new Event('change'));
                    Toast.info('连续发射模式下MIDI映射已禁用，已切换至取值集合');
                }
            }
        } else {
            if (window._seekSequence) window._seekSequence(0, [], null);
            if (sequenceModeBtn) sequenceModeBtn.classList.add('mode-active');
            if (continuousModeBtn) continuousModeBtn.classList.remove('mode-active');
            if (playbackBar) playbackBar.style.display = 'flex';
            if (sequencePanel) sequencePanel.style.display = 'block';
            if (midiSection) midiSection.style.display = 'block';
            const ms = document.getElementById('midiSectionSeparator');
            if (ms) ms.style.display = 'block';
            if (modeSeparator) modeSeparator.style.display = 'block';
            if (!seqPlaybackActive && !seqPaused && seqPlayPauseBtn) seqPlayPauseBtn.innerHTML = '播放 （空格）';
            seqTabDisabled(false);
            if (window._updateMidiOptionState) window._updateMidiOptionState();
        }
    }
    window._setSequenceMode = setMode;

    if (loopSeqCheckbox) loopSeqCheckbox.addEventListener('change', () => { seqLoop = loopSeqCheckbox.checked; });
    window._setSeqLoop = function(v) { seqLoop = v; if (loopSeqCheckbox) loopSeqCheckbox.checked = v; };

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
                seekTo(val);
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
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
            e.preventDefault();
            if (seqPaused) playSequence();
            else if (seqPlaybackActive) pauseSequence();
            else playSequence();
        }
    });
    
    const midiFileName = document.getElementById('midiFileName');
    const timelineSourceSelect = document.getElementById('timelineSource');
    if (timelineSourceSelect) {
        timelineSource = timelineSourceSelect.value || 'manual';
        window._timelineSource = timelineSource;
        timelineSourceSelect.addEventListener('change', () => {
            timelineSource = timelineSourceSelect.value;
            window._timelineSource = timelineSource;
            if (timelineSource === 'midi' && currentMidiTracks.length > 0) {
                updateTimelineFromSelectedTrack(true, true);
            }
        });
    }
    if (midiUpload) {
        midiUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (midiFileName) midiFileName.innerText = file.name;
            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const arrayBuffer = evt.target.result;
                    const midiData = window.MidiMapper.parse(arrayBuffer);
                    currentMidiTracks = midiData.tracks;
                    if (window._setMidiTracks) window._setMidiTracks(currentMidiTracks);
                    if (midiTrackSelect) {
                        midiTrackSelect.innerHTML = '<option value="all">&lt; 所有轨道合并 &gt;</option>';
                        for (let i=0; i<currentMidiTracks.length; i++) {
                            const tr = currentMidiTracks[i];
                            const option = document.createElement('option');
                            option.value = i;
                            option.textContent = `${tr.name} （${tr.noteCount}个音符）`;
                            midiTrackSelect.appendChild(option);
                        }
                    }
                    if (currentMidiTracks.length === 0) {
                        Toast.error('MIDI文件中未检测到任何音符轨道');
                        return;
                    }
                    if (midiTrackSelect) midiTrackSelect.value = "0";
                    stopSequence(); // 重置进度
                    if (timelineSource === 'midi') {
                        updateTimelineFromSelectedTrack(true, true);
                    } else {
                        updateMidiNotes();
                        renderPitchColorRows();
                    }
                    window._updateMidiOptionState?.();
                    Toast.success('MIDI导入成功');
                } catch(err) {
                    Toast.error('MIDI解析失败: ' + err.message);
                    console.error(err);
                }
            };
            reader.onerror = () => { Toast.error('文件读取失败'); };
            reader.readAsArrayBuffer(file);
        });
    }
    
    if (midiTrackSelect) midiTrackSelect.addEventListener('change', () => {
        if (currentMidiTracks.length > 0) {
            if (timelineSource === 'midi') {
                updateTimelineFromSelectedTrack(false, true);
            } else {
                updateMidiNotes();
                renderPitchColorRows();
                if (midiNotes.length === 0) {
                    const pm = document.getElementById('paletteMode');
                    if (pm && pm.value === 'midi') {
                        Toast.warn('所选轨道无音符事件');
                    }
                }
            }
        }
    });
    if (precisionSelect) precisionSelect.addEventListener('change', () => {
        if (currentMidiTracks.length > 0 && timelineSource === 'midi') {
            updateTimelineFromSelectedTrack(false);
        }
    });
    
    if (timelineInput) {
        timelineInput.value = '';
    }
    setMode(true);
})();