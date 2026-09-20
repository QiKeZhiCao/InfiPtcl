// color-picker.js - 自绘颜色选择弹层（贴触发控件弹出，还原原生取色器全功能）
(function() {
    let activeEl = null;
    let closingEl = null;
    let listeners = [];
    let closingByClick = false;

    function abortClosing() {
        if (closingEl) {
            const p = closingEl;
            closingEl = null;
            if (p._closingTimer) { clearTimeout(p._closingTimer); p._closingTimer = null; }
            if (p.parentNode) p.parentNode.removeChild(p);
        }
    }

    function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
    function hexToHsv(hex) {
        hex = (hex || '').replace(/^#/, '').slice(0, 6);
        let r = parseInt(hex.slice(0, 2), 16) / 255;
        let g = parseInt(hex.slice(2, 4), 16) / 255;
        let b = parseInt(hex.slice(4, 6), 16) / 255;
        if (isNaN(r)) r = 0; if (isNaN(g)) g = 0; if (isNaN(b)) b = 0;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        let h = 0, s, v = mx;
        const d = mx - mn;
        s = mx === 0 ? 0 : d / mx;
        if (d !== 0) {
            if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (mx === g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
            h *= 60;
            if (h < 0) h += 360;
        }
        return { h, s, v };
    }
    function hsvToHex(h, s, v) {
        s = clamp(s, 0, 1); v = clamp(v, 0, 1);
        const c = v * s;
        const hp = ((h % 360) + 360) % 360 / 60;
        const x = c * (1 - Math.abs(hp % 2 - 1));
        let r = 0, g = 0, b = 0;
        if (hp < 1) { r = c; g = x; }
        else if (hp < 2) { r = x; g = c; }
        else if (hp < 3) { g = c; b = x; }
        else if (hp < 4) { g = x; b = c; }
        else if (hp < 5) { r = x; b = c; }
        else { r = c; b = x; }
        const m = v - c;
        const to2 = n => Math.round((n + m) * 255).toString(16).padStart(2, '0');
        return '#' + to2(r) + to2(g) + to2(b);
    }

    function hexToRgb(hex) {
        hex = (hex || '').replace(/^#/, '').slice(0, 6);
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return { r: isNaN(r) ? 0 : r, g: isNaN(g) ? 0 : g, b: isNaN(b) ? 0 : b };
    }
    function rgbToHex(r, g, b) {
        const c = n => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
        return '#' + c(r) + c(g) + c(b);
    }
    function hexToHsl(hex) {
        const { r: pr, g: pg, b: pb } = hexToRgb(hex);
        const r = pr / 255, g = pg / 255, b = pb / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        let h = 0, s, l = (mx + mn) / 2;
        const d = mx - mn;
        if (d !== 0) {
            s = d / (1 - Math.abs(2 * l - 1));
            if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (mx === g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
            h *= 360;
        } else {
            s = 0;
        }
        return { h, s, l };
    }
    function hslToHex(h, s, l) {
        h = ((h % 360) + 360) % 360;
        s = clamp(s, 0, 1); l = clamp(l, 0, 1);
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const hp = h / 60;
        const x = c * (1 - Math.abs(hp % 2 - 1));
        let r = 0, g = 0, b = 0;
        if (hp < 1) { r = c; g = x; }
        else if (hp < 2) { r = x; g = c; }
        else if (hp < 3) { g = c; b = x; }
        else if (hp < 4) { g = x; b = c; }
        else if (hp < 5) { r = x; b = c; }
        else { r = c; b = x; }
        const m = l - c / 2;
        const c2 = n => Math.round((n + m) * 255).toString(16).padStart(2, '0');
        return '#' + c2(r) + c2(g) + c2(b);
    }
    const FORMATS = ['hex', 'rgb', 'hsl'];

    const PRESETS = ['#000000', '#ffffff', '#ff4d4d', '#ff9f40', '#ffd93d', '#6bcf7f',
        '#40c4ff', '#4d6bff', '#b26bff', '#e84393', '#99ddff', '#66ccff'];

    function buildPanel() {
        const panel = document.createElement('div');
        panel.className = 'color-popup';
        panel.innerHTML =
            '<div class="cp-sv-wrap">' +
            '<canvas class="cp-sv" width="180" height="150"></canvas>' +
            '<div class="cp-sv-dot"></div>' +
            '</div>' +
            '<div class="cp-hue-wrap"><div class="cp-hue"></div><div class="cp-hue-dot"></div></div>' +
            '<div class="cp-format-row">' +
            '<select class="cp-format" name="cp-format" aria-label="颜色格式" style="flex:1 1 auto;">' +
            '<option value="hex">HEX</option>' +
            '<option value="rgb">RGB</option>' +
            '<option value="hsl">HSL</option>' +
            '</select>' +
            '</div>' +
            '<div class="cp-input-row">' +
            '<div class="cp-channels">' +
            '<input class="cp-chan cp-hex" name="cp-hex" data-fmt="hex" type="text" spellcheck="false" />' +
            '<span class="cp-fmt-group" data-fmt="rgb" style="display:none;">' +
            '<input class="cp-chan" name="cp-rgb-r" type="text" data-chan="r" /><input class="cp-chan" name="cp-rgb-g" type="text" data-chan="g" /><input class="cp-chan" name="cp-rgb-b" type="text" data-chan="b" />' +
            '</span>' +
            '<span class="cp-fmt-group" data-fmt="hsl" style="display:none;">' +
            '<input class="cp-chan" name="cp-hsl-h" type="text" data-chan="h" /><span class="cp-unit">°</span>' +
            '<input class="cp-chan" name="cp-hsl-s" type="text" data-chan="s" /><span class="cp-unit">%</span>' +
            '<input class="cp-chan" name="cp-hsl-l" type="text" data-chan="l" /><span class="cp-unit">%</span>' +
            '</span>' +
            '</div>' +
            '<div class="cp-preview"></div>' +
            '</div>' +
            '<div class="cp-presets"></div>';
        return panel;
    }

    function drawSv(canvas, h) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, ht = canvas.height;
        ctx.clearRect(0, 0, w, ht);
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(1, 'hsl(' + h + ', 100%, 50%)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, ht);
        const black = ctx.createLinearGradient(0, 0, 0, ht);
        black.addColorStop(0, 'rgba(0,0,0,0)');
        black.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = black;
        ctx.fillRect(0, 0, w, ht);
    }

    function positionPanel(panel, anchor) {
        const r = anchor.getBoundingClientRect();
        const pw = panel.offsetWidth, ph = panel.offsetHeight;
        const gap = 8;
        let top = r.bottom + gap;
        const above = top + ph > window.innerHeight - 8;
        if (above) top = r.top - ph - gap;
        let left = r.left;
        if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
        left = Math.max(8, left);
        panel.style.left = left + 'px';
        panel.style.top = Math.max(8, top) + 'px';
        panel.dataset.flip = above ? 'above' : 'below';
    }

    function setChannelValue(inp, v) {
        inp.value = Math.round(v);
    }
    function renderChannelInputs(panel) {
        const fmt = panel._fmt;
        const hex = panel._cur || '#000000';
        const hexEl = panel.querySelector('.cp-hex');
        if (fmt === 'hex') {
            hexEl.value = hex;
        } else if (fmt === 'rgb') {
            const { r, g, b } = hexToRgb(hex);
            const ins = panel.querySelectorAll('[data-fmt="rgb"] .cp-chan');
            setChannelValue(ins[0], r); setChannelValue(ins[1], g); setChannelValue(ins[2], b);
        } else {
            const hl = hexToHsl(hex);
            const ins = panel.querySelectorAll('[data-fmt="hsl"] .cp-chan');
            setChannelValue(ins[0], hl.h); setChannelValue(ins[1], hl.s * 100); setChannelValue(ins[2], hl.l * 100);
        }
    }
    function renderFormatUI(panel) {
        const fmt = panel._fmt;
        panel.querySelector('.cp-hex').style.display = fmt === 'hex' ? '' : 'none';
        panel.querySelector('[data-fmt="rgb"]').style.display = fmt === 'rgb' ? '' : 'none';
        panel.querySelector('[data-fmt="hsl"]').style.display = fmt === 'hsl' ? '' : 'none';
    }
    function setFormat(panel, fmt) {
        if (!FORMATS.includes(fmt)) return;
        panel._fmt = fmt;
        renderFormatUI(panel);
        renderChannelInputs(panel);
    }
    function applyColor(panel, hex, exactHue) {
        panel._cur = hex;
        applyToPanel(panel, hex, true, exactHue);
        renderChannelInputs(panel);
    }

    function emit(panel, hex, exactHue) {
        const cb = panel._onPick;
        if (cb) cb(hex);
        applyColor(panel, hex, exactHue);
    }

    function applyToPanel(panel, hex, keepHue, exactHue) {
        const hsv = hexToHsv(hex);
        const h = (typeof exactHue === 'number') ? exactHue : hsv.h;
        panel.dataset.hue = h;
        panel.querySelector('.cp-preview').style.background = hex;
        const hueEl = panel.querySelector('.cp-hue');
        panel.querySelector('.cp-hue-dot').style.left = (h / 360 * hueEl.getBoundingClientRect().width) + 'px';
        if (!keepHue) {
            const sv = panel.querySelector('.cp-sv');
            drawSv(sv, h);
            panel.querySelector('.cp-sv-dot').style.left = (hsv.s * sv.getBoundingClientRect().width) + 'px';
            panel.querySelector('.cp-sv-dot').style.top = ((1 - hsv.v) * sv.getBoundingClientRect().height) + 'px';
        }
    }

    function bindDrag(target, apply) {        let dragging = false;
        const down = (e) => {
            e.preventDefault();
            dragging = true;
            apply(e);
            const move = (ev) => { if (dragging) apply(ev); };
            const up = () => { dragging = false; remove(); };
            const remove = () => {
                document.removeEventListener('pointermove', move);
                document.removeEventListener('pointerup', up);
            };
            document.addEventListener('pointermove', move);
            document.addEventListener('pointerup', up);
        };
        target.addEventListener('pointerdown', down);
    }

    function close(byAnchor) {
        if (!activeEl) return;
        if (byAnchor) {
            closingByClick = true;
        }
        const panel = activeEl;
        activeEl = null;
        listeners.forEach(l => l());
        listeners = [];
        if (!panel.parentNode) return;
        const finish = () => {
            if (closingEl === panel) closingEl = null;
            if (panel.parentNode) panel.parentNode.removeChild(panel);
        };
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            finish();
            return;
        }
        panel.classList.remove('cp-open');
        panel.classList.add('cp-closing');
        if (panel._closingTimer) clearTimeout(panel._closingTimer);
        panel._closingTimer = setTimeout(finish, 180);
        closingEl = panel;
    }

    window._openColorPicker = function(anchor, options) {
        options = options || {};
        if (closingByClick) {
            closingByClick = false;
            return;
        }
        abortClosing();
        close();
        const panel = buildPanel();
        document.body.appendChild(panel);

        const sv = panel.querySelector('.cp-sv');
        const hue = panel.querySelector('.cp-hue');
        const hexInput = panel.querySelector('.cp-hex');
        const presets = panel.querySelector('.cp-presets');
        panel._onPick = options.onPick || null;

        const initial = options.initial || '#000000';
        panel.style.display = 'block';
        void panel.offsetHeight;
        positionPanel(panel, anchor);
        panel.classList.add('cp-open');
        panel._cur = initial;
        setFormat(panel, 'hex');
        applyToPanel(panel, initial);

        bindDrag(hue, (e) => {
            const r = hue.getBoundingClientRect();
            const h = clamp((e.clientX - r.left) / r.width, 0, 1) * 360;
            panel.dataset.hue = h;
            panel.querySelector('.cp-hue-dot').style.left = (h / 360 * r.width) + 'px';
            const sv = panel.querySelector('.cp-sv');
            drawSv(sv, h);
            const svDot = panel.querySelector('.cp-sv-dot');
            const sr = sv.getBoundingClientRect();
            const s = sr.width ? clamp(parseFloat(svDot.style.left) / sr.width, 0, 1) : 0;
            const v = sr.height ? clamp(1 - parseFloat(svDot.style.top) / sr.height, 0, 1) : 1;
            const hex = hsvToHex(h, s, v);
            emit(panel, hex, h);
        });

        // SV 拖拽：指针 down 即时应用 + 拖动
        bindDrag(sv, (e) => {
            const r = sv.getBoundingClientRect();
            const s = clamp((e.clientX - r.left) / r.width, 0, 1);
            const v = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
            const h = parseFloat(panel.dataset.hue || 0);
            const dot = panel.querySelector('.cp-sv-dot');
            dot.style.left = (s * r.width) + 'px';
            dot.style.top = ((1 - v) * r.height) + 'px';
            emit(panel, hsvToHex(h, s, v), h);
        });

        hexInput.addEventListener('input', () => {
            let v = hexInput.value.trim();
            if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
                if (v[0] !== '#') v = '#' + v;
                emit(panel, v);
            }
        });

        // 格式步进器：以真实 <select> 交给全局 StepperSelect 组件包装，
        // 由组件统一处理步进 / hover / 下拉 / 动画 / 等宽 / 键盘，行为与全站其它下拉完全一致
        const fmtSelect = panel.querySelector('.cp-format');
        fmtSelect.addEventListener('change', () => setFormat(panel, fmtSelect.value));
        if (window.StepperSelect && window.StepperSelect.wrapElement) {
            window.StepperSelect.wrapElement(fmtSelect);
        }

        // 通道输入：rgb / hsl（每通道一个输入框，合法即写回 hex）
        const chanInput = (inp) => {
            const grp = inp.closest('.cp-fmt-group').dataset.fmt;
            const readChannels = () => {
                const ins = panel.querySelectorAll('[data-fmt="' + grp + '"] .cp-chan');
                return [ins[0].value, ins[1].value, ins[2].value];
            };
            const applyChannels = () => {
                const vals = readChannels();
                if (grp === 'rgb') {
                    if (!vals.every(v => /^\d{1,3}$/.test(v.trim()))) return;
                    const r = parseInt(vals[0], 10), g = parseInt(vals[1], 10), b = parseInt(vals[2], 10);
                    if (r > 255 || g > 255 || b > 255 || isNaN(r) || isNaN(g) || isNaN(b)) return;
                    emit(panel, rgbToHex(r, g, b));
                } else {
                    if (!vals.every(v => /^-?\d{1,3}(\.\d+)?$/.test(v.trim()))) return;
                    const h = parseFloat(vals[0]), s = parseFloat(vals[1]), l = parseFloat(vals[2]);
                    if (isNaN(h) || isNaN(s) || isNaN(l) || s < 0 || s > 100 || l < 0 || l > 100) return;
                    emit(panel, hslToHex(h, s / 100, l / 100));
                }
            };
            inp.addEventListener('change', applyChannels);
        };
        panel.querySelectorAll('.cp-channels .cp-chan[data-chan]').forEach(chanInput);

        PRESETS.forEach(col => {
            const c = document.createElement('button');
            c.type = 'button';
            c.className = 'cp-preset';
            c.style.background = col;
            c.addEventListener('click', () => {
                emit(panel, col);
            });
            presets.appendChild(c);
        });

        const onDoc = (e) => {
            if (panel.contains(e.target)) return;
            const hitAnchor = (anchor === e.target) || (anchor && anchor.contains && anchor.contains(e.target));
            close(hitAnchor ? anchor : null);
        };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        const onScroll = () => positionPanel(panel, anchor);
        document.addEventListener('pointerdown', onDoc);
        document.addEventListener('keydown', onKey);
        window.addEventListener('scroll', onScroll, true);
        listeners.push(() => {
            document.removeEventListener('pointerdown', onDoc);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', onScroll, true);
        });

        activeEl = panel;
    };
})();
