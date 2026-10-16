"use client";

import { Analytics } from "@vercel/analytics/next";
import { isLocalAuditHost } from "@/lib/privateAuditHost";
import { useBrowserUrl } from "@/lib/useBrowserUrl";

export default function PublicAnalytics() {
  const href = useBrowserUrl();
  return href && !isLocalAuditHost(new URL(href).hostname) ? <Analytics /> : null;
}
