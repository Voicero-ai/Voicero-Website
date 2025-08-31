"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FaKey,
  FaAngular,
  FaCode,
  FaCheck,
  FaArrowLeft,
  FaCog,
  FaRocket,
  FaCopy,
} from "react-icons/fa";

export default function AngularGuide() {
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
            <FaAngular className="w-8 h-8 text-brand-accent" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            Angular Integration Guide
          </h1>
        </div>
        <p className="text-lg text-gray-300">
          Follow these steps to add Voicero.AI to your Angular application
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
                used to connect your Angular application to our AI services.
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

        {/* Step 2: Create Service */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                2. Create a Voicero Service
              </h2>
              <p className="text-gray-300">
                First, create a service to handle the Voicero.AI script
                injection:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// voicero.service.ts
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class VoiceroService {
  private scriptElement: HTMLScriptElement | null = null;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  /**
   * Initialize the Voicero.AI widget
   * @param accessKey Your Voicero.AI access key
   * @param options Additional configuration options
   */
  initialize(accessKey: string, options: {
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left',
    theme?: 'light' | 'dark',
    welcomeMessage?: string,
    buttonText?: string,
    buttonColor?: string
  } = {}): void {
    // Only run in browser environment
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Remove any existing script
    this.removeScript();

    // Create script element
    this.scriptElement = document.createElement('script');
    this.scriptElement.src = 'https://voicero-text-frontend.vercel.app/widget.js';
    this.scriptElement.setAttribute('data-token', accessKey);
    
    // Add optional attributes
    if (options.position) {
      this.scriptElement.setAttribute('data-position', options.position);
    }
    
    if (options.theme) {
      this.scriptElement.setAttribute('data-theme', options.theme);
    }
    
    if (options.welcomeMessage) {
      this.scriptElement.setAttribute('data-welcome-message', options.welcomeMessage);
    }
    
    if (options.buttonText) {
      this.scriptElement.setAttribute('data-button-text', options.buttonText);
    }
    
    if (options.buttonColor) {
      this.scriptElement.setAttribute('data-button-color', options.buttonColor);
    }
    
    // Add to document
    document.body.appendChild(this.scriptElement);
  }

  /**
   * Remove the Voicero.AI widget script
   */
  removeScript(): void {
    if (isPlatformBrowser(this.platformId) && this.scriptElement && document.body.contains(this.scriptElement)) {
      document.body.removeChild(this.scriptElement);
      this.scriptElement = null;
    }
  }
}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// voicero.service.ts
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class VoiceroService {
  private scriptElement: HTMLScriptElement | null = null;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  /**
   * Initialize the Voicero.AI widget
   * @param accessKey Your Voicero.AI access key
   * @param options Additional configuration options
   */
  initialize(accessKey: string, options: {
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left',
    theme?: 'light' | 'dark',
    welcomeMessage?: string,
    buttonText?: string,
    buttonColor?: string
  } = {}): void {
    // Only run in browser environment
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Remove any existing script
    this.removeScript();

    // Create script element
    this.scriptElement = document.createElement('script');
    this.scriptElement.src = 'https://voicero-text-frontend.vercel.app/widget.js';
    this.scriptElement.setAttribute('data-token', accessKey);
    
    // Add optional attributes
    if (options.position) {
      this.scriptElement.setAttribute('data-position', options.position);
    }
    
    if (options.theme) {
      this.scriptElement.setAttribute('data-theme', options.theme);
    }
    
    if (options.welcomeMessage) {
      this.scriptElement.setAttribute('data-welcome-message', options.welcomeMessage);
    }
    
    if (options.buttonText) {
      this.scriptElement.setAttribute('data-button-text', options.buttonText);
    }
    
    if (options.buttonColor) {
      this.scriptElement.setAttribute('data-button-color', options.buttonColor);
    }
    
    // Add to document
    document.body.appendChild(this.scriptElement);
  }

  /**
   * Remove the Voicero.AI widget script
   */
  removeScript(): void {
    if (isPlatformBrowser(this.platformId) && this.scriptElement && document.body.contains(this.scriptElement)) {
      document.body.removeChild(this.scriptElement);
      this.scriptElement = null;
    }
  }
}`,
                      "service"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "service" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Create Component */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                3. Create a Voicero Component
              </h2>
              <p className="text-gray-300">
                Now, create a component that will use the service:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// voicero.component.ts
import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { VoiceroService } from './voicero.service';

@Component({
  selector: 'app-voicero',
  template: '', // This component doesn't render anything
  standalone: true // For Angular 14+ (optional)
})
export class VoiceroComponent implements OnInit, OnDestroy {
  @Input() accessKey: string = '';
  @Input() position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' = 'bottom-right';
  @Input() theme: 'light' | 'dark' = 'light';
  @Input() welcomeMessage: string = 'How can I help you today?';
  @Input() buttonText: string = '';
  @Input() buttonColor: string = '';

  constructor(private voiceroService: VoiceroService) {}

  ngOnInit(): void {
    this.voiceroService.initialize(this.accessKey, {
      position: this.position,
      theme: this.theme,
      welcomeMessage: this.welcomeMessage,
      buttonText: this.buttonText || undefined,
      buttonColor: this.buttonColor || undefined
    });
  }

  ngOnDestroy(): void {
    this.voiceroService.removeScript();
  }
}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// voicero.component.ts
import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { VoiceroService } from './voicero.service';

@Component({
  selector: 'app-voicero',
  template: '', // This component doesn't render anything
  standalone: true // For Angular 14+ (optional)
})
export class VoiceroComponent implements OnInit, OnDestroy {
  @Input() accessKey: string = '';
  @Input() position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' = 'bottom-right';
  @Input() theme: 'light' | 'dark' = 'light';
  @Input() welcomeMessage: string = 'How can I help you today?';
  @Input() buttonText: string = '';
  @Input() buttonColor: string = '';

  constructor(private voiceroService: VoiceroService) {}

  ngOnInit(): void {
    this.voiceroService.initialize(this.accessKey, {
      position: this.position,
      theme: this.theme,
      welcomeMessage: this.welcomeMessage,
      buttonText: this.buttonText || undefined,
      buttonColor: this.buttonColor || undefined
    });
  }

  ngOnDestroy(): void {
    this.voiceroService.removeScript();
  }
}`,
                      "component"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "component" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Add to App */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCog className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                4. Add the Component to Your App
              </h2>
              <p className="text-gray-300">
                Add the component to your app module or main component:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<!-- app.component.html -->
<div>
  <header>
    <h1>My Angular App</h1>
  </header>
  
  <main>
    <!-- Your app content -->
    <router-outlet></router-outlet>
  </main>
  
  <!-- Add Voicero widget -->
  <app-voicero [accessKey]="'${demoAccessKey}'" [theme]="'light'"></app-voicero>
</div>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<!-- app.component.html -->
<div>
  <header>
    <h1>My Angular App</h1>
  </header>
  
  <main>
    <!-- Your app content -->
    <router-outlet></router-outlet>
  </main>
  
  <!-- Add Voicero widget -->
  <app-voicero [accessKey]="'${demoAccessKey}'" [theme]="'light'"></app-voicero>
</div>`,
                      "appTemplate"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "appTemplate" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>

              <p className="text-sm text-gray-300 mt-4 mb-2">
                For Angular 15+ with standalone components:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// app.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { VoiceroComponent } from './voicero.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, VoiceroComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'my-angular-app';
}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// app.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { VoiceroComponent } from './voicero.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, VoiceroComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'my-angular-app';
}`,
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

              <p className="text-sm text-gray-300 mt-4 mb-2">
                For Angular 14 and below with NgModule:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// app.module.ts
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { VoiceroComponent } from './voicero.component';

@NgModule({
  declarations: [
    AppComponent,
    VoiceroComponent
  ],
  imports: [
    BrowserModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// app.module.ts
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { VoiceroComponent } from './voicero.component';

@NgModule({
  declarations: [
    AppComponent,
    VoiceroComponent
  ],
  imports: [
    BrowserModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }`,
                      "appModule"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "appModule" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 5: Environment Variables */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCog className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                5. Using Environment Variables (Recommended)
              </h2>
              <p className="text-gray-300">
                For better security, store your access key in an environment
                variable:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// environment.ts
export const environment = {
  production: false,
  voiceroAccessKey: '${demoAccessKey}'
};`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// environment.ts
export const environment = {
  production: false,
  voiceroAccessKey: '${demoAccessKey}'
};`,
                      "environment"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "environment" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>

              <p className="text-sm text-gray-300 mt-4 mb-2">
                Then in your app component:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// app.component.ts
import { Component } from '@angular/core';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'my-angular-app';
  voiceroKey = environment.voiceroAccessKey;
}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// app.component.ts
import { Component } from '@angular/core';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'my-angular-app';
  voiceroKey = environment.voiceroAccessKey;
}`,
                      "appComponentEnv"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "appComponentEnv" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>

              <p className="text-sm text-gray-300 mt-4 mb-2">
                And in your template:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<app-voicero [accessKey]="voiceroKey"></app-voicero>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<app-voicero [accessKey]="voiceroKey"></app-voicero>`,
                      "templateEnv"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "templateEnv" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 6: Verification */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaRocket className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                6. You're All Set!
              </h2>
              <p className="text-gray-300">
                Run your Angular application to see the AI chat widget in
                action. The chat widget will appear as a small button in the
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
