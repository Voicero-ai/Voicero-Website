"use client";

import React, { Suspense } from "react";
import Sidebar from "../../components/Sidebar";
import { UserProvider } from "../../contexts/UserContext";
import { SessionProvider } from "next-auth/react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <UserProvider>
        <div className="min-h-screen bg-gray-900 text-white">
          <main className="p-8">
            <Suspense
              fallback={
                <div className="flex items-center justify-center min-h-screen">
                  <div className="animate-pulse text-white/70">Loading...</div>
                </div>
              }
            >
              {children}
            </Suspense>
          </main>
        </div>
      </UserProvider>
    </SessionProvider>
  );
}
