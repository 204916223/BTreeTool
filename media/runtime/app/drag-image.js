(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function setNeutralDragImage(event) {
    const transfer = event?.dataTransfer;
    if (!transfer || typeof transfer.setDragImage !== "function") {
      return;
    }

    let dragImage = document.getElementById("btree-neutral-drag-image");
    if (!dragImage) {
      dragImage = document.createElement("div");
      dragImage.id = "btree-neutral-drag-image";
      dragImage.style.position = "fixed";
      dragImage.style.left = "-1000px";
      dragImage.style.top = "-1000px";
      dragImage.style.width = "1px";
      dragImage.style.height = "1px";
      dragImage.style.opacity = "0";
      dragImage.style.pointerEvents = "none";
      document.body.appendChild(dragImage);
    }

    transfer.setDragImage(dragImage, 0, 0);
  }

  runtime.dragImage = {
    setNeutralDragImage
  };
})();
