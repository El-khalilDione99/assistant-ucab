import { requireAdmin } from "@/lib/auth";
import { dashboard, type Period } from "@/lib/stats";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) return admin;
  const p = new URL(request.url).searchParams.get("periode");
  const period: Period = p === "30" || p === "365" ? p : "7";
  return Response.json(dashboard(period));
}
