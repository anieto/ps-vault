"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, APIError } from "@/lib/api";
import { ShieldOff, ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

function AbortContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [state, setState] = useState<"confirm" | "loading" | "success" | "error">("confirm");
  const [errorMsg, setErrorMsg] = useState("");

  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api.getBranding(),
    staleTime: Infinity,
  });
  const appName = branding?.app_name || "P.S. Vault";

  async function handleAbort() {
    if (!token) {
      setState("error");
      setErrorMsg("No token found in this link. Please check the email and try again.");
      return;
    }
    setState("loading");
    try {
      await api.abortByToken(token);
      setState("success");
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof APIError ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-border p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            {state === "success"
              ? <ShieldCheck className="w-5 h-5 text-green-600" />
              : state === "error"
              ? <AlertCircle className="w-5 h-5 text-destructive" />
              : <ShieldOff className="w-5 h-5 text-primary" />}
          </div>
          <h1 className="text-lg font-semibold text-text-primary">{appName}</h1>
        </div>

        {state === "confirm" && (
          <>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-text-primary">Abort vault delivery?</h2>
              <p className="text-sm text-text-secondary leading-relaxed">
                You were designated as a trusted contact with permission to stop a false-alarm delivery.
                Clicking the button below will abort the trigger and reset the check-in timer.
              </p>
              <p className="text-sm text-text-secondary leading-relaxed">
                Only do this if you have confirmed that the vault owner is safe.
              </p>
            </div>
            <Button className="w-full" onClick={handleAbort}>
              Yes, abort delivery
            </Button>
          </>
        )}

        {state === "loading" && (
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-text-primary">Aborting...</h2>
            <p className="text-sm text-text-secondary">Please wait.</p>
          </div>
        )}

        {state === "success" && (
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-text-primary">Delivery aborted</h2>
            <p className="text-sm text-text-secondary leading-relaxed">
              The vault delivery has been stopped. The owner&apos;s check-in timer has been reset.
              No vault contents were shared.
            </p>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-text-primary">Link unavailable</h2>
            <p className="text-sm text-text-secondary leading-relaxed">{errorMsg}</p>
            <p className="text-sm text-text-muted">
              This can happen if the abort window has passed, the trigger was already aborted,
              or the link was already used.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AbortPage() {
  return (
    <Suspense>
      <AbortContent />
    </Suspense>
  );
}
