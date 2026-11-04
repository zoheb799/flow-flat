import { ZodError } from "zod";
import { authorizationResponse } from "@/lib/auth/authorize";
import { addWalletContributionBatch } from "@/lib/services/contribution-batch";

export async function POST(request: Request) {
  try {
    const transactions = await addWalletContributionBatch(await request.json());
    return Response.json({ transactions }, { status: 201 });
  } catch (error) {
    const authError = authorizationResponse(error);
    if (authError) return authError;
    if (error instanceof ZodError) {
      return Response.json({ error: "Invalid wallet contribution details.", issues: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith("Too many")) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof Error && /wallet|maximum supported|batch/i.test(error.message)) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("Failed to add wallet contribution batch.", error);
    return Response.json({ error: "Unable to add wallet contributions." }, { status: 500 });
  }
}
