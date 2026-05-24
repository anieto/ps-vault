"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, APIError } from "@/lib/api";
import { CheckCircle2 } from "lucide-react";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type Form = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: Form) => {
    setIsLoading(true);
    try {
      await api.forgotPassword(data.email);
      setSent(true);
    } catch (err) {
      // Always show success to prevent email enumeration
      setSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-success-50 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-6 w-6 text-success-700" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Check your email</h1>
          <p className="text-sm text-text-secondary mt-2">
            If an account exists with that address, we&apos;ve sent a reset link. It expires in 1 hour.
          </p>
        </div>
        <Link href="/login" className="text-sm text-primary hover:underline block">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-xl font-semibold text-text-primary mb-1">Forgot your password?</h1>
      <p className="text-sm text-text-secondary mb-6">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <Button type="submit" loading={isLoading} className="w-full">
          Send reset link
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-text-secondary">
        Remember it?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
