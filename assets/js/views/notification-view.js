export function notify(message, type = "info") {
  const region = document.getElementById("notificationRegion");
  const node = document.createElement("div");
  node.className = `notice ${type}`;
  node.textContent = message;
  region.append(node);
  setTimeout(() => node.remove(), 4500);
}

