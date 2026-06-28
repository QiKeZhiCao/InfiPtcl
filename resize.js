// resize.js - 内部手柄拖拽调整宽度（手柄不随滚动条移动）
(function() {
    const panel = document.querySelector('.control-panel');
    const handle = document.querySelector('.resize-handle');
    if (!panel || !handle) return;

    let startX, startWidth;

    function onMouseMove(e) {
        const dx = e.clientX - startX;
        let newWidth = startWidth - dx; // 右边缘固定，左边缘移动
        newWidth = Math.min(500, Math.max(320, newWidth));
        panel.style.width = newWidth + 'px';
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.classList.remove('resizing');
        if (window._updateFusedNav) window._updateFusedNav();
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