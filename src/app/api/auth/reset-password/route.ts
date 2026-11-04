import { createHash } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { hash } from "bcryptjs";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";

const resetSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  const input = resetSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Use a valid reset link and a password of at least 12 characters." }, { status: 400 });

  const tokenHash = createHash("sha256").update(input.data.token).digest("hex");
  const passwordHash = await hash(input.data.password, 12);
  try {
    const result = await getDb().transaction(async (tx) => {
      const [resetToken] = await tx.select({
        id: schema.passwordResetTokens.id,
        userId: schema.passwordResetTokens.userId,
      })
        .from(schema.passwordResetTokens)
        .where(and(
          eq(schema.passwordResetTokens.tokenHash, tokenHash),
          isNull(schema.passwordResetTokens.consumedAt),
          gt(schema.passwordResetTokens.expiresAt, new Date()),
        ))
        .for("update");
      if (!resetToken) return false;

      await tx.update(schema.users)
        .set({
          passwordHash,
          authVersion: sql`${schema.users.authVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, resetToken.userId));
      await tx.update(schema.passwordResetTokens)
        .set({ consumedAt: new Date() })
        .where(eq(schema.passwordResetTokens.id, resetToken.id));
      await tx.delete(schema.passwordResetTokens)
        .where(and(
          eq(schema.passwordResetTokens.userId, resetToken.userId),
          isNull(schema.passwordResetTokens.consumedAt),
        ));
      return true;
    });
    if (!result) return Response.json({ error: "This reset link is invalid or expired." }, { status: 400 });
    return Response.json({ message: "Password updated. Please log in again." });
  } catch (error) {
    console.error("Failed to reset password.", error);
    return Response.json({ error: "Unable to reset your password." }, { status: 500 });
  }
}
