import { forwardApi } from "@/lib/api-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  return forwardApi(request, (await context.params).path);
}
export { handle as GET, handle as POST, handle as PATCH };
