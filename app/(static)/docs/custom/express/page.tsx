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
import { SiExpress } from "react-icons/si";

export default function ExpressGuide() {
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
            <SiExpress className="w-8 h-8 text-brand-accent" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            Express.js Integration Guide
          </h1>
        </div>
        <p className="text-lg text-gray-300">
          Follow these steps to add Voicero.AI to your Express.js application
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
                used to connect your Express.js application to our AI services.
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

        {/* Step 2: Create Express App */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                2. Create Express.js Application
              </h2>
              <p className="text-gray-300">
                First, install Express and other required packages:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`npm init -y
npm install express dotenv ejs`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `npm init -y
npm install express dotenv ejs`,
                      "install"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "install" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>

              <p className="text-gray-300 mt-4">
                Now create your Express application:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// app.js
const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Access key from environment variable
const VOICERO_ACCESS_KEY = process.env.VOICERO_ACCESS_KEY || '${demoAccessKey}';

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.render('index', {
    title: 'My Express App',
    voiceroAccessKey: VOICERO_ACCESS_KEY
  });
});

// Start server
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// app.js
const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Access key from environment variable
const VOICERO_ACCESS_KEY = process.env.VOICERO_ACCESS_KEY || '${demoAccessKey}';

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.render('index', {
    title: 'My Express App',
    voiceroAccessKey: VOICERO_ACCESS_KEY
  });
});

// Start server
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`,
                      "app"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "app" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Create EJS Template */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                3. Create EJS Template
              </h2>
              <p className="text-gray-300">
                Create an EJS template that includes the Voicero.AI script:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<!-- views/index.ejs -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= title %></title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header>
    <h1>Welcome to <%= title %></h1>
  </header>
  
  <main>
    <p>This is my Express.js application.</p>
  </main>
  
  <footer>
    <p>&copy; 2025 My Application</p>
  </footer>

  <!-- Voicero.AI Script with EJS variable -->
  <script 
    src="https://voicero-text-frontend.vercel.app/widget.js" 
    data-token="<%= voiceroAccessKey %>"
  ></script>
</body>
</html>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<!-- views/index.ejs -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= title %></title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <header>
    <h1>Welcome to <%= title %></h1>
  </header>
  
  <main>
    <p>This is my Express.js application.</p>
  </main>
  
  <footer>
    <p>&copy; 2025 My Application</p>
  </footer>

  <!-- Voicero.AI Script with EJS variable -->
  <script 
    src="https://voicero-text-frontend.vercel.app/widget.js" 
    data-token="<%= voiceroAccessKey %>"
  ></script>
</body>
</html>`,
                      "template"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "template" ? (
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
PORT=3000
VOICERO_ACCESS_KEY=${demoAccessKey}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `# .env
PORT=3000
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
                  {`my-express-app/
├── .env                 # Environment variables
├── app.js               # Express application
├── package.json         # Project dependencies
├── views/               # EJS templates
│   └── index.ejs        # Main template
└── public/              # Static files
    └── css/             # CSS files
        └── style.css    # CSS styles`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `my-express-app/
├── .env                 # Environment variables
├── app.js               # Express application
├── package.json         # Project dependencies
├── views/               # EJS templates
│   └── index.ejs        # Main template
└── public/              # Static files
    └── css/             # CSS files
        └── style.css    # CSS styles`,
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

        {/* Step 7: Run the App */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaRocket className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                7. Run Your Express App
              </h2>
              <p className="text-gray-300">
                Start your Express.js application:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`node app.js`}
                </pre>
                <button
                  onClick={() => handleCopy(`node app.js`, "run")}
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
                Your Express application will start on port 3000 (or the port
                specified in your environment variables). Visit{" "}
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
