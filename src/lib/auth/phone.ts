import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export function isStaticOtpEnabled() {
  return process.env.STATIC_OTP_ENABLED === "true"
    && /^\d{6}$/.test(process.env.DEMO_OTP ?? "");
}

export function hashOtp(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hashesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function verifyOtp(phone: string, otp: string, consume = false) {
  const db = getDb();
  const verify = async (tx: typeof db) => {
    const [record] = await tx.select({
      otpHash: schema.phoneOtps.otpHash,
      expiresAt: schema.phoneOtps.expiresAt,
    })
      .from(schema.phoneOtps)
      .where(eq(schema.phoneOtps.phone, phone))
      .for("update");
    if (!record) return false;

    if (record.expiresAt <= new Date()) {
      await tx.delete(schema.phoneOtps).where(eq(schema.phoneOtps.phone, phone));
      return false;
    }

    if (!hashesMatch(record.otpHash, hashOtp(otp))) return false;
    if (consume) await tx.delete(schema.phoneOtps).where(eq(schema.phoneOtps.phone, phone));
    return true;
  };

  return consume ? db.transaction(verify) : verify(db);
}
