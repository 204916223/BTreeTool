(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  function clampInteger(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return min;
    }
    return Math.min(max, Math.max(min, Math.round(numeric)));
  }

  function clampNumber(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return min;
    }
    return Math.min(max, Math.max(min, numeric));
  }

  runtime.math = {
    clampInteger,
    clampNumber
  };
})();
