// midi-parser.js - 轻量离线MIDI解析器，支持多轨分离
(function(){
    window.MidiParser = {
        parse: function(arrayBuffer) {
            var data = new Uint8Array(arrayBuffer);
            if (data[0] !== 0x4D || data[1] !== 0x54 || data[2] !== 0x68 || data[3] !== 0x64) {
                throw new Error("Invalid MIDI file: missing MThd header");
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
                        byte = data[pos++];
                        delta = (delta << 7) | (byte & 0x7F);
                    } while ((byte & 0x80) !== 0);
                    currentTime += delta;
                    
                    var eventType = data[pos++];
                    if (eventType === 0xFF) {
                        var metaType = data[pos++];
                        var len = 0;
                        do {
                            byte = data[pos++];
                            len = (len << 7) | (byte & 0x7F);
                        } while ((byte & 0x80) !== 0);
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
                            byte = data[pos++];
                            sysexLen = (sysexLen << 7) | (byte & 0x7F);
                        } while ((byte & 0x80) !== 0);
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
                            if (cmd === 0xC || cmd === 0xD) {
                                pos += 1;
                            } else {
                                pos += 2;
                            }
                        }
                    }
                }
                
                var timestamps = [];
                var microsecondsPerTick = tempo / timebase;
                for (var j=0; j<events.length; j++) {
                    var ev = events[j];
                    if (ev.type === "note") {
                        var startSeconds = ev.start * microsecondsPerTick / 1000000;
                        timestamps.push(startSeconds);
                    }
                }
                timestamps.sort(function(a,b){ return a-b; });
                
                tracksInfo.push({
                    index: t,
                    name: trackName,
                    timestamps: timestamps,
                    noteCount: timestamps.length
                });
            }
            return { tracks: tracksInfo, totalTracks: tracksInfo.length };
        }
    };
})();