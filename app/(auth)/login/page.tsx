"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FaEnvelope, FaLock, FaEye, FaEyeSlash } from "react-icons/fa";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface FormData {
  login: string;
  password: string;
}

const LoginPage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState<FormData>({
    login: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [searchParams, setSearchParams] = useState("");
  const [verificationMode, setVerificationMode] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [userId, setUserId] = useState("");

  useEffect(() => {
    setSearchParams(window.location.search);
    // Generate a simple device ID based on browser info
    generateDeviceId();
  }, []);

  // Generate a device ID based on browser properties
  const generateDeviceId = () => {
    const userAgent = navigator.userAgent;
    const screenProps = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const language = navigator.language;

    // Create a simple hash from the combined values
    let hash = 0;
    const deviceStr = `${userAgent}|${screenProps}|${timezone}|${language}`;

    for (let i = 0; i < deviceStr.length; i++) {
      const char = deviceStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    setDeviceId(Math.abs(hash).toString(16));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // First check if login credentials are valid
      const authCheck = await fetch("/api/auth/checkCredentials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          login: formData.login,
          password: formData.password,
        }),
      });

      const authData = await authCheck.json();

      if (authData.error) {
        setError(authData.error);
        setIsLoading(false);
        return;
      }

      // Store user ID for later
      setUserId(authData.userId);

      // Check if we need to verify the device
      const deviceCheck = await fetch("/api/auth/checkDevice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: authData.userId,
          deviceId: deviceId,
        }),
      });

      const deviceData = await deviceCheck.json();

      // If the device is not verified and email isn't verified, we need verification
      if (deviceData.needsVerification) {
        // Set verification mode and send code
        setVerificationMode(true);
        setUserEmail(authData.email);
        await sendVerificationCode(authData.email);
        setIsLoading(false);
        return;
      }

      // If we got here, credentials are valid and device is verified (or email already verified)
      const params = new URLSearchParams(searchParams);
      const callbackUrl = params.get("callbackUrl");
      const redirectUrl = callbackUrl || "/app";

      const result = await signIn("credentials", {
        login: formData.login,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else if (result?.url) {
        router.push(redirectUrl);
      }
    } catch (error) {
      console.error("Login error:", error);
      setError("An error occurred during sign in");
    } finally {
      setIsLoading(false);
    }
  };

  const sendVerificationCode = async (email: string) => {
    try {
      const response = await fetch("/api/auth/sendVerificationCode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to send verification code");
      }

      return true;
    } catch (error) {
      console.error("Error sending verification code:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send verification code"
      );
      return false;
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // Verify the email code
      const response = await fetch("/api/auth/verifyEmailCode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: userEmail,
          code: verificationCode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Invalid verification code");
      }

      // Now add this device to verified devices
      if (userId && deviceId) {
        await fetch("/api/auth/addVerifiedDevice", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: userId,
            deviceId: deviceId,
          }),
        });
      }

      // If verification successful, try to sign in again
      const params = new URLSearchParams(searchParams);
      const callbackUrl = params.get("callbackUrl");
      const redirectUrl = callbackUrl || "/app";

      const result = await signIn("credentials", {
        login: userEmail,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else if (result?.url) {
        router.push(redirectUrl);
      }
    } catch (error) {
      console.error("Verification error:", error);
      setError(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVerificationCode(e.target.value);
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    await sendVerificationCode(userEmail);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="container mx-auto px-4 py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <Link href="/">
              <h1
                className="text-4xl font-bold bg-clip-text text-transparent 
                            bg-gradient-to-r from-brand-accent to-brand-lavender-dark 
                            inline-block mb-4"
              >
                Voicero.AI
              </h1>
            </Link>
            <p className="text-lg text-white">
              {verificationMode
                ? "Please verify this device"
                : "Welcome back! Sign in to your account"}
            </p>
          </div>

          {/* Login Form or Verification Form */}
          <div className="bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-700">
            {verificationMode ? (
              <form
                onSubmit={verifyCode}
                className="grid gap-6 max-w-xl mx-auto"
              >
                {error && (
                  <div className="text-red-400 text-sm text-center bg-red-900/30 p-3 rounded-lg">
                    {error}
                  </div>
                )}

                <div>
                  <p className="text-white mb-4">
                    For security, we need to verify this device. We've sent a
                    6-digit verification code to <strong>{userEmail}</strong>.
                    Please enter it below.
                  </p>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Verification Code
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="verificationCode"
                      value={verificationCode}
                      onChange={handleCodeChange}
                      className="block w-full px-3 py-2 border border-gray-600 
                               rounded-xl focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent 
                               transition-colors bg-gray-700 text-white text-center"
                      placeholder="123456"
                      maxLength={6}
                    />
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 px-4 bg-gradient-to-r from-brand-accent to-brand-lavender-dark 
                           text-white rounded-xl font-medium shadow-lg shadow-brand-accent/20
                           hover:shadow-xl hover:shadow-brand-accent/30 transition-shadow
                           disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading}
                >
                  {isLoading ? "Verifying..." : "Verify Device"}
                </motion.button>

                <button
                  type="button"
                  onClick={handleResendCode}
                  className="text-brand-accent hover:text-brand-accent/80 text-sm transition-colors"
                  disabled={isLoading}
                >
                  Resend verification code
                </button>
              </form>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="grid gap-6 max-w-xl mx-auto"
              >
                {error && (
                  <div className="text-red-400 text-sm text-center bg-red-900/30 p-3 rounded-lg">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email or Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaEnvelope className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      name="login"
                      value={formData.login}
                      onChange={handleChange}
                      className="block w-full pl-10 pr-3 py-2 border border-gray-600 
                               rounded-xl focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent 
                               transition-colors bg-gray-700 text-white"
                      placeholder="Email or username"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-300">
                      Password
                    </label>
                    <Link
                      href="/forgotPassword"
                      className="text-sm text-brand-accent hover:text-brand-accent/80 transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaLock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      className="block w-full pl-10 pr-12 py-2 border border-gray-600 
                               rounded-xl focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent 
                               transition-colors bg-gray-700 text-white"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
                    >
                      {showPassword ? (
                        <FaEyeSlash className="h-5 w-5" />
                      ) : (
                        <FaEye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Login Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 px-4 bg-gradient-to-r from-brand-accent to-brand-lavender-dark 
                           text-white rounded-xl font-medium shadow-lg shadow-brand-accent/20
                           hover:shadow-xl hover:shadow-brand-accent/30 transition-shadow
                           disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading}
                >
                  {isLoading ? "Signing in..." : "Sign in"}
                </motion.button>
              </form>
            )}

            {/* Sign Up Link */}
            {!verificationMode && (
              <p className="mt-8 text-center text-sm text-gray-400">
                Don&apos;t have an account?{" "}
                <Link
                  href={`/getStarted${searchParams}`}
                  className="font-medium text-brand-accent hover:text-brand-accent/80 transition-colors"
                >
                  Create one
                </Link>
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
