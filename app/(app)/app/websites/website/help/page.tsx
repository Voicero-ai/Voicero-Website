"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FaQuestionCircle,
  FaRobot,
  FaEdit,
  FaCheckCircle,
  FaEye,
  FaBold,
  FaItalic,
  FaListUl,
  FaListOl,
  FaLink,
  FaTable,
  FaHeading,
  FaQuoteLeft,
  FaTrash,
  FaCode,
} from "react-icons/fa";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import dynamic from "next/dynamic";
import { marked } from "marked";
import TurndownService from "turndown";
const ReactQuill = dynamic(() => import("react-quill-new"), {
  ssr: false,
} as any);
import "react-quill-new/dist/quill.snow.css";

interface HelpQuestion {
  id: string;
  question: string;
  number: number;
  type: "ai" | "manual";
  status: "draft" | "published";
  documentAnswer: string;
}

export default function HelpPage() {
  const searchParams = useSearchParams();
  const websiteId = searchParams.get("id");
  const [questions, setQuestions] = useState<HelpQuestion[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<HelpQuestion | null>(
    null
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editQuestion, setEditQuestion] = useState("");
  const turndown = new TurndownService();

  const quillModules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ["bold", "italic", "underline", "strike"],
      [{ list: "ordered" }, { list: "bullet" }],
      ["blockquote", "code"],
      ["link"],
      ["clean"],
    ],
  } as const;

  const quillFormats = [
    "header",
    "bold",
    "italic",
    "underline",
    "strike",
    "list",
    "bullet",
    "blockquote",
    "code",
    "link",
  ];

  // Removed TipTap setup

  useEffect(() => {
    const loadModules = async () => {
      if (!websiteId) return;
      try {
        const res = await fetch(`/api/helpCenter/get?websiteId=${websiteId}`);
        const data = await res.json();
        if (data?.modules) {
          setQuestions(data.modules);
          setSelectedQuestion(data.modules[0] || null);
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadModules();
  }, [websiteId]);

  useEffect(() => {
    if (isEditing && selectedQuestion) {
      const md = selectedQuestion.documentAnswer || "";
      const html = (marked.parse(md) as string) || "";
      setEditContent(html);
      setEditQuestion(selectedQuestion.question);
    }
  }, [isEditing, selectedQuestion]);

  const handleAdd = async () => {
    if (!websiteId) return;
    const nextNumber = questions.length
      ? Math.max(...questions.map((q) => q.number)) + 1
      : 1;
    const body = {
      websiteId,
      question: "New question",
      documentAnswer: "",
      number: nextNumber,
      type: "manual",
      status: "draft",
    } as const;
    const res = await fetch(`/api/helpCenter/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data?.id) {
      const newQ: HelpQuestion = {
        id: data.id,
        question: body.question,
        documentAnswer: body.documentAnswer,
        number: body.number,
        type: body.type,
        status: body.status,
      };
      const updated = [...questions, newQ].sort((a, b) => a.number - b.number);
      setQuestions(updated);
      setSelectedQuestion(newQ);
      setIsEditing(true);
      setEditContent("");
      setEditQuestion(newQ.question);
    }
  };

  const handleDelete = async (id: string) => {
    if (!websiteId) return;
    await fetch(`/api/helpCenter/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, websiteId }),
    });
    const remaining = questions.filter((q) => q.id !== id);
    setQuestions(remaining);
    setSelectedQuestion(remaining[0] || null);
    setIsEditing(false);
    setEditContent("");
  };

  const handleSave = async () => {
    if (!websiteId || !selectedQuestion) return;
    // Convert current HTML from editor to markdown before saving
    const markdownToSave = turndown.turndown(editContent || "");
    await fetch(`/api/helpCenter/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedQuestion.id,
        websiteId,
        question: editQuestion,
        documentAnswer: markdownToSave,
      }),
    });
    const updated = questions.map((q) =>
      q.id === selectedQuestion.id
        ? { ...q, question: editQuestion, documentAnswer: markdownToSave }
        : q
    );
    setQuestions(updated);
    setSelectedQuestion({
      ...selectedQuestion,
      question: editQuestion,
      documentAnswer: markdownToSave,
    });
    setIsEditing(false);
  };

  const togglePublish = async () => {
    if (!websiteId || !selectedQuestion) return;
    const newStatus: HelpQuestion["status"] =
      selectedQuestion.status === "published" ? "draft" : "published";
    await fetch(`/api/helpCenter/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedQuestion.id,
        websiteId,
        status: newStatus,
      }),
    });
    const updated = questions.map((q) =>
      q.id === selectedQuestion.id ? { ...q, status: newStatus } : q
    );
    setQuestions(updated);
    setSelectedQuestion({ ...selectedQuestion, status: newStatus });
  };

  // TipTap handles formatting; legacy markdown helper removed

  if (!websiteId) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          Missing website id.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-brand-text-primary mb-2">
          Help Center
        </h1>
        <p className="text-brand-text-secondary">
          Find answers to common questions and learn how to use our platform
          effectively.
        </p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <div className="w-80 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/30 p-6">
            <h2 className="text-lg font-semibold text-brand-text-primary mb-4 flex items-center gap-2">
              <FaQuestionCircle className="text-brand-accent" />
              Questions
            </h2>
            <div className="mb-4">
              <button
                onClick={handleAdd}
                className="w-full px-4 py-2 bg-brand-accent text-white rounded-lg hover:bg-brand-accent/90"
              >
                Add Question
              </button>
            </div>
            <div className="space-y-3">
              {questions.map((question) => (
                <button
                  key={question.id}
                  onClick={() => setSelectedQuestion(question)}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    selectedQuestion?.id === question.id
                      ? "border-brand-accent bg-brand-accent/5"
                      : "border-brand-lavender-light/20 hover:border-brand-lavender-light/40"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-sm font-medium text-brand-text-primary">
                      {question.question}
                    </span>
                    <span className="text-xs text-brand-text-secondary bg-brand-lavender-light/20 px-2 py-1 rounded">
                      #{question.number}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {question.type === "ai" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                        <FaRobot className="w-3 h-3" />
                        AI Generated
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                        <FaEdit className="w-3 h-3" />
                        Manual
                      </span>
                    )}

                    {question.status === "published" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                        <FaCheckCircle className="w-3 h-3" />
                        Published
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                        <FaEye className="w-3 h-3" />
                        Draft
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          {selectedQuestion && (
            <div className="space-y-6">
              {/* Question Header */}
              <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/30 p-6">
                <div className="mb-4">
                  <h2 className="text-2xl font-bold text-brand-text-primary mb-3">
                    {selectedQuestion.question}
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-brand-text-secondary bg-brand-lavender-light/20 px-3 py-1 rounded">
                      #{selectedQuestion.number}
                    </span>
                    {selectedQuestion.type === "ai" ? (
                      <span className="inline-flex items-center gap-1 text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded">
                        <FaRobot className="w-4 h-4" />
                        AI Generated
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm text-green-600 bg-green-50 px-3 py-1 rounded">
                        <FaEdit className="w-4 h-4" />
                        Manual
                      </span>
                    )}
                    {selectedQuestion.status === "published" ? (
                      <span className="inline-flex items-center gap-1 text-sm text-green-600 bg-green-50 px-3 py-1 rounded">
                        <FaCheckCircle className="w-4 h-4" />
                        Published
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm text-amber-600 bg-amber-50 px-3 py-1 rounded">
                        <FaEye className="w-4 h-4" />
                        Draft
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-4 border-t border-brand-lavender-light/20">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          setEditContent("");
                        }}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                      >
                        <FaCheckCircle className="w-4 h-4" />
                        Save Changes
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setIsEditing(true);
                          setEditContent(selectedQuestion.documentAnswer);
                          setEditQuestion(selectedQuestion.question);
                        }}
                        className="px-4 py-2 bg-brand-accent text-white rounded-lg hover:bg-brand-accent/90 flex items-center gap-2"
                      >
                        <FaEdit className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={togglePublish}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                      >
                        {selectedQuestion.status === "published" ? (
                          <FaEye className="w-4 h-4" />
                        ) : (
                          <FaCheckCircle className="w-4 h-4" />
                        )}
                        {selectedQuestion.status === "published"
                          ? "Unpublish"
                          : "Publish"}
                      </button>
                      <button
                        onClick={() => handleDelete(selectedQuestion.id)}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                      >
                        <FaTrash className="w-4 h-4" />
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Article Content */}
              <div className="bg-white rounded-xl shadow-sm border border-brand-lavender-light/30 p-6">
                {isEditing ? (
                  <div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Question Title
                      </label>
                      <input
                        type="text"
                        value={editQuestion}
                        onChange={(e) => setEditQuestion(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg text-black"
                        placeholder="Enter the question title"
                      />
                    </div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Rich Text Editor
                    </label>

                    <div className="border border-gray-300 rounded-lg">
                      <ReactQuill
                        theme="snow"
                        value={editContent}
                        onChange={(html: string) => {
                          setEditContent(html);
                        }}
                        modules={quillModules as any}
                        formats={quillFormats as any}
                        className="text-black [&_*]:text-black"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="max-w-none text-black [&_*]:text-black">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSlug, rehypeAutolinkHeadings]}
                      components={{
                        h1: ({ node, ...props }) => (
                          <h1
                            className="text-lg font-semibold mt-2 mb-2"
                            {...props}
                          />
                        ),
                        h2: ({ node, ...props }) => (
                          <h2
                            className="text-base font-semibold mt-2 mb-1.5"
                            {...props}
                          />
                        ),
                        h3: ({ node, ...props }) => (
                          <h3
                            className="text-sm font-semibold mt-1.5 mb-1"
                            {...props}
                          />
                        ),
                        p: ({ node, ...props }) => (
                          <p className="my-1.5 leading-snug" {...props} />
                        ),
                        ul: ({ node, ...props }) => (
                          <ul className="list-disc pl-6 my-2" {...props} />
                        ),
                        ol: ({ node, ...props }) => (
                          <ol className="list-decimal pl-7 my-2" {...props} />
                        ),
                        li: ({ node, ...props }) => (
                          <li className="my-1 ml-1" {...props} />
                        ),
                        blockquote: ({ node, ...props }) => (
                          <blockquote
                            className="border-l-2 border-gray-300 pl-3 my-2"
                            {...props}
                          />
                        ),
                        code: ({ node, ...props }: any) => (
                          <code
                            className={
                              "px-1 py-0.5 rounded bg-gray-100 text-black"
                            }
                            {...props}
                          />
                        ),
                        pre: ({ node, ...props }) => (
                          <pre
                            className="p-2 rounded bg-gray-100 overflow-auto my-2"
                            {...props}
                          />
                        ),
                      }}
                    >
                      {selectedQuestion.documentAnswer}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
