import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { requireMember } from "@/lib/server/access";
import { getCurrentUser } from "@/lib/session";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) return new Response("Not found", { status: 404 });

  const db = await getDb();
  const [file] = await db.select().from(attachments).where(eq(attachments.id, id.data)).limit(1);
  if (!file) return new Response("Not found", { status: 404 });
  try {
    await requireMember(db, file.groupId, user.id);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.sizeBytes),
      "Content-Disposition": `inline; filename="${file.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
