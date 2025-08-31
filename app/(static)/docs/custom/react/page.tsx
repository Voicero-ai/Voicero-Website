"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FaKey,
  FaReact,
  FaCode,
  FaCheck,
  FaArrowLeft,
  FaCog,
  FaRocket,
  FaCopy,
} from "react-icons/fa";

export default function ReactGuide() {
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
            <FaReact className="w-8 h-8 text-brand-accent" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            React Integration Guide
          </h1>
        </div>
        <p className="text-lg text-gray-300">
          Follow these steps to add Voicero.AI to your React application
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
                used to connect your React application to our AI services.
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

        {/* Step 2: Create Component */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                2. Create a VoiceroWidget Component
              </h2>
              <p className="text-gray-300">
                Create a new component that will load the Voicero.AI script. You
                can use React Helmet or directly manipulate the DOM.
              </p>

              <h3 className="text-lg font-medium text-white mt-4">
                Option 1: Using React Helmet
              </h3>
              <p className="text-sm text-gray-300 mb-2">
                First, install react-helmet:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`npm install react-helmet
# or
yarn add react-helmet`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `npm install react-helmet
# or
yarn add react-helmet`,
                      "installHelmet"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "installHelmet" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>

              <p className="text-sm text-gray-300 mt-4 mb-2">
                Then create your component:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`import React from 'react';
import { Helmet } from 'react-helmet';

const VoiceroWidget = () => {
  return (
    <Helmet>
      <script
        src="https://voicero-text-frontend.vercel.app/widget.js"
        data-token="${demoAccessKey}"
      />
    </Helmet>
  );
};

export default VoiceroWidget;`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `import React from 'react';
import { Helmet } from 'react-helmet';

const VoiceroWidget = () => {
  return (
    <Helmet>
      <script
        src="https://voicero-text-frontend.vercel.app/widget.js"
        data-token="${demoAccessKey}"
      />
    </Helmet>
  );
};

export default VoiceroWidget;`,
                      "helmetComponent"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "helmetComponent" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>

              <h3 className="text-lg font-medium text-white mt-6">
                Option 2: Using useEffect
              </h3>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`import React, { useEffect } from 'react';

const VoiceroWidget = () => {
  useEffect(() => {
    // Create script element
    const script = document.createElement('script');
    script.src = 'https://voicero-text-frontend.vercel.app/widget.js';
    script.setAttribute('data-token', '${demoAccessKey}');
    script.async = true;
    
    // Append to body
    document.body.appendChild(script);
    
    // Clean up on unmount
    return () => {
      document.body.removeChild(script);
    };
  }, []); // Empty dependency array means this runs once on mount
  
  return null; // This component doesn't render anything
};

export default VoiceroWidget;`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `import React, { useEffect } from 'react';

const VoiceroWidget = () => {
  useEffect(() => {
    // Create script element
    const script = document.createElement('script');
    script.src = 'https://voicero-text-frontend.vercel.app/widget.js';
    script.setAttribute('data-token', '${demoAccessKey}');
    script.async = true;
    
    // Append to body
    document.body.appendChild(script);
    
    // Clean up on unmount
    return () => {
      document.body.removeChild(script);
    };
  }, []); // Empty dependency array means this runs once on mount
  
  return null; // This component doesn't render anything
};

export default VoiceroWidget;`,
                      "useEffectComponent"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "useEffectComponent" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Add to App */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCog className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                3. Add the Component to Your App
              </h2>
              <p className="text-gray-300">
                Import and use the VoiceroWidget component in your main App
                component or layout.
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`import React from 'react';
import VoiceroWidget from './VoiceroWidget';

function App() {
  return (
    <div className="App">
      <VoiceroWidget />
      {/* Your app content */}
      <header className="App-header">
        <h1>Welcome to My React App</h1>
      </header>
      <main>
        <p>This is my app content.</p>
      </main>
    </div>
  );
}

export default App;`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `import React from 'react';
import VoiceroWidget from './VoiceroWidget';

function App() {
  return (
    <div className="App">
      <VoiceroWidget />
      {/* Your app content */}
      <header className="App-header">
        <h1>Welcome to My React App</h1>
      </header>
      <main>
        <p>This is my app content.</p>
      </main>
    </div>
  );
}

export default App;`,
                      "appComponent"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "appComponent" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 5: Verification */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaRocket className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                5. You're All Set!
              </h2>
              <p className="text-gray-300">
                Run your React application to see the AI chat widget in action.
                The chat widget will appear as a small button in the
                bottom-right corner of your application.
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
