import { AppShell } from "@/components/app-shell";
import { LiveUpdates } from "@/components/live-updates";
import { getUnreadNotificationCount } from "@/lib/server/queries";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await getUnreadNotificationCount(user.id);
  return (
    <AppShell user={{ id: user.id, name: user.name, email: user.email, image: user.image }} unread={unread}>
      <LiveUpdates />
      {children}
    </AppShell>
  );
}
