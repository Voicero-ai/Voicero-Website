import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import prisma from "../../../../lib/prisma";
import { JWT } from "next-auth/jwt";

export const dynamic = "force-dynamic";

interface Token extends JWT {
  id: string;
  email: string;
  username: string;
  emailVerified?: boolean;
}

interface UserWithVerification {
  id: string;
  email: string;
  username: string;
  emailVerified?: boolean;
}

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        login: { label: "Email or Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials): Promise<UserWithVerification | null> {
        if (!credentials?.login || !credentials?.password) {
          throw new Error("Please enter your email/username and password");
        }

        const isEmail = credentials.login.includes("@");
        const user = await prisma.user.findFirst({
          where: isEmail
            ? { email: credentials.login }
            : { username: credentials.login },
          select: {
            id: true,
            password: true,
            email: true,
            username: true,
            emailVerified: true,
          },
        });

        if (!user) throw new Error("No user found with that email/username");

        const isPasswordValid = await compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) throw new Error("Invalid password");

        // Email verification is now handled by the frontend flow
        // We're not blocking login here anymore

        return {
          id: user.id,
          email: user.email,
          username: user.username,
          emailVerified: user.emailVerified,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.username = user.username;
        token.emailVerified = (user as UserWithVerification).emailVerified;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        // Use type assertion for the extended user properties
        const user = {
          id: (token as Token).id,
          email: (token as Token).email,
          username: (token as Token).username,
        };

        // Add emailVerified to session.user with type assertion
        session.user = user;
        (session.user as any).emailVerified = (token as Token).emailVerified;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
