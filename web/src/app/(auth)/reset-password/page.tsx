"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { PasswordInput, PasswordStrengthMeter } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { api, APIError } from "@/lib/api";
import { AlertTriangle } from "lucide-react";
import { OpenInAppBanner } from "@/components/OpenInAppBanner";

const schema = z.object({
  password: z.string().min(12, "Password must be at least 12 characters"),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: "Passwords do not match",
  path: ["confirm"],
});

type Form = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  return <Suspense><ResetPasswordForm /></Suspense>;
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, control, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });
  const passwordValue = useWatch({ control, name: "password", defaultValue: "" });

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <p className="text-sm text-text-secondary">
          This reset link is invalid or has expired.
        </p>
        <Link href="/forgot-password" className="text-sm text-primary hover:underline block">
          Request a new one
        </Link>
      </div>
    );
  }

  const onSubmit = async (data: Form) => {
    setIsLoading(true);
    try {
      await api.resetPassword(token, data.password);
      toast({ title: "Password reset — please sign in.", variant: "success" });
      router.push("/login");
    } catch (err) {
      const msg = err instanceof APIError ? err.message : "Something went wrong. Please try again.";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <OpenInAppBanner
        deepLink={`psvault://reset-password?token=${encodeURIComponent(token)}`}
        message="Reset your password in the P.S. Vault app"
      />
      <h1 className="text-xl font-semibold text-text-primary mb-1">Set a new password</h1>
      <p className="text-sm text-text-secondary mb-4">
        Choose a strong password — at least 12 characters.
      </p>

      <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-3 mb-5">
        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 leading-relaxed">
          Resetting your password means your vault encryption keys will be re-derived. You&apos;ll need to re-enter any access keys you&apos;ve shared with beneficiaries after signing back in.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div>
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <PasswordStrengthMeter value={passwordValue} />
        </div>
        <PasswordInput
          label="Confirm new password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register("confirm")}
        />
        <Button type="submit" loading={isLoading} className="w-full mt-1">
          Reset password
        </Button>
      </form>
    </>
  );
}
