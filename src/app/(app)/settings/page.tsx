import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/session";
import { ProfileForm } from "./profile-form";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Profile & settings" />
      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="py-5">
            <ProfileForm user={user} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Session</CardTitle>
              <CardDescription>Sign out of {user.email} on this device.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <SignOutButton />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
