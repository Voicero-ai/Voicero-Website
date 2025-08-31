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

export default function AspNetGuide() {
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
            ASP.NET Integration Guide
          </h1>
        </div>
        <p className="text-lg text-gray-300">
          Follow these steps to add Voicero.AI to your classic ASP.NET
          application
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
                used to connect your ASP.NET application to our AI services.
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

        {/* Step 2: Configure Web.config */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCog className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                2. Configure Web.config
              </h2>
              <p className="text-gray-300">
                Add your Voicero.AI access key to your Web.config file:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<!-- Web.config -->
<configuration>
  <appSettings>
    <!-- Other app settings -->
    <add key="VoiceroAI:AccessKey" value="${demoAccessKey}" />
    <add key="VoiceroAI:Position" value="bottom-right" />
    <add key="VoiceroAI:Theme" value="light" />
    <add key="VoiceroAI:WelcomeMessage" value="How can I help you today?" />
  </appSettings>
  
  <!-- Rest of your Web.config -->
</configuration>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<!-- Web.config -->
<configuration>
  <appSettings>
    <!-- Other app settings -->
    <add key="VoiceroAI:AccessKey" value="${demoAccessKey}" />
    <add key="VoiceroAI:Position" value="bottom-right" />
    <add key="VoiceroAI:Theme" value="light" />
    <add key="VoiceroAI:WelcomeMessage" value="How can I help you today?" />
  </appSettings>
  
  <!-- Rest of your Web.config -->
</configuration>`,
                      "webconfig"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "webconfig" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Create Helper Class */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                3. Create Helper Class
              </h2>
              <p className="text-gray-300">
                Create a helper class to access your Voicero.AI settings:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`// App_Code/VoiceroAIHelper.cs
using System;
using System.Configuration;
using System.Web;

namespace YourApp.Helpers
{
    public static class VoiceroAIHelper
    {
        public static string GetAccessKey()
        {
            return ConfigurationManager.AppSettings["VoiceroAI:AccessKey"] ?? "";
        }

        public static string GetPosition()
        {
            return ConfigurationManager.AppSettings["VoiceroAI:Position"] ?? "bottom-right";
        }

        public static string GetTheme()
        {
            return ConfigurationManager.AppSettings["VoiceroAI:Theme"] ?? "light";
        }

        public static string GetWelcomeMessage()
        {
            return ConfigurationManager.AppSettings["VoiceroAI:WelcomeMessage"] ?? "How can I help you today?";
        }

        public static IHtmlString RenderScript()
        {
            var script = $@"<script 
                src=""https://voicero-text-frontend.vercel.app/widget.js"" 
                data-token=""{GetAccessKey()}""
                data-position=""{GetPosition()}""
                data-theme=""{GetTheme()}""
                data-welcome-message=""{GetWelcomeMessage()}"">
            </script>";

            return new HtmlString(script);
        }
    }
}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `// App_Code/VoiceroAIHelper.cs
using System;
using System.Configuration;
using System.Web;

namespace YourApp.Helpers
{
    public static class VoiceroAIHelper
    {
        public static string GetAccessKey()
        {
            return ConfigurationManager.AppSettings["VoiceroAI:AccessKey"] ?? "";
        }

        public static string GetPosition()
        {
            return ConfigurationManager.AppSettings["VoiceroAI:Position"] ?? "bottom-right";
        }

        public static string GetTheme()
        {
            return ConfigurationManager.AppSettings["VoiceroAI:Theme"] ?? "light";
        }

        public static string GetWelcomeMessage()
        {
            return ConfigurationManager.AppSettings["VoiceroAI:WelcomeMessage"] ?? "How can I help you today?";
        }

        public static IHtmlString RenderScript()
        {
            var script = $@"<script 
                src=""https://voicero-text-frontend.vercel.app/widget.js"" 
                data-token=""{GetAccessKey()}""
                data-position=""{GetPosition()}""
                data-theme=""{GetTheme()}""
                data-welcome-message=""{GetWelcomeMessage()}"">
            </script>";

            return new HtmlString(script);
        }
    }
}`,
                      "helper"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "helper" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Add to Master Page */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                4. Add to Master Page
              </h2>
              <p className="text-gray-300">
                Add the Voicero.AI script to your master page:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<%@ Master Language="C#" AutoEventWireup="true" CodeBehind="Site.master.cs" Inherits="YourApp.SiteMaster" %>
<%@ Import Namespace="YourApp.Helpers" %>

<!DOCTYPE html>

<html lang="en">
<head runat="server">
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><%: Page.Title %> - Your ASP.NET Application</title>

    <asp:PlaceHolder runat="server">
        <%: Scripts.Render("~/bundles/modernizr") %>
    </asp:PlaceHolder>

    <webopt:bundlereference runat="server" path="~/Content/css" />
    <link href="~/favicon.ico" rel="shortcut icon" type="image/x-icon" />
</head>
<body>
    <form runat="server">
        <asp:ScriptManager runat="server">
            <Scripts>
                <%--Framework Scripts--%>
                <asp:ScriptReference Name="MsAjaxBundle" />
                <asp:ScriptReference Name="jquery" />
                <asp:ScriptReference Name="bootstrap" />
                <asp:ScriptReference Name="WebForms.js" Assembly="System.Web" Path="~/Scripts/WebForms/WebForms.js" />
                <asp:ScriptReference Name="WebUIValidation.js" Assembly="System.Web" Path="~/Scripts/WebForms/WebUIValidation.js" />
                <asp:ScriptReference Name="MenuStandards.js" Assembly="System.Web" Path="~/Scripts/WebForms/MenuStandards.js" />
                <asp:ScriptReference Name="GridView.js" Assembly="System.Web" Path="~/Scripts/WebForms/GridView.js" />
                <asp:ScriptReference Name="DetailsView.js" Assembly="System.Web" Path="~/Scripts/WebForms/DetailsView.js" />
                <asp:ScriptReference Name="TreeView.js" Assembly="System.Web" Path="~/Scripts/WebForms/TreeView.js" />
                <asp:ScriptReference Name="WebParts.js" Assembly="System.Web" Path="~/Scripts/WebForms/WebParts.js" />
                <asp:ScriptReference Name="Focus.js" Assembly="System.Web" Path="~/Scripts/WebForms/Focus.js" />
                <asp:ScriptReference Name="WebFormsBundle" />
                <%--Site Scripts--%>
            </Scripts>
        </asp:ScriptManager>

        <div class="navbar navbar-inverse navbar-fixed-top">
            <!-- Navigation content -->
        </div>
        
        <div class="container body-content">
            <asp:ContentPlaceHolder ID="MainContent" runat="server">
            </asp:ContentPlaceHolder>
            <hr />
            <footer>
                <p>&copy; <%: DateTime.Now.Year %> - Your ASP.NET Application</p>
            </footer>
        </div>
    </form>
    
    <!-- Add Voicero.AI widget -->
    <%= VoiceroAIHelper.RenderScript() %>
</body>
</html>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<%@ Master Language="C#" AutoEventWireup="true" CodeBehind="Site.master.cs" Inherits="YourApp.SiteMaster" %>
<%@ Import Namespace="YourApp.Helpers" %>

<!DOCTYPE html>

<html lang="en">
<head runat="server">
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><%: Page.Title %> - Your ASP.NET Application</title>

    <asp:PlaceHolder runat="server">
        <%: Scripts.Render("~/bundles/modernizr") %>
    </asp:PlaceHolder>

    <webopt:bundlereference runat="server" path="~/Content/css" />
    <link href="~/favicon.ico" rel="shortcut icon" type="image/x-icon" />
</head>
<body>
    <form runat="server">
        <asp:ScriptManager runat="server">
            <Scripts>
                <%--Framework Scripts--%>
                <asp:ScriptReference Name="MsAjaxBundle" />
                <asp:ScriptReference Name="jquery" />
                <asp:ScriptReference Name="bootstrap" />
                <asp:ScriptReference Name="WebForms.js" Assembly="System.Web" Path="~/Scripts/WebForms/WebForms.js" />
                <asp:ScriptReference Name="WebUIValidation.js" Assembly="System.Web" Path="~/Scripts/WebForms/WebUIValidation.js" />
                <asp:ScriptReference Name="MenuStandards.js" Assembly="System.Web" Path="~/Scripts/WebForms/MenuStandards.js" />
                <asp:ScriptReference Name="GridView.js" Assembly="System.Web" Path="~/Scripts/WebForms/GridView.js" />
                <asp:ScriptReference Name="DetailsView.js" Assembly="System.Web" Path="~/Scripts/WebForms/DetailsView.js" />
                <asp:ScriptReference Name="TreeView.js" Assembly="System.Web" Path="~/Scripts/WebForms/TreeView.js" />
                <asp:ScriptReference Name="WebParts.js" Assembly="System.Web" Path="~/Scripts/WebForms/WebParts.js" />
                <asp:ScriptReference Name="Focus.js" Assembly="System.Web" Path="~/Scripts/WebForms/Focus.js" />
                <asp:ScriptReference Name="WebFormsBundle" />
                <%--Site Scripts--%>
            </Scripts>
        </asp:ScriptManager>

        <div class="navbar navbar-inverse navbar-fixed-top">
            <!-- Navigation content -->
        </div>
        
        <div class="container body-content">
            <asp:ContentPlaceHolder ID="MainContent" runat="server">
            </asp:ContentPlaceHolder>
            <hr />
            <footer>
                <p>&copy; <%: DateTime.Now.Year %> - Your ASP.NET Application</p>
            </footer>
        </div>
    </form>
    
    <!-- Add Voicero.AI widget -->
    <%= VoiceroAIHelper.RenderScript() %>
</body>
</html>`,
                      "masterPage"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "masterPage" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 5: Alternative Method */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaCode className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                5. Alternative: Add Directly to Pages
              </h2>
              <p className="text-gray-300">
                If you prefer, you can add the script directly to individual
                pages:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`<%@ Page Title="Home Page" Language="C#" MasterPageFile="~/Site.Master" AutoEventWireup="true" CodeBehind="Default.aspx.cs" Inherits="YourApp._Default" %>

<asp:Content ID="BodyContent" ContentPlaceHolderID="MainContent" runat="server">
    <div class="jumbotron">
        <h1>ASP.NET</h1>
        <p class="lead">ASP.NET is a free web framework for building great Web sites and Web applications using HTML, CSS, and JavaScript.</p>
        <p><a href="http://www.asp.net" class="btn btn-primary btn-lg">Learn more &raquo;</a></p>
    </div>

    <div class="row">
        <!-- Your page content -->
    </div>
    
    <!-- If not using master page, add this directly -->
    <script 
        src="https://voicero-text-frontend.vercel.app/widget.js" 
        data-token="<%= ConfigurationManager.AppSettings["VoiceroAI:AccessKey"] %>"
        data-position="<%= ConfigurationManager.AppSettings["VoiceroAI:Position"] ?? "bottom-right" %>"
        data-theme="<%= ConfigurationManager.AppSettings["VoiceroAI:Theme"] ?? "light" %>"
        data-welcome-message="<%= ConfigurationManager.AppSettings["VoiceroAI:WelcomeMessage"] ?? "How can I help you today?" %>">
    </script>
</asp:Content>`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `<%@ Page Title="Home Page" Language="C#" MasterPageFile="~/Site.Master" AutoEventWireup="true" CodeBehind="Default.aspx.cs" Inherits="YourApp._Default" %>

<asp:Content ID="BodyContent" ContentPlaceHolderID="MainContent" runat="server">
    <div class="jumbotron">
        <h1>ASP.NET</h1>
        <p class="lead">ASP.NET is a free web framework for building great Web sites and Web applications using HTML, CSS, and JavaScript.</p>
        <p><a href="http://www.asp.net" class="btn btn-primary btn-lg">Learn more &raquo;</a></p>
    </div>

    <div class="row">
        <!-- Your page content -->
    </div>
    
    <!-- If not using master page, add this directly -->
    <script 
        src="https://voicero-text-frontend.vercel.app/widget.js" 
        data-token="<%= ConfigurationManager.AppSettings["VoiceroAI:AccessKey"] %>"
        data-position="<%= ConfigurationManager.AppSettings["VoiceroAI:Position"] ?? "bottom-right" %>"
        data-theme="<%= ConfigurationManager.AppSettings["VoiceroAI:Theme"] ?? "light" %>"
        data-welcome-message="<%= ConfigurationManager.AppSettings["VoiceroAI:WelcomeMessage"] ?? "How can I help you today?" %>">
    </script>
</asp:Content>`,
                      "individualPage"
                    )
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "individualPage" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
              <p className="text-gray-300 mt-2">
                Remember to add the following import to your code-behind file:
              </p>
              <div className="bg-gray-800 rounded-lg p-4 relative">
                <pre className="text-white text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {`using System.Configuration;`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(`using System.Configuration;`, "import")
                  }
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                  aria-label="Copy code"
                >
                  {copied === "import" ? (
                    <FaCheck className="text-green-400" />
                  ) : (
                    <FaCopy />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 6: Run the Application */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-gray-800 rounded-lg">
              <FaRocket className="w-5 h-5 text-brand-accent" />
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-white">
                6. Run Your Application
              </h2>
              <p className="text-gray-300">
                Run your ASP.NET application by pressing F5 in Visual Studio or
                deploying to your web server. The Voicero.AI chat widget will
                appear as a small button in the bottom-right corner of your
                application.
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
