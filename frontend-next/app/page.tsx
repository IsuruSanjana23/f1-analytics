import { Suspense } from "react";
import Workspace from "./workspace";

export default function Page() {
  // Workspace reads the URL query, which is only known in the browser.
  return <Suspense><Workspace /></Suspense>;
}
