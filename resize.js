// resize.js - 控制面板左边缘拖拽调整宽度
(function() {
    const panel = document.querySelector('.control-panel');
    if (!panel) return;

    let handle = document.querySelector('.resize-handle');
    if (!handle) {
        handle = document.createElement('div');
        handle.className = 'resize-handle';
        panel.style.position = 'relative';
        panel.appendChild(handle);
    }

    let startX, startWidth;

    function onMouseMove(e) {
        const dx = e.clientX - startX;
        let newWidth = startWidth - dx;
        newWidth = Math.min(500, Math.max(260, newWidth));
        panel.style.width = newWidth + 'px';
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.classList.remove('resizing');
    }

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startWidth = panel.offsetWidth;
        document.body.classList.add('resizing');
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
})();