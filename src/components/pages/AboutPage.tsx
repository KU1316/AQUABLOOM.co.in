/**
 * AquaBloom Public Website — About (/about)
 * 
 * Corporate background, mission, and technology-driven physical media infrastructure.
 */

import React from 'react';
import { ShieldCheck, Target, Globe, Award } from 'lucide-react';

interface AboutPageProps {
  navigate: (path: string) => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ navigate }) => {
  return (
    <div className="bg-[#08080a] text-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="text-center max-w-3xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-widest text-[#c5a059]">
            Corporate Profile
          </span>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Pioneering Physical Advertising Infrastructure
          </h1>
          <p className="mt-4 text-sm text-[#9b9ba8] leading-relaxed">
            AquaBloom was founded to transform standard commercial hydration into a verifiable, high-retention corporate media channel.
          </p>
        </div>

        {/* Narrative */}
        <div className="mt-14 rounded-2xl border border-[#23232f] bg-[#0d0d12] p-8 sm:p-12 space-y-6 text-sm text-[#9c9cad] leading-relaxed">
          <h3 className="font-display text-2xl font-bold text-white">
            The Intersection of Essential Hydration and Brand Attention
          </h3>
          <p>
            In a saturated digital advertising landscape burdened by ad-blockers, bot traffic, and rapidly declining viewability, physical touchpoints provide unmatched authenticity and focus. Clean, chilled natural water is universally appreciated by consumers in high-stress or high-activity venues like conferences, transit hubs, hotels, and luxury retail destinations.
          </p>
          <p>
            AquaBloom replaces informal, fragmented, and ad-hoc bottle printing with an audited, enterprise-grade technology platform. By connecting all four vital market participants—Advertisers, Venues, Bottling Plants, and Freight Operators—in a transparent marketplace, we guarantee physical verification and digital measurement.
          </p>
        </div>

        {/* Core Principles */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-xl border border-[#22222c] bg-[#0f0f14] p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded border border-[#c5a059]/40 bg-[#16161f] text-[#c5a059]">
              <Target className="h-5 w-5" />
            </div>
            <h4 className="mt-4 font-display text-base font-bold text-white">Verified Placement</h4>
            <p className="mt-2 text-xs text-[#858594] leading-relaxed">
              Every production batch is traced from certified bottling through dock receipt directly into designated venue distribution zones.
            </p>
          </div>

          <div className="rounded-xl border border-[#22222c] bg-[#0f0f14] p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded border border-[#c5a059]/40 bg-[#16161f] text-[#c5a059]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h4 className="mt-4 font-display text-base font-bold text-white">Zero Compromise Quality</h4>
            <p className="mt-2 text-xs text-[#858594] leading-relaxed">
              We mandate strict packaging tolerances, food-grade certifications, and eco-conscious recyclable or biodegradable container standards.
            </p>
          </div>

          <div className="rounded-xl border border-[#22222c] bg-[#0f0f14] p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded border border-[#c5a059]/40 bg-[#16161f] text-[#c5a059]">
              <Globe className="h-5 w-5" />
            </div>
            <h4 className="mt-4 font-display text-base font-bold text-white">Global Scalability</h4>
            <p className="mt-2 text-xs text-[#858594] leading-relaxed">
              Designed as a distributed marketplace capable of coordinating regional production partners across international markets.
            </p>
          </div>
        </div>

        {/* Call to action */}
        <div className="mt-16 text-center border-t border-[#1e1e26] pt-10">
          <button
            onClick={() => navigate('/get-started')}
            className="rounded-lg bg-[#c5a059] px-6 py-3 text-xs font-bold uppercase tracking-wider text-black transition hover:opacity-95"
          >
            Become a Participant
          </button>
        </div>
      </div>
    </div>
  );
};
