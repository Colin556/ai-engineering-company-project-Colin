"use client";

import { useEffect, useRef } from "react";
import { track } from "./telemetry";

export function useTelemetryFlow(flowId: "inbound_order" | "outbound_order" | "incident_create" | "supplier_create") {
  const started = useRef<number | null>(null);
  useEffect(() => {
    const abandon = () => {
      if (started.current === null) return;
      track("navigation_flow_abandoned", {
        flow_id: flowId, last_step_id: "details", step_index: 0,
        elapsed_seconds: Math.max(0, Math.floor((Date.now() - started.current) / 1000)),
      });
      started.current = null;
    };
    const hidden = () => { if (document.visibilityState === "hidden") abandon(); };
    window.addEventListener("pagehide", abandon, true);
    document.addEventListener("visibilitychange", hidden, true);
    return () => {
      window.removeEventListener("pagehide", abandon, true);
      document.removeEventListener("visibilitychange", hidden, true);
      abandon();
    };
  }, [flowId]);
  return {
    begin: () => { started.current ??= Date.now(); },
    complete: () => { started.current = null; },
  };
}