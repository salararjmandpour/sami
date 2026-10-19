export function detectFileSignature(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) return "empty";
  const bytes = new Uint8Array(arrayBuffer.slice(0, 8));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  if (hex.startsWith("50 4b 03 04")) return "zip";
  if (hex.startsWith("d0 cf 11 e0 a1 b1 1a e1")) return "ole";
  return "text-or-unknown";
}

export function assertSpreadsheetBytes(arrayBuffer, label) {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) throw new Error(`${label} خالی است.`);
  const signature = detectFileSignature(arrayBuffer);
  if (signature === "zip" || signature === "ole") return signature;
  if (looksLikeDelimitedText(arrayBuffer)) return "text";
  throw new Error(`${label} قالب پشتیبانی‌شده نیست یا فایل خراب است. فایل Excel یا CSV/TSV معتبر انتخاب کنید.`);
}

export function assertDocxBytes(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) throw new Error("فایل KPI خالی است.");
  if (detectFileSignature(arrayBuffer) !== "zip") throw new Error("فایل KPI باید یک سند DOCX معتبر باشد.");
}

function looksLikeDelimitedText(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer.slice(0, Math.min(arrayBuffer.byteLength, 4096)));
  if (bytes.includes(0)) return false;
  const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");
  if (!sample.trim()) return false;
  const printable = [...sample].filter((char) => char === "\n" || char === "\r" || char === "\t" || (char >= " " && char !== "\u007f")).length;
  if (printable / sample.length < 0.9) return false;
  const firstLine = sample.split(/\r?\n/).find((line) => line.trim()) || "";
  return [",", "\t", ";"].some((delimiter) => firstLine.includes(delimiter));
}
