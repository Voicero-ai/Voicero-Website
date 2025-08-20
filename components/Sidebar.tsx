"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  FaChartBar,
  FaKey,
  FaComments,
  FaGlobe,
  FaCog,
  FaSignOutAlt,
  FaBars,
  FaTimes,
  FaBook,
  FaUserCircle,
  FaHeadset,
} from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "../contexts/UserContext";

const menuItems = [
  { name: "Dashboard", icon: FaChartBar, path: "/app" },
  { name: "Access Keys", icon: FaKey, path: "/app/access-keys" },
  { name: "Chats", icon: FaComments, path: "/app/chats" },
  { name: "Websites", icon: FaGlobe, path: "/app/websites" },
  { name: "Documentation", icon: FaBook, path: "/docs" },
  { name: "Settings", icon: FaCog, path: "/app/settings" },
];

const Sidebar = () => {
  const { user } = useUser();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const UserProfile = () => (
    <div className="flex items-center gap-3 px-4 py-2">
      {user?.profilePicture ? (
        <img
          src={user.profilePicture}
          alt="Profile"
          className="w-10 h-10 rounded-full object-cover"
        />
      ) : (
        <FaUserCircle className="w-10 h-10 text-brand-text-secondary" />
      )}
      <div>
        <p className="font-medium text-brand-text-primary">{user?.name}</p>
        <p className="text-sm text-brand-text-secondary">@{user?.username}</p>
      </div>
    </div>
  );

  // Render menu item with notification badge if needed
  const renderMenuItem = (item: {
    name: string;
    icon: React.ElementType;
    path: string;
  }) => {
    const isActive = pathname === item.path;

    return (
      <li key={item.path}>
        <Link href={item.path} onClick={() => setIsOpen(false)}>
          <motion.div
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.98 }}
            className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors
                      ${
                        isActive
                          ? "bg-brand-accent/10 text-brand-accent"
                          : "text-brand-text-secondary hover:bg-brand-lavender-light/5"
                      }`}
          >
            <item.icon className="w-5 h-5" />
            <span>{item.name}</span>
          </motion.div>
        </Link>
      </li>
    );
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 right-4 z-50 p-2 bg-white rounded-lg shadow-lg border border-brand-lavender-light/20"
      >
        {isOpen ? <FaTimes size={24} /> : <FaBars size={24} />}
      </button>

      {/* Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="md:hidden fixed inset-0 bg-black/50 z-40"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div
        className="fixed top-0 left-0 h-screen bg-white border-r border-brand-lavender-light/20 
                  z-50 w-64 hidden md:block"
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-brand-lavender-light/20">
          <Link href="/app" className="flex items-center gap-2">
            <img
              src="/logos/logoNoBackground.png"
              alt="Voicero.AI Logo"
              className="w-12 h-12 object-contain"
            />
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-accent to-brand-lavender-dark">
              Voicero.AI
            </h1>
          </Link>
        </div>

        {/* User Profile */}
        <div className="p-4 border-b border-brand-lavender-light/20">
          <UserProfile />
        </div>

        {/* Navigation */}
        <nav className="p-4 flex flex-col h-[calc(100vh-13rem)]">
          <div className="flex-1">
            <ul className="space-y-2">
              {menuItems.map((item) => renderMenuItem(item))}
            </ul>
          </div>

          {/* Bottom Section */}
          <div className="border-t border-brand-lavender-light/20 pt-4">
            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-3 px-4 py-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <FaSignOutAlt className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile Sidebar */}
      <motion.div
        initial={false}
        animate={{ x: isOpen ? 0 : "-100%" }}
        className="fixed top-0 left-0 h-screen bg-white border-r border-brand-lavender-light/20 
                  z-50 w-64 md:hidden"
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-brand-lavender-light/20">
          <Link href="/app" className="flex items-center gap-2">
            <img
              src="/logos/logoNoBackground.png"
              alt="Voicero.AI Logo"
              className="w-12 h-12 object-contain"
            />
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-accent to-brand-lavender-dark">
              Voicero.AI
            </h1>
          </Link>
        </div>

        {/* User Profile */}
        <div className="p-4 border-b border-brand-lavender-light/20">
          <UserProfile />
        </div>

        {/* Navigation */}
        <nav className="p-4 flex flex-col h-[calc(100vh-13rem)]">
          <div className="flex-1">
            <ul className="space-y-2">
              {menuItems.map((item) => renderMenuItem(item))}
            </ul>
          </div>

          {/* Bottom Section */}
          <div className="border-t border-brand-lavender-light/20 pt-4">
            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-3 px-4 py-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <FaSignOutAlt className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </div>
        </nav>
      </motion.div>
    </>
  );
};

export default Sidebar;
