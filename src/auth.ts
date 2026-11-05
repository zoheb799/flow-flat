import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { consumeRateLimit, getClientAddress } from "@/lib/security/rate-limit";
import { getDb, schema } from "@/lib/db";
import { isStaticOtpEnabled, verifyOtp } from "@/lib/auth/phone";
import { normalizePhone } from "@/lib/validation/phone";

const credentialsSchema = z.object({
  phone: z.string().min(8).max(20),
  otp: z.string().regex(/^\d{6}$/),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        phone: { label: "Phone number", type: "tel" },
        otp: { label: "One-time password", type: "text" },
      },
      async authorize(rawCredentials, request) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const phone = normalizePhone(parsed.data.phone);
        if (!phone || !isStaticOtpEnabled()) return null;
        const allowed = await consumeRateLimit(
          "login",
          `${getClientAddress(request.headers)}:${phone}`,
          10,
          15 * 60 * 1000,
        );
        if (!allowed) return null;
        const [user] = await getDb()
          .select({
            id: schema.users.id,
            name: schema.users.name,
            phone: schema.users.phone,
            authVersion: schema.users.authVersion,
          })
          .from(schema.users)
          .where(eq(schema.users.phone, phone))
          .limit(1);

        if (!user || !user.phone) return null;
        if (!await verifyOtp(phone, parsed.data.otp, true)) return null;

        return { id: user.id, name: user.name, phone: user.phone, authVersion: user.authVersion };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.authVersion = user.authVersion;
      } else if (token.sub) {
        const [currentUser] = await getDb()
          .select({ authVersion: schema.users.authVersion })
          .from(schema.users)
          .where(eq(schema.users.id, token.sub))
          .limit(1);
        if (!currentUser || currentUser.authVersion !== token.authVersion) token.sub = undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
