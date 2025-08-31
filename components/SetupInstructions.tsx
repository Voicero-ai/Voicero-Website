"use client";

import React from "react";
import { FaCode, FaCopy, FaCheck } from "react-icons/fa";
import { motion } from "framer-motion";

interface SetupInstructionsProps {
  accessKey: string;
  technology?: string;
}

const SetupInstructions: React.FC<SetupInstructionsProps> = ({
  accessKey,
  technology = "Regular HTML",
}) => {
  const [copied, setCopied] = React.useState<string | null>(null);
  const [selectedTech, setSelectedTech] = React.useState<string>(technology);

  // List of all available technologies
  const availableTechnologies = [
    "Regular HTML",
    "React",
    "Next.js",
    "Vue.js",
    "Angular",
    "Node.js",
    "Express",
    "ASP.NET Core",
    "ASP.NET",
    "Flask",
    "jQuery",
  ];

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const getInstallInstructions = () => {
    switch (selectedTech) {
      case "Node.js":
        return {
          install: "No package installation required",
          usage: `// In your main file (e.g., index.js)
const express = require('express');
const app = express();

app.use(express.static('public'));

// Add this to your HTML file in the public folder
// <script src="https://voicero-text-frontend.vercel.app/widget.js" data-token="${accessKey}"></script>`,
        };
      case "React":
        return {
          install: "No package installation required",
          usage: `// In your component
import React from 'react';
import { Helmet } from 'react-helmet';

const VoiceroWidget = () => {
  return (
    <Helmet>
      <script
        src="https://voicero-text-frontend.vercel.app/widget.js"
        data-token="${accessKey}"
      />
    </Helmet>
  );
};

export default VoiceroWidget;

// Then in your App.js or layout component:
import VoiceroWidget from './VoiceroWidget';

function App() {
  return (
    <div>
      <VoiceroWidget />
      {/* Your app content */}
    </div>
  );
}`,
        };
      case "Next.js":
        return {
          install: "No package installation required",
          usage: `// In your _app.js or layout.js
import Script from 'next/script';

export default function Layout({ children }) {
  return (
    <>
      <Script
        src="https://voicero-text-frontend.vercel.app/widget.js"
        strategy="afterInteractive"
        data-token="${accessKey}"
      />
      {children}
    </>
  );
}`,
        };
      case "Express":
        return {
          install: "npm install express",
          usage: `// In your Express app
const express = require('express');
const app = express();

app.use(express.static('public'));

// Create a public/index.html file with:
/*
<!DOCTYPE html>
<html>
<head>
  <title>My Website</title>
  <script src="https://voicero-text-frontend.vercel.app/widget.js" data-token="${accessKey}"></script>
</head>
<body>
  <!-- Your content here -->
</body>
</html>
*/`,
        };
      case "Angular":
        return {
          install: "No package installation required",
          usage: `// In your index.html
<!DOCTYPE html>
<html>
<head>
  <title>Angular App</title>
  <script src="https://voicero-text-frontend.vercel.app/widget.js" data-token="${accessKey}"></script>
</head>
<body>
  <app-root></app-root>
</body>
</html>

// Alternatively, in a component template:
// app.component.ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  template: \`
    <div>
      <!-- Your content -->
    </div>
  \`,
})
export class AppComponent {
  ngOnInit() {
    const script = document.createElement('script');
    script.src = 'https://voicero-text-frontend.vercel.app/widget.js';
    script.setAttribute('data-token', '${accessKey}');
    document.body.appendChild(script);
  }
}`,
        };
      case "Vue.js":
        return {
          install: "No package installation required",
          usage: `// In your public/index.html
<!DOCTYPE html>
<html>
<head>
  <title>Vue App</title>
  <script src="https://voicero-text-frontend.vercel.app/widget.js" data-token="${accessKey}"></script>
</head>
<body>
  <div id="app"></div>
</body>
</html>

// Alternatively, in a component:
// VoiceroWidget.vue
<template>
  <div><!-- Your content --></div>
</template>

<script>
export default {
  name: 'VoiceroWidget',
  mounted() {
    const script = document.createElement('script');
    script.src = 'https://voicero-text-frontend.vercel.app/widget.js';
    script.setAttribute('data-token', '${accessKey}');
    document.body.appendChild(script);
  }
}
</script>`,
        };
      case "ASP.NET Core":
        return {
          install: "No package installation required",
          usage: `<!-- In your _Layout.cshtml -->
<!DOCTYPE html>
<html>
<head>
    <title>@ViewData["Title"]</title>
    @RenderSection("Scripts", required: false)
</head>
<body>
    @RenderBody()
    <script src="https://voicero-text-frontend.vercel.app/widget.js" data-token="${accessKey}"></script>
</body>
</html>`,
        };
      case "ASP.NET":
        return {
          install: "No package installation required",
          usage: `<!-- In your Master Page or Layout -->
<%@ Master Language="C#" AutoEventWireup="true" CodeBehind="Site.master.cs" Inherits="YourNamespace.SiteMaster" %>

<!DOCTYPE html>
<html>
<head runat="server">
    <title><%: Page.Title %></title>
    <asp:ContentPlaceHolder ID="HeadContent" runat="server"></asp:ContentPlaceHolder>
</head>
<body>
    <form runat="server">
        <asp:ContentPlaceHolder ID="MainContent" runat="server"></asp:ContentPlaceHolder>
    </form>
    <script src="https://voicero-text-frontend.vercel.app/widget.js" data-token="${accessKey}"></script>
</body>
</html>`,
        };
      case "Flask":
        return {
          install: "pip install flask",
          usage: `# In your Flask app
from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def home():
    return render_template('index.html', access_key='${accessKey}')

# Then in templates/index.html
<!DOCTYPE html>
<html>
<head>
    <title>Flask App</title>
</head>
<body>
    <!-- Your content here -->
    <script src="https://voicero-text-frontend.vercel.app/widget.js" data-token="{{ access_key }}"></script>
</body>
</html>`,
        };
      case "jQuery":
        return {
          install: "Include jQuery in your HTML",
          usage: `<!DOCTYPE html>
<html>
<head>
    <title>jQuery Website</title>
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
</head>
<body>
    <!-- Your content here -->
    
    <script>
        $(document).ready(function() {
            // Add Voicero script
            $('body').append(
                $('<script>')
                    .attr('src', 'https://voicero-text-frontend.vercel.app/widget.js')
                    .attr('data-token', '${accessKey}')
            );
        });
    </script>
</body>
</html>`,
        };
      case "Regular HTML":
      default:
        return {
          install: "No installation required",
          usage: `<!DOCTYPE html>
<html>
<head>
    <title>My Website</title>
</head>
<body>
    <!-- Your content here -->
    
    <script src="https://voicero-text-frontend.vercel.app/widget.js" data-token="${accessKey}"></script>
</body>
</html>`,
        };
    }
  };

  const instructions = getInstallInstructions();

  // Use the selected technology instead of the prop
  React.useEffect(() => {
    setSelectedTech(technology);
  }, [technology]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-4">
        <h2 className="text-xl font-semibold text-brand-text-primary">
          Setup Instructions
        </h2>

        <div className="flex items-center">
          <label
            htmlFor="technology-select"
            className="mr-2 text-sm text-brand-text-secondary"
          >
            Select technology:
          </label>
          <select
            id="technology-select"
            value={selectedTech}
            onChange={(e) => setSelectedTech(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent text-black"
          >
            {availableTechnologies.map((tech) => (
              <option key={tech} value={tech}>
                {tech}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-sm text-brand-text-secondary mb-4">
        Add the following script to your website to enable Voicero.AI. This will
        add the chat widget to your site.
      </div>

      {instructions.install !== "No installation required" &&
        instructions.install !== "No package installation required" && (
          <div className="mb-6">
            <h3 className="text-md font-medium text-brand-text-primary mb-2">
              Installation
            </h3>
            <div className="bg-gray-900 rounded-lg p-4 relative">
              <code className="text-white text-sm font-mono whitespace-pre">
                {instructions.install}
              </code>
              <button
                onClick={() => handleCopy(instructions.install, "install")}
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
          </div>
        )}

      <div>
        <h3 className="text-md font-medium text-brand-text-primary mb-2">
          Usage
        </h3>
        <div className="bg-gray-900 rounded-lg p-4 relative">
          <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto">
            {instructions.usage}
          </pre>
          <button
            onClick={() => handleCopy(instructions.usage, "usage")}
            className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
            aria-label="Copy code"
          >
            {copied === "usage" ? (
              <FaCheck className="text-green-400" />
            ) : (
              <FaCopy />
            )}
          </button>
        </div>
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
        <h3 className="text-md font-medium text-blue-800 mb-2">
          <FaCode className="inline-block mr-2" />
          Important Notes
        </h3>
        <ul className="list-disc pl-5 text-sm text-blue-700 space-y-1">
          <li>
            Make sure to include the script in the global layout of your
            application.
          </li>
          <li>
            The <code className="bg-blue-100 px-1 rounded">data-token</code>{" "}
            attribute must contain your unique access key.
          </li>
          <li>
            The widget will automatically initialize once the script is loaded.
          </li>
          <li>
            For customization options, visit the{" "}
            <a href="/docs" className="text-brand-accent hover:underline">
              documentation
            </a>
            .
          </li>
        </ul>
      </div>
    </div>
  );
};

export default SetupInstructions;
