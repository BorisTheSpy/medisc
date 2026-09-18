import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import { router } from "./router";
import { applyStoredTheme } from "./lib/theme";
import { installSyncHooks, scheduleSync } from "./services/sync";
import { installPublishRetries } from "./services/community";

applyStoredTheme();
registerSW({ immediate: true });
installSyncHooks();
scheduleSync(800);
installPublishRetries();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
