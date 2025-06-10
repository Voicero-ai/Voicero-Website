"use client";

import React, { Suspense } from "react";
import Sidebar from "../../components/Sidebar";
import { UserProvider } from "../../contexts/UserContext";
import { SessionProvider } from "next-auth/react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <UserProvider>
        <div className="min-h-screen bg-gray-100">
          <Sidebar />
          <div className="md:pl-64">
            <main className="p-8">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center min-h-screen bg-white">
                    <div className="animate-pulse text-white/70">
                      Loading...
                    </div>
                  </div>
                }
              >
                {children}
              </Suspense>
            </main>
          </div>
        </div>
      </UserProvider>
    </SessionProvider>
  );
}
