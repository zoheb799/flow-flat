import { z } from "zod";
import { hashDemoOtp, isDemoOtpAvailable } from "@/lib/auth/phone";
import { normalizePhone } from "@/lib/validation/phone";
import { consumeRateLimit, getClientAddress } from "@/lib/security/rate-limit";
import { getDb, schema } from "@/lib/db";

const requestSchema = z.object({ phone: z.string().min(8).max(20) });

export async function POST(request: Request) {
  // if (!isDemoOtpAvailable()) {
  //   return Response.json({ error: "Demo OTP login is only available in development. Configure an SMS provider for production." }, { status: 503 });
  // }

  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Enter a valid phone number." }, { status: 400 });
  const phone = normalizePhone(input.data.phone);
  if (!phone) return Response.json({ error: "Enter a valid phone number, including country code if needed." }, { status: 400 });

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
