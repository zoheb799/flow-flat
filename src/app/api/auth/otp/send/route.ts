import { z } from "zod";
import { hashDemoOtp, isDemoOtpAvailable } from "@/lib/auth/phone";
import { normalizePhoneParts } from "@/lib/validation/phone";
import { consumeRateLimit, getClientAddress } from "@/lib/security/rate-limit";
import { getDb, schema } from "@/lib/db";

const requestSchema = z.object({
  countryCode: z.string().min(2).max(4),
  mobileNumber: z.string().regex(/^\d{10}$/),
});

export async function POST(request: Request) {
  // if (!isDemoOtpAvailable()) {
  //   return Response.json({ error: "Demo OTP is available only in development. Production phone login requires SMS OTP delivery." }, { status: 503 });
  // }

  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Enter a country code and a 10-digit mobile number." }, { status: 400 });
  const phone = normalizePhoneParts(input.data.countryCode, input.data.mobileNumber);
  if (!phone) return Response.json({ error: "Enter a valid country code and exactly 10 mobile digits." }, { status: 400 });

  const ipAllowed = await consumeRateLimit("otp-send-ip", getClientAddress(request.headers), 20, 60 * 60 * 1000);
  const phoneAllowed = await consumeRateLimit("otp-send-phone", phone, 5, 60 * 60 * 1000);
  if (!ipAllowed || !phoneAllowed) {
    return Response.json({ error: "Too many OTP requests. Try again later." }, { status: 429 });
  }

  const now = new Date();
  await getDb().insert(schema.phoneOtps).values({
    phone,
    otpHash: hashDemoOtp(process.env.DEMO_OTP ?? ""),
    expiresAt: new Date(now.getTime() + 60_000),
    createdAt: now,
  }).onConflictDoUpdate({
    target: schema.phoneOtps.phone,
    set: {
      otpHash: hashDemoOtp(process.env.DEMO_OTP ?? ""),
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    },
  });

  return Response.json({ sent: true });
}
