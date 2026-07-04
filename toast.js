(function() {
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
                el.classList.remove('toast-visible');
                el.classList.add('toast-hiding');
                el.addEventListener('animationend', () => {
                    if (el.parentNode) el.parentNode.removeChild(el);
                }, { once: true });
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
