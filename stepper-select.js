// stepper-select.js - 复合选择器（StepperSelect）
// 在原生 <select> 之上覆盖一层 ◀ 当前值 ▼ ▶ 交互壳，保留原生 select 的 .value 读写与 change 事件，
// 使现有业务代码（约 77 处 .value / change 用法）无需改动。
(function () {
    // 悬停自动展开延迟（ms），比原方案 150ms 更防误触，比 1s 更跟手，可按需调整
    const HOVER_OPEN_DELAY = 500;

    const WRAP_IDS = [
        'appearanceMode', 'animModeSelect', 'fontSelect', 'fontWeightSelect',
        'paletteMode', 'timelineSource', 'precisionSelect', 'midiTrackSelect', 'exportType',
        'exportFormat', 'exportMethod', 'unitAnimModeSelect', 'unitAnimTarget'
    ];

    // 仅继承原生 select 的布局类行内样式，视觉样式统一由 .stepper-select 控制
    const LAYOUT_STYLE_KEYS = [
        'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'order',
        'width', 'minWidth', 'maxWidth', 'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft'
    ];

    const registry = new Map();
    let ss_uid = 0;

    function copyLayoutStyle(fromEl, toEl) {
        const cs = fromEl.style;
        for (const k of LAYOUT_STYLE_KEYS) {
            const v = cs[k];
            if (v) toEl.style[k] = v;
        }
    }

    function wrapElement(select) {
        if (!select) return null;
        const gid = select.id = (select.id || ('ss-' + (++ss_uid)));
        if (registry.has(gid) || select.dataset.stepperWrapped) return null;
        select.dataset.stepperWrapped = '1';

        const root = document.createElement('div');
        root.className = 'stepper-select';
        root.tabIndex = 0;
        root.setAttribute('role', 'combobox');
        root.setAttribute('aria-haspopup', 'listbox');
        root.setAttribute('aria-expanded', 'false');
        const label = select.getAttribute('aria-label')
            || select.closest('.param-row')?.querySelector('span')?.textContent?.trim()
            || select.getAttribute('id');
        root.setAttribute('aria-label', label || gid);

        copyLayoutStyle(select, root);
        const minW = select.dataset.stepperMin;
        if (minW) root.style.minWidth = minW + 'px';

        const btnPrev = document.createElement('button');
        btnPrev.type = 'button';
        btnPrev.className = 'stepper-select__arrow';
        btnPrev.textContent = '<';
        btnPrev.setAttribute('aria-label', '上一个选项');

        const valueEl = document.createElement('div');
        valueEl.className = 'stepper-select__value';

        const ddIcon = document.createElement('div');
        ddIcon.className = 'stepper-select__dropdown-icon';
        ddIcon.textContent = '˅';
        ddIcon.setAttribute('aria-hidden', 'true');

        const btnNext = document.createElement('button');
        btnNext.type = 'button';
        btnNext.className = 'stepper-select__arrow';
        btnNext.textContent = '>';
        btnNext.setAttribute('aria-label', '下一个选项');

        const listEl = document.createElement('div');
        listEl.className = 'stepper-select__list';
        listEl.setAttribute('role', 'listbox');

        root.appendChild(btnPrev);
        root.appendChild(valueEl);
        root.appendChild(ddIcon);
        root.appendChild(btnNext);
        root.appendChild(listEl);

        select.style.display = 'none';
        select.parentNode.insertBefore(root, select);

        let open = false;
        let openByHover = false;
        let hoverTimer = null;
        let closing = false;
        let closeTimer = null;

        function getOptions() {
            const arr = [];
            for (const o of select.options) {
                arr.push({ value: o.value, label: o.textContent, disabled: !!o.disabled });
            }
            return arr;
        }

        function currentIndex() {
            const o = getOptions();
            return o.findIndex(x => String(x.value) === String(select.value));
        }

        function renderValue() {
            const o = getOptions();
            const i = currentIndex();
            const cur = i >= 0 ? o[i] : null;
            valueEl.textContent = cur ? cur.label : '';
            valueEl.title = cur ? cur.label : '';
        }

        function renderList() {
            const o = getOptions();
            const curV = String(select.value);
            listEl.innerHTML = '';
            o.forEach((opt) => {
                const item = document.createElement('div');
                const active = String(opt.value) === curV;
                item.className = 'stepper-select__list-item'
                    + (active ? ' stepper-select__list-item--active' : '')
                    + (opt.disabled ? ' stepper-select__list-item--disabled' : '');
                item.setAttribute('role', 'option');
                item.setAttribute('aria-selected', active ? 'true' : 'false');
                item.textContent = opt.label;
                item.title = opt.label;
                item.addEventListener('mousedown', (e) => e.preventDefault());
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (opt.disabled) return;
                    setValue(opt.value);
                    close();
                });
                listEl.appendChild(item);
            });
            const cur = listEl.querySelector('.stepper-select__list-item--active');
            if (cur) cur.scrollIntoView({ block: 'nearest' });
        }

        function renderAll() {
            renderValue();
            if (open) renderList();
        }

        function setValue(v) {
            if (String(select.value) === String(v)) return;
            select.value = v;
            select.dispatchEvent(new Event('change'));
        }

        function step(dir) {
            const o = getOptions();
            if (!o.length) return;
            let i = currentIndex();
            if (i < 0) i = dir > 0 ? -1 : 0;
            const n = o.length;
            for (let k = 0; k < n; k++) {
                i = (i + dir + n) % n;
                if (!o[i].disabled) { setValue(o[i].value); renderAll(); break; }
            }
        }

        function positionList() {
            const rect = root.getBoundingClientRect();
            const scroller = root.closest('.panel-content') || root.closest('.panel-file');
            const scRect = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
            const spaceBelow = scRect.bottom - rect.bottom;
            const spaceAbove = rect.top - scRect.top;
            listEl.style.width = Math.max(rect.width, 120) + 'px';
            listEl.style.left = '0px';
            listEl.style.right = 'auto';
            if (spaceBelow < listEl.offsetHeight && spaceAbove > spaceBelow) {
                listEl.style.top = 'auto';
                listEl.style.bottom = '100%';
                listEl.dataset.flip = 'above';
            } else {
                listEl.style.top = '100%';
                listEl.style.bottom = 'auto';
                listEl.dataset.flip = 'below';
            }
        }

        function openList(byHover) {
            if (open) return;
            clearTimeout(closeTimer);
            closing = false;
            root.classList.remove('stepper-select--closing');
            open = true;
            openByHover = !!byHover;
            root.classList.add('stepper-select--open');
            root.setAttribute('aria-expanded', 'true');
            renderList();
            positionList();
        }

        function close() {
            if (!open || closing) return;
            open = false;
            openByHover = false;
            closing = true;
            root.classList.add('stepper-select--closing');
            root.setAttribute('aria-expanded', 'false');
            closeTimer = setTimeout(() => {
                closing = false;
                root.classList.remove('stepper-select--closing');
                root.classList.remove('stepper-select--open');
            }, 130);
        }

        function toggle() { open ? close() : openList(false); }

        btnPrev.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); step(-1); });
        btnNext.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); step(1); });
        valueEl.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
        ddIcon.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

        root.addEventListener('mouseenter', () => {
            if (open) return;
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(() => {
                hoverTimer = null;
                if (!open && root.matches(':hover')) openList(true);
            }, HOVER_OPEN_DELAY);
        });
        root.addEventListener('mouseleave', () => {
            if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
            if (open && openByHover) close();
        });

        root.addEventListener('keydown', (e) => {
            if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
                e.preventDefault(); e.stopPropagation(); step(-1);
            } else if (e.code === 'ArrowRight' || e.code === 'ArrowDown') {
                e.preventDefault(); e.stopPropagation();
                if (e.code === 'ArrowDown' && !open) openList(false);
                else step(1);
            } else if (e.code === 'Enter' || e.code === 'Space') {
                e.preventDefault(); e.stopPropagation(); toggle();
            } else if (e.code === 'Escape') {
                close();
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (open && !root.contains(e.target)) close();
        });

        select.addEventListener('change', renderAll);

        renderValue();

        registry.set(gid, { root, renderAll });
        return root;
    }

    function wrap(id) {
        return wrapElement(document.getElementById(id));
    }

    window.StepperSelect = {
        wrapAll() { WRAP_IDS.forEach(wrap); },
        wrapElement,
        rebuild(id) { const r = registry.get(id); if (r) r.renderAll(); },
        rebuildAll() { registry.forEach(r => r.renderAll()); }
    };

    window.StepperSelect.wrapAll();
})();
