import type { Metadata } from "next";
import { isGoogleAuthConfigured } from "@/lib/auth";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Sign in to see who owes what.</p>
      <AuthForm mode="login" googleEnabled={isGoogleAuthConfigured()} next={next ?? null} />
    </>
  );
}
