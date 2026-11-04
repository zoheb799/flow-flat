import { ZodError } from "zod";
import { AuthorizationError, authorizationResponse } from "@/lib/auth/authorize";
import { editMeal } from "@/lib/services/edit-meal";

type RouteContext = { params: Promise<{ householdId: string; mealId: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const { householdId, mealId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mealId)) {
    return Response.json({ error: "Meal not found." }, { status: 404 });
  }
  try {
    const body = await request.json().catch(() => null);
    const result = await editMeal(mealId, { ...body, householdId });
    return Response.json(result);
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) return Response.json({ error: "Invalid meal update.", issues: error.issues }, { status: 400 });
    if (error instanceof Error && error.message.startsWith("Too many")) return Response.json({ error: error.message }, { status: 429 });
    if (error instanceof Error && /meal|household|balance|wallet/i.test(error.message)) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("Failed to edit meal.", error);
    return Response.json({ error: "Unable to update meal." }, { status: 500 });
  }
}
