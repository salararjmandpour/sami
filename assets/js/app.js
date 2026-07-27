import { AppController } from "./controllers/app-controller.js";

window.addEventListener("DOMContentLoaded", async () => {
  const app = new AppController();
  await app.init();
});

