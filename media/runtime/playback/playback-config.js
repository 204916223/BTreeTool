(function () {
  const runtime = (window.BTreeToolRuntime = window.BTreeToolRuntime || {});

  runtime.playbackConfig = {
    transitionRowHeight: 23,
    transitionOverscanRows: 12,
    autoAdvanceBaseDelayMs: 20,
    durationMinVisibleUs: 1_000_000,
    durationMaxVisibleUs: 30_000_000,
    speedOptions: [
      { value: 0.1, label: "0.1x" },
      { value: 0.5, label: "0.5x" },
      { value: 1, label: "1.0x" },
      { value: 1.5, label: "1.5x" },
      { value: 2, label: "2.0x" },
      { value: 3, label: "3.0x" },
      { value: 5, label: "5.0x" },
      { value: 10, label: "10.0x" }
    ]
  };
})();
