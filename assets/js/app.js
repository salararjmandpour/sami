import { AppController } from "./controllers/app-controller.js";
import { APP_VERSION } from "./config/app-version.js";

window.addEventListener("DOMContentLoaded", async () => {
  const versionLabel = document.getElementById("appVersionLabel");
  if (versionLabel) versionLabel.textContent = `نسخه ${APP_VERSION}`;
  const app = new AppController();
  await app.init();
});
