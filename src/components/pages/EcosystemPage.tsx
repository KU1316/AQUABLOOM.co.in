/**
 * AquaBloom Public Website — The Ecosystem (/ecosystem)
 * 
 * Comprehensive overview of the 4 synchronized participant roles
 * and the planned sequential lifecycle pipeline.
 */

import React from 'react';
import { ArrowRight, Layers, Building2, Factory, Truck, CheckCircle2, ChevronRight, Lock } from 'lucide-react';

interface EcosystemPageProps {
  navigate: (path: string) => void;
}

export const EcosystemPage: React.FC<EcosystemPageProps> = ({ navigate }) => {
  const lifecycleSteps = [
    { step: '01', title: 'Campaign', role: 'ADVERTISER', desc: 'Campaign definition & targeting criteria' },
    { step: '02', title: 'Proposal', role: 'SYSTEM / VENUE', desc: 'Venue inventory alignment & allocation' },
    { step: '03', title: 'Agreement', role: 'BILATERAL', desc: 'Mutual commercial terms & rate lock' },
    { step: '04', title: 'Order', role: 'COMMERCIAL', desc: 'Production work-order generation' },
    { step: '05', title: 'Supplier Assignment', role: 'SUPPLIER', desc: 'Routing to certified bottling partner' },
    { step: '06', title: 'Production', role: 'SUPPLIER', desc: 'Batch bottling & label fabrication' },
    { step: '07', title: 'Logistics', role: 'LOGISTICS', desc: 'Cold/ambient freight dispatch' },
    { step: '08', title: 'Delivery', role: 'LOGISTICS', desc: 'Venue dock receipt & condition check' },
    { step: '09', title: 'Venue Placement', role: 'VENUE', desc: 'Frontline distribution & guest presentation' },
    { step: '10', title: 'QR Engagement', role: 'CONSUMER', desc: 'Interactive engagement capture' },
    { step: '11', title: 'Analytics', role: 'VERIFIED', desc: 'Audited interaction metrics' },
    { step: '12', title: 'Settlement', role: 'FINANCIAL', desc: 'Multi-party balance clearing' },
  ];

  return (
    <div className="bg-[#08080a] text-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-widest text-[#c5a059]">
            The AquaBloom Ecosystem
          </span>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            A Four-Pillar Synchronized Marketplace
          </h1>
          <p className="mt-4 text-sm text-[#9b9ba8] leading-relaxed">
            AquaBloom orchestrates physical manufacturing, logistics networks, commercial real estate hospitality, and enterprise advertising into a single automated commercial loop.
          </p>
        </div>

        {/* 4 Pillars Detailed Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 1. Advertisers */}
          <div className="rounded-xl border border-[#262633] bg-[#0e0e13] p-8">
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#c5a059]/40 bg-[#16161f] text-[#c5a059]">
                <Layers className="h-6 w-6" />
              </div>
              <span className="rounded bg-[#171722] px-3 py-1 text-[11px] font-mono text-[#c5a059] border border-[#2b2b3b]">
                ROLE: ADVERTISER
              </span>
            </div>
            <h3 className="mt-6 font-display text-xl font-bold text-white">Enterprise Advertisers</h3>
            <p className="mt-3 text-xs text-[#8a8a9a] leading-relaxed">
              Global and regional consumer brands seeking tactile, undivided consumer attention. Turn hydration touchpoints into verified, high-retention advertising real estate with interactive QR bridges.
            </p>
            <ul className="mt-4 space-y-2 text-xs text-[#b0b0bf]">
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-[#c5a059]" />
                <span>Custom bottle sleeve & cap labeling specifications</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-[#c5a059]" />
                <span>Audited physical distribution verification</span>
              </li>
            </ul>
          </div>

          {/* 2. Hosting Venues */}
          <div className="rounded-xl border border-[#262633] bg-[#0e0e13] p-8">
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#c5a059]/40 bg-[#16161f] text-[#c5a059]">
                <Building2 className="h-6 w-6" />
              </div>
              <span className="rounded bg-[#171722] px-3 py-1 text-[11px] font-mono text-[#c5a059] border border-[#2b2b3b]">
                ROLE: VENUE
              </span>
            </div>
            <h3 className="mt-6 font-display text-xl font-bold text-white">Hosting Venues</h3>
            <p className="mt-3 text-xs text-[#8a8a9a] leading-relaxed">
              Hospitality properties, enterprise conferences, sports arenas, transit hubs, and private venues that distribute complimentary premium bottled water to guests and attendees.
            </p>
            <ul className="mt-4 space-y-2 text-xs text-[#b0b0bf]">
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-[#c5a059]" />
                <span>Zero water procurement overhead for property owners</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-[#c5a059]" />
                <span>Verified drop-off scheduling and dock management</span>
              </li>
            </ul>
          </div>

          {/* 3. Bottling Suppliers */}
          <div className="rounded-xl border border-[#262633] bg-[#0e0e13] p-8">
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#c5a059]/40 bg-[#16161f] text-[#c5a059]">
                <Factory className="h-6 w-6" />
              </div>
              <span className="rounded bg-[#171722] px-3 py-1 text-[11px] font-mono text-[#c5a059] border border-[#2b2b3b]">
                ROLE: SUPPLIER
              </span>
            </div>
            <h3 className="mt-6 font-display text-xl font-bold text-white">Production Suppliers</h3>
            <p className="mt-3 text-xs text-[#8a8a9a] leading-relaxed">
              Certified regional water bottlers and label printers capable of executing standard high-speed packaging runs according to AquaBloom quality parameters.
            </p>
            <ul className="mt-4 space-y-2 text-xs text-[#b0b0bf]">
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-[#c5a059]" />
                <span>Direct production batch work orders with clear volume forecasts</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-[#c5a059]" />
                <span>Quality control compliance and batch sign-offs</span>
              </li>
            </ul>
          </div>

          {/* 4. Logistics Partners */}
          <div className="rounded-xl border border-[#262633] bg-[#0e0e13] p-8">
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#c5a059]/40 bg-[#16161f] text-[#c5a059]">
                <Truck className="h-6 w-6" />
              </div>
              <span className="rounded bg-[#171722] px-3 py-1 text-[11px] font-mono text-[#c5a059] border border-[#2b2b3b]">
                ROLE: LOGISTICS_PARTNER
              </span>
            </div>
            <h3 className="mt-6 font-display text-xl font-bold text-white">Logistics Partners</h3>
            <p className="mt-3 text-xs text-[#8a8a9a] leading-relaxed">
              Specialized carriers and regional freight fleets managing palletized line-haul and last-mile delivery to venue loading docks.
            </p>
            <ul className="mt-4 space-y-2 text-xs text-[#b0b0bf]">
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-[#c5a059]" />
                <span>Audited chain of custody and scheduled dock time slots</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-[#c5a059]" />
                <span>Delivery verification protocols</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Future Sequential Lifecycle Architecture Preview */}
        <div className="mt-20 rounded-2xl border border-[#242430] bg-[#0c0c11] p-8 sm:p-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1f1f2a] pb-6">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#c5a059]">
                Planned Sequential Workflow
              </span>
              <h3 className="mt-1 font-display text-xl font-bold text-white">
                The AquaBloom Execution Pipeline
              </h3>
            </div>
            <div className="flex items-center space-x-2 rounded-full border border-[#30303e] bg-[#14141c] px-3.5 py-1 text-xs text-[#9d9da8]">
              <Lock className="h-3.5 w-3.5 text-[#c5a059]" />
              <span>Step 1 Active: Foundation & Auth</span>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {lifecycleSteps.map((item) => (
              <div
                key={item.step}
                className="rounded-lg border border-[#1e1e28] bg-[#101017] p-4 transition hover:border-[#c5a059]/40"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#c5a059]">{item.step}</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-[#6b6b7a]">{item.role}</span>
                </div>
                <h4 className="mt-2 text-sm font-bold text-[#f2f2f7]">{item.title}</h4>
                <p className="mt-1 text-[11px] text-[#7d7d8c]">{item.desc}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-xs text-[#717180]">
            Notice: Specific campaign creation, supplier assignment, logistics dispatch, and settlement engines are scheduled for subsequent sequential releases.
          </p>
        </div>

        {/* Bottom CTA */}
        <div className="mt-14 text-center">
          <button
            onClick={() => navigate('/get-started')}
            className="inline-flex items-center space-x-2 rounded-lg bg-[#c5a059] px-6 py-3 text-xs font-bold uppercase tracking-wider text-black transition hover:opacity-95"
          >
            <span>JOIN THE ECOSYSTEM</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
