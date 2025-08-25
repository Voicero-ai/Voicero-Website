"use client";

import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";

export default function WebsitePreview() {
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // Validate URL format
      let url = websiteUrl.trim();

      // Create preview URL with script injection
      const previewUrl = `/api/autoWebsite?url=${encodeURIComponent(url)}`;

      console.log("doing: generating website preview");
      setPreviewUrl(previewUrl);

      // Open in new tab automatically
      window.open(previewUrl, "_blank");

      console.log("done: preview generated and opened in new tab");
    } catch (err) {
      setError(
        "Failed to generate preview. Please check the URL and try again."
      );
      console.error("Preview generation error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="backdrop-blur-xl bg-white/10 border border-purple-500/30 rounded-2xl p-4 sm:p-5 md:p-6 hover:scale-105 transition-all duration-500 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 bg-gradient-to-r from-purple-600/30 to-violet-600/30 rounded-lg">
          <Search className="w-5 h-5 text-purple-300" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
          See Voicero on Your Website
        </h2>
      </div>

      <p className="text-sm sm:text-base text-gray-300 mb-1">
        Enter your website URL and click Preview to see Voicero AI on your
        website.
      </p>
      <p className="text-xs text-gray-400 mb-4">
        The preview will appear below and automatically open in a new tab for
        your convenience.
      </p>

      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="Enter your website URL (e.g. mywebsite.com)"
            className="flex-1 px-3 py-2 bg-white/10 border border-purple-500/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-white placeholder:text-gray-400"
            required
          />
          <button
            type="submit"
            disabled={isLoading || !websiteUrl}
            className={`px-4 py-2 bg-gradient-to-r from-purple-600 to-violet-600 rounded-lg font-medium text-white transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/25 ${
              isLoading || !websiteUrl
                ? "opacity-70 cursor-not-allowed"
                : "hover:scale-105"
            } flex items-center gap-1.5`}
          >
            {isLoading ? "Loading..." : "Preview Now & Open"}
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {previewUrl && !error && (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <h3 className="font-medium text-sm text-purple-300">
                Preview Ready
              </h3>
            </div>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors bg-purple-800/30 px-2 py-1 rounded-md border border-purple-500/20 hover:bg-purple-800/50"
            >
              Open in new tab <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="border border-purple-500/20 rounded-lg overflow-hidden h-[450px] shadow-xl shadow-purple-500/10 transition-all duration-300 relative">
            <iframe
              src={previewUrl}
              title="Website Preview with Voicero"
              className="w-full h-full bg-white"
              loading="eager"
              sandbox="allow-scripts allow-same-origin allow-forms"
              style={{
                transform: "scale(0.85)",
                transformOrigin: "top left",
                width: "118%",
                height: "118%",
              }}
            />
          </div>
          <div className="bg-gray-900/80 rounded-md p-2 border border-gray-800">
            <div className="flex items-center gap-2 justify-center">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <div className="flex-1 bg-gray-800 h-5 rounded flex items-center justify-center px-2">
                <p className="text-xs text-gray-400 truncate">{websiteUrl}</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center mt-2">
            👆 This is your website with Voicero AI chatbot embedded and
            functional. Try interacting with the chatbot!
          </p>
          <p className="text-xs text-gray-500 text-center">
            Note: Website navigation is disabled in preview mode.
          </p>
        </div>
      )}
    </div>
  );
}
