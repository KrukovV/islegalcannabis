export const STATUS_BANNERS = {
  provisional: {
    title: "Provisional data",
    body: "Extracted from sources; may be incomplete. Verify locally.",
    tone: "warning"
  },
  needs_review: {
    title: "Needs review",
    body: "Rules may have changed. Check official sources.",
    tone: "warning"
  }
} as const;
