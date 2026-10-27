import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign up", description: "Create a VeriDose account." };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
