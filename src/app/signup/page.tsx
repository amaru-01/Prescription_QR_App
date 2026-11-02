import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { getSessionUser, safeNextPath } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Sign up", description: "Create a VeriDose account." };

type PageProps = { searchParams: Promise<{ next?: string | string[] }> };

export default async function SignupPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  const destination = safeNextPath(typeof next === "string" ? next : null);

  // Guests may still open sign-up to create a full account.
  const user = await getSessionUser().catch(() => null);
  if (user && !user.isAnonymous) redirect(destination);

  return <AuthForm mode="signup" next={destination} />;
}
