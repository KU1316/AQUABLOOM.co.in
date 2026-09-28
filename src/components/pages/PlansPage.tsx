/**
 * AquaBloom Public Website — Plans (/plans)
 * 
 * High-level commercial participation frameworks without fabricated pricing
 * or artificial financial promises.
 */

import React from 'react';
import { ArrowRight, ShieldCheck, Check } from 'lucide-react';

interface PlansPageProps {
  navigate: (path: string) => void;
}

export const PlansPage: React.FC<PlansPageProps> = ({ navigate }) => {
  const frameworks = [
    {
      name: 'Pilot Deployment',
      badge: 'Evaluation Tier',
      description: 'Designed for advertisers and single-property venue partners validating local attention impact and dock logistics.',
      features: [
        'Single metro or venue cluster activation',
        'Standardized bottle & label specifications',
        'Direct verification and placement logging',
        'Dedicated onboarding coordinator',
      ],
      cta: 'Request Pilot Briefing',
    },
    {
      name: 'Regional Activation',
      badge: 'Multi-Venue Tier',
      featured: true,
      description: 'Synchronized cross-venue distribution for brands targeting continuous presence across convention centers, hotels, and key metro transit hubs.',
      features: [
        'Multi-property venue network routing',
        'Custom interactive QR landing destination',
        'Scheduled recurring batch production',
        'Automated logistics tracking and dock receipt',
        'Audited campaign performance reporting',
      ],
      cta: 'Explore Regional Rollout',
    },
    {
      name: 'Enterprise Network',
      badge: 'National Scale',
      description: 'Comprehensive nationwide physical media network with custom industrial bottle finishes and dedicated supply chains.',
      features: [
        'Custom mold & premium sleeve finishes',
        'Priority multi-supplier bottling allocation',
        'Real-time delivery verification across major hubs',
        'Custom enterprise API data integration',
        'Dedicated SLA & executive account oversight',
      ],
      cta: 'Engage Institutional Advisory',
    },
  ];

  return (
    <div className="bg-[#08080a] text-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="text-center max-w-3xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-widest text-[#c5a059]">
            Engagement Structures
          </span>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Institutional Participation Frameworks
          </h1>
          <p className="mt-4 text-sm text-[#9b9ba8] leading-relaxed">
            AquaBloom structures campaigns and participation around physical volume requirements, venue footprint, and production specifications.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-8">
          {frameworks.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-8 flex flex-col justify-between transition ${
                plan.featured
                  ? 'border-[#c5a059] bg-[#0f0f15] shadow-xl shadow-[#c5a059]/5'
                  : 'border-[#242430] bg-[#0c0c10] hover:border-[#353545]'
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#c5a059] px-3.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-black">
                  Recommended Architecture
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#c5a059]">
                    {plan.badge}
                  </span>
                </div>
                <h3 className="mt-3 font-display text-2xl font-bold text-white">{plan.name}</h3>
                <p className="mt-3 text-xs text-[#8a8a9a] leading-relaxed">{plan.description}</p>

                <div className="mt-6 border-t border-[#1e1e28] pt-6">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#6e6e7d]">
                    Included Specifications:
                  </span>
                  <ul className="mt-3 space-y-2.5 text-xs text-[#bebecb]">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start space-x-2">
                        <Check className="h-4 w-4 shrink-0 text-[#c5a059] mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-[#1e1e28]">
                <button
                  onClick={() => navigate('/contact')}
                  className={`w-full rounded-lg py-3 text-xs font-bold uppercase tracking-wider transition ${
                    plan.featured
                      ? 'bg-[#c5a059] text-black hover:opacity-95'
                      : 'border border-[#2e2e3d] text-white hover:border-[#c5a059]'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 rounded-xl border border-[#23232e] bg-[#0d0d12] p-6 text-center text-xs text-[#7d7d8c]">
          <div className="inline-flex items-center space-x-2 text-[#c5a059] font-medium">
            <ShieldCheck className="h-4 w-4" />
            <span>Commercial Pricing Policy Note</span>
          </div>
          <p className="mt-1 max-w-2xl mx-auto">
            Actual campaign agreements and production costs depend on batch volume, geographical delivery zones, and custom packaging tolerances. Formal pricing is generated during the campaign proposal phase.
          </p>
        </div>
      </div>
    </div>
  );
};
