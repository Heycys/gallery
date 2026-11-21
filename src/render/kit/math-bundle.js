// /kit/math.js: the kit's formulas (math.js) with KaTeX's mhchem (\ce{H2O}, \pu{1 mol}: chemistry
// and units), which adds its macros to the page's KaTeX. Its "katex" is
// the page's (vendor katex.min.js, loaded before: page-katex.js); "contrib/…" is found in the katex
// package (assets.mjs: the bundle's alias and nodePaths).
import "contrib/mhchem/mhchem.js";
import "./math.js";
