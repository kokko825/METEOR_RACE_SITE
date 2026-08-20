import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";

/** The operations studio is a local development tool, never a public website route. */
export default async function BalanceLayout({ children }: { children: ReactNode }) {
  const host = (await headers()).get("host")?.toLowerCase() ?? "";
  const localHost = host === "localhost" || host.startsWith("localhost:") || host === "127.0.0.1" || host.startsWith("127.0.0.1:");
  if (!localHost) notFound();
  return children;
}
