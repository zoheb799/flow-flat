import { ZodError } from "zod";
import { authorizationResponse } from "@/lib/auth/authorize";
import { addWalletContribution } from "@/lib/services/contributions";

export async function POST(request: Request) {
  try {
    const transaction = await addWalletContribution(await request.json());
    return Response.json(transaction, { status: 201 });
  } catch (error) {
    const authError = authorizationResponse(error);
    if (authError) return authError;
    if (error instanceof ZodError) {
      return Response.json({ error: "Invalid contribution details.", issues: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith("Too many")) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof Error && /wallet|maximum supported/i.test(error.message)) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("Failed to add wallet contribution.", error);
    return Response.json({ error: "Unable to add wallet contribution." }, { status: 500 });
  }
}
