"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";

interface OpenInAppBannerProps {
  /**
   * The psvault:// deep link to fire when the user taps "Open in App".
   * e.g. "psvault://checkin-confirm" or "psvault://reset-password?token=xxx"
   */
  deepLink: string;
  message?: string;
}

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

export function OpenInAppBanner({ deepLink, message = "Open in P.S. Vault app" }: OpenInAppBannerProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isMobileBrowser());
  }, []);

  if (!show) return null;

  return (
    <div className="w-full max-w-md mx-auto mb-4">
      <a
        href={deepLink}
        className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 text-sm text-primary hover:bg-primary/15 transition-colors"
      >
        <Smartphone className="h-4 w-4 shrink-0" />
        <span className="font-medium">{message}</span>
        <span className="ml-auto shrink-0 text-primary/60">→</span>
      </a>
    </div>
  );
}
