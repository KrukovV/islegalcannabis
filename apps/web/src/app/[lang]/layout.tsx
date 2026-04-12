import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isSeoAltLocale } from "@/lib/seo/i18n";

export default async function SeoLocaleLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isSeoAltLocale(lang)) {
    notFound();
  }
  return children;
}
