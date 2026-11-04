import "next-auth";

declare module "next-auth" {
  interface User {
    authVersion: number;
    phone: string;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      phone?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    authVersion?: number;
  }
}
