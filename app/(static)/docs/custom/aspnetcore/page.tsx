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
import { SiDotnet } from "react-icons/si";

export default function AspNetCoreGuide() {
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
            <SiDotnet className="w-8 h-8 text-brand-accent" />
          </div>
          <h1 className="text-3xl font-bold text-white">
            ASP.NET Core Integration Guide
          </h1>
        </div>
        <p className="text-lg text-gray-300">
          Follow these steps to add Voicero.AI to your ASP.NET Core application
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
                used to connect your ASP.NET Core application to our AI
                services.
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

        {/* Step 2: Configure App Settings */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCog className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                2. Configure Application Settings
              </h2>
              <p className="text-gray-300">
                Add your Voicero.AI access key to your application settings:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// appsettings.json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "VoiceroAI": {
    "AccessKey": "${demoAccessKey}",
    "Position": "bottom-right",
    "Theme": "light",
    "WelcomeMessage": "How can I help you today?"
  }
}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// appsettings.json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "VoiceroAI": {
    "AccessKey": "${demoAccessKey}",
    "Position": "bottom-right",
    "Theme": "light",
    "WelcomeMessage": "How can I help you today?"
  }
}`,
                      "appsettings"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "appsettings" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Create Configuration Class */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                3. Create Configuration Class
              </h2>
              <p className="text-gray-300">
                Create a class to hold your Voicero.AI configuration:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// VoiceroAIOptions.cs
namespace YourApp.Models
{
    public class VoiceroAIOptions
    {
        public const string VoiceroAI = "VoiceroAI";
        
        public string AccessKey { get; set; } = string.Empty;
        public string Position { get; set; } = "bottom-right";
        public string Theme { get; set; } = "light";
        public string WelcomeMessage { get; set; } = "How can I help you today?";
    }
}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// VoiceroAIOptions.cs
namespace YourApp.Models
{
    public class VoiceroAIOptions
    {
        public const string VoiceroAI = "VoiceroAI";
        
        public string AccessKey { get; set; } = string.Empty;
        public string Position { get; set; } = "bottom-right";
        public string Theme { get; set; } = "light";
        public string WelcomeMessage { get; set; } = "How can I help you today?";
    }
}`,
                      "options"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "options" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Register Configuration */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                4. Register Configuration in Program.cs
              </h2>
              <p className="text-gray-300">
                Register the configuration in your Program.cs file:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// Program.cs
using YourApp.Models;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();

// Configure VoiceroAI options
builder.Services.Configure<VoiceroAIOptions>(
    builder.Configuration.GetSection(VoiceroAIOptions.VoiceroAI));

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseRouting();

app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// Program.cs
using YourApp.Models;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();

// Configure VoiceroAI options
builder.Services.Configure<VoiceroAIOptions>(
    builder.Configuration.GetSection(VoiceroAIOptions.VoiceroAI));

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseRouting();

app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();`,
                      "program"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "program" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 5: Create View Component */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                5. Create a View Component
              </h2>
              <p className="text-gray-300">
                Create a View Component to encapsulate the Voicero.AI widget:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// ViewComponents/VoiceroAIViewComponent.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using YourApp.Models;

namespace YourApp.ViewComponents
{
    public class VoiceroAIViewComponent : ViewComponent
    {
        private readonly VoiceroAIOptions _options;

        public VoiceroAIViewComponent(IOptions<VoiceroAIOptions> options)
        {
            _options = options.Value;
        }

        public IViewComponentResult Invoke()
        {
            return View(_options);
        }
    }
}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// ViewComponents/VoiceroAIViewComponent.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using YourApp.Models;

namespace YourApp.ViewComponents
{
    public class VoiceroAIViewComponent : ViewComponent
    {
        private readonly VoiceroAIOptions _options;

        public VoiceroAIViewComponent(IOptions<VoiceroAIOptions> options)
        {
            _options = options.Value;
        }

        public IViewComponentResult Invoke()
        {
            return View(_options);
        }
    }
}`,
                      "viewComponent"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "viewComponent" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 6: Create View Component Template */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                6. Create View Component Template
              </h2>
              <p className="text-gray-300">
                Create a Razor view for the View Component:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`@* Views/Shared/Components/VoiceroAI/Default.cshtml *@
@model YourApp.Models.VoiceroAIOptions

<script 
    src="https://voicero-text-frontend.vercel.app/widget.js" 
    data-token="@Model.AccessKey"
    data-position="@Model.Position"
    data-theme="@Model.Theme"
    data-welcome-message="@Model.WelcomeMessage">
</script>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `@* Views/Shared/Components/VoiceroAI/Default.cshtml *@
@model YourApp.Models.VoiceroAIOptions

