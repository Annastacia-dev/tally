import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";
import { demoEnabled, DEMO_EMAIL, googleEnabled } from "@/lib/flags";

const providers = [];

if (googleEnabled()) {
  providers.push(
    Google({
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
          // offline + consent so Google returns a refresh token for background scans.
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
        },
      },
    }),
  );
}

if (demoEnabled()) {
  providers.push(
    Credentials({
      id: "demo",
      name: "Demo",
      credentials: {},
      async authorize() {
        const user = await prisma.user.upsert({
          where: { email: DEMO_EMAIL },
          create: { email: DEMO_EMAIL, name: "Demo Anna", isDemo: true },
          update: {},
        });
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // JWT sessions so the demo (credentials) provider works alongside Google.
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});

export async function requireUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}
