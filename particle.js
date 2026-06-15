// particle.js - 最终修复版（支持多张粒子贴图，随机选择）
(function(){
    const canvas = document.getElementById('particleCanvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let textureImages = [];     // 存储多个纹理图片对象
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
        rotSpeedMin: -1.2,   // 弧度，滑块值为角度
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
            const fileNameSpan = document.getElementById('textureFileName');
            if (fileNameSpan) fileNameSpan.innerText = '默认纹理 (1张)';
        };
        img.src = canvasTex.toDataURL();
    }
    createDefaultTexture();
    
    // ========== 导出辅助函数（包含渲染） ==========
    window._cloneParticleState = function() {
        return {
            particles: JSON.parse(JSON.stringify(particles)),
            emitterPos: { ...emitterPos },
            followMouse: followMouse,
            emitActive: emitActive,
            params: JSON.parse(JSON.stringify(params))
        };
    };
    window._restoreParticleState = function(state) {
        particles = state.particles;
        emitterPos = state.emitterPos;
        followMouse = state.followMouse;
        emitActive = state.emitActive;
        Object.assign(params, state.params);
        updateParticleCount();
    };
    window._clearParticles = function() {
        particles = [];
        updateParticleCount();
    };
    
    // 通用的粒子创建函数（支持随机纹理）
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
        // 随机选择纹理
        let texture = null;
        if (textureImages.length > 0) {
            const idx = Math.floor(Math.random() * textureImages.length);
            texture = textureImages[idx];
        }
        return {
            x: px, y: py, vx, vy, size,
            life: maxLife,
            maxLife: maxLife,
            fadeStart: fadeStart,
            fadeDuration: fadeDuration,
            rot: initRot, rotSpeed, alpha: 1.0,
            texture: texture
        };
    }

    window.burstEmit = function(count) {
        if (textureImages.length === 0) return;
        const ex = emitterPos.x, ey = emitterPos.y;
        for (let i = 0; i < count; i++) {
            if (particles.length >= params.maxParticles) particles.shift();
            particles.push(createParticleWithRandomTexture(ex, ey));
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
            const tex = p.texture;
            if (tex && tex.complete) {
                ctx.drawImage(tex, -half, -half, p.size, p.size);
            } else if (textureImages.length > 0 && textureImages[0] && textureImages[0].complete) {
                // 后备：使用第一张纹理
                ctx.drawImage(textureImages[0], -half, -half, p.size, p.size);
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
    
    function setParticleSizeFromImage(img) {
        const maxDim = Math.max(img.width, img.height);
        let newMin = Math.min(80, Math.max(8, Math.floor(maxDim * 0.5)));
        let newMax = Math.min(120, Math.max(16, Math.floor(maxDim * 1.2)));
        if (newMin > newMax) newMin = newMax;
        params.sizeMin = newMin;
        params.sizeMax = newMax;
        const sizeMinSlider = document.getElementById('sizeMin');
        const sizeMinVal = document.getElementById('sizeMinVal');
        const sizeMaxSlider = document.getElementById('sizeMax');
        const sizeMaxVal = document.getElementById('sizeMaxVal');
        if (sizeMinSlider) sizeMinSlider.value = newMin;
        if (sizeMinVal) sizeMinVal.value = newMin;
        if (sizeMaxSlider) sizeMaxSlider.value = newMax;
        if (sizeMaxVal) sizeMaxVal.value = newMax;
    }
    
    function bindUI() {
        const mappings = [
            ['emitRate', 'emitRate', false],
            ['sizeMin', 'sizeMin', false],
            ['sizeMax', 'sizeMax', false],
            ['speedMin', 'speedMin', false],
            ['speedMax', 'speedMax', false],
            ['gravityX', 'gravityX', false],
            ['gravityY', 'gravityY', false],
            ['damping', 'damping', true],
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
                if (span) span.value = isFloat ? val.toFixed(2) : val;
            };
            slider.addEventListener('input', update);
            update();
        }
        
        // 范围参数绑定
        function bindRange(minId, maxId, paramMin, paramMax, isFloat, step) {
            const minSlider = document.getElementById(minId);
            const maxSlider = document.getElementById(maxId);
            const minSpan = document.getElementById(minId + 'Val');
            const maxSpan = document.getElementById(maxId + 'Val');
            if (!minSlider || !maxSlider) return;
            const update = () => {
                let minVal = isFloat ? parseFloat(minSlider.value) : parseInt(minSlider.value);
                let maxVal = isFloat ? parseFloat(maxSlider.value) : parseInt(maxSlider.value);
                params[paramMin] = minVal;
                params[paramMax] = maxVal;
                if (minSpan) minSpan.value = minVal;
                if (maxSpan) maxSpan.value = maxVal;
                if (minVal > maxVal) {
                    maxSlider.value = minVal;
                    params[paramMax] = minVal;
                    if (maxSpan) maxSpan.value = minVal;
                }
            };
            minSlider.addEventListener('input', update);
            maxSlider.addEventListener('input', update);
            if (minSpan) minSpan.addEventListener('change', () => {
                let v = isFloat ? parseFloat(minSpan.value) : parseInt(minSpan.value);
                if (isNaN(v)) return;
                v = Math.min(parseFloat(minSlider.max), Math.max(parseFloat(minSlider.min), v));
                minSlider.value = v;
                update();
            });
            if (maxSpan) maxSpan.addEventListener('change', () => {
                let v = isFloat ? parseFloat(maxSpan.value) : parseInt(maxSpan.value);
                if (isNaN(v)) return;
                v = Math.min(parseFloat(maxSlider.max), Math.max(parseFloat(maxSlider.min), v));
                maxSlider.value = v;
                update();
            });
            update();
        }
        
        bindRange('fadeStartMin', 'fadeStartMax', 'fadeStartMin', 'fadeStartMax', true, 0.1);
        bindRange('fadeDurationMin', 'fadeDurationMax', 'fadeDurationMin', 'fadeDurationMax', true, 0.1);
        bindRange('sizeMin', 'sizeMax', 'sizeMin', 'sizeMax', false, 1);
        bindRange('speedMin', 'speedMax', 'speedMin', 'speedMax', false, 5);
        
        // 旋转速度范围：滑块值为角度，内部存储弧度
        const rotSpeedMinSlider = document.getElementById('rotSpeedMin');
        const rotSpeedMaxSlider = document.getElementById('rotSpeedMax');
        const rotSpeedMinVal = document.getElementById('rotSpeedMinVal');
        const rotSpeedMaxVal = document.getElementById('rotSpeedMaxVal');
        if (rotSpeedMinSlider && rotSpeedMaxSlider) {
            const updateRotSpeed = () => {
                let minDeg = parseInt(rotSpeedMinSlider.value);
                let maxDeg = parseInt(rotSpeedMaxSlider.value);
                params.rotSpeedMin = minDeg * Math.PI / 180;
                params.rotSpeedMax = maxDeg * Math.PI / 180;
                if (rotSpeedMinVal) rotSpeedMinVal.value = minDeg;
                if (rotSpeedMaxVal) rotSpeedMaxVal.value = maxDeg;
                if (minDeg > maxDeg) {
                    rotSpeedMaxSlider.value = minDeg;
                    params.rotSpeedMax = minDeg * Math.PI / 180;
                    if (rotSpeedMaxVal) rotSpeedMaxVal.value = minDeg;
                }
            };
            rotSpeedMinSlider.addEventListener('input', updateRotSpeed);
            rotSpeedMaxSlider.addEventListener('input', updateRotSpeed);
            if (rotSpeedMinVal) {
                rotSpeedMinVal.addEventListener('change', () => {
                    let v = parseInt(rotSpeedMinVal.value);
                    v = Math.min(parseInt(rotSpeedMinSlider.max), Math.max(parseInt(rotSpeedMinSlider.min), v));
                    rotSpeedMinSlider.value = v;
                    updateRotSpeed();
                });
            }
            if (rotSpeedMaxVal) {
                rotSpeedMaxVal.addEventListener('change', () => {
                    let v = parseInt(rotSpeedMaxVal.value);
                    v = Math.min(parseInt(rotSpeedMaxSlider.max), Math.max(parseInt(rotSpeedMaxSlider.min), v));
                    rotSpeedMaxSlider.value = v;
                    updateRotSpeed();
                });
            }
            updateRotSpeed();
        }
        
        const baseAngleSlider = document.getElementById('baseAngle');
        const baseAngleVal = document.getElementById('baseAngleVal');
        if (baseAngleSlider) {
            baseAngleSlider.addEventListener('input', () => {
                params.baseAngle = parseInt(baseAngleSlider.value);
                if (baseAngleVal) baseAngleVal.value = params.baseAngle;
            });
            baseAngleSlider.dispatchEvent(new Event('input'));
        }
        if (baseAngleVal) {
            baseAngleVal.addEventListener('change', () => {
                let v = parseInt(baseAngleVal.value);
                v = Math.min(360, Math.max(0, v));
                baseAngleSlider.value = v;
                params.baseAngle = v;
            });
        }
        
        const angleSpreadSlider = document.getElementById('angleSpread');
        const angleSpreadVal = document.getElementById('angleSpreadVal');
        if (angleSpreadSlider) {
            angleSpreadSlider.addEventListener('input', () => {
                params.angleSpread = parseInt(angleSpreadSlider.value);
                if (angleSpreadVal) angleSpreadVal.value = params.angleSpread;
            });
            angleSpreadSlider.dispatchEvent(new Event('input'));
        }
        if (angleSpreadVal) {
            angleSpreadVal.addEventListener('change', () => {
                let v = parseInt(angleSpreadVal.value);
                v = Math.min(180, Math.max(0, v));
                angleSpreadSlider.value = v;
                params.angleSpread = v;
            });
        }
        
        const initRotAngleSlider = document.getElementById('initRotAngle');
        const initRotAngleVal = document.getElementById('initRotAngleVal');
        if (initRotAngleSlider) {
            initRotAngleSlider.addEventListener('input', () => {
                params.initRotAngle = parseInt(initRotAngleSlider.value);
                if (initRotAngleVal) initRotAngleVal.value = params.initRotAngle;
            });
            initRotAngleSlider.dispatchEvent(new Event('input'));
        }
        if (initRotAngleVal) {
            initRotAngleVal.addEventListener('change', () => {
                let v = parseInt(initRotAngleVal.value);
                v = Math.min(360, Math.max(0, v));
                initRotAngleSlider.value = v;
                params.initRotAngle = v;
            });
        }
        
        const initRotSpreadSlider = document.getElementById('initRotSpread');
        const initRotSpreadVal = document.getElementById('initRotSpreadVal');
        if (initRotSpreadSlider) {
            initRotSpreadSlider.addEventListener('input', () => {
                params.initRotSpread = parseInt(initRotSpreadSlider.value);
                if (initRotSpreadVal) initRotSpreadVal.value = params.initRotSpread;
            });
            initRotSpreadSlider.dispatchEvent(new Event('input'));
        }
        if (initRotSpreadVal) {
            initRotSpreadVal.addEventListener('change', () => {
                let v = parseInt(initRotSpreadVal.value);
                v = Math.min(180, Math.max(0, v));
                initRotSpreadSlider.value = v;
                params.initRotSpread = v;
            });
        }
        
        // 背景色选择器
        const bgPicker = document.getElementById('bgColorPicker');
        const bgPreview = document.getElementById('bgPreview');
        if (bgPicker && bgPreview) {
            bgPicker.addEventListener('input', (e) => {
                params.backgroundColor = e.target.value;
                bgPreview.style.backgroundColor = params.backgroundColor;
            });
            // 初始触发一次
            bgPicker.dispatchEvent(new Event('input'));
        }
        
        // 发射模式按钮
        const followBtn = document.getElementById('followMouseBtn');
        const fixedBtn = document.getElementById('fixedModeBtn');
        const centerBtn = document.getElementById('centerPointBtn');
        if (followBtn && fixedBtn) {
            followBtn.classList.add('active');
            fixedBtn.classList.remove('active');
            if (centerBtn) centerBtn.style.display = 'none';
            
            followBtn.addEventListener('click', () => {
                followMouse = true;
                followBtn.classList.add('active');
                fixedBtn.classList.remove('active');
                if (centerBtn) centerBtn.style.display = 'none';
            });
            fixedBtn.addEventListener('click', () => {
                followMouse = false;
                fixedBtn.classList.add('active');
                followBtn.classList.remove('active');
                if (centerBtn) centerBtn.style.display = 'inline-block';
            });
        }
        
        // 中心点按钮
        if (centerBtn) {
            centerBtn.addEventListener('click', () => {
                emitterPos.x = canvas.width / 2;
                emitterPos.y = canvas.height / 2;
                document.getElementById('emitterCoord').innerText = `(${Math.floor(emitterPos.x)}, ${Math.floor(emitterPos.y)})`;
            });
        }
        
        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn) clearBtn.addEventListener('click', () => {
            particles = [];
            updateParticleCount();
        });
        
        // 纹理上传（多文件）
        const textureUpload = document.getElementById('textureUpload');
        const textureFileNameSpan = document.getElementById('textureFileName');
        if (textureUpload) {
            textureUpload.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                if (files.length === 0) return;
                let loadedCount = 0;
                const imgs = [];
                files.forEach(file => {
                    const img = new Image();
                    img.onload = () => {
                        imgs.push(img);
                        loadedCount++;
                        if (loadedCount === files.length) {
                            textureImages = imgs;
                            if (textureFileNameSpan) textureFileNameSpan.innerText = `${files.length}张图片`;
                            // 根据第一张图片调整粒子大小
                            setParticleSizeFromImage(imgs[0]);
                        }
                    };
                    img.src = URL.createObjectURL(file);
                });
            });
        }
        
        const resetTextureBtn = document.getElementById('resetTextureBtn');
        if (resetTextureBtn) resetTextureBtn.addEventListener('click', () => {
            createDefaultTexture();
            if (textureFileNameSpan) textureFileNameSpan.innerText = '默认纹理 (1张)';
        });
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
        const coordSpan = document.getElementById('emitterCoord');
        if (coordSpan) coordSpan.innerText = `(${Math.floor(emitterPos.x)}, ${Math.floor(emitterPos.y)})`;
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
            const coordSpan = document.getElementById('emitterCoord');
            if (coordSpan) coordSpan.innerText = `(${Math.floor(emitterPos.x)}, ${Math.floor(emitterPos.y)})`;
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
    
    let prevTime = 0;
    function animate(nowMs) {
        requestAnimationFrame(animate);
        if (window._exporting) return;
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
    
    // 导出模拟中需要的步进函数（复用现有逻辑）
    window._stepSimulation = function(deltaSec) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        updatePhysics(deltaSec);
        emitContinuous(deltaSec);
        setBackground();
        render();
        drawEmitter();
    };
    
    resizeCanvas();
    bindUI();
    initEvents();
    requestAnimationFrame(animate);
})();