import { notFound } from "next/navigation";
import DesignSystemPage from "@/features/design-system";

export default function DesignSystemRoute() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <DesignSystemPage />;
}
