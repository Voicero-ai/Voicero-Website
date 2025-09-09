"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

declare global {
  interface Window {
    gtag: (...args: any[]) => void;
  }
}

export default function TrackGtag() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams?.toString();
    const page_path = query ? `${pathname}?${query}` : pathname || "/";
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("config", "AW-17503203512", { page_path });
    }
  }, [pathname, searchParams]);

  return null;
}


