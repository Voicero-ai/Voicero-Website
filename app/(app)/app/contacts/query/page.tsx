"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FaArrowLeft,
  FaEnvelope,
  FaExternalLinkAlt,
  FaCode,
  FaArrowDown,
  FaMousePointer,
  FaWpforms,
  FaShoppingCart,
  FaTruck,
  FaUndo,
  FaSignInAlt,
  FaSignOutAlt,
  FaRedo,
  FaCalendarAlt,
  FaHighlighter,
  FaPlay,
  FaStop,
  FaReply,
  FaCheck,
  FaTrash,
} from "react-icons/fa";
import ReactMarkdown from "react-markdown";

interface ThreadMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  type?: string;
  metadata?: {
    jsonResponse?: any;
  };
}

interface ContactDetails {
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
  threadMessages: ThreadMessage[];
}

export default function ContactQuery() {
  const router = useRouter();
  const searchParams = useSearchParams()!;
  const contactId = searchParams.get("id");
  const [contact, setContact] = useState<ContactDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAsRead, setMarkingAsRead] = useState(false);
  const [markingAsReplied, setMarkingAsReplied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchContact = async () => {
      if (!contactId) return;

      try {
        setLoading(true);
        const response = await fetch(`/api/contacts/query?id=${contactId}`);
        if (!response.ok) throw new Error("Failed to fetch contact details");

        const data = await response.json();
        setContact(data);

        // Mark as read if not already read
        if (data && !data.read) {
          markAsRead();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    fetchContact();
  }, [contactId]);

  const markAsRead = async () => {
    if (!contactId || markingAsRead) return;

    try {
      setMarkingAsRead(true);
      const response = await fetch(`/api/contacts/mark-read?id=${contactId}`, {
        method: "POST",
      });

      if (response.ok && contact) {
        setContact({ ...contact, read: true });
      }
    } catch (err) {
      console.error("Failed to mark as read:", err);
    } finally {
      setMarkingAsRead(false);
    }
  };

  const markAsReplied = async () => {
    if (!contactId || markingAsReplied) return;

    try {
      setMarkingAsReplied(true);
      const response = await fetch(
        `/api/contacts/mark-replied?id=${contactId}`,
        {
          method: "POST",
        }
      );

      if (response.ok && contact) {
        setContact({ ...contact, replied: true });

        // Open email client
        if (contact.email) {
          const subject = `Re: Contact from Website`;
          const mailtoLink = `mailto:${
            contact.email
          }?subject=${encodeURIComponent(subject)}`;
          window.open(mailtoLink, "_blank");
        }
      }
    } catch (err) {
      console.error("Failed to mark as replied:", err);
    } finally {
      setMarkingAsReplied(false);
    }
  };

  const deleteContact = async () => {
    if (!contactId || deleting) return;

    if (!confirm("Are you sure you want to delete this contact message?")) {
      return;
    }

    try {
      setDeleting(true);
      const response = await fetch(
        `/api/contacts/delete?id=${contactId}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        router.push("/app/contacts");
      } else {
        const data = await response.json();
        setError(data.error || "Failed to delete contact");
      }
    } catch (err) {
      console.error("Failed to delete contact:", err);
      setError("Failed to delete contact");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-20 bg-gray-200 rounded-xl" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-red-50 text-red-500 p-4 rounded-xl">
          {error || "Contact not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-brand-text-secondary hover:text-brand-text-primary transition-colors"
        >
          <FaArrowLeft className="w-4 h-4" />
          <span>Back to Contact Messages</span>
        </button>

        <div className="flex items-center gap-3">
          {contact.read && !contact.replied && (
            <div className="flex items-center text-blue-600 text-sm">
              <FaCheck className="w-3.5 h-3.5 mr-1.5" />
              Read
            </div>
          )}

          {contact.replied && (
            <div className="flex items-center text-green-600 text-sm">
              <FaReply className="w-3.5 h-3.5 mr-1.5" />
              Replied
            </div>
          )}

          <button
            onClick={deleteContact}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-red-500 hover:bg-red-600"
          >
            <FaTrash className="w-3.5 h-3.5" />
            {deleting ? "Deleting..." : "Delete"}
          </button>

          <button
            onClick={markAsReplied}
            disabled={markingAsReplied || contact.replied}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white 
              ${
                contact.replied
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-brand-accent hover:bg-brand-accent/90"
              }`}
          >
            <FaReply className="w-3.5 h-3.5" />
            {markingAsReplied
              ? "Processing..."
              : contact.replied
              ? "Replied"
              : "Reply"}
          </button>
        </div>
      </div>

      {/* Contact Info */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/20 p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-2 bg-brand-lavender-light/10 rounded-lg">
            <FaEnvelope className="w-5 h-5 text-brand-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-brand-text-primary mb-1">
              Contact Message from {contact.email}
            </h1>
            <p className="text-brand-text-secondary">
              Received on {new Date(contact.createdAt).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Message Content */}
        <div className="mt-6 p-4 bg-brand-lavender-light/5 rounded-lg">
          <h2 className="text-sm font-medium text-brand-text-secondary mb-2">
            Message
          </h2>
          <p className="text-brand-text-primary whitespace-pre-wrap">
            {contact.message}
          </p>
        </div>
      </div>

      {/* Thread Messages */}
      {contact.threadMessages.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-brand-text-primary">
            Associated Conversation
          </h2>
          {contact.threadMessages.map((message) => {
            // Try to parse JSON from message content for AI messages
            let parsedJson = null;
            if (message.role === "assistant") {
              try {
                // Check if the content is JSON
                if (
                  message.content.trim().startsWith("{") &&
                  message.content.trim().endsWith("}")
                ) {
                  parsedJson = JSON.parse(message.content);
                }
              } catch (e) {
                console.error("Failed to parse JSON from message:", e);
              }
            }

            // Get the actual content to display
            const displayContent = parsedJson?.answer || message.content;

            return (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] ${
                    message.role === "user"
                      ? "bg-brand-accent text-white rounded-2xl rounded-tr-sm"
                      : "bg-white border border-brand-lavender-light/20 rounded-2xl rounded-tl-sm"
                  } p-4 shadow-sm space-y-3`}
                >
                  {/* Message Content */}
                  <div
                    className={
                      message.role === "user"
                        ? "text-white [&_*]:text-white"
                        : "text-brand-text-primary [&_*]:text-brand-text-primary"
                    }
                  >
                    <ReactMarkdown>{displayContent}</ReactMarkdown>
                  </div>

                  {/* Action Summary for AI messages */}
                  {message.role === "assistant" &&
                    parsedJson &&
                    parsedJson.action !== "none" &&
                    parsedJson.action_context &&
                    Object.keys(parsedJson.action_context).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-brand-lavender-light/20">
                        <div className="flex items-center gap-2 text-sm text-brand-text-secondary">
                          <div className="p-1.5 rounded-md bg-brand-lavender-light/10">
                            {(() => {
                              switch (parsedJson.action) {
                                case "redirect":
                                  return (
                                    <FaExternalLinkAlt className="w-3.5 h-3.5 text-brand-accent" />
                                  );
                                case "scroll":
                                  return (
                                    <FaArrowDown className="w-3.5 h-3.5 text-brand-accent" />
                                  );
                                case "click":
                                  return (
                                    <FaMousePointer className="w-3.5 h-3.5 text-brand-accent" />
                                  );
                                case "fill_form":
                                  return (
                                    <FaWpforms className="w-3.5 h-3.5 text-brand-accent" />
                                  );
                                case "purchase":
                                  return (
                                    <FaShoppingCart className="w-3.5 h-3.5 text-brand-accent" />
                                  );
                                case "track_order":
                                  return (
                                    <FaTruck className="w-3.5 h-3.5 text-brand-accent" />
                                  );
                                case "return_order":
                                  return (
                                    <FaUndo className="w-3.5 h-3.5 text-brand-accent" />
                                  );
                                case "login":
                                  return (
                                    <FaSignInAlt className="w-3.5 h-3.5 text-brand-accent" />
                                  );
                                case "logout":
                                  return (
                                    <FaSignOutAlt className="w-3.5 h-3.5 text-brand-accent" />
                                  );
                                case "account_reset":
                                  return (
                                    <FaRedo className="w-3.5 h-3.5 text-brand-accent" />
                                  );
                                case "scheduler":
                                  return (
                                    <FaCalendarAlt className="w-3.5 h-3.5 text-brand-accent" />
                                  );
                                case "highlight_text":
                                  return (
                                    <FaHighlighter className="w-3.5 h-3.5 text-brand-accent" />
                                  );
                                case "start_subscription":
                                  return (
                                    <FaPlay className="w-3.5 h-3.5 text-brand-accent" />
                                  );
                                case "end_subscription":
                                  return (
                                    <FaStop className="w-3.5 h-3.5 text-brand-accent" />
                                  );
                                default:
                                  return (
                                    <FaCode className="w-3.5 h-3.5 text-brand-accent" />
                                  );
                              }
                            })()}
                          </div>
                          <span>
                            {(() => {
                              const ctx = parsedJson.action_context;
                              switch (parsedJson.action) {
                                case "redirect":
                                  return (
                                    <>
                                      Redirected to:{" "}
                                      <span className="font-medium text-brand-text-primary">
                                        {ctx.url}
                                      </span>
                                    </>
                                  );
                                case "scroll":
                                  return (
                                    <>
                                      Scrolled to section:{" "}
                                      <span className="font-medium text-brand-text-primary">
                                        {ctx.section_id}
                                      </span>
                                    </>
                                  );
                                case "click":
                                  return ctx.button_text ? (
                                    <>
                                      Clicked button:{" "}
                                      <span className="font-medium text-brand-text-primary">
                                        {ctx.button_text}
                                      </span>
                                    </>
                                  ) : ctx.link_text ? (
                                    <>
                                      Clicked link:{" "}
                                      <span className="font-medium text-brand-text-primary">
                                        {ctx.link_text}
                                      </span>
                                    </>
                                  ) : (
                                    <>Clicked element</>
                                  );
                                case "fill_form":
                                  return ctx.form_id ? (
                                    <>
                                      Filled form:{" "}
                                      <span className="font-medium text-brand-text-primary">
                                        {ctx.form_id}
                                      </span>
                                    </>
                                  ) : (
                                    <>Filled a form</>
                                  );
                                case "purchase":
                                  return ctx.product_name ? (
                                    <>
                                      Purchased:{" "}
                                      <span className="font-medium text-brand-text-primary">
                                        {ctx.product_name}
                                      </span>
                                    </>
                                  ) : (
                                    <>Made a purchase</>
                                  );
                                case "track_order":
                                  return <>Tracked an order</>;
                                case "return_order":
                                  return <>Processed a return</>;
                                case "login":
                                  return <>Logged in</>;
                                case "logout":
                                  return <>Logged out</>;
                                case "account_reset":
                                  return <>Account reset</>;
                                case "scheduler":
                                  return <>Scheduled an event</>;
                                case "highlight_text":
                                  return ctx.exact_text ? (
                                    <>
                                      Highlighted text:{" "}
                                      <span className="font-medium text-brand-text-primary">
                                        {ctx.exact_text}
                                      </span>
                                    </>
                                  ) : (
                                    <>Highlighted text</>
                                  );
                                case "start_subscription":
                                  return <>Started a subscription</>;
                                case "end_subscription":
                                  return <>Ended a subscription</>;
                                default:
                                  return (
                                    <>
                                      Action:{" "}
                                      <span className="font-medium text-brand-text-primary">
                                        {parsedJson.action}
                                      </span>
                                    </>
                                  );
                              }
                            })()}
                          </span>
                        </div>
                      </div>
                    )}

                  {/* Timestamp */}
                  <div
                    className={`text-xs ${
                      message.role === "user"
                        ? "text-white/80"
                        : "text-brand-text-secondary"
                    }`}
                  >
                    {new Date(message.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
