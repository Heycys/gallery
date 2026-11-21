import type { DocChartsApi } from "./doc-charts.js";
import type { DocDialogsApi } from "./doc-dialogs.js";
import type { DocKitApi } from "./doc-kit.js";
import type { DocMathApi } from "./doc-math.js";
import type { DocStateFactory } from "./doc-state.js";
import type { DocSheetsApi } from "./doc-sheets.js";
import type { DocTablesApi } from "./doc-tables.js";
import type { DocTokensApi } from "./doc-tokens.js";

declare global {
  var DocCharts: DocChartsApi;
  var DocDialogs: DocDialogsApi;
  var DocKit: DocKitApi;
  var DocMath: DocMathApi;
  var DocState: DocStateFactory;
  var DocSheets: DocSheetsApi;
  var DocTables: DocTablesApi;
  var DocTokens: DocTokensApi;
}

export * from "./doc-charts.js";
export * from "./doc-dialogs.js";
export * from "./doc-kit.js";
export * from "./doc-math.js";
export * from "./doc-state.js";
export * from "./doc-sheets.js";
export * from "./doc-tables.js";
export * from "./doc-tokens.js";

export * from "./doc-code.js";
