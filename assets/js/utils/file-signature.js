export function detectFileSignature(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer.slice(0, 8));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  if (hex.startsWith("50 4b 03 04")) return "zip";
  if (hex.startsWith("d0 cf 11 e0 a1 b1 1a e1")) return "ole";
  return "text-or-unknown";
}

