// particle.js - 核心粒子逻辑（混合发射策略）
(function(){
    const canvas = document.getElementById('particleCanvas');
    const ctx = canvas.getContext('2d');
    let renderCanvas = canvas;
    let renderCtx = ctx;
    window._setExportTarget = function(c) {
        renderCanvas = c || canvas;
        renderCtx = renderCanvas.getContext('2d');
    };
    function targetScale() { return renderCanvas === canvas ? _backingScale : 1; }
    function targetLogicalW() { return renderCanvas === canvas ? _logicalW : renderCanvas.width; }
    function targetLogicalH() { return renderCanvas === canvas ? _logicalH : renderCanvas.height; }
    // 渲染终止标志：检测到不可绘制的贴图引用时置位，停止动画循环并弹窗报错
    window._renderTerminated = false;
    const _tintCanvas = document.createElement('canvas');
    const _tintCtx = _tintCanvas.getContext('2d');
    const _tintCanvas2 = document.createElement('canvas');
    const _tintCtx2 = _tintCanvas2.getContext('2d', { willReadFrequently: true });
    let particles = [];

    // 可复现随机源（mulberry32）：状态为 32 位整数，可存取
    let _rngState = 12345;
    let _rngSource = null;
    function _rng() {
        if (_rngSource) return _rngSource();
        _rngState = (_rngState + 0x6D2B79F5) | 0;
        let t = _rngState;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    window._setRngSeed = function(s) { _rngState = s | 0; };
    window._getRngState = function() { return _rngState; };
    window._setRngState = function(s) { _rngState = s | 0; };
    let _initialSeed = ((Date.now() ^ (performance.now() * 1000)) | 0) & 0x7FFFFFFF;
    _rngState = _initialSeed;
    window._INITIAL_SEED = _initialSeed;
    window._getInitialSeed = function() { return _initialSeed; };
    window._setInitialSeed = function(s) { _initialSeed = s | 0; window._INITIAL_SEED = _initialSeed; };
    // 逐粒子确定性随机源：编号 n 相同的粒子永远得到同一串随机数
    function particleRng(n) {
        let nLo = n % 4294967296;
        let nHi = Math.floor(n / 4294967296);
        let s = (_initialSeed ^ Math.imul(nLo | 0, 0x9E3779B1) ^ Math.imul(nHi | 0, 0x85EBCA77)) | 0;
        return function() {
            s = (s + 0x6D2B79F5) | 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    let emitterPos = { x: 0, y: 0 };
    let followMouse = true;
    let emitActive = true;
    
    // 文字模式状态
    let textMode = false;
    let textContent = '粒子';
    let selectedFont = 'default';
    let fontStyles = { italic: false, underline: false, strike: false, letterSpacing: 0, weight: 'normal' };

    let params = {
        emitRate: 220,
        fadeStartMin: 0.5,
        fadeStartMax: 2.0,
        fadeDurationMin: 0.3,
        fadeDurationMax: 1.0,
        sizeMin: 6,
        sizeMax: 24,
        speedMin: 80,
        speedMax: 240,
        baseAngle: 0,
        angleSpread: 180,
        gravityX: 0,
        gravityY: 80,
        damping: 0.99,
        rotSpeedMin: -200 * Math.PI / 180,
        rotSpeedMax: 200 * Math.PI / 180,
        emitRadius: 5,
        maxParticles: 3000,
        backgroundColor: '#000000',
        initRotAngle: 0,
        initRotSpread: 0,
        alphaMin: 100,
        alphaMax: 100
    };
    
    window._isContinuousMode = true;

    let textureImages = [];
    window._particleTextures = [];
    window._particleMultiTex = false;
    window._noTextureSmoothing = false;

    // 累加器变量（用于均匀发射）
    let emitAccumulator = 0;

    // 暴露接口
    window._particleParams = params;
    window._particleEmitterPos = emitterPos;
    window._particleFollowMouse = followMouse;
    window._particleTextMode = textMode;
    window._particleTextContent = textContent;
    window._particleSelectedFont = selectedFont;
    window._particleFontStyles = fontStyles;
    window._randomRateMode = false;
    window._particleAnimMode = 0;
    window._particleAnimFps = 10;
    window._particleSimTime = 0;
    window._paletteParams = { mode: 'list', hueMin: 0, hueMax: 360, satMin: 60, satMax: 100, colors: [] };

    window._viewZoom = 1;
    window._viewPanX = 0;
    window._viewPanY = 0;
    let _autoFit = true;
    window._getAutoFit = function() { return _autoFit; };
    window._setAutoFitFlag = function(v) { _autoFit = v; };
    let _panMode = false;
    let _panLastX = 0, _panLastY = 0;
    let _panInitialized = false;
    let _panMouseDown = false;
    let _isPinching = false;
    let _pinchData = {};

    // ---------- 逻辑尺寸 / 位图尺寸解耦 ----------
    // 逻辑尺寸固定（画布设定值），位图按屏幕实际需要降采样，避免高分辨率画布的空闲重绘开销。
    let _logicalW = 0, _logicalH = 0;
    let _backingScale = 1;
    window._getLogicalSize = function() { return { w: _logicalW, h: _logicalH }; };
    window._getBackingScale = function() { return _backingScale; };

    // DOM 十字准星覆盖层：发射中心在画布外也能显示
    const emitterCrosshair = document.createElement('div');
    emitterCrosshair.style.cssText = 'position: fixed; left: 0; top: 0; pointer-events: none; z-index: 5; display: none;';
    emitterCrosshair.innerHTML = '<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);">'
        + '<line x1="18" y1="5" x2="18" y2="31" stroke="#66ccff" stroke-width="2.5"/>'
        + '<line x1="5" y1="18" x2="31" y2="18" stroke="#66ccff" stroke-width="2.5"/>'
        + '<circle cx="18" cy="18" r="8" fill="none" stroke="#66ccff" stroke-width="2.5"/>'
        + '<circle cx="18" cy="18" r="3" fill="#ffffff"/>'
        + '</svg>';
    const emitterRadiusCircle = document.createElement('div');
    emitterRadiusCircle.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:2px dashed #66ccff;border-radius:50%;';
    emitterCrosshair.appendChild(emitterRadiusCircle);
    document.body.appendChild(emitterCrosshair);
    document.body.style.cursor = 'crosshair';

    // 画布视口矩形缓存：避免每帧 getBoundingClientRect 触发强制布局
    let _canvasRectCache = null;
    function invalidateCanvasRect() { _canvasRectCache = null; }
    window._invalidateCanvasRect = invalidateCanvasRect;
    function getCanvasRect() {
        if (!_canvasRectCache) _canvasRectCache = canvas.getBoundingClientRect();
        return _canvasRectCache;
    }

    // 准星脏检查状态：值不变则不写 DOM，静止时零开销。
    // 用 transform 定位（只走合成），避免 left/top 触发布局。
    let _chX = null, _chY = null, _chVisible = null;
    let _chR = null, _chRVisible = null;
    function updateEmitterCrosshair() {
        if (window._exporting) {
            if (_chVisible !== false) {
                emitterCrosshair.style.display = 'none';
                _chVisible = false;
            }
            return;
        }
        const rect = getCanvasRect();
        const z = window._viewZoom || 1;
        const x = rect.left + emitterPos.x * z;
        const y = rect.top + emitterPos.y * z;
        if (_chVisible !== true) {
            emitterCrosshair.style.display = 'block';
            _chVisible = true;
        }
        if (x !== _chX || y !== _chY) {
            emitterCrosshair.style.transform = 'translate(' + x + 'px, ' + y + 'px) translate(-50%, -50%)';
            _chX = x; _chY = y;
        }
        const emitR = (window._particleParams && window._particleParams.emitRadius) || 0;
        const R = emitR * z;
        if (R > 3) {
            const d = R * 2;
            if (d !== _chR) {
                emitterRadiusCircle.style.width = d + 'px';
                emitterRadiusCircle.style.height = d + 'px';
                _chR = d;
            }
            if (_chRVisible !== true) {
                emitterRadiusCircle.style.display = 'block';
                _chRVisible = true;
            }
        } else if (_chRVisible !== false) {
            emitterRadiusCircle.style.display = 'none';
            _chRVisible = false;
        }
    }
    window._syncEmitterCrosshair = updateEmitterCrosshair;

    window._resetDefaultTexture = function() {
        createDefaultTexture();
    };
    function updateCoordDisplay() {
        const ex = document.getElementById('emitterX');
        const ey = document.getElementById('emitterY');
        if (ex && ey && window._particleEmitterPos) {
            ex.value = Math.floor(window._particleEmitterPos.x);
            ey.value = Math.floor(window._particleEmitterPos.y);
        }
    }
    window._updateCoordDisplay = updateCoordDisplay;

    function updateCanvasSizeDisplay() {
        const cw = document.getElementById('canvasWidth');
        const ch = document.getElementById('canvasHeight');
        if (cw && ch) {
            cw.value = _logicalW || canvas.width;
            ch.value = _logicalH || canvas.height;
        }
    }

    function applyViewTransform() {
        const z = window._viewZoom || 1;
        const px = window._viewPanX || 0;
        const py = window._viewPanY || 0;
        if (!window._exporting && _logicalW > 0) applyBackingSize(false);
        canvas.style.width = (_logicalW || canvas.width) + 'px';
        canvas.style.height = (_logicalH || canvas.height) + 'px';
        canvas.style.transformOrigin = '0 0';
        canvas.style.transform = `translate(${px}px, ${py}px) scale(${z})`;
        canvas.style.setProperty('--gb', (12 / z) + 'px');
        canvas.style.setProperty('--gs', (2 / z) + 'px');
        invalidateCanvasRect();
    }
    window._applyViewTransform = applyViewTransform;

    // 平移所有已存在粒子（含解析化起点），实现「改发射点即整体跟随」
    function shiftParticles(dx, dy) {
        if (dx === 0 && dy === 0) return;
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.x += dx; p.y += dy;
            p.x0 += dx; p.y0 += dy;
        }
        if (window._isContinuousMode === false && window._isSeqPlaying && !window._isSeqPlaying()) {
            setBackground(); render(); drawEmitter();
        }
    }

    window._setEmitterPos = function(x, y) {
        if (!followMouse) shiftParticles(x - emitterPos.x, y - emitterPos.y);
        emitterPos.x = x;
        emitterPos.y = y;
        window._particleEmitterPos = emitterPos;
        updateCoordDisplay();
        updateEmitterCrosshair();
    };
    window._scaleEmitterPos = function(s) {
        emitterPos.x = Math.round(emitterPos.x * s);
        emitterPos.y = Math.round(emitterPos.y * s);
        window._particleEmitterPos = emitterPos;
        updateCoordDisplay();
        updateEmitterCrosshair();
    };

    // ---------- 核心函数 ----------
    function randomRange(min, max) {
        return min + _rng() * (max - min);
    }
    function hexToHsl(hex) {
        hex = hex.replace(/^#/, '');
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        let h, s, l = (mx + mn) / 2;
        if (mx === mn) { h = 0; s = 0; }
        else {
            const d = mx - mn;
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (mx === g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
            h *= 360;
        }
        return { h, s: s * 100, l: l * 100 };
    }
    window._hexToHsl = hexToHsl;

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        let h, s, l = (mx + mn) / 2;
        if (mx === mn) { h = 0; s = 0; }
        else {
            const d = mx - mn;
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (mx === g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
            h *= 360;
        }
        return { h, s: s * 100, l: l * 100 };
    }

    function hslToRgb(h, s, l) {
        h /= 360; s /= 100; l /= 100;
        if (s === 0) { const v = l * 255; return { r: v, g: v, b: v }; }
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return {
            r: hue2rgb(p, q, h + 1/3) * 255,
            g: hue2rgb(p, q, h) * 255,
            b: hue2rgb(p, q, h - 1/3) * 255
        };
    }

    function tintTexture(texture, size, hue, sat, light, intensity) {
        if (_tintCanvas2.width !== size || _tintCanvas2.height !== size) {
            _tintCanvas2.width = size; _tintCanvas2.height = size;
        }
        _tintCtx2.clearRect(0, 0, size, size);
        _tintCtx2.imageSmoothingEnabled = !window._noTextureSmoothing;
        _tintCtx2.drawImage(texture, 0, 0, size, size);
        const imageData = _tintCtx2.getImageData(0, 0, size, size);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
            const a = d[i+3];
            if (a === 0) continue;
            const r = d[i];
            const g = d[i+1];
            const b = d[i+2];
            const hsl = rgbToHsl(r, g, b);
            const t = intensity ?? 1;
            const blendedHue = hsl.h + (hue - hsl.h) * t;
            const blendedSat = hsl.s + (sat - hsl.s) * t;
            const rgb = hslToRgb(blendedHue, blendedSat, hsl.l);
            d[i] = rgb.r;
            d[i+1] = rgb.g;
            d[i+2] = rgb.b;
        }
        _tintCtx2.putImageData(imageData, 0, 0);
        const result = document.createElement('canvas');
        result.width = size; result.height = size;
        result.getContext('2d').drawImage(_tintCanvas2, 0, 0);
        return result;
    }
    
    // ---------- 调色结果缓存 ----------
    // 同一「纹理 + 尺寸 + 颜色 + 强度」只调色一次，避免每个粒子重复 getImageData + 逐像素运算。
    // 以纹理对象为键（WeakMap），纹理被替换/释放后可自动回收。
    let _tintCache = new WeakMap();
    const _TINT_CACHE_PER_TEXTURE_MAX = 256;

    function _tintCacheKey(size, hue, sat, light, intensity) {
        return size + '|' + (hue | 0) + '|' + (sat | 0) + '|' + (light | 0) + '|' + Math.round((intensity ?? 1) * 100);
    }

    function getTintedTexture(texture, size, hue, sat, light, intensity) {
        if (!texture) return null;
        let map = _tintCache.get(texture);
        if (!map) {
            map = new Map();
            _tintCache.set(texture, map);
        }
        const key = _tintCacheKey(size, hue, sat, light, intensity);
        const cached = map.get(key);
        if (cached) return cached;
        const result = tintTexture(texture, size, hue, sat, light, intensity);
        if (map.size >= _TINT_CACHE_PER_TEXTURE_MAX) map.clear();
        map.set(key, result);
        return result;
    }
    // 无插值开关等会改变调色结果时调用，丢弃全部缓存
    window._clearTintCache = function() { _tintCache = new WeakMap(); };

    // 粒子计数脏检查：数量不变则不写 DOM；缓存元素引用，避免每帧查询
    let _countEl = null;
    let _lastCount = -1;
    function updateParticleCount() {
        if (!_countEl) _countEl = document.getElementById('particleCount');
        if (!_countEl) return;
        if (particles.length !== _lastCount) {
            _lastCount = particles.length;
            _countEl.textContent = _lastCount;
        }
    }
    
    function createDefaultTexture() {
        const canvasTex = document.createElement('canvas');
        const size = 64;
        canvasTex.width = size;
        canvasTex.height = size;
        const tc = canvasTex.getContext('2d');
        tc.clearRect(0, 0, size, size);
        const center = size / 2;
        const grad = tc.createRadialGradient(center, center, 0, center, center, center);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.6, 'rgba(102, 204, 255, 0.5)');
        grad.addColorStop(1, 'rgba(102, 204, 255, 0)');
        tc.beginPath();
        tc.arc(center, center, center, 0, Math.PI * 2);
        tc.fillStyle = grad;
        tc.fill();
        const img = new Image();
        img.onload = () => {
            textureImages = [img];
            window._particleTextures = textureImages;
            window._textureUnits = [{ name: '默认纹理', isAnim: false, fps: 0, frames: [img], frameNames: ['默认纹理'] }];
            const fileNameSpan = document.getElementById('textureFileName');
            if (fileNameSpan) fileNameSpan.innerText = '默认纹理（1张）';
            if (window._updateTextureOrderList) window._updateTextureOrderList();
        };
        img.src = canvasTex.toDataURL();
    }
    createDefaultTexture();
    
    // 导出辅助函数
    window._cloneParticleState = function() {
        return {
            particles: particles.map(p => Object.assign({}, p)),
            emitterPos: { ...emitterPos },
            followMouse: followMouse,
            emitActive: emitActive,
            params: JSON.parse(JSON.stringify(params)),
            animMode: window._particleAnimMode,
            animFps: window._particleAnimFps,
            simTime: window._particleSimTime,
            emitAccumulator: emitAccumulator,
            rngState: _rngState
        };
    };
    window._restoreParticleState = function(state) {
        particles = state.particles;
        emitterPos = state.emitterPos;
        window._particleEmitterPos = emitterPos;
        followMouse = state.followMouse;
        emitActive = state.emitActive;
        Object.assign(params, state.params);
        window._particleAnimMode = state.animMode || 0;
        window._particleAnimFps = state.animFps || 10;
        window._particleSimTime = state.simTime || 0;
        emitAccumulator = state.emitAccumulator || 0;
        if (state.rngState != null) _rngState = state.rngState;
        updateParticleCount();
    };
    window._clearParticles = function() {
        particles = [];
        updateParticleCount();
    };

    // 序列模式 seek：重演到目标时刻（解析物理，无需逐步推进）
    window._seekSequence = function(targetTime, events, getForceHsl) {
        particles = [];
        emitAccumulator = 0;
        const maxLife = ((params.fadeStartMax || 2) + (params.fadeDurationMax || 1)) + 1;
        const minTime = targetTime - maxLife;
        for (let k = 0; k < events.length; k++) {
            const ev = events[k];
            if (ev.time > targetTime) break;
            if (ev.time < minTime) continue;
            window._particleSimTime = ev.time;
            const hsl = getForceHsl ? getForceHsl(k) : undefined;
            window.burstEmit(ev.count, hsl, k * 10000);
        }
        window._particleSimTime = targetTime;
        updatePhysics(0);
        setBackground();
        render();
        drawEmitter();
        updateParticleCount();
    };
    
    function createParticleWithRandomTexture(ex, ey, forceHsl, n) {
        _rngSource = (typeof n === 'number') ? particleRng(n) : null;
        const angleOffset = _rng() * Math.PI * 2;
        const rad = randomRange(0, params.emitRadius);
        const px = ex + Math.cos(angleOffset) * rad;
        const py = ey + Math.sin(angleOffset) * rad;
        const baseRad = params.baseAngle * Math.PI / 180;
        const spreadRad = params.angleSpread * Math.PI / 180;
        let angleRad = baseRad;
        if (spreadRad > 0) {
            const offset = randomRange(-spreadRad, spreadRad);
            angleRad = baseRad + offset;
            angleRad = ((angleRad % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
        }
        const speed = randomRange(params.speedMin, params.speedMax);
        const vx = Math.cos(angleRad) * speed;
        const vy = Math.sin(angleRad) * speed;
        const size = randomRange(params.sizeMin, params.sizeMax);
        const fadeStart = randomRange(params.fadeStartMin, params.fadeStartMax);
        const fadeDuration = randomRange(params.fadeDurationMin, params.fadeDurationMax);
        const maxLife = fadeStart + fadeDuration;
        const rotSpeed = randomRange(params.rotSpeedMin, params.rotSpeedMax);
        const baseRot = params.initRotAngle * Math.PI / 180;
        const spreadRot = params.initRotSpread * Math.PI / 180;
        let initRot = baseRot;
        if (spreadRot > 0) {
            const offset = randomRange(-spreadRot, spreadRot);
            initRot = baseRot + offset;
            initRot = ((initRot % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
        }
        
        let texture = null;
        let isText = window._particleTextMode || false;
        let text = '';
        let font = window._particleSelectedFont || 'default';
        let styles = window._particleFontStyles || { italic: false, underline: false, strike: false, letterSpacing: 0, weight: 'normal' };
        let textureIndex = 0;
        let birthTime = window._particleSimTime;
        const texs = window._particleTextures || [];
        let unitIndex = -1;
        
        if (isText) {
            const lines = (window._particleTextContent || '粒子').split('\n').filter(line => line.trim() !== '');
            if (lines.length === 0) lines.push(' ');
            const randomLine = lines[Math.floor(_rng() * lines.length)];
            text = randomLine || ' ';
        } else if (window._particleMultiTex && (window._textureUnits || []).length > 0) {
            const units = window._textureUnits || [];
            unitIndex = Math.floor(_rng() * units.length);
            const unit = units[unitIndex];
            if (unit.frames.length > 0) {
                const uMode = (unit.anim && unit.anim.mode != null) ? unit.anim.mode : 2;
                if (unit.isAnim && uMode !== 0) {
                    if (uMode === 1) {
                        textureIndex = Math.floor(_rng() * unit.frames.length);
                    } else {
                        textureIndex = 0;
                    }
                    texture = unit.frames[textureIndex];
                    birthTime = window._particleSimTime;
                } else {
                    textureIndex = Math.floor(_rng() * unit.frames.length);
                    texture = unit.frames[textureIndex];
                }
            }
        } else {
            if (texs.length > 0) {
                const idx = Math.floor(_rng() * texs.length);
                texture = texs[idx];
                textureIndex = idx;
                if (window._particleAnimMode === 1) {
                    textureIndex = Math.floor(_rng() * texs.length);
                    texture = texs[textureIndex];
                    birthTime = window._particleSimTime;
                } else if (window._particleAnimMode === 2) {
                    textureIndex = 0;
                    texture = texs[0];
                    birthTime = window._particleSimTime;
                }
            }
        }
        
        let hue, sat, light;
        if (forceHsl) {
            hue = forceHsl.h; sat = forceHsl.s; light = forceHsl.l;
        } else {
            const palette = window._paletteParams;
            if (palette && palette.mode !== 'off') {
                if (palette.mode === 'range') {
                    hue = palette.hueMin + _rng() * (palette.hueMax - palette.hueMin);
                    sat = palette.satMin + _rng() * (palette.satMax - palette.satMin);
                } else if (palette.mode === 'list' && palette.colors.length > 0) {
                    const hex = palette.colors[Math.floor(_rng() * palette.colors.length)];
                    const hsl = hexToHsl(hex);
                    hue = hsl.h; sat = hsl.s; light = hsl.l;
                } else if (palette.mode === 'midi') {
                    hue = _rng() * 360;
                    sat = 80;
                    light = 60;
                }
            }
        }

        let tintedFrames = null;
        if (texs.length > 0 && !isText && hue !== undefined) {
            try {
                if (window._particleMultiTex && unitIndex >= 0 && (window._textureUnits || []).length > 0) {
                    const unit = (window._textureUnits || [])[unitIndex];
                    if (unit && unit.frames.length > 0) {
                        tintedFrames = unit.frames.map(t => {
                            if (t && t.complete) {
                                try { return getTintedTexture(t, Math.ceil(size), hue, sat, light, (window._tintIntensity ?? 100) / 100); } catch(e) {}
                            }
                            return null;
                        });
                    }
                } else {
                    tintedFrames = texs.map(t => {
                        if (t && t.complete) {
                                try { return getTintedTexture(t, Math.ceil(size), hue, sat, light, (window._tintIntensity ?? 100) / 100); } catch(e) {}
                        }
                        return null;
                    });
                }
            } catch(e) {}
        }

        const initAlpha = (params.alphaMin + _rng() * (params.alphaMax - params.alphaMin)) / 100;
        _rngSource = null;

        return {
            x0: px, y0: py, vx0: vx, vy0: vy, rot0: initRot,
            x: px, y: py, vx, vy, size,
            life: maxLife,
            maxLife: maxLife,
            fadeStart: fadeStart,
            fadeDuration: fadeDuration,
            rot: initRot, rotSpeed, alpha: initAlpha, initAlpha: initAlpha,
            texture: texture,
            isText: isText,
            text: text,
            font: font,
            styles: styles,
            textureIndex: textureIndex,
            unitIndex: unitIndex,
            birthTime: birthTime,
            hue, sat, light,
            tintedFrames
        };
    }

    window.burstEmit = function(count, forceHsl, baseN) {
        const texs = window._particleTextures || [];
        const ex = emitterPos.x, ey = emitterPos.y;
        for (let i = 0; i < count; i++) {
            if (particles.length >= params.maxParticles) particles.shift();
            const n = (typeof baseN === 'number') ? baseN + i : undefined;
            particles.push(createParticleWithRandomTexture(ex, ey, forceHsl, n));
        }
        updateParticleCount();
    };
    
    // 混合发射策略
    function emitContinuous(deltaSec) {
        if (!window._isContinuousMode || !emitActive) return;
        let baseRate = params.emitRate;
        let rate = baseRate;
        
        if (window._randomRateMode) {
            // 随机模式：速率浮动 + 小数进位（随机间隔）
            const variation = 0.3;
            rate = baseRate * (1 + randomRange(-variation, variation));
            rate = Math.max(0, rate);
            let target = rate * deltaSec;
            let count = Math.floor(target);
            if (_rng() < target - count) count++;
            if (count) window.burstEmit(count);
        } else {
            // 非随机模式：累加器（均匀间隔）
            emitAccumulator += rate * deltaSec;
            let count = Math.floor(emitAccumulator);
            if (count > 0) {
                emitAccumulator -= count;
                window.burstEmit(count);
            }
        }
    }
    
    function updatePhysics(deltaSec) {
        const gx = params.gravityX, gy = params.gravityY;
        const dampPerSec = Math.pow(params.damping, 60);
        const lambda = -Math.log(dampPerSec);
        const linear = lambda < 1e-6;
        const now = window._particleSimTime;
        for (let i = particles.length-1; i >= 0; i--) {
            const p = particles[i];
            const t = now - (p.birthTime || 0);
            if (t >= p.maxLife) {
                particles.splice(i,1);
                continue;
            }
            if (linear) {
                p.vx = p.vx0 + gx * t;
                p.vy = p.vy0 + gy * t;
                p.x  = p.x0 + p.vx0 * t + 0.5 * gx * t * t;
                p.y  = p.y0 + p.vy0 * t + 0.5 * gy * t * t;
            } else {
                const kt = Math.exp(-lambda * t);
                const inv = 1 / lambda;
                p.vx = p.vx0 * kt + gx * inv * (1 - kt);
                p.vy = p.vy0 * kt + gy * inv * (1 - kt);
                p.x  = p.x0 + (p.vx0 - gx * inv) * (1 - kt) * inv + gx * inv * t;
                p.y  = p.y0 + (p.vy0 - gy * inv) * (1 - kt) * inv + gy * inv * t;
            }
            p.rot = p.rot0 + p.rotSpeed * t;
            if (t < p.fadeStart) {
                p.alpha = p.initAlpha;
            } else {
                const fe = t - p.fadeStart;
                if (fe >= p.fadeDuration) {
                    p.alpha = 0;
                } else {
                    p.alpha = p.initAlpha * (1 - fe / p.fadeDuration);
                }
            }
            if (p.alpha < 0) p.alpha = 0;
            p.life = p.maxLife - t;
        }
        updateParticleCount();
    }
    
    function isDrawable(o) {
        return o === undefined || o === null ||
            o instanceof HTMLCanvasElement || o instanceof HTMLImageElement;
    }

    function terminateRender(detail) {
        if (window._renderTerminated) return;
        window._renderTerminated = true;
        console.error('粒子贴图数据已损坏，渲染已终止', detail);
        if (window.Toast) window.Toast.error('粒子贴图数据已损坏，渲染已终止，请刷新页面');
    }

    function render() {
        const _s = targetScale();
        renderCtx.setTransform(_s, 0, 0, _s, 0, 0);
        renderCtx.imageSmoothingEnabled = !window._noTextureSmoothing;
        for (let p of particles) {
            renderCtx.save();
            renderCtx.globalAlpha = p.alpha;
            renderCtx.translate(p.x, p.y);
            renderCtx.rotate(p.rot);
            const half = p.size / 2;
            
            if (p.isText) {
                const fontSize = p.size;
                let fontFamily = p.font;
                if (fontFamily === 'default') fontFamily = 'system-ui, sans-serif';
                fontFamily = String(fontFamily || '').replace(/["'\\]/g, '');
                const styles = p.styles || {};
                let fontWeight = styles.weight || 'normal';
                let fontStyle = styles.italic ? 'italic' : 'normal';
                renderCtx.font = fontStyle + ' ' + fontWeight + ' ' + fontSize + 'px "' + fontFamily + '"';
                renderCtx.textAlign = 'center';
                renderCtx.textBaseline = 'middle';
                renderCtx.fillStyle = p.hue !== undefined ? `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${p.alpha})` : `rgba(255,255,255,${p.alpha})`;
                const text = p.text;
                const letterSpacing = styles.letterSpacing || 0;
                let lineLeft, lineRight;
                if (letterSpacing !== 0) {
                    const charWidths = [];
                    let totalWidth = 0;
                    for (let i = 0; i < text.length; i++) {
                        const metrics = renderCtx.measureText(text[i]);
                        charWidths.push(metrics.width);
                        totalWidth += metrics.width + letterSpacing;
                    }
                    const startX = -totalWidth / 2 + (letterSpacing / 2);
                    let x = startX;
                    for (let i = 0; i < text.length; i++) {
                        renderCtx.fillText(text[i], x, 0);
                        x += charWidths[i] + letterSpacing;
                    }
                    lineLeft = startX - charWidths[0] / 2;
                    lineRight = startX + totalWidth - letterSpacing - charWidths[text.length - 1] / 2;
                } else {
                    renderCtx.fillText(text, 0, 0);
                    const metrics = renderCtx.measureText(text);
                    lineLeft = -metrics.width / 2;
                    lineRight = metrics.width / 2;
                }
                if (styles.underline || styles.strike) {
                    let lineWidth = Math.max(1, fontSize * 0.08);
                    if (fontWeight === 'bold' || fontWeight === '700') lineWidth *= 1.2;
                    renderCtx.strokeStyle = `rgba(255,255,255,${p.alpha})`;
                    renderCtx.lineWidth = lineWidth;
                    if (styles.underline) {
                        const yPos = fontSize * 0.45;
                        renderCtx.beginPath();
                        renderCtx.moveTo(lineLeft, yPos);
                        renderCtx.lineTo(lineRight, yPos);
                        renderCtx.stroke();
                    }
                    if (styles.strike) {
                        const yPos = 0;
                        renderCtx.beginPath();
                        renderCtx.moveTo(lineLeft, yPos);
                        renderCtx.lineTo(lineRight, yPos);
                        renderCtx.stroke();
                    }
                }
            } else {
                const texs = window._particleTextures || [];
                const units = window._textureUnits || [];
                const multiTex = window._particleMultiTex && p.unitIndex >= 0 && p.unitIndex < units.length;
                let useTex = p.texture;
                let curFrame = 0;
                if (multiTex) {
                    const unit = units[p.unitIndex];
                    if (unit && unit.frames.length > 0) {
                        const uMode = (unit.anim && unit.anim.mode != null) ? unit.anim.mode : 2;
                        const start = (p.textureIndex !== undefined ? p.textureIndex : 0) % unit.frames.length;
                        if (unit.isAnim && uMode !== 0) {
                            const fps = (unit.anim && unit.anim.fps > 0 ? unit.anim.fps : (unit.fps > 0 ? unit.fps : (window._particleAnimFps || 10)));
                            const elapsed = window._particleSimTime - (p.birthTime || 0);
                            const totalFrames = Math.floor(elapsed * fps);
                            curFrame = (start + totalFrames) % unit.frames.length;
                            if (curFrame < 0) curFrame += unit.frames.length;
                            useTex = unit.frames[curFrame];
                        } else {
                            curFrame = start;
                            useTex = unit.frames[start];
                        }
                    }
                } else if (texs.length > 1 && window._particleAnimMode !== 0 && p.textureIndex !== undefined) {
                    const fps = window._particleAnimFps || 10;
                    const elapsed = window._particleSimTime - (p.birthTime || 0);
                    const totalFrames = Math.floor(elapsed * fps);
                    curFrame = ((p.textureIndex || 0) + totalFrames) % texs.length;
                    if (curFrame < 0) curFrame += texs.length;
                    useTex = texs[curFrame];
                }
                let tintedTex = null;
                if (p.tintedFrames && p.hue !== undefined) {
                    const idx = multiTex ? curFrame : ((texs.length > 1 && window._particleAnimMode !== 0 && p.textureIndex !== undefined)
                        ? curFrame : (p.textureIndex !== undefined ? p.textureIndex : 0));
                    tintedTex = p.tintedFrames[idx];
                }
                if (!isDrawable(tintedTex)) { terminateRender({ field: 'tintedFrames', textureIndex: p.textureIndex }); continue; }
                if (!isDrawable(useTex)) { terminateRender({ field: 'texture' }); continue; }
                if (useTex && useTex.complete) {
                    if (tintedTex) {
                        renderCtx.drawImage(tintedTex, -half, -half);
                    } else if (p.hue !== undefined) {
                        const ts = Math.ceil(p.size);
                        if (_tintCanvas.width !== ts || _tintCanvas.height !== ts) { _tintCanvas.width = ts; _tintCanvas.height = ts; }
                        _tintCtx.imageSmoothingEnabled = !window._noTextureSmoothing;
                        _tintCtx.clearRect(0, 0, ts, ts);
                        _tintCtx.fillStyle = `hsl(${p.hue}, ${p.sat}%, ${p.light}%)`;
                        _tintCtx.fillRect(0, 0, ts, ts);
                        _tintCtx.globalCompositeOperation = 'destination-in';
                        _tintCtx.drawImage(useTex, 0, 0, ts, ts);
                        _tintCtx.globalCompositeOperation = 'source-over';
                        const intensity = (window._tintIntensity ?? 100) / 100;
                        if (intensity <= 0) {
                            renderCtx.drawImage(useTex, -half, -half, p.size, p.size);
                        } else if (intensity >= 1) {
                            renderCtx.drawImage(_tintCanvas, -half, -half);
                        } else {
                            renderCtx.drawImage(useTex, -half, -half, p.size, p.size);
                            renderCtx.globalAlpha = p.alpha * intensity;
                            renderCtx.drawImage(_tintCanvas, -half, -half);
                            renderCtx.globalAlpha = p.alpha;
                        }
                    } else {
                        renderCtx.drawImage(useTex, -half, -half, p.size, p.size);
                    }
                } else if (texs.length > 0 && texs[0] && texs[0].complete) {
                    if (tintedTex) {
                        renderCtx.drawImage(tintedTex, -half, -half);
                    } else if (p.hue !== undefined) {
                        const ts = Math.ceil(p.size);
                        if (_tintCanvas.width !== ts || _tintCanvas.height !== ts) { _tintCanvas.width = ts; _tintCanvas.height = ts; }
                        _tintCtx.imageSmoothingEnabled = !window._noTextureSmoothing;
                        _tintCtx.clearRect(0, 0, ts, ts);
                        _tintCtx.fillStyle = `hsl(${p.hue}, ${p.sat}%, ${p.light}%)`;
                        _tintCtx.fillRect(0, 0, ts, ts);
                        _tintCtx.globalCompositeOperation = 'destination-in';
                        _tintCtx.drawImage(texs[0], 0, 0, ts, ts);
                        _tintCtx.globalCompositeOperation = 'source-over';
                        const intensity = (window._tintIntensity ?? 100) / 100;
                        if (intensity <= 0) {
                            renderCtx.drawImage(texs[0], -half, -half, p.size, p.size);
                        } else if (intensity >= 1) {
                            renderCtx.drawImage(_tintCanvas, -half, -half);
                        } else {
                            renderCtx.drawImage(texs[0], -half, -half, p.size, p.size);
                            renderCtx.globalAlpha = p.alpha * intensity;
                            renderCtx.drawImage(_tintCanvas, -half, -half);
                            renderCtx.globalAlpha = p.alpha;
                        }
                    } else {
                        renderCtx.drawImage(texs[0], -half, -half, p.size, p.size);
                    }
                } else {
                    renderCtx.fillStyle = p.hue !== undefined ? `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${p.alpha})` : `rgba(102,204,255,${p.alpha})`;
                    renderCtx.beginPath();
                    renderCtx.arc(0, 0, half, 0, Math.PI*2);
                    renderCtx.fill();
                }
            }
            renderCtx.restore();
        }
    }
    
    function drawEmitter() {
        updateEmitterCrosshair();
    }
    
    function setBackground() {
        renderCtx.setTransform(1, 0, 0, 1, 0, 0);
        renderCtx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
        if (!window._exporting) {
            const s = targetScale();
            renderCtx.setTransform(s, 0, 0, s, 0, 0);
            renderCtx.fillStyle = params.backgroundColor;
            renderCtx.fillRect(0, 0, targetLogicalW(), targetLogicalH());
        }
    }
    
    const SIM_STEP = 1 / 60;
    let simAccum = 0;
    let prevTime = 0;
    function animate(nowMs) {
        if (window._renderTerminated) return;
        requestAnimationFrame(animate);
        if (window._exporting) return;
        if (!prevTime) { prevTime = nowMs; return; }
        let delta = Math.min(0.1, (nowMs - prevTime) / 1000);
        if (delta <= 0) { prevTime = nowMs; return; }
        prevTime = nowMs;
        textMode = window._particleTextMode;
        textContent = window._particleTextContent;
        selectedFont = window._particleSelectedFont;
        fontStyles = window._particleFontStyles;
        window._particleAnimMode = window._particleAnimMode || 0;
        window._particleAnimFps = window._particleAnimFps || 10;
        const frozen = (window._isContinuousMode === false) && window._isSeqPlaying && !window._isSeqPlaying();
        if (!frozen) {
            simAccum += delta;
            while (simAccum >= SIM_STEP) {
                window._particleSimTime += SIM_STEP;
                updatePhysics(SIM_STEP);
                emitContinuous(SIM_STEP);
                simAccum -= SIM_STEP;
            }
        }
        setBackground();
        render();
        drawEmitter();
        if (window._onSequenceUpdate) window._onSequenceUpdate(nowMs / 1000);
    }
    
    window._stepSimulation = function(deltaSec) {
        renderCtx.setTransform(1, 0, 0, 1, 0, 0);
        renderCtx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
        window._particleAnimMode = window._particleAnimMode || 0;
        window._particleAnimFps = window._particleAnimFps || 10;
        window._particleSimTime += deltaSec;
        updatePhysics(deltaSec);
        emitContinuous(deltaSec);
        setBackground();
        render();
        drawEmitter();
    };
    
    resizeCanvas();
    initEvents();
    requestAnimationFrame(animate);

    function computeLogicalSize() {
        if (_autoFit) {
            return { w: Math.max(1, containerWidth()), h: Math.max(1, containerHeight()) };
        }
        const cw = document.getElementById('canvasWidth');
        const ch = document.getElementById('canvasHeight');
        let w = cw ? parseInt(cw.value) : NaN;
        let h = ch ? parseInt(ch.value) : NaN;
        if (!(w > 0)) w = containerWidth();
        if (!(h > 0)) h = containerHeight();
        return { w: Math.max(1, w), h: Math.max(1, h) };
    }
    // 目标位图缩放：不超过 1（放大时保持满逻辑分辨率），且不超过设备像素比所需
    function desiredBackingScale() {
        if (window._exporting) return _backingScale;
        const dpr = window.devicePixelRatio || 1;
        const z = window._viewZoom || 1;
        return Math.min(1, z * dpr);
    }
    // 按阈值应用位图尺寸，避免连续缩放时反复重分配
    function applyBackingSize(force) {
        if (_logicalW <= 0 || _logicalH <= 0) return false;
        const s = desiredBackingScale();
        const bw = Math.max(1, Math.round(_logicalW * s));
        const bh = Math.max(1, Math.round(_logicalH * s));
        if (!force && canvas.width > 0 && canvas.height > 0) {
            const dw = Math.abs(bw - canvas.width) / canvas.width;
            const dh = Math.abs(bh - canvas.height) / canvas.height;
            if (dw < 0.12 && dh < 0.12) { _backingScale = canvas.width / _logicalW; return false; }
        }
        canvas.width = bw;
        canvas.height = bh;
        _backingScale = bw / _logicalW;
        return true;
    }
    function resizeCanvas() {
        const L = computeLogicalSize();
        _logicalW = L.w;
        _logicalH = L.h;
        applyBackingSize(true);
        applyViewTransform();
        if (followMouse && emitterPos.x === 0 && emitterPos.y === 0) {
            emitterPos.x = _logicalW/2;
            emitterPos.y = _logicalH/2;
        }
        window._particleEmitterPos = emitterPos;
        updateCoordDisplay();
        updateCanvasSizeDisplay();
        updateAutoFitInputs();
    }
    function containerWidth() { return canvas.parentElement.clientWidth; }
    function containerHeight() { return canvas.parentElement.clientHeight; }
    window._resizeCanvas = resizeCanvas;
    window._setAutoFit = function(enabled) {
        _autoFit = enabled;
        if (enabled) {
            window._viewZoom = 1;
            window._viewPanX = 0;
            window._viewPanY = 0;
            _isPinching = false;
            _panMouseDown = false;
            if (_panMode) {
                _panMode = false;
                document.getElementById('panModeBtn')?.classList.remove('active');
                canvas.style.cursor = 'crosshair';
            }
            const panBtn = document.getElementById('panModeBtn');
            if (panBtn) panBtn.disabled = true;
            resizeCanvas();
        } else {
            const panBtn = document.getElementById('panModeBtn');
            if (panBtn) panBtn.disabled = false;
        }
        const cw = document.getElementById('canvasWidth');
        const ch = document.getElementById('canvasHeight');
        if (cw) cw.disabled = enabled;
        if (ch) ch.disabled = enabled;
    };
    function updateAutoFitInputs() {
        const cw = document.getElementById('canvasWidth');
        const ch = document.getElementById('canvasHeight');
        if (cw) cw.disabled = _autoFit;
        if (ch) ch.disabled = _autoFit;
    }
    
    function getCanvasCoords(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const lw = _logicalW || canvas.width;
        const lh = _logicalH || canvas.height;
        const sx = lw / rect.width;
        const sy = lh / rect.height;
        return {
            x: (clientX - rect.left) * sx,
            y: (clientY - rect.top) * sy
        };
    }

    function initEvents() {
        // ---------- 平移模式 ----------
        window._setPanMode = function(enabled) {
            _panMode = enabled;
            _panMouseDown = false;
            canvas.style.cursor = enabled ? 'grab' : 'crosshair';
            document.body.style.cursor = enabled ? 'grab' : 'crosshair';
        };

        const updateFromMouse = (e) => {
            if (_panMode && _panMouseDown && !_autoFit) {
                if (!_panInitialized) {
                    _panLastX = e.clientX;
                    _panLastY = e.clientY;
                    _panInitialized = true;
                }
                window._viewPanX += e.clientX - _panLastX;
                window._viewPanY += e.clientY - _panLastY;
                _panLastX = e.clientX;
                _panLastY = e.clientY;
                applyViewTransform();
                return;
            }
            const cx = e.clientX;
            const cy = e.clientY;
            const c = getCanvasCoords(cx, cy);
            if (window._particleFollowMouse) {
                emitterPos.x = c.x;
                emitterPos.y = c.y;
                window._particleEmitterPos = emitterPos;
            }
            updateCoordDisplay();
            updateEmitterCrosshair();
        };
        const setFixed = (e) => {
            if (_panMode) return;
            if (e.target.closest('.toolbar, .control-panel, .panel-file, .panel-tabs, .fused-nav, .playback-bar-container, .stepper-select, .color-popup, input, select, textarea, button, label')) return;            if (!window._particleFollowMouse) {
                const c = getCanvasCoords(e.clientX, e.clientY);
                window._setEmitterPos(c.x, c.y);
            }
        };
        document.addEventListener('mousedown', (e) => {
            if (_panMode && e.button === 0) {
                if (e.target.closest('.stepper-select, .color-popup, input, select, textarea')) return;
                e.preventDefault();
                _panMouseDown = true;
                _panInitialized = false;
                canvas.style.cursor = 'grabbing';
                document.body.style.cursor = 'grabbing';
            }
        });
        document.addEventListener('mouseup', (e) => {
            if (_panMode && e.button === 0) {
                _panMouseDown = false;
                _panInitialized = false;
                canvas.style.cursor = 'grab';
                document.body.style.cursor = 'grab';
            }
        });
        document.addEventListener('selectstart', (e) => {
            if (_panMode) e.preventDefault();
        });

        // ---------- 滚轮：默认平移，Ctrl = 缩放（全页面有效，排除面板区域） ----------
        document.addEventListener('wheel', (e) => {
            if (_autoFit) return;
            if (e.target.closest('.toolbar, .control-panel, .panel-file, .panel-tabs, .fused-nav, .playback-bar-container, .stepper-select, .color-popup, input, select, textarea, button, label')) return;            e.preventDefault();
            if (e.ctrlKey) {
                const factor = 1 - e.deltaY * 0.005;
                const oldZ = window._viewZoom;
                const newZ = Math.max(0.1, Math.min(10, oldZ * factor));
                if (newZ !== oldZ) {
                    const rect = canvas.getBoundingClientRect();
                    const cx = (e.clientX - rect.left) / oldZ;
                    const cy = (e.clientY - rect.top) / oldZ;
                    window._viewZoom = newZ;
                    window._viewPanX += cx * (oldZ - newZ);
                    window._viewPanY += cy * (oldZ - newZ);
                }
            } else {
                window._viewPanX -= e.deltaX;
                window._viewPanY -= e.deltaY;
            }
            applyViewTransform();
        }, { passive: false });

        // ---------- 触摸（单指发射点 + 双指缩放/平移） ----------
        const touchFromEvent = (e, idx) => {
            const t = e.touches[idx];
            const c = getCanvasCoords(t.clientX, t.clientY);
            return c;
        };

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (_autoFit && e.touches.length === 2) return;
            if (e.touches.length === 2) {
                const t = e.touches;
                _pinchData = {
                    dist: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY),
                    zoom: window._viewZoom,
                    midX: (t[0].clientX + t[1].clientX) / 2,
                    midY: (t[0].clientY + t[1].clientY) / 2,
                    panX: window._viewPanX,
                    panY: window._viewPanY,
                    rect: canvas.getBoundingClientRect()
                };
                _isPinching = true;
                return;
            }
            if (!_isPinching && e.touches.length === 1) {
                const c = touchFromEvent(e, 0);
                if (window._particleFollowMouse) {
                    emitterPos.x = c.x;
                    emitterPos.y = c.y;
                    window._particleEmitterPos = emitterPos;
                } else {
                    emitterPos.x = c.x;
                    emitterPos.y = c.y;
                    window._particleEmitterPos = emitterPos;
                }
                updateCoordDisplay();
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 2 && _isPinching) {
                const t = e.touches;
                const dist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
                const midX = (t[0].clientX + t[1].clientX) / 2;
                const midY = (t[0].clientY + t[1].clientY) / 2;
                const ratio = _pinchData.dist > 0 ? dist / _pinchData.dist : 1;
                const z0 = _pinchData.zoom;
                const r0 = _pinchData.rect;
                const newZ = Math.max(0.1, Math.min(10, z0 * ratio));
                const cx = (_pinchData.midX - r0.left) / z0;
                const cy = (_pinchData.midY - r0.top) / z0;
                window._viewZoom = newZ;
                window._viewPanX = _pinchData.panX + (midX - r0.left) - cx * newZ;
                window._viewPanY = _pinchData.panY + (midY - r0.top) - cy * newZ;
                applyViewTransform();
                return;
            }
            if (!_isPinching && e.touches.length === 1) {
                const c = touchFromEvent(e, 0);
                if (window._particleFollowMouse) {
                    emitterPos.x = c.x;
                    emitterPos.y = c.y;
                    window._particleEmitterPos = emitterPos;
                }
                updateCoordDisplay();
            }
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) _isPinching = false;
        }, { passive: false });

        canvas.addEventListener('touchcancel', (e) => {
            _isPinching = false;
        }, { passive: false });

        // ---------- 点击设发射点（桌面左键） ----------
        document.addEventListener('click', setFixed);

        document.addEventListener('mousemove', updateFromMouse);
        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('scroll', invalidateCanvasRect, { passive: true });
    }
})();