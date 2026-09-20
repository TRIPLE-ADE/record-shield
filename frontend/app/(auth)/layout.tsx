import type { ReactNode } from "react";
import { QueryProvider } from "@/lib/query/provider";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
