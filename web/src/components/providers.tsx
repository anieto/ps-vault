"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { api } from "@/lib/api";
import { applyAccentColor } from "@/lib/branding";

function BrandingApplier() {
  const { data } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api.getBranding(),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (data?.accent_color) {
      applyAccentColor(data.accent_color);
    }
  }, [data?.accent_color]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: (failureCount, error: unknown) => {
              // Don't retry on 401/403
              if (
                error instanceof Error &&
                "status" in error &&
                (error as { status: number }).status < 500
              ) {
                return false;
              }
              return failureCount < 2;
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <BrandingApplier />
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
