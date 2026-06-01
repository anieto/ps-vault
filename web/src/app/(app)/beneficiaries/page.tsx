"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BeneficiariesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/contacts"); }, [router]);
  return null;
}
