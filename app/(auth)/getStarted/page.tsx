"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FaEnvelope, FaLock, FaUser, FaEye, FaEyeSlash } from "react-icons/fa";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

interface FormData {
  companyName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface FormErrors {
  companyName?: string;
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  submit?: string;
}

export default function GetStartedPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    companyName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [searchParams, setSearchParams] = useState("");

  useEffect(() => {
    setSearchParams(window.location.search);
  }, []);

  const validateForm = () => {
    const newErrors: FormErrors = {};

    if (!formData.companyName) {
      newErrors.companyName = "Company name is required";
    }

    if (!formData.username) {
      newErrors.username = "Username is required";
    } else if (formData.username.length < 3) {
      newErrors.username = "Username must be at least 3 characters";
    } else if (!/^[a-zA-Z0-9_-]+$/.test(formData.username)) {
      newErrors.username =
        "Username can only contain letters, numbers, underscores, and dashes";
    }

    if (!formData.email) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    } else if (!/(?=.*[0-9])/.test(formData.password)) {
      newErrors.password = "Password must contain at least 1 number";
    } else if (!/(?=.*[!@#$%^&*])/.test(formData.password)) {
      newErrors.password = "Password must contain at least 1 special character";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Always clear previous submit errors first
    setErrors((prev) => ({ ...prev, submit: undefined }));

    // Then validate the form
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to register");
      }

      const params = new URLSearchParams(searchParams);
      const callbackUrl = params.get("callbackUrl");

      // Always sign in the user regardless of callback URL
      const result = await signIn("credentials", {
        login: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      if (callbackUrl) {
        router.push(callbackUrl);
      } else {
        setStep(2);
      }
    } catch (error) {
      console.error("Registration error:", error);
      setErrors((prev) => ({
        ...prev,
        submit: error instanceof Error ? error.message : "Failed to register",
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  return (
    <main className="min-h-screen bg-gray-900">
      <div className="container mx-auto px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto"
        >
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
              Create your account and start building better website experiences
            </p>
          </div>

          <div className="bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-700">
            {step === 1 ? (
              <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Company Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaUser className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      name="companyName"
                      value={formData.companyName}
                      onChange={handleChange}
                      className={`block w-full pl-10 pr-3 py-2 border 
                              rounded-xl focus:ring-2 focus:ring-brand-accent/20 
                              transition-colors bg-gray-700 text-white ${
                                errors.companyName
                                  ? "border-red-500 focus:border-red-500"
                                  : "border-gray-600 focus:border-brand-accent"
                              }`}
                      placeholder="Acme Inc."
                    />
                    {errors.companyName && (
                      <p className="mt-1 text-xs text-red-400">
                        {errors.companyName}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaUser className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      name="username"
                      value={formData.username}
                      onChange={handleChange}
                      className={`block w-full pl-10 pr-3 py-2 border 
                              rounded-xl focus:ring-2 focus:ring-brand-accent/20 
                              transition-colors bg-gray-700 text-white ${
                                errors.username
                                  ? "border-red-500 focus:border-red-500"
                                  : "border-gray-600 focus:border-brand-accent"
                              }`}
                      placeholder="johndoe"
                    />
                    {errors.username && (
                      <p className="mt-1 text-xs text-red-400">
                        {errors.username}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaEnvelope className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className={`block w-full pl-10 pr-3 py-2 border 
                              rounded-xl focus:ring-2 focus:ring-brand-accent/20 
                              transition-colors bg-gray-700 text-white ${
                                errors.email
                                  ? "border-red-500 focus:border-red-500"
                                  : "border-gray-600 focus:border-brand-accent"
                              }`}
                      placeholder="you@example.com"
                    />
                    {errors.email && (
                      <p className="mt-1 text-xs text-red-400">
                        {errors.email}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaLock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      className={`block w-full pl-10 pr-12 py-2 border rounded-xl focus:ring-2 
                                focus:ring-brand-accent/20 transition-colors bg-gray-700 text-white ${
                                  errors.password
                                    ? "border-red-500 focus:border-red-500"
                                    : "border-gray-600 focus:border-brand-accent"
                                }`}
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
                  {errors.password && (
                    <p className="mt-1 text-xs text-red-400">
                      {errors.password}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FaLock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className={`block w-full pl-10 pr-12 py-2 border rounded-xl focus:ring-2 
                                focus:ring-brand-accent/20 transition-colors bg-gray-700 text-white ${
                                  errors.confirmPassword
                                    ? "border-red-500 focus:border-red-500"
                                    : "border-gray-600 focus:border-brand-accent"
                                }`}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
                    >
                      {showConfirmPassword ? (
                        <FaEyeSlash className="h-5 w-5" />
                      ) : (
                        <FaEye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="mt-1 text-xs text-red-400">
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>

                <div className="col-span-2">
                  {errors.submit && (
                    <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 mb-4 animate-pulse">
                      <p className="text-red-400 text-center font-medium">
                        {errors.submit}
                      </p>
                    </div>
                  )}
                </div>
                <div className="col-span-2 mt-4">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-3 px-4 bg-gradient-to-r from-brand-accent to-brand-lavender-dark 
                             text-white rounded-xl font-medium shadow-lg shadow-brand-accent/20
                             hover:shadow-xl hover:shadow-brand-accent/30 transition-shadow
                             disabled:opacity-50 disabled:cursor-not-allowed relative"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <span className="opacity-0">Create Account</span>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg
                            className="animate-spin h-5 w-5 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          <span className="ml-2">Creating Account...</span>
                        </div>
                      </>
                    ) : (
                      "Create Account"
                    )}
                  </motion.button>
                </div>
              </form>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <div className="text-5xl mb-4">🎉</div>
                <h2 className="text-2xl font-semibold text-white mb-4">
                  Welcome to Voicero.AI!
                </h2>
                <p className="text-gray-300 mb-8">
                  Your account has been created successfully. Check your email
                  to verify your account.
                </p>
                <Link href="/login">
                  <motion.a
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="inline-block py-3 px-6 bg-gradient-to-r from-brand-accent to-brand-lavender-dark 
                             text-white rounded-xl font-medium shadow-lg shadow-brand-accent/20
                             hover:shadow-xl hover:shadow-brand-accent/30 transition-shadow"
                  >
                    Go to Login
                  </motion.a>
                </Link>
              </motion.div>
            )}

            {step === 1 && (
              <p className="mt-8 text-center text-sm text-gray-400">
                Already have an account?{" "}
                <Link
                  href={`/login${searchParams}`}
                  className="font-medium text-brand-accent hover:text-brand-accent/80 transition-colors"
                >
                  Sign in
                </Link>
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </main>
  );
}
