// Classic script installed before boot/module loading, including failed module imports.
(() => {
  const rows = [];
  const text = value => {
    try {
      if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack || ""}`.slice(0, 2048);
      if (typeof value === "string") return value.slice(0, 2048);
      return String(JSON.stringify(value) ?? value).slice(0, 2048);
    } catch { return "[unserializable]"; }
  };
  const add = (level, values) => {
    rows.push({ level, t: Math.round(performance.now()), created: new Date().toISOString(),
      message: values.slice(0, 10).map(text).join(" ").slice(0, 2048) });
    if (rows.length > 50) rows.shift();
  };
  for (const level of ["warn", "error"]) {
    const original = console[level];
    console[level] = function (...values) {
      try { add(level, values); } catch { /* Logging must never disturb boot or flight. */ }
      return original.apply(this, values);
    };
  }
  window.addEventListener("error", event => add("error", [event.error || event.message]));
  window.addEventListener("unhandledrejection", event => add("error", [event.reason]));
  globalThis.__gunsReportConsole = () => rows.map(row => ({ ...row }));
})();
