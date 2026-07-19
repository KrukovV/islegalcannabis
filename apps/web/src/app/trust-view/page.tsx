import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocalAuditHost } from "@/lib/privateAuditHost";

export default async function TrustViewPage() {
  const requestHeaders = await headers();
  if (!isLocalAuditHost(requestHeaders.get("host"))) {
    notFound();
  }
  redirect("/wiki-truth");
}
