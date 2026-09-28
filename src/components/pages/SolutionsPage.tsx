/**
 * AquaBloom Public Website — Solutions (/solutions)
 * 
 * Structural solutions for Enterprise Advertisers, Commercial Venues,
 * Certified Bottlers, and Logistics Operators.
 */

import React from 'react';
import { ArrowRight, Layers, Building2, Factory, Truck, Check } from 'lucide-react';

interface SolutionsPageProps {
  navigate: (path: string) => void;
}

export const SolutionsPage: React.FC<SolutionsPageProps> = ({ navigate }) => {
  return (
    <div className="bg-[#08080a] text-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="text-center max-w-3xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-widest text-[#c5a059]">
            Enterprise Solutions
          </span>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Physical Attention at Institutional Scale
          </h1>
          <p className="mt-4 text-sm text-[#9b9ba8] leading-relaxed">
            AquaBloom replaces fragmented physical promotions with a standardized, auditable media framework designed for high-caliber brand engagement.
          </p>
        </div>

        <div className="mt-14 space-y-12">
          {/* Solution 1: Advertisers */}
          <div className="rounded-2xl border border-[#23232f] bg-[#0c0c11] p-8 lg:p-10">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              <div className="max-w-2xl">
                <div className="flex items-center space-x-2 text-[#c5a059]">
                  <Layers className="h-5 w-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">For Enterprise Advertisers</span>
                </div>
                <h3 className="mt-3 font-display text-2xl font-bold text-white">
                  High-Dwell-Time Physical Media & Verified Reach
                </h3>
                <p className="mt-3 text-xs text-[#8f8f9e] leading-relaxed">
                  Unlike fleeting digital banner impressions or highway billboards passed in seconds, physical water bottles maintain an average consumer hold time of 30+ minutes in premium environments.
                </p>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#b8b8c7]">
                  <div className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-[#c5a059]" />
                    <span>Targeted demographic & venue tier selection</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-[#c5a059]" />
                    <span>Custom industrial design & label specifications</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-[#c5a059]" />
                    <span>Interactive QR verification bridges</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-[#c5a059]" />
                    <span>Comprehensive batch audit reporting</span>
                  </div>
                </div>
              </div>
              <div className="shrink-0">
                <button
                  onClick={() => navigate('/get-started')}
                  className="w-full sm:w-auto rounded-lg bg-[#c5a059] px-6 py-3 text-xs font-bold uppercase tracking-wider text-black transition hover:opacity-95"
                >
                  Join as Advertiser
                </button>
              </div>
            </div>
          </div>

          {/* Solution 2: Venues */}
          <div className="rounded-2xl border border-[#23232f] bg-[#0c0c11] p-8 lg:p-10">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              <div className="max-w-2xl">
                <div className="flex items-center space-x-2 text-[#c5a059]">
                  <Building2 className="h-5 w-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">For Commercial Venues</span>
                </div>
                <h3 className="mt-3 font-display text-2xl font-bold text-white">
                  Hospitality Amenity Without Procurement Expense
                </h3>
                <p className="mt-3 text-xs text-[#8f8f9e] leading-relaxed">
                  Hotels, corporate conference parks, airport lounges, and private event operators elevate guest hospitality with sponsored premium natural water without capital or logistics strain.
                </p>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#b8b8c7]">
                  <div className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-[#c5a059]" />
                    <span>Scheduled dock pallet deliveries</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-[#c5a059]" />
                    <span>Verified aesthetic standards matching venue decorum</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-[#c5a059]" />
                    <span>Zero procurement invoice line-items</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-[#c5a059]" />
                    <span>Automated replenishment schedules</span>
                  </div>
                </div>
              </div>
              <div className="shrink-0">
                <button
                  onClick={() => navigate('/get-started')}
                  className="w-full sm:w-auto rounded-lg border border-[#c5a059] px-6 py-3 text-xs font-bold uppercase tracking-wider text-[#c5a059] transition hover:bg-[#c5a059] hover:text-black"
                >
                  Join as Venue
                </button>
              </div>
            </div>
          </div>

          {/* Solution 3: Suppliers & Logistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="rounded-2xl border border-[#23232f] bg-[#0c0c11] p-8">
              <div className="flex items-center space-x-2 text-[#c5a059]">
                <Factory className="h-5 w-5" />
                <span className="text-xs font-bold uppercase tracking-wider">For Bottlers & Converters</span>
              </div>
              <h3 className="mt-3 font-display text-xl font-bold text-white">
                Predictable Production Utilization
              </h3>
              <p className="mt-3 text-xs text-[#8f8f9e] leading-relaxed">
                Fill spare bottling capacity with structured work orders, standardized packaging mandates, and clear batch settlement.
              </p>
              <div className="mt-6">
                <button
                  onClick={() => navigate('/get-started')}
                  className="text-xs font-bold uppercase tracking-wider text-[#c5a059] hover:underline inline-flex items-center space-x-1"
                >
                  <span>Supplier Registration</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-[#23232f] bg-[#0c0c11] p-8">
              <div className="flex items-center space-x-2 text-[#c5a059]">
                <Truck className="h-5 w-5" />
                <span className="text-xs font-bold uppercase tracking-wider">For Logistics Fleets</span>
              </div>
              <h3 className="mt-3 font-display text-xl font-bold text-white">
                Dedicated Commercial Line-Haul
              </h3>
              <p className="mt-3 text-xs text-[#8f8f9e] leading-relaxed">
                Clear transit windows from bottling warehouses to commercial loading bays, backed by auditable electronic proof-of-delivery protocols.
              </p>
              <div className="mt-6">
                <button
                  onClick={() => navigate('/get-started')}
                  className="text-xs font-bold uppercase tracking-wider text-[#c5a059] hover:underline inline-flex items-center space-x-1"
                >
                  <span>Logistics Carrier Onboarding</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
