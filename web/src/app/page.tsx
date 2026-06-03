import { redirect } from "next/navigation";

// Root redirect: send authenticated users to dashboard, others to login
export default function RootPage() {
  redirect("/dashboard");
}
