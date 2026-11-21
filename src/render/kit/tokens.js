(function initDocTokens(global) {
  "use strict";

  const seriesNames = Object.freeze(Array.from({ length: 6 }, (_, index) => `--doc-series-${index + 1}`));

  function read(element = document.documentElement) {
    const styles = getComputedStyle(element);
    const css = (name, fallback = "") => styles.getPropertyValue(name).trim() || fallback;
    return Object.freeze({
      css,
      tone: (name) => css(`--doc-${name}`),
      bg: css("--doc-bg"),
      surface: css("--doc-surface"),
      text: css("--doc-text"),
      muted: css("--doc-muted"),
      border: css("--doc-border"),
      grid: css("--doc-grid"),
      accent: css("--doc-accent"),
      accentSoft: css("--doc-accent-soft"),
      success: css("--doc-success"),
      warning: css("--doc-warning"),
      danger: css("--doc-danger"),
      series: Object.freeze(seriesNames.map((name) => css(name))),
    });
  }

  global.DocTokens = Object.freeze({ read, seriesNames });
  global.ReportTokens = global.DocTokens; // its old name (before 2026-10-26), for a script no tool rewrote (shared/old-names.mjs)
})(globalThis);
