import { LABEL_ALIASES } from "../../config/label-mapping.js";
import { comparable } from "./string-normalizer.js";

export function normalizeLabels(value) {
  const parts = String(value ?? "").split(/[;,]/).map(comparable).filter(Boolean);
  const canonical = new Set();
  parts.forEach((part) => {
    let matched = false;
    Object.entries(LABEL_ALIASES).forEach(([name, aliases]) => {
      if (aliases.map(comparable).includes(part)) {
        canonical.add(name);
        matched = true;
      }
    });
    if (!matched) canonical.add(part);
  });
  return [...canonical];
}

