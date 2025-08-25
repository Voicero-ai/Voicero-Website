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
      console.log("done: preview generated");
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
    <div className="backdrop-blur-xl bg-white/10 border border-purple-500/30 rounded-3xl p-6 sm:p-8 md:p-10 hover:scale-105 transition-all duration-500">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-gradient-to-r from-purple-600/30 to-violet-600/30 rounded-lg">
          <Search className="w-6 h-6 text-purple-300" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
          See Voicero on Your Website
        </h2>
      </div>

      <p className="text-base sm:text-lg text-gray-300 mb-2">
        Enter your website URL below to see how Voicero AI would look and
        function on your site.
      </p>
      <p className="text-sm text-gray-400 mb-6">
        Note: Some websites with complex security policies may not display
        correctly in the preview. Open in a new tab to see the full website.
      </p>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="Enter your website URL (e.g. mywebsite.com)"
            className="flex-1 px-4 py-3 bg-white/10 border border-purple-500/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-white placeholder:text-gray-400"
            required
          />
          <button
            type="submit"
            disabled={isLoading || !websiteUrl}
            className={`px-6 py-3 bg-gradient-to-r from-purple-600 to-violet-600 rounded-xl font-medium text-white transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/25 ${
              isLoading || !websiteUrl
                ? "opacity-70 cursor-not-allowed"
                : "hover:scale-105"
            }`}
          >
            {isLoading ? "Loading..." : "Preview Now"}
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 mb-6 text-red-300">
          {error}
        </div>
      )}

      {previewUrl && !error && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <h3 className="font-medium text-purple-300">Preview Ready</h3>
            </div>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors bg-purple-800/30 px-3 py-1 rounded-lg border border-purple-500/20 hover:bg-purple-800/50"
            >
              Open in new tab <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          <div className="border border-purple-500/20 rounded-xl overflow-hidden h-[600px] shadow-2xl shadow-purple-500/10 transition-all duration-300">
            <iframe
              src={previewUrl}
              title="Website Preview with Voicero"
              className="w-full h-full bg-white"
              loading="eager"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          </div>
          <div className="bg-gray-900/80 rounded-lg p-3 mt-2 border border-gray-800">
            <div className="flex items-center gap-2 justify-center">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <div className="flex-1 bg-gray-800 h-6 rounded-md flex items-center justify-center px-3">
                <p className="text-xs text-gray-400 truncate">{websiteUrl}</p>
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-400 text-center mt-4">
            👆 This is your actual website with Voicero AI chatbot already
            embedded and fully functional. Try interacting with the chatbot just
            like a real visitor would!
          </p>
          <p className="text-xs text-gray-500 text-center mt-2">
            Note: Website navigation links are disabled in this preview. Use the
            chatbot to experience Voicero's functionality.
          </p>
        </div>
      )}
    </div>
  );
}
