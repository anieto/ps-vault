"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput, PasswordStrengthMeter } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { api, APIError } from "@/lib/api";
import { deriveMEK, storeMEK } from "@/lib/crypto";
import { useAuthStore } from "@/store/auth";

const registerSchema = z.object({
  display_name: z.string().min(1, "Your name is required").max(100),
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters"),
  invite_code: z.string().optional(),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const passwordValue = useWatch({ control, name: "password", defaultValue: "" });

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    try {
      const result = await api.register({
        email: data.email,
        display_name: data.display_name,
        password: data.password,
        invite_code: data.invite_code,
      });

      // Derive and store MEK
      const saltHex = Buffer.from(data.email + "psvault").toString("hex").padEnd(32, "0").slice(0, 32);
      const mek = await deriveMEK(data.password, saltHex);
      storeMEK(mek);

      setAuth(result.user, result.access_token);
      router.push("/onboarding");
    } catch (err) {
      const msg = err instanceof APIError
        ? err.message
        : err instanceof Error
        ? err.message
        : "Something went wrong. Please try again.";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-xl font-semibold text-text-primary mb-1">
        Create your vault
      </h1>
      <p className="text-sm text-text-secondary mb-6">
        Set up your account to get started
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Input
          label="Your name"
          type="text"
          autoComplete="name"
          placeholder="Jane Smith"
          error={errors.display_name?.message}
          {...register("display_name")}
        />
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <div>
          <PasswordInput
            label="Password"
            autoComplete="new-password"
            hint="At least 12 characters"
            error={errors.password?.message}
            {...register("password")}
          />
          <PasswordStrengthMeter value={passwordValue} />
        </div>
        <Input
          label="Invite code"
          type="text"
          placeholder="Optional"
          error={errors.invite_code?.message}
          {...register("invite_code")}
        />

        <Button type="submit" loading={isLoading} className="w-full mt-2">
          Create account
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-text-muted leading-relaxed">
        By creating an account, you acknowledge this is a personal tool and
        not a substitute for legal estate planning.
      </p>

      <p className="mt-4 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
