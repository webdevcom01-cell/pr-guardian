import type { NextAuthConfig } from "next-auth"
import GitHub from "next-auth/providers/github"

export const authConfig = {
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isPublic =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/api/health") ||
        nextUrl.pathname.startsWith("/api/webhooks") ||
        nextUrl.pathname.startsWith("/embed")
      if (isPublic) return true
      if (isLoggedIn) return true
      return false
    },
  },
} satisfies NextAuthConfig
