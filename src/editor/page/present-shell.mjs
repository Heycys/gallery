import { pageAddress } from "../../shared/page-address.mjs";
import { PROTOCOL, VERSION } from "../../shared/session.mjs";

// Presentations and their documents share one origin; links may notify their parent.
export function tell(type, fields = {}) {
  if (window.parent === window) return;
  window.parent.postMessage({ protocol: PROTOCOL, v: VERSION, type, slug: pageAddress(location.href)?.slug ?? "", ...fields }, location.origin);
}
