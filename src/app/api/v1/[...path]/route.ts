import { handleApiRequest } from "@/lib/server/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, { params }: Context) {
  const { path } = await params;
  return handleApiRequest(request, path);
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
