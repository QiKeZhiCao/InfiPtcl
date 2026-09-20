// midi-mapper.js - 轻量离线MIDI映射/解析器，支持多轨分离
(function(){
    window.MidiMapper = {
        parse: function(arrayBuffer) {
            var data = new Uint8Array(arrayBuffer);
            if (data[0] !== 0x4D || data[1] !== 0x54 || data[2] !== 0x68 || data[3] !== 0x64) {
                throw new Error("Invalid MIDI file: missing MThd header");
            }
            if (data.length < 22) {
                throw new Error("MIDI 文件过短，可能已损坏");
            }
            var pos = 4;
            var headerLen = (data[pos] << 24) | (data[pos+1] << 16) | (data[pos+2] << 8) | data[pos+3];
            pos += 4;
            var format = (data[pos] << 8) | data[pos+1];
            pos += 2;
            var tracksNum = (data[pos] << 8) | data[pos+1];
            pos += 2;
            var division = (data[pos] << 8) | data[pos+1];
            pos += 2;
            var ticksPerQuarter = division & 0x7FFF;
            var smpte = (division & 0x8000) !== 0;
            if (smpte) console.warn("SMPTE time division not fully supported");
            
            var tracksInfo = [];
            
            for (var t=0; t<tracksNum; t++) {
                while (pos < data.length && (data[pos] !== 0x4D || data[pos+1] !== 0x54 || data[pos+2] !== 0x72 || data[pos+3] !== 0x6B)) {
                    pos++;
                }
                if (pos+4 >= data.length) break;
                pos += 4;
                var trackLen = (data[pos] << 24) | (data[pos+1] << 16) | (data[pos+2] << 8) | data[pos+3];
                pos += 4;
                var trackEnd = pos + trackLen;
                if (trackEnd > data.length) {
                    throw new Error("MIDI 轨道数据长度超出文件范围，文件可能已损坏");
                }
                var events = [];
                var runningStatus = 0;
                var currentTime = 0;
                var tempo = 500000;
                var timebase = ticksPerQuarter;
                var noteOnMap = {};
                var trackName = "Track " + (t+1);
                
                while (pos < trackEnd) {
                    var delta = 0;
                    var byte;
                    do {
                        if (pos >= trackEnd) {
                            throw new Error("MIDI 数据意外结尾（变长时长读取越界）");
                        }
                        byte = data[pos++];
                        delta = (delta << 7) | (byte & 0x7F);
                    } while ((byte & 0x80) !== 0);
                    currentTime += delta;
                    
                    if (pos >= trackEnd) {
                        throw new Error("MIDI 数据截断（轨道事件缺失）");
                    }
                    var eventType = data[pos++];
                    if (eventType === 0xFF) {
                        if (pos >= trackEnd) {
                            throw new Error("MIDI 数据截断（元事件缺失）");
                        }
                        var metaType = data[pos++];
                        var len = 0;
                        do {
                            if (pos >= trackEnd) {
                                throw new Error("MIDI 数据意外结尾（元事件长度读取越界）");
                            }
                            byte = data[pos++];
                            len = (len << 7) | (byte & 0x7F);
                        } while ((byte & 0x80) !== 0);
                        if (pos + len > trackEnd) {
                            throw new Error("MIDI 数据截断（元事件内容长度超界）");
                        }
                        var metaData = data.subarray(pos, pos+len);
                        pos += len;
                        if (metaType === 0x51 && len === 3) {
                            tempo = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
                        } else if (metaType === 0x03) {
                            trackName = new TextDecoder().decode(metaData);
                        }
                    } 
                    else if (eventType === 0xF0 || eventType === 0xF7) {
                        var sysexLen = 0;
                        do {
                            if (pos >= trackEnd) {
                                throw new Error("MIDI 数据意外结尾（系统事件长度读取越界）");
                            }
                            byte = data[pos++];
                            sysexLen = (sysexLen << 7) | (byte & 0x7F);
                        } while ((byte & 0x80) !== 0);
                        if (pos + sysexLen > trackEnd) {
                            throw new Error("MIDI 数据截断（系统事件内容长度超界）");
                        }
                        pos += sysexLen;
                    } 
                    else {
                        var status = eventType;
                        if (status < 0x80) {
                            status = runningStatus;
                            pos--;
                        } else {
                            runningStatus = status;
                        }
                        var channel = status & 0x0F;
                        var cmd = status >> 4;
                        if (cmd === 0x8) {
                            if (pos + 2 > trackEnd) {
                                throw new Error("MIDI 数据截断（音符关事件数据不足）");
                            }
                            var note = data[pos++];
                            var velocity = data[pos++];
                            if (noteOnMap[note] && noteOnMap[note].length) {
                                var onEvent = noteOnMap[note].shift();
                                events.push({
                                    type: "note",
                                    pitch: note,
                                    start: onEvent.time,
                                    end: currentTime,
                                    channel: channel,
                                    velocity: onEvent.velocity
                                });
                            }
                        } 
                        else if (cmd === 0x9) {
                            if (pos + 2 > trackEnd) {
                                throw new Error("MIDI 数据截断（音符开事件数据不足）");
                            }
                            var note = data[pos++];
                            var velocity = data[pos++];
                            if (velocity === 0) {
                                if (noteOnMap[note] && noteOnMap[note].length) {
                                    var onEvent = noteOnMap[note].shift();
                                    events.push({
                                        type: "note",
                                        pitch: note,
                                        start: onEvent.time,
                                        end: currentTime,
                                        channel: channel,
                                        velocity: onEvent.velocity
                                    });
                                }
                            } else {
                                if (!noteOnMap[note]) noteOnMap[note] = [];
                                noteOnMap[note].push({ time: currentTime, velocity: velocity, channel: channel });
                            }
                        }
                        else {
                            var need = (cmd === 0xC || cmd === 0xD) ? 1 : 2;
                            if (pos + need > trackEnd) {
                                throw new Error("MIDI 数据截断（事件数据不足）");
                            }
                            pos += need;
                        }
                    }
                }
                
                var timestamps = [];
                var notes = [];
                var microsecondsPerTick = tempo / timebase;
                for (var j=0; j<events.length; j++) {
                    var ev = events[j];
                    if (ev.type === "note") {
                        var startSeconds = ev.start * microsecondsPerTick / 1000000;
                        timestamps.push(startSeconds);
                        notes.push({
                            time: startSeconds,
                            pitch: ev.pitch,
                            velocity: ev.velocity
                        });
                    }
                }
                timestamps.sort(function(a,b){ return a-b; });
                notes.sort(function(a,b){ return a.time - b.time; });
                
                tracksInfo.push({
                    index: t,
                    name: trackName,
                    timestamps: timestamps,
                    notes: notes,
                    noteCount: timestamps.length
                });
            }
            return { tracks: tracksInfo, totalTracks: tracksInfo.length };
        }
    };
})();