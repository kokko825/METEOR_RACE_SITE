import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/** The operations studio is a local development tool, never a public website route. */
export default function BalanceLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return children;
}
