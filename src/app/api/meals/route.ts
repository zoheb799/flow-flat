import { ZodError } from "zod";
import { AuthorizationError, authorizationResponse } from "@/lib/auth/authorize";
import { createMeal } from "@/lib/services/meals";

export async function POST(request: Request) {
  try {
    const meal = await createMeal(await request.json());
    return Response.json(meal, { status: 201 });
  } catch (error) {
    const authError = authorizationResponse(error);
    if (authError) return authError;
    if (error instanceof ZodError) {
      return Response.json({ error: "Invalid meal details.", issues: error.issues }, { status: 400 });
    }
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message.startsWith("Too many")) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof Error && /household|wallet balance|participant/i.test(error.message)) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("Failed to create meal.", error);
    return Response.json({ error: "Unable to create meal." }, { status: 500 });
  }
}
