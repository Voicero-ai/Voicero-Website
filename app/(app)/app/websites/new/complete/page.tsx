"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function CompleteWebsitePage() {
  const router = useRouter();
  const searchParams = useSearchParams()!;
  const sessionId = searchParams.get("session_id");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const completeSetup = async () => {
      try {
        const response = await fetch(
          `/api/stripe/session?session_id=${sessionId}`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to complete setup");
        }

        // Redirect to websites page after completion
        router.push("/app/websites");
      } catch (error: any) {
        console.error("Error completing setup:", error);
        setError(error.message);
      }
    };

    if (sessionId) {
      completeSetup();
    }
  }, [sessionId, router]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-6">
          <h1 className="text-2xl font-bold text-red-600">Setup Failed</h1>
          <p className="text-brand-text-secondary max-w-md mx-auto">{error}</p>
          <button
            onClick={() => router.push("/app/websites")}
            className="px-4 py-2 bg-brand-accent text-white rounded-lg"
          >
            Return to Websites
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-6">
        <div className="w-16 h-16 mx-auto mb-6">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-brand-accent"></div>
        </div>
        <h1 className="text-2xl font-bold text-brand-text-primary">
          Setting Up Your Website
        </h1>
        <p className="text-brand-text-secondary max-w-md mx-auto">
          We&apos;re configuring your website with Voicero.AI. This will only
          take a moment...
        </p>
      </div>
    </div>
  );
}
