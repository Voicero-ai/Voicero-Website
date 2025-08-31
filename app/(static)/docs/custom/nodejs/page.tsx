"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FaKey,
  FaNodeJs,
  FaCode,
  FaCheck,
  FaArrowLeft,
  FaCog,
  FaRocket,
  FaCopy,
} from "react-icons/fa";

export default function NodejsGuide() {
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
            <FaNodeJs className="w-8 h-8 text-brand-accent" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            Node.js Integration Guide
          </h1>
        </div>
        <p className="text-lg text-gray-300">
          Follow these steps to add Voicero.AI to your Node.js application
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
                used to connect your Node.js application to our AI services.
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

        {/* Step 2: Setup Basic Server */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                2. Setup Basic Node.js Server
              </h2>
              <p className="text-gray-300">
                Create a basic Node.js server to serve your HTML pages:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

// Access key from environment variable
const VOICERO_ACCESS_KEY = process.env.VOICERO_ACCESS_KEY || '${demoAccessKey}';

// Create server
const server = http.createServer((req, res) => {
  // Serve index.html for root path
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8', (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      
      // Replace placeholder with actual access key
      content = content.replace('VOICERO_ACCESS_KEY_PLACEHOLDER', VOICERO_ACCESS_KEY);
      
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    });
  } 
  // Serve static files
  else if (req.url.match(/\\.(css|js|jpg|png|gif)$/)) {
    const filePath = path.join(__dirname, 'public', req.url);
    const contentType = getContentType(req.url);
    
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  }
  // Handle 404
  else {
    res.writeHead(404);
    res.end('Page not found');
  }
});

// Helper function to determine content type
function getContentType(url) {
  const extname = path.extname(url);
  switch (extname) {
    case '.js':
      return 'text/javascript';
    case '.css':
      return 'text/css';
    case '.json':
      return 'application/json';
    case '.png':
      return 'image/png';
    case '.jpg':
      return 'image/jpg';
    case '.gif':
      return 'image/gif';
    default:
      return 'text/html';
  }
}

// Set port
const PORT = process.env.PORT || 3000;

// Start server
server.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

// Access key from environment variable
const VOICERO_ACCESS_KEY = process.env.VOICERO_ACCESS_KEY || '${demoAccessKey}';

// Create server
const server = http.createServer((req, res) => {
  // Serve index.html for root path
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8', (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      
      // Replace placeholder with actual access key
      content = content.replace('VOICERO_ACCESS_KEY_PLACEHOLDER', VOICERO_ACCESS_KEY);
      
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    });
  } 
  // Serve static files
  else if (req.url.match(/\\.(css|js|jpg|png|gif)$/)) {
    const filePath = path.join(__dirname, 'public', req.url);
    const contentType = getContentType(req.url);
    
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  }
  // Handle 404
  else {
    res.writeHead(404);
    res.end('Page not found');
  }
});

// Helper function to determine content type
function getContentType(url) {
  const extname = path.extname(url);
  switch (extname) {
    case '.js':
      return 'text/javascript';
    case '.css':
      return 'text/css';
    case '.json':
      return 'application/json';
    case '.png':
      return 'image/png';
    case '.jpg':
      return 'image/jpg';
    case '.gif':
      return 'image/gif';
    default:
      return 'text/html';
  }
}

// Set port
const PORT = process.env.PORT || 3000;

// Start server
server.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));`,
                      "server"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "server" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Create HTML Template */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                3. Create HTML Template
              </h2>
              <p className="text-gray-300">
                Create an HTML template with a placeholder for your access key:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<!-- public/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Node.js App</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <h1>Welcome to My Node.js App</h1>
  </header>
  
  <main>
    <p>This is my application content.</p>
  </main>
  
  <footer>
    <p>&copy; 2025 My Application</p>
  </footer>

  <!-- Voicero.AI Script - Access key will be injected by server -->
  <script 
    src="https://voicero-text-frontend.vercel.app/widget.js" 
    data-token="VOICERO_ACCESS_KEY_PLACEHOLDER"
  ></script>
</body>
</html>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<!-- public/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Node.js App</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <h1>Welcome to My Node.js App</h1>
  </header>
  
  <main>
    <p>This is my application content.</p>
  </main>
  
  <footer>
    <p>&copy; 2025 My Application</p>
  </footer>

  <!-- Voicero.AI Script - Access key will be injected by server -->
  <script 
    src="https://voicero-text-frontend.vercel.app/widget.js" 
    data-token="VOICERO_ACCESS_KEY_PLACEHOLDER"
  ></script>
</body>
</html>`,
                      "html"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "html" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Environment Setup */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCog className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                4. Set Up Environment Variables
              </h2>
              <p className="text-gray-300">
                Create a .env file to store your access key securely:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`# .env
VOICERO_ACCESS_KEY=${demoAccessKey}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `# .env
VOICERO_ACCESS_KEY=${demoAccessKey}`,
                      "env"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "env" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>

              <p className="text-sm text-gray-300 mt-4 mb-2">
                Install dotenv to load environment variables:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`npm install dotenv`}
                </pre>
                <button
                  onClick={() => handleCopy(`npm install dotenv`, "dotenv")}
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "dotenv" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>

              <p className="text-sm text-gray-300 mt-4 mb-2">
                Update your server.js to use dotenv:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// Add to the top of server.js
require('dotenv').config();

// Then use process.env.VOICERO_ACCESS_KEY`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// Add to the top of server.js
require('dotenv').config();

// Then use process.env.VOICERO_ACCESS_KEY`,
                      "dotenvUsage"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "dotenvUsage" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 5: Project Structure */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCog className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                5. Project Structure
              </h2>
              <p className="text-gray-300">
                Your project structure should look like this:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`my-node-app/
├── .env                 # Environment variables
├── server.js            # Node.js server
├── package.json         # Project dependencies
└── public/              # Static files
    ├── index.html       # HTML template
    └── styles.css       # CSS styles`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `my-node-app/
├── .env                 # Environment variables
├── server.js            # Node.js server
├── package.json         # Project dependencies
└── public/              # Static files
    ├── index.html       # HTML template
    └── styles.css       # CSS styles`,
                      "structure"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "structure" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 6: Run the Server */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaRocket className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                6. Run the Server
              </h2>
              <p className="text-gray-300">Start your Node.js server:</p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`node server.js`}
                </pre>
                <button
                  onClick={() => handleCopy(`node server.js`, "run")}
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "run" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
              <p className="text-gray-300 mt-2">
                Your server will start on port 3000 (or the port specified in
                your environment variables). Visit{" "}
                <code className="bg-gray-700 px-1 rounded">
                  http://localhost:3000
                </code>{" "}
                to see your application with the Voicero.AI chat widget.
              </p>
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-900/20 px-3 py-2 rounded-lg">
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
