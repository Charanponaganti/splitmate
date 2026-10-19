import type { Metadata } from "next";
import { isGoogleAuthConfigured } from "@/lib/auth";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Split trips, rent and dinners without the awkward maths.</p>
      <AuthForm mode="signup" googleEnabled={isGoogleAuthConfigured()} next={next ?? null} />
    </>
  );
}
