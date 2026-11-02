import { captureFrontendError } from "./lib/services/telemetry-browser";

window.addEventListener("error", () => captureFrontendError("uncaught_error"));
window.addEventListener("unhandledrejection", () => captureFrontendError("unhandled_rejection"));