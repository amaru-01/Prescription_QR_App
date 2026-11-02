import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { getSessionUser, safeNextPath } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Log in", description: "Log in to VeriDose." };

type PageProps = { searchParams: Promise<{ next?: string | string[] }> };

export default async function LoginPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  const destination = safeNextPath(typeof next === "string" ? next : null);

  const user = await getSessionUser().catch(() => null);
  if (user && !user.isAnonymous) redirect(destination);

  return <AuthForm mode="login" next={destination} />;
}
