"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FaKey,
  FaVuejs,
  FaCode,
  FaCheck,
  FaArrowLeft,
  FaCog,
  FaRocket,
  FaCopy,
} from "react-icons/fa";

export default function VuejsGuide() {
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
            <FaVuejs className="w-8 h-8 text-brand-accent" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            Vue.js Integration Guide
          </h1>
        </div>
        <p className="text-lg text-gray-300">
          Follow these steps to add Voicero.AI to your Vue.js application
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
                used to connect your Vue.js application to our AI services.
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
                2. Create a Voicero Component
              </h2>
              <p className="text-gray-300">
                Create a new Vue component that will load the Voicero.AI script.
              </p>

              <h3 className="text-lg font-medium text-white mt-4">
                For Vue 3 (Composition API)
              </h3>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<!-- VoiceroWidget.vue -->
<template>
  <!-- This component doesn't render anything visible -->
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';

const props = defineProps({
  accessKey: {
    type: String,
    required: true
  },
  position: {
    type: String,
    default: 'bottom-right'
  },
  theme: {
    type: String,
    default: 'light'
  },
  welcomeMessage: {
    type: String,
    default: 'How can I help you today?'
  }
});

let scriptElement = null;

onMounted(() => {
  // Create script element
  scriptElement = document.createElement('script');
  scriptElement.src = 'https://voicero-text-frontend.vercel.app/widget.js';
  scriptElement.setAttribute('data-token', props.accessKey);
  scriptElement.setAttribute('data-position', props.position);
  scriptElement.setAttribute('data-theme', props.theme);
  scriptElement.setAttribute('data-welcome-message', props.welcomeMessage);
  
  // Add to document
  document.body.appendChild(scriptElement);
});

onUnmounted(() => {
  // Clean up on component unmount
  if (scriptElement && document.body.contains(scriptElement)) {
    document.body.removeChild(scriptElement);
  }
});
</script>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<!-- VoiceroWidget.vue -->
<template>
  <!-- This component doesn't render anything visible -->
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';

const props = defineProps({
  accessKey: {
    type: String,
    required: true
  },
  position: {
    type: String,
    default: 'bottom-right'
  },
  theme: {
    type: String,
    default: 'light'
  },
  welcomeMessage: {
    type: String,
    default: 'How can I help you today?'
  }
});

let scriptElement = null;

onMounted(() => {
  // Create script element
  scriptElement = document.createElement('script');
  scriptElement.src = 'https://voicero-text-frontend.vercel.app/widget.js';
  scriptElement.setAttribute('data-token', props.accessKey);
  scriptElement.setAttribute('data-position', props.position);
  scriptElement.setAttribute('data-theme', props.theme);
  scriptElement.setAttribute('data-welcome-message', props.welcomeMessage);
  
  // Add to document
  document.body.appendChild(scriptElement);
});

onUnmounted(() => {
  // Clean up on component unmount
  if (scriptElement && document.body.contains(scriptElement)) {
    document.body.removeChild(scriptElement);
  }
});
</script>`,
                      "vue3Component"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "vue3Component" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>

              <h3 className="text-lg font-medium text-white mt-6">
                For Vue 2 (Options API)
              </h3>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<!-- VoiceroWidget.vue -->
<template>
  <!-- This component doesn't render anything visible -->
</template>

<script>
export default {
  name: 'VoiceroWidget',
  
  props: {
    accessKey: {
      type: String,
      required: true
    },
    position: {
      type: String,
      default: 'bottom-right'
    },
    theme: {
      type: String,
      default: 'light'
    },
    welcomeMessage: {
      type: String,
      default: 'How can I help you today?'
    }
  },
  
  data() {
    return {
      scriptElement: null
    };
  },
  
  mounted() {
    // Create script element
    this.scriptElement = document.createElement('script');
    this.scriptElement.src = 'https://voicero-text-frontend.vercel.app/widget.js';
    this.scriptElement.setAttribute('data-token', this.accessKey);
    this.scriptElement.setAttribute('data-position', this.position);
    this.scriptElement.setAttribute('data-theme', this.theme);
    this.scriptElement.setAttribute('data-welcome-message', this.welcomeMessage);
    
    // Add to document
    document.body.appendChild(this.scriptElement);
  },
  
  beforeDestroy() {
    // Clean up on component unmount
    if (this.scriptElement && document.body.contains(this.scriptElement)) {
      document.body.removeChild(this.scriptElement);
    }
  }
};
</script>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<!-- VoiceroWidget.vue -->
<template>
  <!-- This component doesn't render anything visible -->
</template>

<script>
export default {
  name: 'VoiceroWidget',
  
  props: {
    accessKey: {
      type: String,
      required: true
    },
    position: {
      type: String,
      default: 'bottom-right'
    },
    theme: {
      type: String,
      default: 'light'
    },
    welcomeMessage: {
      type: String,
      default: 'How can I help you today?'
    }
  },
  
  data() {
    return {
      scriptElement: null
    };
  },
  
  mounted() {
    // Create script element
    this.scriptElement = document.createElement('script');
    this.scriptElement.src = 'https://voicero-text-frontend.vercel.app/widget.js';
    this.scriptElement.setAttribute('data-token', this.accessKey);
    this.scriptElement.setAttribute('data-position', this.position);
    this.scriptElement.setAttribute('data-theme', this.theme);
    this.scriptElement.setAttribute('data-welcome-message', this.welcomeMessage);
    
    // Add to document
    document.body.appendChild(this.scriptElement);
  },
  
  beforeDestroy() {
    // Clean up on component unmount
    if (this.scriptElement && document.body.contains(this.scriptElement)) {
      document.body.removeChild(this.scriptElement);
    }
  }
};
</script>`,
                      "vue2Component"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "vue2Component" ? (
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
                component:
              </p>

              <h3 className="text-lg font-medium text-white mt-4">For Vue 3</h3>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<!-- App.vue -->
<template>
  <div>
    <header>
      <h1>My Vue App</h1>
    </header>
    
    <main>
      <!-- Your app content -->
    </main>
    
    <!-- Add Voicero widget -->
    <VoiceroWidget :accessKey="'${demoAccessKey}'" />
  </div>
</template>

<script setup>
import VoiceroWidget from './components/VoiceroWidget.vue';
</script>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<!-- App.vue -->
<template>
  <div>
    <header>
      <h1>My Vue App</h1>
    </header>
    
    <main>
      <!-- Your app content -->
    </main>
    
    <!-- Add Voicero widget -->
    <VoiceroWidget :accessKey="'${demoAccessKey}'" />
  </div>
</template>

<script setup>
import VoiceroWidget from './components/VoiceroWidget.vue';
</script>`,
                      "vue3App"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "vue3App" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>

              <h3 className="text-lg font-medium text-white mt-6">For Vue 2</h3>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<!-- App.vue -->
<template>
  <div>
    <header>
      <h1>My Vue App</h1>
    </header>
    
    <main>
      <!-- Your app content -->
    </main>
    
    <!-- Add Voicero widget -->
    <voicero-widget :access-key="'${demoAccessKey}'" />
  </div>
</template>

<script>
import VoiceroWidget from './components/VoiceroWidget.vue';

export default {
  name: 'App',
  components: {
    VoiceroWidget
  }
};
</script>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<!-- App.vue -->
<template>
  <div>
    <header>
      <h1>My Vue App</h1>
    </header>
    
    <main>
      <!-- Your app content -->
    </main>
    
    <!-- Add Voicero widget -->
    <voicero-widget :access-key="'${demoAccessKey}'" />
  </div>
</template>

<script>
import VoiceroWidget from './components/VoiceroWidget.vue';

export default {
  name: 'App',
  components: {
    VoiceroWidget
  }
};
</script>`,
                      "vue2App"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "vue2App" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Environment Variables */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCog className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                4. Using Environment Variables (Recommended)
              </h2>
              <p className="text-gray-300">
                For better security, store your access key in an environment
                variable:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// .env
VUE_APP_VOICERO_ACCESS_KEY="${demoAccessKey}"`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// .env
VUE_APP_VOICERO_ACCESS_KEY="${demoAccessKey}"`,
                      "envFile"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "envFile" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>

              <p className="text-sm text-gray-300 mt-4 mb-2">
                Then update your component usage:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<!-- Vue 3 -->
<VoiceroWidget :accessKey="import.meta.env.VUE_APP_VOICERO_ACCESS_KEY" />

<!-- Vue 2 -->
<voicero-widget :access-key="process.env.VUE_APP_VOICERO_ACCESS_KEY" />`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<!-- Vue 3 -->
<VoiceroWidget :accessKey="import.meta.env.VUE_APP_VOICERO_ACCESS_KEY" />

<!-- Vue 2 -->
<voicero-widget :access-key="process.env.VUE_APP_VOICERO_ACCESS_KEY" />`,
                      "envUsage"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "envUsage" ? (
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
                Run your Vue application to see the AI chat widget in action.
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
