"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect } from "react";
import { track } from "../lib/services/telemetry";
import { deviceClass, routeId, sectionId } from "../lib/services/telemetry-browser";

const metrics = new Set<string>();
const reportVital: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  if (!["LCP", "INP", "CLS", "FCP", "TTFB"].includes(metric.name)) return;
  const key = `${metric.id}:${metric.name}`;
  if (metrics.has(key)) return;
  metrics.add(key);
  track("web_vital_recorded", {
    metric_name: metric.name, value: metric.value, route_id: routeId(), device_class: deviceClass(),
  });
};

export function TelemetryObserver() {
  const pathname = usePathname();
  useReportWebVitals(reportVital);
  useEffect(() => {
    const section = sectionId(pathname);
    if (section) track("navigation_section_viewed", { section_id: section });
  }, [pathname]);
  return null;
}