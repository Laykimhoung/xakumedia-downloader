import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { LandingPage } from "./landing/LandingPage";
import "./index.css";

// Check environment:
// In the Electron desktop shell, window.api is exposed by the preload bridge.
// In a standard web browser (e.g. Vercel deployment), window.api is undefined.
// We also support explicit URL query param overrides: ?view=app or ?view=landing.
const urlParams = new URLSearchParams(window.location.search);
const forcedView = urlParams.get("view");
const isElectronDesktop = typeof window !== "undefined" && Boolean(window.api);

const shouldShowDesktopApp =
  forcedView === "app" || (isElectronDesktop && forcedView !== "landing");

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      {shouldShowDesktopApp ? <App /> : <LandingPage />}
    </React.StrictMode>
  );
}

