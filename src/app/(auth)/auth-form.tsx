"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { signIn, signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(60),
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
});

type FormValues = { name?: string; email: string; password: string };

/** Only allow same-origin relative redirects after login. */
function safeNext(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  return "/dashboard";
}

export function AuthForm({ mode, googleEnabled, next }: { mode: "login" | "signup"; googleEnabled: boolean; next: string | null }) {
  const router = useRouter();
  const [googleLoading, setGoogleLoading] = useState(false);
  const destination = safeNext(next);
  const form = useForm<FormValues>({
    resolver: zodResolver(mode === "login" ? loginSchema : signupSchema) as never,
    defaultValues: { name: "", email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result =
      mode === "login"
        ? await signIn.email({ email: values.email, password: values.password })
        : await signUp.email({ name: values.name!, email: values.email, password: values.password });
    if (result.error) {
      const message =
        result.error.status === 429
          ? "Too many attempts. Please wait a minute and try again."
          : mode === "login"
            ? "Incorrect email or password."
            : result.error.message || "Couldn't create your account.";
      toast.error(message);
      return;
    }
    router.replace(destination);
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-5">
      {googleEnabled && (
        <>
          <Button
            type="button"
            variant="outline"
            size="lg"
            loading={googleLoading}
            onClick={async () => {
              setGoogleLoading(true);
              const result = await signIn.social({ provider: "google", callbackURL: destination });
              if (result?.error) {
                setGoogleLoading(false);
                toast.error("Google sign-in is unavailable right now.");
              }
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-4">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
            </svg>
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {mode === "signup" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...form.register("name")} />
            <FieldError>{errors.name?.message}</FieldError>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" inputMode="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
          <FieldError>{errors.email?.message}</FieldError>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            aria-invalid={!!errors.password}
            {...form.register("password")}
          />
          <FieldError>{errors.password?.message}</FieldError>
        </div>
        <Button type="submit" size="lg" loading={isSubmitting} className="mt-1">
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? "New here? " : "Already have an account? "}
        <Link
          href={`${mode === "login" ? "/signup" : "/login"}${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {mode === "login" ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}
