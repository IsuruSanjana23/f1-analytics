import { Suspense } from "react";
import Workspace from "../workspace";

export default function TelemetryPage() {
  return <Suspense><Workspace telemetryPage /></Suspense>;
}
