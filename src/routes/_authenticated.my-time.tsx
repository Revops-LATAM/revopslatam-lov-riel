import { createFileRoute } from "@tanstack/react-router";
import { RouteError } from "@/components/tasko/RouteError";
import { MyTimeView } from "@/components/tasko/MyTimeView";

export const Route = createFileRoute("/_authenticated/my-time")({
  ssr: false,
  head: () => ({ meta: [{ title: "Mi tiempo · Riel" }] }),
  errorComponent: RouteError,
  component: () => <MyTimeView />,
});
