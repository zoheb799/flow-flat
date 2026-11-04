import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { consumeRateLimit, getClientAddress } from "@/lib/security/rate-limit";
import { isDemoOtpAvailable, verifyDemoOtp } from "@/lib/auth/phone";
import { normalizePhone } from "@/lib/validation/phone";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().min(8).max(20),
  otp: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  if (!isDemoOtpAvailable()) {
    return Response.json({ error: "Demo OTP login is only available in development. Configure an SMS provider for production." }, { status: 503 });
  }
  const allowed = await consumeRateLimit("register", getClientAddress(request.headers), 5, 60 * 60 * 1000);
  if (!allowed) return Response.json({ error: "Too many registration attempts. Try again later." }, { status: 429 });
  const input = registerSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return Response.json({ error: "Enter your name, a valid phone number, and the six-digit OTP." }, { status: 400 });
  }

  const phone = normalizePhone(input.data.phone);
  if (!phone || !await verifyDemoOtp(phone, input.data.otp)) {
    return Response.json({ error: "The phone number or OTP is invalid." }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db.select({ id: schema.users.id })
    .from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
  if (existing) {
    return Response.json({ id: existing.id, existing: true }, { status: 200 });
  }

  let user: { id: string };
  try {
    [user] = await db.insert(schema.users).values({
      name: input.data.name,
      phone,
    }).returning({ id: schema.users.id });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return Response.json({ message: "An account with that phone number already exists. Log in instead." }, { status: 409 });
    }
    console.error("Failed to register account.", error);
    return Response.json({ error: "Unable to create your account." }, { status: 500 });
  }

  return Response.json({ id: user.id }, { status: 201 });
}
