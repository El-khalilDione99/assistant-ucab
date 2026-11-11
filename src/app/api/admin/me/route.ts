import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  return admin instanceof Response ? admin : Response.json(admin);
}
