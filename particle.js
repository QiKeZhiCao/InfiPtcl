// particle.js - 支持基准方向、随机偏转、初始旋转角度及随机范围，寿命拆分为开始消失时间+持续时间
(function(){
    const canvas = document.getElementById('particleCanvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let textureImage = null;
    let emitterPos = { x: 0, y: 0 };
    let followMouse = true;
    let emitActive = true;
    let lastFrameTime = 0;
    
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
    
    function bindUI() {
        // 普通滑块映射（移除了 lifeMin/lifeMax）
        const mappings = [
            ['emitRate', 'emitRate', false],
            ['sizeMin', 'sizeMin', false],
            ['sizeMax', 'sizeMax', false],
            ['speedMin', 'speedMin', false],
            ['speedMax', 'speedMax', false],
            ['gravityX', 'gravityX', false],
            ['gravityY', 'gravityY', false],
            ['damping', 'damping', true],
            ['rotSpeedMin', 'rotSpeedMin', true],
            ['rotSpeedMax', 'rotSpeedMax', true],
            ['emitRadius', 'emitRadius', false],
            ['maxParticles', 'maxParticles', false]
        ];
        for (let [id, prop, isFloat] of mappings) {
            const slider = document.getElementById(id);
            const span = document.getElementById(id + 'Val');
            if (!slider) continue;
            const update = () => {
                let val = isFloat ? parseFloat(slider.value) : parseInt(slider.value);
                params[prop] = val;
                if (span) span.innerText = isFloat ? val.toFixed(2) : val;
            };
            slider.addEventListener('input', update);
            update();
        }
        
        // 开始消失时间范围
        const fadeStartMin = document.getElementById('fadeStartMin');
        const fadeStartMinVal = document.getElementById('fadeStartMinVal');
        if (fadeStartMin) {
            fadeStartMin.addEventListener('input', () => {
                params.fadeStartMin = parseFloat(fadeStartMin.value);
                if (fadeStartMinVal) fadeStartMinVal.innerText = params.fadeStartMin.toFixed(1);
            });
            fadeStartMin.dispatchEvent(new Event('input'));
        }
        const fadeStartMax = document.getElementById('fadeStartMax');
        const fadeStartMaxVal = document.getElementById('fadeStartMaxVal');
        if (fadeStartMax) {
            fadeStartMax.addEventListener('input', () => {
                params.fadeStartMax = parseFloat(fadeStartMax.value);
                if (fadeStartMaxVal) fadeStartMaxVal.innerText = params.fadeStartMax.toFixed(1);
            });
            fadeStartMax.dispatchEvent(new Event('input'));
        }
        
        // 消失持续时间范围
        const fadeDurationMin = document.getElementById('fadeDurationMin');
        const fadeDurationMinVal = document.getElementById('fadeDurationMinVal');
        if (fadeDurationMin) {
            fadeDurationMin.addEventListener('input', () => {
                params.fadeDurationMin = parseFloat(fadeDurationMin.value);
                if (fadeDurationMinVal) fadeDurationMinVal.innerText = params.fadeDurationMin.toFixed(1);
            });
            fadeDurationMin.dispatchEvent(new Event('input'));
        }
        const fadeDurationMax = document.getElementById('fadeDurationMax');
        const fadeDurationMaxVal = document.getElementById('fadeDurationMaxVal');
        if (fadeDurationMax) {
            fadeDurationMax.addEventListener('input', () => {
                params.fadeDurationMax = parseFloat(fadeDurationMax.value);
                if (fadeDurationMaxVal) fadeDurationMaxVal.innerText = params.fadeDurationMax.toFixed(1);
            });
            fadeDurationMax.dispatchEvent(new Event('input'));
        }
        
        // 方向与旋转参数
        const baseAngleSlider = document.getElementById('baseAngle');
        const baseAngleVal = document.getElementById('baseAngleVal');
        if (baseAngleSlider) {
            baseAngleSlider.addEventListener('input', () => {
                params.baseAngle = parseInt(baseAngleSlider.value);
                if (baseAngleVal) baseAngleVal.innerText = params.baseAngle;
            });
            baseAngleSlider.dispatchEvent(new Event('input'));
        }
        
        const angleSpreadSlider = document.getElementById('angleSpread');
        const angleSpreadVal = document.getElementById('angleSpreadVal');
        if (angleSpreadSlider) {
            angleSpreadSlider.addEventListener('input', () => {
                params.angleSpread = parseInt(angleSpreadSlider.value);
                if (angleSpreadVal) angleSpreadVal.innerText = params.angleSpread;
            });
            angleSpreadSlider.dispatchEvent(new Event('input'));
        }
        
        const initRotAngleSlider = document.getElementById('initRotAngle');
        const initRotAngleVal = document.getElementById('initRotAngleVal');
        if (initRotAngleSlider) {
            initRotAngleSlider.addEventListener('input', () => {
                params.initRotAngle = parseInt(initRotAngleSlider.value);
                if (initRotAngleVal) initRotAngleVal.innerText = params.initRotAngle;
            });
            initRotAngleSlider.dispatchEvent(new Event('input'));
        }
        
        const initRotSpreadSlider = document.getElementById('initRotSpread');
        const initRotSpreadVal = document.getElementById('initRotSpreadVal');
        if (initRotSpreadSlider) {
            initRotSpreadSlider.addEventListener('input', () => {
                params.initRotSpread = parseInt(initRotSpreadSlider.value);
                if (initRotSpreadVal) initRotSpreadVal.innerText = params.initRotSpread;
            });
            initRotSpreadSlider.dispatchEvent(new Event('input'));
        }
        
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
        
        const textureUpload = document.getElementById('textureUpload');
        textureUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const img = new Image();
                img.onload = () => { textureImage = img; };
                img.src = URL.createObjectURL(file);
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