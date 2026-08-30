// unsaved.js - 未保存更改检测（基准快照 + 惰性比较）
(function() {
    let savedFingerprint = '';

    function fingerprint() {
        const base = (window._collectProjectFingerprint && window._collectProjectFingerprint()) || {};
        const texNames = (window._textureFileNames || []).slice();
        const fontNames = Object.keys(window._importedFonts || {}).slice().sort();
        const midi = {
            name: (document.getElementById && document.getElementById('midiFileName')?.innerText) || '',
            tracks: (window._currentMidiTracks || []).length,
            source: document.getElementById && document.getElementById('timelineSource')?.value || ''
        };
        return JSON.stringify({ base, texNames, fontNames, midi });
    }

    window._refreshSavedFingerprint = function() {
        savedFingerprint = fingerprint();
    };

    window._isStateDirty = function() {
        return fingerprint() !== savedFingerprint;
    };

    window.addEventListener('beforeunload', (e) => {
        if (window._isStateDirty()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    function init() {
        window._refreshSavedFingerprint();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
