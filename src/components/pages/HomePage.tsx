/**
 * AquaBloom Public Website — Home Page (/)
 * 
 * Premium corporate gold + black aesthetic.
 * Executive introduction to the physical bottle advertising marketplace.
 */

import React from 'react';
import { ArrowRight, ShieldCheck, Layers, QrCode, Truck, Building2, Factory, Sparkles } from 'lucide-react';

interface HomePageProps {
  navigate: (path: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ navigate }) => {
  return (
    <div className="relative overflow-hidden bg-[#08080a] text-white">
      {/* Hero Section */}
      <section className="relative px-4 pt-16 pb-24 sm:px-6 lg:px-8 lg:pt-24 lg:pb-32">
        {/* Subtle geometric ambient gradient */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-25">
          <div className="h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-[#c5a059]/20 via-[#d4af37]/10 to-transparent blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl text-center">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center space-x-2 rounded-full border border-[#c5a059]/30 bg-[#121217] px-4 py-1.5 text-xs text-[#c5a059]">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="font-semibold uppercase tracking-wider">
              Physical Media Meets Digital Precision
            </span>
          </div>

          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-[#f5f5f7] sm:text-5xl lg:text-6xl">
            The Enterprise Marketplace for{' '}
            <span className="bg-gradient-to-r from-[#d4af37] via-[#f3e5ab] to-[#c5a059] bg-clip-text text-transparent">
              Bottle Advertising
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base text-[#9e9ea8] sm:text-lg leading-relaxed">
            AquaBloom connects advertisers, hosting venues, verified bottling suppliers, and specialized logistics networks to deliver high-attention branded refreshment at high-value commercial touchpoints.
          </p>

          {/* Action CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/get-started')}
              className="group flex w-full sm:w-auto items-center justify-center space-x-2 rounded-lg bg-gradient-to-r from-[#c5a059] to-[#d4af37] px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-[#09090c] shadow-lg shadow-[#c5a059]/10 transition hover:opacity-95"
            >
              <span>GET STARTED AS A PARTICIPANT</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>

            <button
              onClick={() => navigate('/ecosystem')}
              className="flex w-full sm:w-auto items-center justify-center space-x-2 rounded-lg border border-[#2d2d38] bg-[#0e0e13] px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#d4d4dc] transition hover:border-[#c5a059]/60 hover:text-white"
            >
              <span>EXPLORE THE ECOSYSTEM</span>
            </button>
          </div>

          {/* Institutional Trust Badges */}
          <div className="mt-16 grid grid-cols-2 gap-4 border-t border-[#1e1e26] pt-10 sm:grid-cols-4">
            <div className="border-r border-[#1a1a22] pr-4 text-left">
              <span className="font-display text-2xl font-bold text-[#d4af37]">4-Pillar</span>
              <p className="mt-0.5 text-xs uppercase tracking-wider text-[#737380]">Closed-Loop Marketplace</p>
            </div>
            <div className="border-r border-[#1a1a22] pr-4 text-left">
              <span className="font-display text-2xl font-bold text-white">100%</span>
              <p className="mt-0.5 text-xs uppercase tracking-wider text-[#737380]">Verified Physical Placement</p>
            </div>
            <div className="border-r border-[#1a1a22] pr-4 text-left">
              <span className="font-display text-2xl font-bold text-[#d4af37]">Enterprise</span>
              <p className="mt-0.5 text-xs uppercase tracking-wider text-[#737380]">Grade Security Standards</p>
            </div>
            <div className="text-left">
              <span className="font-display text-2xl font-bold text-white">Single</span>
              <p className="mt-0.5 text-xs uppercase tracking-wider text-[#737380]">Unified Settlement Framework</p>
            </div>
          </div>
        </div>
      </section>

      {/* The 4 Marketplace Pillars */}
      <section className="border-t border-[#1e1e26] bg-[#0b0b0e] py-20 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="font-display text-2xl font-bold text-[#f5f5f7] sm:text-3xl">
              Engineered for Four Commercial Participants
            </h2>
            <p className="mt-3 text-sm text-[#8a8a99] leading-relaxed">
              AquaBloom synchronizes the entire lifecycle of physical refreshment advertising into an automated, auditable transaction ecosystem.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Pillar 1: Advertisers */}
            <div className="group rounded-xl border border-[#22222b] bg-[#111116] p-6 transition hover:border-[#c5a059]/60 hover:bg-[#14141a]">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#c5a059]/30 bg-[#171720] text-[#c5a059]">
                <Layers className="h-6 w-6" />
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-white">1. Advertisers</h3>
              <p className="mt-2 text-xs text-[#828291] leading-relaxed">
                Reach high-intent audiences with tactile, premium water bottle branding paired with measurable digital engagement.
              </p>
              <div className="mt-4 border-t border-[#1d1d26] pt-3 text-[11px] font-semibold text-[#c5a059]">
                Role: ADVERTISER
              </div>
            </div>

            {/* Pillar 2: Venues */}
            <div className="group rounded-xl border border-[#22222b] bg-[#111116] p-6 transition hover:border-[#c5a059]/60 hover:bg-[#14141a]">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#c5a059]/30 bg-[#171720] text-[#c5a059]">
                <Building2 className="h-6 w-6" />
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-white">2. Hosting Venues</h3>
              <p className="mt-2 text-xs text-[#828291] leading-relaxed">
                Hotels, corporate centers, conventions, and athletic venues provide sponsored premium water while reducing guest overhead.
              </p>
              <div className="mt-4 border-t border-[#1d1d26] pt-3 text-[11px] font-semibold text-[#c5a059]">
                Role: VENUE
              </div>
            </div>

            {/* Pillar 3: Suppliers */}
            <div className="group rounded-xl border border-[#22222b] bg-[#111116] p-6 transition hover:border-[#c5a059]/60 hover:bg-[#14141a]">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#c5a059]/30 bg-[#171720] text-[#c5a059]">
                <Factory className="h-6 w-6" />
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-white">3. Suppliers</h3>
              <p className="mt-2 text-xs text-[#828291] leading-relaxed">
                Certified water bottling plants and high-precision label converters fulfill standardized production batch specifications.
              </p>
              <div className="mt-4 border-t border-[#1d1d26] pt-3 text-[11px] font-semibold text-[#c5a059]">
                Role: SUPPLIER
              </div>
            </div>

            {/* Pillar 4: Logistics */}
            <div className="group rounded-xl border border-[#22222b] bg-[#111116] p-6 transition hover:border-[#c5a059]/60 hover:bg-[#14141a]">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#c5a059]/30 bg-[#171720] text-[#c5a059]">
                <Truck className="h-6 w-6" />
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-white">4. Logistics Partners</h3>
              <p className="mt-2 text-xs text-[#828291] leading-relaxed">
                Regional transport providers execute audited end-to-end delivery from production facilities directly to verified venue docks.
              </p>
              <div className="mt-4 border-t border-[#1d1d26] pt-3 text-[11px] font-semibold text-[#c5a059]">
                Role: LOGISTICS_PARTNER
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Architectural Integrity Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-[#1e1e26] bg-[#09090c]">
        <div className="mx-auto max-w-5xl rounded-2xl border border-[#262633] bg-[#0e0e14] p-8 sm:p-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="max-w-xl">
              <div className="flex items-center space-x-2 text-[#c5a059] text-xs font-bold uppercase tracking-wider">
                <ShieldCheck className="h-4 w-4" />
                <span>Enterprise Architecture Foundation</span>
              </div>
              <h3 className="mt-3 font-display text-2xl font-bold text-white">
                Audited Identity, Role Boundaries, and Non-Sequential ID Tracking
              </h3>
              <p className="mt-3 text-xs text-[#8f8f9e] leading-relaxed">
                AquaBloom is architected around strict backend authorization, visibility scopes (Private, Role-Shared, Transaction-Shared, Internal Admin), and event-driven audit trails.
              </p>
            </div>
            <div className="flex flex-col gap-3 shrink-0">
              <button
                onClick={() => navigate('/get-started')}
                className="rounded-lg bg-[#c5a059] px-6 py-3 text-xs font-bold uppercase tracking-wider text-black transition hover:opacity-90"
              >
                Register Your Organization
              </button>
              <button
                onClick={() => navigate('/about')}
                className="rounded-lg border border-[#2d2d3a] px-6 py-3 text-xs font-semibold uppercase tracking-wider text-[#a0a0b0] hover:text-white"
              >
                Read Architectural Blueprint
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
