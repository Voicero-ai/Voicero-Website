import { getServerSession } from "next-auth/next";
import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import prisma from "../lib/prisma";
import { JWT } from "next-auth/jwt";

interface Token extends JWT {
  id: string;
  email: string;
  username: string;
}

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        login: { label: "Email or Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials): Promise<any> {
        if (!credentials?.login || !credentials?.password) {
          throw new Error("Please enter your email/username and password");
        }

        const isEmail = credentials.login.includes("@");
        const user = await prisma.user.findFirst({
          where: isEmail
            ? { email: credentials.login }
            : { username: credentials.login },
          select: { id: true, password: true, email: true, username: true },
        });

        if (!user) throw new Error("No user found with that email/username");
        const isPasswordValid = await compare(
          credentials.password,
          user.password
        );
        if (!isPasswordValid) throw new Error("Invalid password");

        return {
          id: user.id,
          email: user.email,
          username: user.username,
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
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user = {
          id: (token as Token).id,
          email: (token as Token).email,
          username: (token as Token).username,
        };
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export const auth = () => getServerSession(authOptions);
