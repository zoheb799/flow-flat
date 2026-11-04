import { ZodError } from "zod";
import { authorizationResponse } from "@/lib/auth/authorize";
import { cancelMeal } from "@/lib/services/cancel-meal";

type RouteContext = { params: Promise<{ householdId: string; mealId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { householdId, mealId } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await cancelMeal({ ...body, householdId, mealId });
    return Response.json(result);
  } catch (error) {
    const authError = authorizationResponse(error);
    if (authError) return authError;
    if (error instanceof ZodError) {
      return Response.json({ error: "Invalid cancellation request." }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith("Too many")) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof Error && /meal|wallet|refund/i.test(error.message)) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("Failed to cancel meal.", error);
    return Response.json({ error: "Unable to cancel meal." }, { status: 500 });
  }
}
