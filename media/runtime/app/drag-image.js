(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function setVisibleDragImage(event, source) {
    const transfer = event?.dataTransfer;
    if (!transfer || typeof transfer.setDragImage !== "function" || !source) {
      return;
    }

    const rect = source.getBoundingClientRect?.();
    const offsetX = rect && Number.isFinite(event.clientX)
      ? Math.max(0, Math.min(event.clientX - rect.left, rect.width))
      : 0;
    const offsetY = rect && Number.isFinite(event.clientY)
      ? Math.max(0, Math.min(event.clientY - rect.top, rect.height))
      : 0;
    transfer.setDragImage(source, offsetX, offsetY);
  }

  runtime.dragImage = {
    setVisibleDragImage
  };
})();
