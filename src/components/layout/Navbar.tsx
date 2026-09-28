/**
 * AquaBloom Public Website Navigation Header
 * 
 * Strict compliance with brand guidelines:
 * - Premium corporate gold + black
 * - Navigation links: HOME, THE AQUABLOOM ECOSYSTEM, SOLUTIONS, PLANS, ABOUT, CONTACT
 * - Primary CTA: GET STARTED
 * - Secondary CTA: LOGIN
 * - Never shows Admin publicly
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { Shield, Menu, X, ArrowRight, UserCircle, LogOut, ExternalLink } from 'lucide-react';

interface NavbarProps {
  currentPath: string;
  navigate: (path: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPath, navigate }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'HOME', path: '/' },
    { label: 'THE AQUABLOOM ECOSYSTEM', path: '/ecosystem' },
    { label: 'VENUES', path: '/venues' },
    { label: 'SOLUTIONS', path: '/solutions' },
    { label: 'PLANS', path: '/plans' },
    { label: 'ABOUT', path: '/about' },
    { label: 'CONTACT', path: '/contact' },
  ];

  const getPortalPathForRole = (role?: string) => {
    switch (role) {
      case 'ADVERTISER':
        return '/portal/advertiser';
      case 'VENUE':
        return '/portal/venue';
      case 'SUPPLIER':
        return '/portal/supplier';
      case 'LOGISTICS_PARTNER':
        return '/portal/logistics';
      case 'ADMIN':
        return '/portal/admin';
      default:
        return '/login';
    }
  };

  const handleNav = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#23232b] bg-[#09090c]/90 backdrop-blur-md">
      {/* Subtle top gold highlight line */}
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#c5a059] to-transparent opacity-75" />

      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Identity */}
        <button
          onClick={() => handleNav('/')}
          className="group flex items-center space-x-3 text-left focus:outline-none"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded border border-[#c5a059]/40 bg-[#121217] transition-colors group-hover:border-[#c5a059]">
            <span className="font-display text-lg font-bold tracking-wider text-[#d4af37]">AB</span>
          </div>
          <div>
            <span className="font-display text-lg font-bold tracking-widest text-[#f5f5f7]">
              AQUABLOOM
            </span>
            <span className="block text-[9px] font-semibold uppercase tracking-[0.25em] text-[#a3a3b0]">
              Physical Advertising Infrastructure
            </span>
          </div>
        </button>

        {/* Desktop Navigation */}
        <nav className="hidden items-center space-x-1 lg:flex xl:space-x-4">
          {navLinks.map((link) => {
            const isActive = currentPath === link.path;
            return (
              <button
                key={link.path}
                onClick={() => handleNav(link.path)}
                className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  isActive
                    ? 'text-[#d4af37] border-b-2 border-[#c5a059]'
                    : 'text-[#a3a3b0] hover:text-[#f5f5f7]'
                }`}
              >
                {link.label}
              </button>
            );
          })}
        </nav>

        {/* Action CTAs */}
        <div className="hidden items-center space-x-3 sm:flex">
          {isAuthenticated && user ? (
            <div className="flex items-center space-x-3">
              <button
                onClick={() => handleNav(getPortalPathForRole(user.role))}
                className="flex items-center space-x-2 rounded border border-[#c5a059]/40 bg-[#14141a] px-3.5 py-1.5 text-xs font-medium text-[#f0f0f4] transition hover:border-[#c5a059] hover:bg-[#1a1a24]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#c5a059]" />
                <span className="text-[#c5a059] font-semibold">{user.role.replace('_', ' ')}</span>
                <span className="text-[#757582]">|</span>
                <span>Portal</span>
                <ArrowRight className="h-3.5 w-3.5 text-[#c5a059]" />
              </button>

              <button
                onClick={logout}
                title="Logout"
                className="flex items-center rounded border border-[#2d2d38] p-2 text-[#8b8b99] transition hover:border-[#4b4b5c] hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              {/* Secondary CTA: LOGIN */}
              <button
                onClick={() => handleNav('/login')}
                className={`rounded border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition ${
                  currentPath === '/login'
                    ? 'border-[#c5a059] text-[#c5a059]'
                    : 'border-[#2d2d38] text-[#c9c9d4] hover:border-[#4b4b5c] hover:text-[#f5f5f7]'
                }`}
              >
                LOGIN
              </button>

              {/* Primary CTA: GET STARTED */}
              <button
                onClick={() => handleNav('/get-started')}
                className="flex items-center space-x-1.5 rounded bg-gradient-to-r from-[#c5a059] to-[#d4af37] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#0a0a0d] shadow-sm transition hover:opacity-90 active:scale-[0.98]"
              >
                <span>GET STARTED</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Mobile menu trigger */}
        <div className="flex items-center lg:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded border border-[#272733] p-2 text-[#a3a3b0] hover:text-white"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-[#23232b] bg-[#0c0c10] px-4 py-6 lg:hidden">
          <div className="flex flex-col space-y-3">
            {navLinks.map((link) => (
              <button
                key={link.path}
                onClick={() => handleNav(link.path)}
                className={`text-left py-2 text-sm font-semibold tracking-wider ${
                  currentPath === link.path ? 'text-[#c5a059]' : 'text-[#a3a3b0]'
                }`}
              >
                {link.label}
              </button>
            ))}

            <div className="pt-4 border-t border-[#23232b] flex flex-col space-y-3">
              {isAuthenticated && user ? (
                <>
                  <button
                    onClick={() => handleNav(getPortalPathForRole(user.role))}
                    className="flex items-center justify-between rounded border border-[#c5a059] bg-[#14141a] px-4 py-2.5 text-sm font-medium text-white"
                  >
                    <span>Go to {user.role.replace('_', ' ')} Portal</span>
                    <ArrowRight className="h-4 w-4 text-[#c5a059]" />
                  </button>
                  <button
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="flex items-center justify-center space-x-2 rounded border border-[#2d2d38] py-2 text-sm text-[#8b8b99]"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleNav('/login')}
                    className="rounded border border-[#2d2d38] py-2.5 text-xs font-bold uppercase tracking-wider text-white"
                  >
                    LOGIN
                  </button>
                  <button
                    onClick={() => handleNav('/get-started')}
                    className="rounded bg-[#c5a059] py-2.5 text-xs font-bold uppercase tracking-wider text-black"
                  >
                    GET STARTED
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
