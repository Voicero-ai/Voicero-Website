"use client";

import React, { useState, useEffect } from "react";
import { FaEnvelope, FaChevronRight, FaCheck, FaReply } from "react-icons/fa";
import Link from "next/link";
import { useSession } from "next-auth/react";

interface Website {
  id: string;
  url: string;
  name: string | null;
  type: string;
  accessKeys?: Array<{ key: string }>;
}

interface Contact {
  id: string;
  email: string;
  message: string;
  threadId: string;
  createdAt: string;
  read: boolean;
  replied: boolean;
  user: {
    name: string;
    email: string;
  };
}

export default function Contacts() {
  const { data: session, status } = useSession();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch websites with access keys
  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user?.id) return;

    const fetchWebsites = async () => {
      try {
        // Fetch websites with access keys
        const response = await fetch("/api/access-keys");
        if (!response.ok) throw new Error("Failed to fetch websites");

        const data = await response.json();
        setWebsites(data);
        if (data.length > 0) {
          setSelectedWebsiteId(data[0].id);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch websites"
        );
      }
    };

    fetchWebsites();
  }, [session, status]);

  // Fetch contacts when selectedWebsiteId changes
  useEffect(() => {
    if (!selectedWebsiteId) return;

    const fetchContacts = async () => {
      try {
        setLoading(true);

        // Find the selected website and its access key
        const selectedWebsite = websites.find(
          (w) => w.id === selectedWebsiteId
        );
        if (
          !selectedWebsite ||
          !selectedWebsite.accessKeys ||
          selectedWebsite.accessKeys.length === 0
        ) {
          throw new Error("No access key found for this website");
        }

        // Use the access key for authorization
        const accessKey = selectedWebsite.accessKeys[0].key;

        const response = await fetch(
          `/api/contacts?websiteId=${selectedWebsiteId}`,
          {
            headers: {
              Authorization: `Bearer ${accessKey}`,
            },
          }
        );

        if (!response.ok) throw new Error("Failed to fetch contacts");

        const data = await response.json();
        setContacts(data.contacts || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, [selectedWebsiteId, websites]);

  if (status === "loading" || loading) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-red-50 text-red-500 p-4 rounded-xl">
          Please sign in to view your contacts
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-red-50 text-red-500 p-4 rounded-xl">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-brand-text-primary mb-2">
          Contact Messages
        </h1>
        <p className="text-brand-text-secondary">
          View all contact messages from your users
        </p>
      </header>

  

      <div className="space-y-4">
        {contacts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-brand-lavender-light/20">
            <h3 className="text-lg font-medium text-brand-text-primary mb-2">
              No contact messages yet
            </h3>
            <p className="text-brand-text-secondary">
              Contact messages will appear here once users start reaching out.
            </p>
          </div>
        ) : (
          contacts.map((contact) => (
            <div
              key={contact.id}
              className={`bg-white rounded-xl shadow-sm border ${
                contact.read
                  ? "border-brand-lavender-light/20"
                  : "border-brand-accent border-l-4"
              } p-6 hover:border-brand-lavender-light/40 transition-colors`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div
                    className={`p-2 ${
                      contact.read
                        ? "bg-brand-lavender-light/10"
                        : "bg-brand-accent/10"
                    } rounded-lg`}
                  >
                    <FaEnvelope
                      className={`w-5 h-5 ${
                        contact.read ? "text-brand-accent" : "text-brand-accent"
                      }`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-brand-text-secondary">
                        {contact.email}
                      </span>
                      <span className="text-xs text-brand-text-secondary">
                        •
                      </span>
                      <span className="text-sm text-brand-text-secondary">
                        {new Date(contact.createdAt).toLocaleString()}
                      </span>

                      {/* Status indicators */}
                      {!contact.read && (
                        <span className="ml-2 bg-brand-accent text-white text-xs px-2 py-0.5 rounded-full">
                          New
                        </span>
                      )}
                      {contact.replied && (
                        <span className="ml-2 flex items-center text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                          <FaReply className="w-2.5 h-2.5 mr-1" />
                          Replied
                        </span>
                      )}
                      {contact.read && !contact.replied && (
                        <span className="ml-2 flex items-center text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          <FaCheck className="w-2.5 h-2.5 mr-1" />
                          Read
                        </span>
                      )}
                    </div>
                    <p className="text-brand-text-primary font-medium mb-2 line-clamp-2">
                      {contact.message}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/app/contacts/query?id=${contact.id}`}
                  className="flex items-center gap-1 text-brand-accent hover:text-brand-accent/80 transition-colors text-sm"
                >
                  View message
                  <FaChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
