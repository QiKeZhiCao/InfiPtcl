// particle.js - 支持可编辑数值、重力范围扩大至±2000、消失持续时间扩大
(function(){
    const canvas = document.getElementById('particleCanvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let textureImage = null;
    let emitterPos = { x: 0, y: 0 };
    let followMouse = true;
    let emitActive = true;
    
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
        rotSpeedMin: -1.2,
        rotSpeedMax: 1.8,
        emitRadius: 5,
        maxParticles: 3000,
        backgroundColor: '#000000',
        initRotAngle: 0,
        initRotSpread: 0
    };
    
    window._isContinuousMode = true;
    
    function randomRange(min, max) {
        return min + Math.random() * (max - min);
    }
    
    function updateParticleCount() {
        document.getElementById('particleCount').innerText = particles.length;
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
        img.onload = () => { textureImage = img; };
        img.src = canvasTex.toDataURL();
    }
    createDefaultTexture();
    
    function computeAngle() {
        const baseRad = params.baseAngle * Math.PI / 180;
        const spreadRad = params.angleSpread * Math.PI / 180;
        if (spreadRad <= 0) return baseRad;
        const offset = randomRange(-spreadRad, spreadRad);
        let angle = baseRad + offset;
        angle = ((angle % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
        return angle;
    }
    
    function computeInitialRotation() {
        const baseRot = params.initRotAngle * Math.PI / 180;
        const spreadRot = params.initRotSpread * Math.PI / 180;
        if (spreadRot <= 0) return baseRot;
        const offset = randomRange(-spreadRot, spreadRot);
        let rot = baseRot + offset;
        rot = ((rot % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
        return rot;
    }
    
    function createSingleParticle(ex, ey) {
        const angleOffset = Math.random() * Math.PI * 2;
        const rad = randomRange(0, params.emitRadius);
        const px = ex + Math.cos(angleOffset) * rad;
        const py = ey + Math.sin(angleOffset) * rad;
        const angleRad = computeAngle();
        const speed = randomRange(params.speedMin, params.speedMax);
        const vx = Math.cos(angleRad) * speed;
        const vy = Math.sin(angleRad) * speed;
        const size = randomRange(params.sizeMin, params.sizeMax);
        const fadeStart = randomRange(params.fadeStartMin, params.fadeStartMax);
        const fadeDuration = randomRange(params.fadeDurationMin, params.fadeDurationMax);
        const maxLife = fadeStart + fadeDuration;
        const rotSpeed = randomRange(params.rotSpeedMin, params.rotSpeedMax);
        const initRot = computeInitialRotation();
        return {
            x: px, y: py, vx, vy, size,
            life: maxLife,
            maxLife: maxLife,
            fadeStart: fadeStart,
            fadeDuration: fadeDuration,
            rot: initRot, rotSpeed, alpha: 1.0
        };
    }

    window.burstEmit = function(count) {
        if (!textureImage) return;
        const ex = emitterPos.x, ey = emitterPos.y;
        for (let i = 0; i < count; i++) {
            if (particles.length >= params.maxParticles) particles.shift();
            particles.push(createSingleParticle(ex, ey));
        }
        updateParticleCount();
    };
    
    function emitContinuous(deltaSec) {
        if (!window._isContinuousMode || !emitActive) return;
        let target = params.emitRate * deltaSec;
        let count = Math.floor(target);
        if (Math.random() < target - count) count++;
        if (count) window.burstEmit(count);
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
            if (p.alpha < 0.05) p.alpha = 0.05;
            if (p.x + p.size < -300 || p.x - p.size > canvas.width + 300 ||
                p.y + p.size < -300 || p.y - p.size > canvas.height + 300) {
                particles.splice(i,1);
            }
        }
        updateParticleCount();
    }
    
    function render() {
        if (!textureImage) return;
        for (let p of particles) {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            const half = p.size / 2;
            if (textureImage.complete) {
                ctx.drawImage(textureImage, -half, -half, p.size, p.size);
            } else {
                ctx.fillStyle = `rgba(255,180,100,${p.alpha})`;
                ctx.beginPath();
                ctx.arc(0, 0, half, 0, Math.PI*2);
                ctx.fill();
            }
            ctx.restore();
        }
    }
    
    function drawEmitter() {
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
        ctx.fillStyle = params.backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // 通用滑块绑定函数（支持输入框双向同步）
    function bindSliderInput(sliderId, inputId, paramName, isFloat, updateCallback) {
        const slider = document.getElementById(sliderId);
        const input = document.getElementById(inputId);
        if (!slider || !input) return;
        const update = () => {
            let val = isFloat ? parseFloat(slider.value) : parseInt(slider.value);
            params[paramName] = val;
            input.value = isFloat ? val.toFixed(isFloat===true?2:0) : val;
            if (updateCallback) updateCallback(val);
        };
        const updateFromInput = () => {
            let val = isFloat ? parseFloat(input.value) : parseInt(input.value);
            if (isNaN(val)) return;
            val = Math.min(parseFloat(slider.max), Math.max(parseFloat(slider.min), val));
            slider.value = val;
            params[paramName] = val;
            if (updateCallback) updateCallback(val);
        };
        slider.addEventListener('input', update);
        input.addEventListener('change', updateFromInput);
        update(); // 初始同步
    }
    
    function bindRangeSliders(minSliderId, minInputId, maxSliderId, maxInputId, paramMin, paramMax, isFloat, unit) {
        const minSlider = document.getElementById(minSliderId);
        const minInput = document.getElementById(minInputId);
        const maxSlider = document.getElementById(maxSliderId);
        const maxInput = document.getElementById(maxInputId);
        if (!minSlider || !maxSlider) return;
        const updateMin = () => {
            let val = isFloat ? parseFloat(minSlider.value) : parseInt(minSlider.value);
            params[paramMin] = val;
            if (minInput) minInput.value = isFloat ? val.toFixed(1) : val;
            if (params[paramMin] > params[paramMax]) {
                params[paramMax] = params[paramMin];
                if (maxSlider) maxSlider.value = params[paramMin];
                if (maxInput) maxInput.value = isFloat ? params[paramMin].toFixed(1) : params[paramMin];
            }
        };
        const updateMax = () => {
            let val = isFloat ? parseFloat(maxSlider.value) : parseInt(maxSlider.value);
            params[paramMax] = val;
            if (maxInput) maxInput.value = isFloat ? val.toFixed(1) : val;
            if (params[paramMax] < params[paramMin]) {
                params[paramMin] = params[paramMax];
                if (minSlider) minSlider.value = params[paramMin];
                if (minInput) minInput.value = isFloat ? params[paramMin].toFixed(1) : params[paramMin];
            }
        };
        const updateMinFromInput = () => {
            let val = isFloat ? parseFloat(minInput.value) : parseInt(minInput.value);
            if (isNaN(val)) return;
            val = Math.min(parseFloat(minSlider.max), Math.max(parseFloat(minSlider.min), val));
            minSlider.value = val;
            params[paramMin] = val;
            if (params[paramMin] > params[paramMax]) {
                params[paramMax] = params[paramMin];
                if (maxSlider) maxSlider.value = params[paramMin];
                if (maxInput) maxInput.value = isFloat ? params[paramMin].toFixed(1) : params[paramMin];
            }
        };
        const updateMaxFromInput = () => {
            let val = isFloat ? parseFloat(maxInput.value) : parseInt(maxInput.value);
            if (isNaN(val)) return;
            val = Math.min(parseFloat(maxSlider.max), Math.max(parseFloat(maxSlider.min), val));
            maxSlider.value = val;
            params[paramMax] = val;
            if (params[paramMax] < params[paramMin]) {
                params[paramMin] = params[paramMax];
                if (minSlider) minSlider.value = params[paramMin];
                if (minInput) minInput.value = isFloat ? params[paramMin].toFixed(1) : params[paramMin];
            }
        };
        minSlider.addEventListener('input', updateMin);
        maxSlider.addEventListener('input', updateMax);
        if (minInput) minInput.addEventListener('change', updateMinFromInput);
        if (maxInput) maxInput.addEventListener('change', updateMaxFromInput);
        updateMin();
        updateMax();
    }
    
    function bindUI() {
        // 单滑块绑定
        bindSliderInput('emitRate', 'emitRateVal', 'emitRate', false);
        bindSliderInput('baseAngle', 'baseAngleVal', 'baseAngle', false);
        bindSliderInput('angleSpread', 'angleSpreadVal', 'angleSpread', false);
        bindSliderInput('gravityX', 'gravityXVal', 'gravityX', false);
        bindSliderInput('gravityY', 'gravityYVal', 'gravityY', false);
        bindSliderInput('damping', 'dampingVal', 'damping', true);
        bindSliderInput('initRotAngle', 'initRotAngleVal', 'initRotAngle', false);
        bindSliderInput('initRotSpread', 'initRotSpreadVal', 'initRotSpread', false);
        bindSliderInput('emitRadius', 'emitRadiusVal', 'emitRadius', false);
        bindSliderInput('maxParticles', 'maxParticlesVal', 'maxParticles', false);
        
        // 范围滑块绑定
        bindRangeSliders('fadeStartMin', 'fadeStartMinVal', 'fadeStartMax', 'fadeStartMaxVal', 'fadeStartMin', 'fadeStartMax', true);
        bindRangeSliders('fadeDurationMin', 'fadeDurationMinVal', 'fadeDurationMax', 'fadeDurationMaxVal', 'fadeDurationMin', 'fadeDurationMax', true);
        bindRangeSliders('sizeMin', 'sizeMinVal', 'sizeMax', 'sizeMaxVal', 'sizeMin', 'sizeMax', false);
        bindRangeSliders('speedMin', 'speedMinVal', 'speedMax', 'speedMaxVal', 'speedMin', 'speedMax', false);
        bindRangeSliders('rotSpeedMin', 'rotSpeedMinVal', 'rotSpeedMax', 'rotSpeedMaxVal', 'rotSpeedMin', 'rotSpeedMax', true);
        
        // 背景色
        const bgPicker = document.getElementById('bgColorPicker');
        const bgPreview = document.getElementById('bgPreview');
        bgPicker.addEventListener('input', (e) => {
            params.backgroundColor = e.target.value;
            bgPreview.style.backgroundColor = params.backgroundColor;
        });
        
        // 发射模式按钮
        document.getElementById('followMouseBtn').addEventListener('click', () => {
            followMouse = true;
            document.getElementById('followMouseBtn').style.background = '#5a5e8a';
            document.getElementById('fixedModeBtn').style.background = '#2c2f42';
        });
        document.getElementById('fixedModeBtn').addEventListener('click', () => {
            followMouse = false;
            document.getElementById('fixedModeBtn').style.background = '#5a5e8a';
            document.getElementById('followMouseBtn').style.background = '#2c2f42';
        });
        
        document.getElementById('clearBtn').addEventListener('click', () => {
            particles = [];
            updateParticleCount();
        });
        document.getElementById('pauseEmitBtn').addEventListener('click', () => { emitActive = false; });
        document.getElementById('resumeEmitBtn').addEventListener('click', () => { emitActive = true; });
        
        // 纹理上传与文件名显示
        const textureUpload = document.getElementById('textureUpload');
        const textureFileName = document.getElementById('textureFileName');
        textureUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const img = new Image();
                img.onload = () => { textureImage = img; };
                img.src = URL.createObjectURL(file);
                textureFileName.innerText = file.name;
            } else {
                textureFileName.innerText = '未选择';
            }
        });
        document.getElementById('resetTextureBtn').addEventListener('click', createDefaultTexture);
    }
    
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
        document.getElementById('emitterCoord').innerText = `（${Math.floor(emitterPos.x)},${Math.floor(emitterPos.y)}）`;
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
            if (followMouse) {
                emitterPos.x = mx;
                emitterPos.y = my;
            }
            document.getElementById('emitterCoord').innerText = `（${Math.floor(emitterPos.x)},${Math.floor(emitterPos.y)}）`;
        };
        const setFixed = (e) => {
            if (!followMouse) {
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
                document.getElementById('emitterCoord').innerText = `（${Math.floor(emitterPos.x)},${Math.floor(emitterPos.y)}）`;
            }
        };
        canvas.addEventListener('mousemove', updateFromMouse);
        canvas.addEventListener('click', setFixed);
        canvas.addEventListener('touchmove', (e) => { e.preventDefault(); updateFromMouse(e); }, { passive: false });
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); updateFromMouse(e); setFixed(e); }, { passive: false });
        window.addEventListener('resize', resizeCanvas);
    }
    
    let prevTime = 0;
    function animate(nowMs) {
        requestAnimationFrame(animate);
        if (!prevTime) { prevTime = nowMs; return; }
        let delta = Math.min(0.033, (nowMs - prevTime) / 1000);
        if (delta <= 0) { prevTime = nowMs; return; }
        prevTime = nowMs;
        updatePhysics(delta);
        emitContinuous(delta);
        setBackground();
        render();
        drawEmitter();
        if (window._onSequenceUpdate) window._onSequenceUpdate(nowMs / 1000);
    }
    
    resizeCanvas();
    bindUI();
    initEvents();
    requestAnimationFrame(animate);
})();