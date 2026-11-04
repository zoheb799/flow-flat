import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { consumeRateLimit, getClientAddress } from "@/lib/security/rate-limit";

const requestSchema = z.object({ email: z.string().trim().email().max(254) });

export async function POST(request: Request) {
  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const email = input.data.email.toLowerCase();
  const allowed = await consumeRateLimit("password-reset", `${getClientAddress(request.headers)}:${email}`, 5, 60 * 60 * 1000);
  if (!allowed) return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, APP_URL } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM || !APP_URL) {
    return Response.json({ error: "Password recovery email is not configured. Contact your household administrator." }, { status: 503 });
  }
  const smtpPort = Number(SMTP_PORT);
  let appOrigin: URL;
  try {
    appOrigin = new URL(APP_URL);
  } catch {
    return Response.json({ error: "Password recovery email is not configured correctly." }, { status: 503 });
  }
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535 || !["http:", "https:"].includes(appOrigin.protocol)) {
    return Response.json({ error: "Password recovery email is not configured correctly." }, { status: 503 });
  }

  const [user] = await getDb().select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!user) {
    return Response.json({ message: "If an account exists for that address, a reset link will be sent." }, { status: 202 });
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, user.id));
    await tx.insert(schema.passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
  });

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  const resetUrl = new URL("/reset-password", appOrigin);
  resetUrl.searchParams.set("token", token);
  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: "Reset your FlatFlow password",
      text: `Hi ${user.name},\n\nUse this link within 30 minutes to reset your FlatFlow password:\n${resetUrl.toString()}\n\nIf you did not request this, you can ignore this email.`,
    });
  } catch (error) {
    console.error("Could not send password recovery email.", error);
    await db.update(schema.passwordResetTokens)
      .set({ consumedAt: new Date() })
      .where(eq(schema.passwordResetTokens.tokenHash, tokenHash));
    return Response.json({ error: "Could not send the recovery email. Please try again later." }, { status: 503 });
  }

  return Response.json({ message: "If an account exists for that address, a reset link will be sent." }, { status: 202 });
}
