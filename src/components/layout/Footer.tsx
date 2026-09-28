/**
 * AquaBloom Public Website Footer
 * 
 * Corporate gold + black layout with architectural status.
 */

import React from 'react';
import { ShieldCheck, Globe, Lock } from 'lucide-react';

interface FooterProps {
  navigate: (path: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ navigate }) => {
  return (
    <footer className="border-t border-[#23232b] bg-[#070709] text-[#8e8e9c]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:gap-12">
          {/* Column 1: Brand & Identity */}
          <div className="md:col-span-1">
            <div className="flex items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded border border-[#c5a059]/40 bg-[#121217]">
                <span className="font-display text-sm font-bold text-[#d4af37]">AB</span>
              </div>
              <span className="font-display text-base font-bold tracking-widest text-[#f5f5f7]">
                AQUABLOOM
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#858594]">
              The premier corporate marketplace connecting Advertisers, Hosting Venues, Production Suppliers, and Logistics Partners through high-attention physical bottle advertising.
            </p>
            <div className="mt-4 flex items-center space-x-2 text-[11px] text-[#c5a059]">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Enterprise Grade Security Architecture</span>
            </div>
          </div>

          {/* Column 2: Ecosystem */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-[#dcdce5]">
              Ecosystem
            </h4>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <button
                  onClick={() => navigate('/ecosystem')}
                  className="hover:text-[#c5a059] transition-colors"
                >
                  Marketplace Overview
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('/solutions')}
                  className="hover:text-[#c5a059] transition-colors"
                >
                  Commercial Venues
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('/solutions')}
                  className="hover:text-[#c5a059] transition-colors"
                >
                  Enterprise Advertisers
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('/solutions')}
                  className="hover:text-[#c5a059] transition-colors"
                >
                  Bottling & Logistics Network
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Corporate */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-[#dcdce5]">
              Corporate
            </h4>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <button
                  onClick={() => navigate('/about')}
                  className="hover:text-[#c5a059] transition-colors"
                >
                  About AquaBloom
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('/plans')}
                  className="hover:text-[#c5a059] transition-colors"
                >
                  Participation Plans
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('/contact')}
                  className="hover:text-[#c5a059] transition-colors"
                >
                  Contact & Inquiries
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('/login')}
                  className="hover:text-[#c5a059] transition-colors flex items-center space-x-1"
                >
                  <span>Participant Login</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: Architectural Status & Integrity */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-[#dcdce5]">
              System Status
            </h4>
            <div className="mt-3 rounded border border-[#23232b] bg-[#0d0d12] p-3 text-xs">
              <div className="flex items-center space-x-2 text-[#4ade80]">
                <span className="h-2 w-2 rounded-full bg-[#22c55e] animate-pulse" />
                <span className="font-semibold text-[11px] uppercase tracking-wider">
                  Foundation Core Active
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#717180]">
                Step 1: Role architecture, session management, and reliability guardrails operational.
              </p>
            </div>
            <div className="mt-3 flex items-center space-x-1.5 text-[11px] text-[#636373]">
              <Lock className="h-3 w-3" />
              <span>Internal Admin Boundary Protected</span>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-[#1c1c24] pt-6 flex flex-col sm:flex-row items-center justify-between text-[11px] text-[#636373]">
          <p>© {new Date().getFullYear()} AquaBloom Global Advertising Technologies Inc. All rights reserved.</p>
          <div className="mt-2 sm:mt-0 flex space-x-4">
            <span>Corporate Terms</span>
            <span>Privacy Standards</span>
            <span>Security Framework</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
