"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaUser,
  FaGlobe,
  FaCamera,
  FaTrash,
  FaExternalLinkAlt,
  FaExclamationTriangle,
} from "react-icons/fa";
import { useRouter } from "next/navigation";
import { useUser } from "../../../../contexts/UserContext";

interface Website {
  id: string;
  url: string;
  name: string | null;
  type: string;
  plan: string;
  active: boolean;
  renewsOn: string;
  stripeId: string;
  monthlyQueries: number;
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  username: string;
  profilePicture: string | null;
}

const DeleteWebsiteModal = ({
  isOpen,
  onClose,
  onConfirm,
  websiteName,
  isDeleting,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  websiteName: string;
  isDeleting: boolean;
}) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 
                   w-full max-w-md bg-white rounded-xl shadow-xl z-50 p-6"
      >
        <div className="flex items-center gap-4 text-red-600 mb-4">
          <FaExclamationTriangle className="w-6 h-6" />
          <h3 className="text-xl font-bold">Delete Website</h3>
        </div>

        <p className="text-brand-text-secondary mb-2">
          Are you sure you want to delete{" "}
          <span className="font-semibold">{websiteName}</span>?
        </p>
        <p className="text-sm text-red-600 mb-6">
          This action cannot be undone. All data will be permanently deleted.
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-brand-text-secondary hover:text-brand-text-primary 
                     transition-colors rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white 
                     rounded-lg transition-colors disabled:opacity-50 
                     flex items-center gap-2"
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete Website"
            )}
          </button>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

