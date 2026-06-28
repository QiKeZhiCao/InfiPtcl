// particle.js - 核心粒子逻辑（混合发射策略）
(function(){
    const canvas = document.getElementById('particleCanvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
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
        initRotSpread: 0
    };
    
    window._isContinuousMode = true;

    let textureImages = [];
    window._particleTextures = [];

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

    window._resetDefaultTexture = function() {
        createDefaultTexture();
    };
    window._setEmitterPos = function(x, y) {
        emitterPos.x = x;
        emitterPos.y = y;
        window._particleEmitterPos = emitterPos;
        const coordSpan = document.getElementById('emitterCoord');
        if (coordSpan) coordSpan.innerText = `(${Math.floor(x)}, ${Math.floor(y)})`;
    };
    window._setRandomRateMode = function(enabled) {
        window._randomRateMode = enabled;
    };

    // ---------- 核心函数 ----------
    function randomRange(min, max) {
        return min + Math.random() * (max - min);
    }
    
    function updateParticleCount() {
        const countSpan = document.getElementById('particleCount');
        if (countSpan) countSpan.innerText = particles.length;
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
        grad.addColorStop(0, 'rgba(220, 235, 255, 1)');
        grad.addColorStop(0.6, 'rgba(100, 160, 220, 0.5)');
        grad.addColorStop(1, 'rgba(50, 100, 150, 0)');
        tc.beginPath();
        tc.arc(center, center, center, 0, Math.PI * 2);
        tc.fillStyle = grad;
        tc.fill();
        const img = new Image();
        img.onload = () => {
            textureImages = [img];
            window._particleTextures = textureImages;
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
            particles: JSON.parse(JSON.stringify(particles)),
            emitterPos: { ...emitterPos },
            followMouse: followMouse,
            emitActive: emitActive,
            params: JSON.parse(JSON.stringify(params)),
            animMode: window._particleAnimMode,
            animFps: window._particleAnimFps,
            simTime: window._particleSimTime
        };
    };
    window._restoreParticleState = function(state) {
        particles = state.particles;
        emitterPos = state.emitterPos;
        followMouse = state.followMouse;
        emitActive = state.emitActive;
        Object.assign(params, state.params);
        window._particleAnimMode = state.animMode || 0;
        window._particleAnimFps = state.animFps || 10;
        window._particleSimTime = state.simTime || 0;
        updateParticleCount();
    };
    window._clearParticles = function() {
        particles = [];
        updateParticleCount();
    };
    
    function createParticleWithRandomTexture(ex, ey) {
        const angleOffset = Math.random() * Math.PI * 2;
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
        let birthTime = 0;
        
        if (isText) {
            const lines = (window._particleTextContent || '粒子').split('\n').filter(line => line.trim() !== '');
            if (lines.length === 0) lines.push(' ');
            const randomLine = lines[Math.floor(Math.random() * lines.length)];
            text = randomLine || ' ';
        } else {
            const texs = window._particleTextures || [];
            if (texs.length > 0) {
                const idx = Math.floor(Math.random() * texs.length);
                texture = texs[idx];
                textureIndex = idx;
                if (window._particleAnimMode === 1) {
                    textureIndex = Math.floor(Math.random() * texs.length);
                    texture = texs[textureIndex];
                    birthTime = window._particleSimTime;
                } else if (window._particleAnimMode === 2) {
                    textureIndex = 0;
                    texture = texs[0];
                    birthTime = window._particleSimTime;
                }
            }
        }
        
        return {
            x: px, y: py, vx, vy, size,
            life: maxLife,
            maxLife: maxLife,
            fadeStart: fadeStart,
            fadeDuration: fadeDuration,
            rot: initRot, rotSpeed, alpha: 1.0,
            texture: texture,
            isText: isText,
            text: text,
            font: font,
            styles: styles,
            textureIndex: textureIndex,
            birthTime: birthTime
        };
    }

    window.burstEmit = function(count) {
        const texs = window._particleTextures || [];
        const ex = emitterPos.x, ey = emitterPos.y;
        for (let i = 0; i < count; i++) {
            if (particles.length >= params.maxParticles) particles.shift();
            particles.push(createParticleWithRandomTexture(ex, ey));
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
            if (Math.random() < target - count) count++;
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
        const gx = params.gravityX, gy = params.gravityY, damp = params.damping;
        for (let i = particles.length-1; i >= 0; i--) {
            const p = particles[i];
            p.life -= deltaSec;
            if (p.life <= 0) {
                particles.splice(i,1);
                continue;
            }
            p.vx += gx * deltaSec;
            p.vy += gy * deltaSec;
            p.vx *= damp;
            p.vy *= damp;
            p.x += p.vx * deltaSec;
            p.y += p.vy * deltaSec;
            p.rot += p.rotSpeed * deltaSec;
            const alive = p.maxLife - p.life;
            if (alive < p.fadeStart) {
                p.alpha = 1.0;
            } else {
                const fadeElapsed = alive - p.fadeStart;
                if (fadeElapsed >= p.fadeDuration) {
                    p.alpha = 0;
                } else {
                    p.alpha = 1 - (fadeElapsed / p.fadeDuration);
                }
            }
            if (p.alpha < 0) p.alpha = 0;
            const outOffset = 20;
            if (p.x + p.size < -outOffset || p.x - p.size > canvas.width + outOffset ||
                p.y + p.size < -outOffset || p.y - p.size > canvas.height + outOffset) {
                particles.splice(i,1);
            }
        }
        updateParticleCount();
    }
    
    function render() {
        for (let p of particles) {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            const half = p.size / 2;
            
            if (p.isText) {
                const fontSize = p.size;
                let fontFamily = p.font;
                if (fontFamily === 'default') fontFamily = 'system-ui, sans-serif';
                const styles = p.styles || {};
                let fontWeight = styles.weight || 'normal';
                let fontStyle = styles.italic ? 'italic' : 'normal';
                ctx.font = fontStyle + ' ' + fontWeight + ' ' + fontSize + 'px "' + fontFamily + '"';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
                const text = p.text;
                const letterSpacing = styles.letterSpacing || 0;
                let lineLeft, lineRight;
                if (letterSpacing !== 0) {
                    const charWidths = [];
                    let totalWidth = 0;
                    for (let i = 0; i < text.length; i++) {
                        const metrics = ctx.measureText(text[i]);
                        charWidths.push(metrics.width);
                        totalWidth += metrics.width + letterSpacing;
                    }
                    const startX = -totalWidth / 2 + (letterSpacing / 2);
                    let x = startX;
                    for (let i = 0; i < text.length; i++) {
                        ctx.fillText(text[i], x, 0);
                        x += charWidths[i] + letterSpacing;
                    }
                    lineLeft = startX - charWidths[0] / 2;
                    lineRight = startX + totalWidth - letterSpacing - charWidths[text.length - 1] / 2;
                } else {
                    ctx.fillText(text, 0, 0);
                    const metrics = ctx.measureText(text);
                    lineLeft = -metrics.width / 2;
                    lineRight = metrics.width / 2;
                }
                if (styles.underline || styles.strike) {
                    let lineWidth = Math.max(1, fontSize * 0.08);
                    if (fontWeight === 'bold' || fontWeight === '700') lineWidth *= 1.2;
                    ctx.strokeStyle = `rgba(255,255,255,${p.alpha})`;
                    ctx.lineWidth = lineWidth;
                    if (styles.underline) {
                        const yPos = fontSize * 0.45;
                        ctx.beginPath();
                        ctx.moveTo(lineLeft, yPos);
                        ctx.lineTo(lineRight, yPos);
                        ctx.stroke();
                    }
                    if (styles.strike) {
                        const yPos = 0;
                        ctx.beginPath();
                        ctx.moveTo(lineLeft, yPos);
                        ctx.lineTo(lineRight, yPos);
                        ctx.stroke();
                    }
                }
            } else {
                const texs = window._particleTextures || [];
                let useTex = p.texture;
                if (texs.length > 1 && window._particleAnimMode !== 0 && p.textureIndex !== undefined) {
                    const fps = window._particleAnimFps || 10;
                    const elapsed = window._particleSimTime - (p.birthTime || 0);
                    const totalFrames = Math.floor(elapsed * fps);
                    let curFrame = ((p.textureIndex || 0) + totalFrames) % texs.length;
                    if (curFrame < 0) curFrame += texs.length;
                    useTex = texs[curFrame];
                }
                if (useTex && useTex.complete) {
                    ctx.drawImage(useTex, -half, -half, p.size, p.size);
                } else if (texs.length > 0 && texs[0] && texs[0].complete) {
                    ctx.drawImage(texs[0], -half, -half, p.size, p.size);
                } else {
                    ctx.fillStyle = `rgba(255,180,100,${p.alpha})`;
                    ctx.beginPath();
                    ctx.arc(0, 0, half, 0, Math.PI*2);
                    ctx.fill();
                }
            }
            ctx.restore();
        }
    }
    
    function drawEmitter() {
        if (window._exporting) return;
        ctx.save();
        ctx.strokeStyle = '#ffdd99';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(emitterPos.x-14, emitterPos.y);
        ctx.lineTo(emitterPos.x+14, emitterPos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(emitterPos.x, emitterPos.y-14);
        ctx.lineTo(emitterPos.x, emitterPos.y+14);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(emitterPos.x, emitterPos.y, 8, 0, Math.PI*2);
        ctx.strokeStyle = '#ffaa66';
        ctx.stroke();
        ctx.fillStyle = '#ffbb77aa';
        ctx.arc(emitterPos.x, emitterPos.y, 5, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }
    
    function setBackground() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!window._exporting) {
            ctx.fillStyle = params.backgroundColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }
    
    let prevTime = 0;
    function animate(nowMs) {
        requestAnimationFrame(animate);
        if (window._exporting) return;
        if (!prevTime) { prevTime = nowMs; return; }
        let delta = Math.min(0.033, (nowMs - prevTime) / 1000);
        if (delta <= 0) { prevTime = nowMs; return; }
        prevTime = nowMs;
        textMode = window._particleTextMode;
        textContent = window._particleTextContent;
        selectedFont = window._particleSelectedFont;
        fontStyles = window._particleFontStyles;
        window._particleAnimMode = window._particleAnimMode || 0;
        window._particleAnimFps = window._particleAnimFps || 10;
        window._particleSimTime += delta;
        updatePhysics(delta);
        emitContinuous(delta);
        setBackground();
        render();
        drawEmitter();
        if (window._onSequenceUpdate) window._onSequenceUpdate(nowMs / 1000);
    }
    
    window._stepSimulation = function(deltaSec) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
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

    function resizeCanvas() {
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        if (!followMouse) {
            emitterPos.x = Math.min(Math.max(emitterPos.x, 15), canvas.width-15);
            emitterPos.y = Math.min(Math.max(emitterPos.y, 15), canvas.height-15);
        } else if (emitterPos.x === 0 && emitterPos.y === 0) {
            emitterPos.x = canvas.width/2;
            emitterPos.y = canvas.height/2;
        }
        const coordSpan = document.getElementById('emitterCoord');
        if (coordSpan) coordSpan.innerText = `(${Math.floor(emitterPos.x)}, ${Math.floor(emitterPos.y)})`;
        window._particleEmitterPos = emitterPos;
    }
    
    function initEvents() {
        const updateFromMouse = (e) => {
            const rect = canvas.getBoundingClientRect();
            const sx = canvas.width / rect.width;
            const sy = canvas.height / rect.height;
            let cx, cy;
            if (e.touches) {
                cx = e.touches[0].clientX;
                cy = e.touches[0].clientY;
            } else {
                cx = e.clientX;
                cy = e.clientY;
            }
            let mx = (cx - rect.left) * sx;
            let my = (cy - rect.top) * sy;
            mx = Math.min(Math.max(mx, 0), canvas.width);
            my = Math.min(Math.max(my, 0), canvas.height);
            if (window._particleFollowMouse) {
                emitterPos.x = mx;
                emitterPos.y = my;
                window._particleEmitterPos = emitterPos;
            }
            const coordSpan = document.getElementById('emitterCoord');
            if (coordSpan) coordSpan.innerText = `(${Math.floor(emitterPos.x)}, ${Math.floor(emitterPos.y)})`;
        };
        const setFixed = (e) => {
            if (!window._particleFollowMouse) {
                const rect = canvas.getBoundingClientRect();
                const sx = canvas.width / rect.width;
                const sy = canvas.height / rect.height;
                let cx, cy;
                if (e.touches) {
                    cx = e.touches[0].clientX;
                    cy = e.touches[0].clientY;
                } else {
                    cx = e.clientX;
                    cy = e.clientY;
                }
                let mx = (cx - rect.left) * sx;
                let my = (cy - rect.top) * sy;
                mx = Math.min(Math.max(mx, 0), canvas.width);
                my = Math.min(Math.max(my, 0), canvas.height);
                emitterPos.x = mx;
                emitterPos.y = my;
                window._particleEmitterPos = emitterPos;
                const coordSpan = document.getElementById('emitterCoord');
                if (coordSpan) coordSpan.innerText = `(${Math.floor(emitterPos.x)}, ${Math.floor(emitterPos.y)})`;
            }
        };
        canvas.addEventListener('mousemove', updateFromMouse);
        canvas.addEventListener('click', setFixed);
        canvas.addEventListener('touchmove', (e) => { e.preventDefault(); updateFromMouse(e); }, { passive: false });
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); updateFromMouse(e); setFixed(e); }, { passive: false });
        window.addEventListener('resize', resizeCanvas);
    }
})();