import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
      authorization: {
        params: {
          // Minimal scope for public repos.
          // Login page offers a separate "private repos" flow that requests full `repo` scope.
          scope: "read:user user:email public_repo admin:repo_hook repo:status",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "github") return false;

      await prisma.user.upsert({
        where: { githubId: String(account.providerAccountId) },
        update: {
          githubToken: account.access_token ?? "",
          name: user.name ?? undefined,
          email: user.email ?? undefined,
          avatar: user.image ?? undefined,
        },
        create: {
          githubId: String(account.providerAccountId),
          githubToken: account.access_token ?? "",
          name: user.name ?? undefined,
          email: user.email ?? undefined,
          avatar: user.image ?? undefined,
          login: (user as { login?: string }).login ?? undefined,
        },
      });

      return true;
    },
    async session({ session, token }) {
      if (token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { githubId: token.sub },
          select: { id: true, login: true, avatar: true },
        });
        if (dbUser) {
          session.user.id = dbUser.id;
          session.user.image = dbUser.avatar ?? session.user.image;
        }
      }
      return session;
    },
    async jwt({ token, account }) {
      if (account?.providerAccountId) {
        token.sub = account.providerAccountId;
      }
      return token;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
