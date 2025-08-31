"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FaKey,
  FaCode,
  FaCheck,
  FaArrowLeft,
  FaCog,
  FaRocket,
  FaCopy,
} from "react-icons/fa";
import { SiJquery } from "react-icons/si";

export default function JqueryGuide() {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const demoAccessKey = "12345";

  return (
    <div className="max-w-4xl mx-auto space-y-8 pt-20 bg-black min-h-screen pb-12">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <Link
          href="/docs/custom"
          className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
        >
          <FaArrowLeft className="w-4 h-4" />
          <span>Back to Custom Integration</span>
        </Link>
      </div>

      {/* Title Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gray-800 rounded-xl">
            <SiJquery className="w-8 h-8 text-brand-accent" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            jQuery Integration Guide
          </h1>
        </div>
        <p className="text-lg text-gray-300">
          Follow these steps to add Voicero.AI to your website using jQuery
        </p>
      </div>

      {/* Installation Steps */}
      <div className="space-y-6">
        {/* Step 1: Get Access Key */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaKey className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                1. Get Your Access Key
              </h2>
              <p className="text-gray-300">
                Generate an access key from your dashboard. This key will be
                used to connect your website to our AI services.
              </p>
              <div className="flex items-center gap-4">
                <Link
                  href="/app/access-keys"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-accent text-white rounded-lg hover:bg-brand-accent/90 transition-colors"
                >
                  Generate Access Key
                  <FaKey className="w-4 h-4" />
                </Link>
                <p className="text-sm text-gray-300">
                  Remember to save your key securely!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Basic Integration */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                2. Basic Integration
              </h2>
              <p className="text-gray-300">
                The simplest way to add Voicero.AI to your website is by adding
                the script tag to your HTML:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Website</title>
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
</head>
<body>
  <!-- Your website content -->
  
  <!-- Add Voicero.AI script before closing body tag -->
  <script 
    src="https://voicero-text-frontend.vercel.app/widget.js" 
    data-token="${demoAccessKey}"
  ></script>
</body>
</html>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Website</title>
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
</head>
<body>
  <!-- Your website content -->
  
  <!-- Add Voicero.AI script before closing body tag -->
  <script 
    src="https://voicero-text-frontend.vercel.app/widget.js" 
    data-token="${demoAccessKey}"
  ></script>
</body>
</html>`,
                      "basic"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "basic" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Dynamic Loading */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                3. Dynamic Loading with jQuery
              </h2>
              <p className="text-gray-300">
                You can also dynamically load the Voicero.AI widget using
                jQuery:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<script>
$(document).ready(function() {
  // Configuration
  const voiceroConfig = {
    accessKey: "${demoAccessKey}",
    position: "bottom-right", // or "bottom-left", "top-right", "top-left"
    theme: "light", // or "dark"
    welcomeMessage: "How can I help you today?"
  };
  
  // Create script element
  const script = document.createElement('script');
  script.src = "https://voicero-text-frontend.vercel.app/widget.js";
  script.setAttribute('data-token', voiceroConfig.accessKey);
  script.setAttribute('data-position', voiceroConfig.position);
  script.setAttribute('data-theme', voiceroConfig.theme);
  script.setAttribute('data-welcome-message', voiceroConfig.welcomeMessage);
  
  // Append to body
  $('body').append(script);
});
</script>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<script>
$(document).ready(function() {
  // Configuration
  const voiceroConfig = {
    accessKey: "${demoAccessKey}",
    position: "bottom-right", // or "bottom-left", "top-right", "top-left"
    theme: "light", // or "dark"
    welcomeMessage: "How can I help you today?"
  };
  
  // Create script element
  const script = document.createElement('script');
  script.src = "https://voicero-text-frontend.vercel.app/widget.js";
  script.setAttribute('data-token', voiceroConfig.accessKey);
  script.setAttribute('data-position', voiceroConfig.position);
  script.setAttribute('data-theme', voiceroConfig.theme);
  script.setAttribute('data-welcome-message', voiceroConfig.welcomeMessage);
  
  // Append to body
  $('body').append(script);
});
</script>`,
                      "dynamic"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "dynamic" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Complete Example */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaRocket className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                4. Complete Example
              </h2>
              <p className="text-gray-300">
                You can load your configuration from an external JSON file:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// voicero-config.json
{
  "accessKey": "${demoAccessKey}",
  "position": "bottom-right",
  "theme": "light",
  "welcomeMessage": "How can I help you today?"
}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// voicero-config.json
{
  "accessKey": "${demoAccessKey}",
  "position": "bottom-right",
  "theme": "light",
  "welcomeMessage": "How can I help you today?"
}`,
                      "configJson"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "configJson" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>

              <p className="text-gray-300 mt-4">Then load it with jQuery:</p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<script>
$(document).ready(function() {
  // Load configuration from JSON file
  $.getJSON('voicero-config.json', function(voiceroConfig) {
    // Create script element
    const script = document.createElement('script');
    script.src = "https://voicero-text-frontend.vercel.app/widget.js";
    script.setAttribute('data-token', voiceroConfig.accessKey);
    
    // Add optional attributes if they exist
    if (voiceroConfig.position) {
      script.setAttribute('data-position', voiceroConfig.position);
    }
    
    if (voiceroConfig.theme) {
      script.setAttribute('data-theme', voiceroConfig.theme);
    }
    
    if (voiceroConfig.welcomeMessage) {
      script.setAttribute('data-welcome-message', voiceroConfig.welcomeMessage);
    }
    
    // Append to body
    $('body').append(script);
  }).fail(function() {
    console.error('Failed to load Voicero.AI configuration');
  });
});
</script>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<script>
$(document).ready(function() {
  // Load configuration from JSON file
  $.getJSON('voicero-config.json', function(voiceroConfig) {
    // Create script element
    const script = document.createElement('script');
    script.src = "https://voicero-text-frontend.vercel.app/widget.js";
    script.setAttribute('data-token', voiceroConfig.accessKey);
    
    // Add optional attributes if they exist
    if (voiceroConfig.position) {
      script.setAttribute('data-position', voiceroConfig.position);
    }
    
    if (voiceroConfig.theme) {
      script.setAttribute('data-theme', voiceroConfig.theme);
    }
    
    if (voiceroConfig.welcomeMessage) {
      script.setAttribute('data-welcome-message', voiceroConfig.welcomeMessage);
    }
    
    // Append to body
    $('body').append(script);
  }).fail(function() {
    console.error('Failed to load Voicero.AI configuration');
  });
});
</script>`,
                      "loadConfig"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "loadConfig" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 6: Complete Example */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaRocket className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                6. Complete Example
              </h2>
              <p className="text-gray-300">
                Here's a complete example of a webpage with jQuery and
                Voicero.AI:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto">
                  {`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Website with Voicero.AI</title>
  
  <!-- jQuery -->
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
  
  <!-- Bootstrap (optional) -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }
    
    header {
      background-color: #f8f9fa;
      padding: 20px;
      margin-bottom: 20px;
      border-radius: 5px;
    }
    
    footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      text-align: center;
    }
  </style>
</head>
<body>
  <header>
    <h1>Welcome to My Website</h1>
    <p>This website uses Voicero.AI for intelligent chat assistance.</p>
  </header>
  
  <main>
    <div class="container">
      <div class="row">
        <div class="col-md-8">
          <h2>Main Content</h2>
          <p>This is the main content of my website. Users can interact with the AI chat assistant by clicking the chat button in the bottom-right corner.</p>
          
          <h3>Features</h3>
          <ul>
            <li>Intelligent AI chat assistance</li>
            <li>Answers questions about your website</li>
            <li>Helps users find information</li>
            <li>Available 24/7</li>
          </ul>
        </div>
        
        <div class="col-md-4">
          <div class="card">
            <div class="card-body">
              <h5 class="card-title">Need Help?</h5>
              <p class="card-text">Click the chat button in the corner to get instant assistance from our AI.</p>
              <button id="openChat" class="btn btn-primary">Chat Now</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
  
  <footer>
    <p>&copy; 2025 My Website. All rights reserved.</p>
  </footer>

  <!-- Voicero.AI Configuration -->
  <script>
    $(document).ready(function() {
      // Configuration
      const voiceroConfig = {
        accessKey: "${demoAccessKey}",
        position: "bottom-right",
        theme: "light",
        welcomeMessage: "How can I help you today?"
      };
      
      // Load Voicero.AI widget
      const script = document.createElement('script');
      script.src = "https://voicero-text-frontend.vercel.app/widget.js";
      script.setAttribute('data-token', voiceroConfig.accessKey);
      script.setAttribute('data-position', voiceroConfig.position);
      script.setAttribute('data-theme', voiceroConfig.theme);
      script.setAttribute('data-welcome-message', voiceroConfig.welcomeMessage);
      
      // Append to body
      $('body').append(script);
      
      // Optional: Handle "Chat Now" button click
      $('#openChat').on('click', function() {
        // If the widget exposes an API to open the chat
        if (window.VoiceroAI && typeof window.VoiceroAI.openChat === 'function') {
          window.VoiceroAI.openChat();
        }
      });
    });
  </script>
  
  <!-- Bootstrap JS (optional) -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Website with Voicero.AI</title>
  
  <!-- jQuery -->
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
  
  <!-- Bootstrap (optional) -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }
    
    header {
      background-color: #f8f9fa;
      padding: 20px;
      margin-bottom: 20px;
      border-radius: 5px;
    }
    
    footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      text-align: center;
    }
  </style>
</head>
<body>
  <header>
    <h1>Welcome to My Website</h1>
    <p>This website uses Voicero.AI for intelligent chat assistance.</p>
  </header>
  
  <main>
    <div class="container">
      <div class="row">
        <div class="col-md-8">
          <h2>Main Content</h2>
          <p>This is the main content of my website. Users can interact with the AI chat assistant by clicking the chat button in the bottom-right corner.</p>
          
          <h3>Features</h3>
          <ul>
            <li>Intelligent AI chat assistance</li>
            <li>Answers questions about your website</li>
            <li>Helps users find information</li>
            <li>Available 24/7</li>
          </ul>
        </div>
        
        <div class="col-md-4">
          <div class="card">
            <div class="card-body">
              <h5 class="card-title">Need Help?</h5>
              <p class="card-text">Click the chat button in the corner to get instant assistance from our AI.</p>
              <button id="openChat" class="btn btn-primary">Chat Now</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
  
  <footer>
    <p>&copy; 2025 My Website. All rights reserved.</p>
  </footer>

  <!-- Voicero.AI Configuration -->
  <script>
    $(document).ready(function() {
      // Configuration
      const voiceroConfig = {
        accessKey: "${demoAccessKey}",
        position: "bottom-right",
        theme: "light",
        welcomeMessage: "How can I help you today?"
      };
      
      // Load Voicero.AI widget
      const script = document.createElement('script');
      script.src = "https://voicero-text-frontend.vercel.app/widget.js";
      script.setAttribute('data-token', voiceroConfig.accessKey);
      script.setAttribute('data-position', voiceroConfig.position);
      script.setAttribute('data-theme', voiceroConfig.theme);
      script.setAttribute('data-welcome-message', voiceroConfig.welcomeMessage);
      
      // Append to body
      $('body').append(script);
      
      // Optional: Handle "Chat Now" button click
      $('#openChat').on('click', function() {
        // If the widget exposes an API to open the chat
        if (window.VoiceroAI && typeof window.VoiceroAI.openChat === 'function') {
          window.VoiceroAI.openChat();
        }
      });
    });
  </script>
  
  <!-- Bootstrap JS (optional) -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`,
                      "completeExample"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "completeExample" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-900/20 px-3 py-2 rounded-lg mt-4">
                <FaCheck className="w-4 h-4" />
                <span>
                  Your AI chat assistant is now ready to help your users
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Need Help */}
      <div className="bg-gray-900/50 rounded-xl p-6 text-center">
        <p className="text-gray-300 mb-4">
          Need help with installation? Our support team is here for you.
        </p>
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors text-white"
        >
          Contact Support
        </Link>
      </div>
    </div>
  );
}