// Add a new modal for subscription warning
const SubscriptionWarningModal = ({
  isOpen,
  onClose,
  websiteName,
  router,
  websiteId,
}: {
  isOpen: boolean;
  onClose: () => void;
  websiteName: string;
  router: any; // Or use proper Next.js router type
  websiteId?: string;
}) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 
                   w-full max-w-md bg-white rounded-xl shadow-xl z-50 p-6"
      >
        <div className="flex items-center gap-4 text-brand-accent mb-4">
          <FaExclamationTriangle className="w-6 h-6" />
          <h3 className="text-xl font-bold">Active Subscription</h3>
        </div>

        <p className="text-brand-text-secondary mb-2">
          <span className="font-semibold">{websiteName}</span> has an active
          subscription.
        </p>
        <p className="text-sm text-brand-text-secondary mb-6">
          Please cancel your subscription before deleting this website.
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-brand-text-secondary hover:text-brand-text-primary 
                     transition-colors rounded-lg"
          >
            Close
          </button>
          <button
            onClick={() => {
              onClose();
              router.push(`/app/websites/website?websiteId=${websiteId}`);
            }}
            className="px-4 py-2 bg-brand-accent hover:bg-brand-accent/90 text-white 
                     rounded-lg transition-colors"
          >
            Manage Subscription
          </button>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default function Settings() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { user, updateUser } = useUser();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [websiteToDelete, setWebsiteToDelete] = useState<Website | null>(null);
  const [showSubscriptionWarning, setShowSubscriptionWarning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch user profile
        const profileRes = await fetch("/api/user/me");
        const profileData = await profileRes.json();
        setProfile(profileData);

        // Fetch websites
        const websitesRes = await fetch("/api/websites");
        if (!websitesRes.ok) {
          throw new Error("Failed to fetch websites");
        }
        const websitesData = await websitesRes.json();
        setWebsites(websitesData);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setIsSaving(true);
    setError("");

    try {
      const response = await fetch("/api/user/update", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: profile.name,
          username: profile.username,
          email: profile.email,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update profile");
      }

      setProfile(data);
      updateUser(data);
      setIsEditing(false);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to update profile"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfile((prev) => (prev ? { ...prev, [name]: value } : null));
  };

  const handleImageUpload = async (file: File) => {
    try {
      setIsUploading(true);
      setError(""); // Clear any previous errors

      // Get presigned URL
      const response = await fetch("/api/upload/s3-url", {
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get upload URL");
      }

      const { uploadUrl, key, bucketUrl } = await response.json();

      // Upload to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
        mode: "cors", // Explicitly set CORS mode
      });

      if (!uploadResponse.ok) {
        throw new Error(
          `Failed to upload image: ${uploadResponse.status} ${uploadResponse.statusText}`
        );
      }

      // Update user profile with new image URL
      const imageUrl = `${bucketUrl}/${key}`;

      const updateResponse = await fetch("/api/user/update", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: profile?.name, // Include existing profile data
          email: profile?.email,
          username: profile?.username,
          profilePicture: imageUrl,
        }),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.json();
        throw new Error(error.error || "Failed to update profile picture");
      }

      const updatedProfile = await updateResponse.json();
      setProfile(updatedProfile);
      updateUser(updatedProfile);

      // Optional: Show success message
      // setSuccessMessage("Profile picture updated successfully");
    } catch (error) {
      console.error("Upload error:", error);
      setError(
        error instanceof Error
          ? `Error: ${error.message}`
          : "Failed to upload image. Please try again later."
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!websiteToDelete) return;

    setIsDeleting(true);

    try {
      // Step 1: Delete vectors
      const vectorRes = await fetch("/api/websites/delete-vectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteId: websiteToDelete.id }),
      });

      if (!vectorRes.ok) {
        const errorData = await vectorRes.json();
        console.error("Vector deletion failed:", errorData);
        throw new Error("Failed to delete vectors");
      }

      // Step 2: Delete content based on website type
      if (websiteToDelete.type === "wordPress") {
        const wpRes = await fetch("/api/websites/delete-wordpress-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteId: websiteToDelete.id }),
        });

        if (!wpRes.ok) {
          const errorData = await wpRes.json();
          console.error("WordPress content deletion failed:", errorData);
          throw new Error("Failed to delete WordPress content");
        }
      } else if (websiteToDelete.type === "shopify") {
        const shopifyRes = await fetch("/api/websites/delete-shopify-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteId: websiteToDelete.id }),
        });

        if (!shopifyRes.ok) {
          const errorData = await shopifyRes.json();
          console.error("Shopify content deletion failed:", errorData);
          throw new Error("Failed to delete Shopify content");
        }
      }

      // Step 3: Delete website
      const websiteRes = await fetch(`/api/websites/delete-website`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: websiteToDelete.id }),
      });

      if (!websiteRes.ok) {
        const errorData = await websiteRes.json();
        throw new Error("Failed to delete website");
      }

      // Update local state to remove the deleted website
      setWebsites(websites.filter((w) => w.id !== websiteToDelete.id));
      setShowDeleteModal(false);
      setWebsiteToDelete(null);
    } catch (error) {
      console.error("Error during deletion process:", error);
      // You might want to show an error message to the user here
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse space-y-8">
          {/* Header skeleton */}
          <div className="space-y-2">
            <div className="h-8 w-48 bg-brand-lavender-light/20 rounded-lg"></div>
            <div className="h-4 w-96 bg-brand-lavender-light/20 rounded-lg"></div>
          </div>

          {/* Profile section skeleton */}
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 overflow-hidden">
            <div className="p-6 border-b border-brand-lavender-light/20">
              <div className="h-6 w-40 bg-brand-lavender-light/20 rounded-lg"></div>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-full bg-brand-lavender-light/20"></div>
                <div className="space-y-2">
                  <div className="h-5 w-32 bg-brand-lavender-light/20 rounded-lg"></div>
                  <div className="h-4 w-48 bg-brand-lavender-light/20 rounded-lg"></div>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 w-24 bg-brand-lavender-light/20 rounded-lg"></div>
                    <div className="h-10 w-full bg-brand-lavender-light/20 rounded-xl"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Websites section skeleton */}
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 overflow-hidden">
            <div className="p-6 border-b border-brand-lavender-light/20">
              <div className="h-6 w-48 bg-brand-lavender-light/20 rounded-lg"></div>
            </div>
            <div className="p-6">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 w-full bg-brand-lavender-light/20 rounded-xl mb-4"
                ></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-brand-text-primary mb-2">
          Settings
        </h1>
        <p className="text-brand-text-secondary">
          Manage your account settings and preferences
        </p>
      </header>

      {/* Profile Section */}
      <section className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 overflow-hidden">
        <div className="p-6 border-b border-brand-lavender-light/20">
          <h2 className="text-xl font-semibold text-brand-text-primary">
            Profile Settings
          </h2>
        </div>

        <div className="p-6">
          {/* Profile Picture */}
          <div className="flex items-center gap-6 mb-8">
            <div className="relative">
              {profile?.profilePicture ? (
                <div className="relative">
                  <img
                    src={profile.profilePicture}
                    alt="Profile"
                    className={`w-24 h-24 rounded-full object-cover transition-opacity duration-200 ${
                      isUploading ? "opacity-50" : "opacity-100"
                    }`}
                    onError={(e) => {
                      e.currentTarget.src = "";
                      setProfile((prev) =>
                        prev ? { ...prev, profilePicture: null } : null
                      );
                    }}
                  />
                  {isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-accent"></div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-24 h-24 rounded-full bg-brand-lavender-light/20 flex items-center justify-center">
                  <FaUser className="w-12 h-12 text-brand-text-secondary/50" />
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute bottom-0 right-0 p-2 bg-white rounded-full shadow-lg border border-brand-lavender-light/20
                         hover:bg-brand-lavender-light/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FaCamera className="w-4 h-4 text-brand-text-secondary" />
              </button>
            </div>
            <div>
              <h3 className="font-medium text-brand-text-primary mb-1">
                Profile Picture
              </h3>
              <p className="text-sm text-brand-text-secondary mb-3">
                Upload a new profile picture
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleImageUpload(file);
                  }
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="text-sm text-brand-accent hover:text-brand-accent/80 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? "Uploading..." : "Upload new image"}
              </button>
            </div>
          </div>

          {/* Profile Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-brand-text-secondary mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={profile?.name || ""}
                  onChange={handleChange}
                  disabled={!isEditing}
                  className={`block w-full px-4 py-2 border border-brand-lavender-light/20 
                           rounded-xl focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent 
                           transition-colors bg-gray-100 text-black ${
                             !isEditing ? "bg-gray-50 cursor-not-allowed" : ""
                           }`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text-secondary mb-2">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={profile?.username || ""}
                  onChange={handleChange}
                  disabled={!isEditing}
                  className={`block w-full px-4 py-2 border border-brand-lavender-light/20 
                           rounded-xl focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent 
                           transition-colors bg-gray-100 text-black ${
                             !isEditing ? "bg-gray-50 cursor-not-allowed" : ""
                           }`}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-brand-text-secondary mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={profile?.email || ""}
                  onChange={handleChange}
                  disabled={!isEditing}
                  className={`block w-full px-4 py-2 border border-brand-lavender-light/20 
                           rounded-xl focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent 
                           transition-colors bg-gray-100 text-black ${
                             !isEditing ? "bg-gray-50 cursor-not-allowed" : ""
                           }`}
                />
              </div>
            </div>

            <div className="flex justify-end gap-4">
              {isEditing ? (
                <>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setIsEditing(false);
                      // Reset form to original values
                      setProfile(profile);
                      setError("");
                    }}
                    className="px-4 py-2 text-brand-text-secondary hover:text-brand-text-primary 
                             transition-colors rounded-xl"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="px-4 py-2 bg-gradient-to-r from-brand-accent to-brand-lavender-dark 
                             text-white rounded-xl shadow-lg shadow-brand-accent/20
                             hover:shadow-xl hover:shadow-brand-accent/30 transition-shadow
                             disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </motion.button>
                </>
              ) : (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 text-brand-accent border border-brand-accent/20 
                           hover:bg-brand-accent/5 transition-colors rounded-xl"
                >
                  Edit Profile
                </motion.button>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* Connected Websites Section */}
      <section className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 overflow-hidden">
        <div className="p-6 border-b border-brand-lavender-light/20 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-brand-text-primary">
              Connected Websites
            </h2>
            <p className="text-sm text-brand-text-secondary mt-1">
              Manage your website connections and subscriptions
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push("/app/websites/new")}
            className="px-4 py-2 bg-gradient-to-r from-brand-accent to-brand-lavender-dark 
                     text-white rounded-xl shadow-lg shadow-brand-accent/20
                     hover:shadow-xl hover:shadow-brand-accent/30 transition-shadow"
          >
            Connect Website
          </motion.button>
        </div>

        <div className="p-6">
          {websites.length > 0 ? (
            <div className="space-y-4">
              {websites.map((site) => (
                <div
                  key={site.id}
                  className="flex flex-col md:flex-row md:items-center justify-between p-4 border border-brand-lavender-light/20 rounded-xl gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-brand-lavender-light/10 rounded-lg">
                      <FaGlobe className="w-6 h-6 text-brand-accent" />
                    </div>
                    <div>
                      <h3 className="font-medium text-brand-text-primary">
                        {site.url}
                      </h3>
                      <p className="text-sm text-brand-text-secondary">
                        {site.name} • {site.type} •{" "}
                        {site.plan ? `${site.plan} Plan` : "Inactive Plan"}
                      </p>
                      {site.plan &&
                        site.plan !== "free" &&
                        site.plan !== "Free" && (
                          <p className="text-sm text-brand-text-secondary">
                            Renews on{" "}
                            {new Date(site.renewsOn).toLocaleDateString()}
                          </p>
                        )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-auto">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="px-3 py-1.5 text-sm text-brand-accent border border-brand-accent/20 
                               hover:bg-brand-accent/5 transition-colors rounded-lg"
                      onClick={() =>
                        router.push(
                          `/app/websites/website?websiteId=${site.id}`
                        )
                      }
                    >
                      Manage Subscription
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="p-2 text-brand-text-secondary hover:text-brand-accent 
                               transition-colors rounded-lg hover:bg-brand-lavender-light/5"
                      onClick={() => window.open(`${site.url}`, "_blank")}
                    >
                      <FaExternalLinkAlt className="w-4 h-4" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="p-2 text-red-500 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
                      onClick={() => {
                        setWebsiteToDelete(site);
                        setShowDeleteModal(true);
                      }}
                    >
                      <FaTrash className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <FaGlobe className="w-12 h-12 text-brand-text-secondary/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-brand-text-primary mb-2">
                No Websites Connected
              </h3>
              <p className="text-brand-text-secondary mb-6">
                Connect your first website to start using Voicero.AI
              </p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push("/app/websites/new")}
                className="px-6 py-3 bg-gradient-to-r from-brand-accent to-brand-lavender-dark 
                         text-white rounded-xl shadow-lg shadow-brand-accent/20
                         hover:shadow-xl hover:shadow-brand-accent/30 transition-shadow"
              >
                Connect Your First Website
              </motion.button>
            </div>
          )}
        </div>
      </section>

      <DeleteWebsiteModal
        isOpen={showDeleteModal}
        onClose={() => {
          if (!isDeleting) {
            setShowDeleteModal(false);
            setWebsiteToDelete(null);
          }
        }}
        onConfirm={handleDelete}
        websiteName={websiteToDelete?.url || ""}
        isDeleting={isDeleting}
      />

      <SubscriptionWarningModal
        isOpen={showSubscriptionWarning}
        onClose={() => {
          setShowSubscriptionWarning(false);
          setWebsiteToDelete(null);
        }}
        websiteName={websiteToDelete?.url || ""}
        router={router}
        websiteId={websiteToDelete?.id}
      />
    </div>
  );
}