<script 
    src="https://voicero-text-frontend.vercel.app/widget.js" 
    data-token="@Model.AccessKey"
    data-position="@Model.Position"
    data-theme="@Model.Theme"
    data-welcome-message="@Model.WelcomeMessage">
</script>`,
                      "viewTemplate"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "viewTemplate" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 7: Add to Layout */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                7. Add to Layout
              </h2>
              <p className="text-gray-300">
                Add the View Component to your layout file:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`@* Views/Shared/_Layout.cshtml *@
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>@ViewData["Title"] - YourApp</title>
    <link rel="stylesheet" href="~/lib/bootstrap/dist/css/bootstrap.min.css" />
    <link rel="stylesheet" href="~/css/site.css" asp-append-version="true" />
    <link rel="stylesheet" href="~/YourApp.styles.css" asp-append-version="true" />
</head>
<body>
    <header>
        <!-- Header content -->
    </header>
    
    <div class="container">
        <main role="main" class="pb-3">
            @RenderBody()
        </main>
    </div>

    <footer class="border-top footer text-muted">
        <!-- Footer content -->
    </footer>
    
    <script src="~/lib/jquery/dist/jquery.min.js"></script>
    <script src="~/lib/bootstrap/dist/js/bootstrap.bundle.min.js"></script>
    <script src="~/js/site.js" asp-append-version="true"></script>
    
    @await RenderSectionAsync("Scripts", required: false)
    
    <!-- Add Voicero.AI widget -->
    @await Component.InvokeAsync("VoiceroAI")
</body>
</html>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `@* Views/Shared/_Layout.cshtml *@
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>@ViewData["Title"] - YourApp</title>
    <link rel="stylesheet" href="~/lib/bootstrap/dist/css/bootstrap.min.css" />
    <link rel="stylesheet" href="~/css/site.css" asp-append-version="true" />
    <link rel="stylesheet" href="~/YourApp.styles.css" asp-append-version="true" />
</head>
<body>
    <header>
        <!-- Header content -->
    </header>
    
    <div class="container">
        <main role="main" class="pb-3">
            @RenderBody()
        </main>
    </div>

    <footer class="border-top footer text-muted">
        <!-- Footer content -->
    </footer>
    
    <script src="~/lib/jquery/dist/jquery.min.js"></script>
    <script src="~/lib/bootstrap/dist/js/bootstrap.bundle.min.js"></script>
    <script src="~/js/site.js" asp-append-version="true"></script>
    
    @await RenderSectionAsync("Scripts", required: false)
    
    <!-- Add Voicero.AI widget -->
    @await Component.InvokeAsync("VoiceroAI")
</body>
</html>`,
                      "layout"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "layout" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 8: Run the Application */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaRocket className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                8. Run Your Application
              </h2>
              <p className="text-gray-300">
                Run your ASP.NET Core application:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`dotnet run`}
                </pre>
                <button
                  onClick={() => handleCopy(`dotnet run`, "run")}
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
                Your application will start, and you can view it in your
                browser. The Voicero.AI chat widget will appear as a small
                button in the bottom-right corner of your application.
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
