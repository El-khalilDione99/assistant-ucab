import { requireAdmin } from "@/lib/auth";
import { unansweredQuestions } from "@/lib/stats";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) return admin;
  return Response.json(unansweredQuestions());
}
