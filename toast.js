(function() {
    let _dedupMsg = null;
    const _hideQueue = [];
    let _processing = false;

    async function _processHideQueue() {
        if (_processing) return;
        _processing = true;
        try {
            while (_hideQueue.length) {
                const el = _hideQueue.shift();
                if (!el.parentNode) continue;
                const container = el.parentNode;
                const gap = parseFloat(getComputedStyle(container).rowGap) || 8;
                el.classList.remove('toast-visible');
                el.classList.add('toast-hiding');
                const shiftPx = el.offsetHeight + gap;
                const items = Array.from(container.children);
                const idx = items.indexOf(el);
                const followers = [];
                for (let k = idx + 1; k < items.length; k++) {
                    const sib = items[k];
                    if (sib.classList.contains('toast-hiding')) continue;
                    followers.push(sib);
                    sib.classList.remove('toast-visible');
                    sib.style.transform = 'translateX(0)';
                    sib.style.opacity = '1';
                }
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                for (const sib of followers) {
                    sib.style.transition = 'transform 0.25s ease-in';
                    sib.style.transform = 'translateY(-' + shiftPx + 'px)';
                }
                await new Promise(resolve => setTimeout(resolve, 300));
                if (el.parentNode) el.parentNode.removeChild(el);
                for (const sib of followers) {
                    if (sib.parentNode) {
                        sib.style.transition = '';
                        sib.style.transform = 'translateY(0)';
                        sib.style.opacity = '1';
                    }
                }
            }
        } finally {
            _processing = false;
        }
    }

    const Toast = {
        container: null,

        _ensureContainer() {
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.className = 'toast-container';
                document.body.appendChild(this.container);
            }
            return this.container;
        },

        show(text, type, duration) {
            if (_dedupMsg === text) return;
            _dedupMsg = text;
            Promise.resolve().then(() => { _dedupMsg = null; });
            type = type || 'info';
            duration = duration || 4000;

            const el = document.createElement('div');
            el.className = 'toast-item toast-' + type;
            el.textContent = text;

            const container = this._ensureContainer();
            container.appendChild(el);

            void el.offsetHeight;
            el.classList.add('toast-visible');

            setTimeout(() => {
                _hideQueue.push(el);
                _processHideQueue();
            }, duration);

            return el;
        },

        info(text, duration) { return this.show(text, 'info', duration); },
        success(text, duration) { return this.show(text, 'success', duration); },
        warn(text, duration) { return this.show(text, 'warn', duration); },
        error(text, duration) { return this.show(text, 'error', duration); }
    };

    window.Toast = Toast;
})();