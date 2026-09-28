/**
 * AquaBloom Public Venue Directory
 * 
 * Step 5: Public discovery surface for host venues participating in the
 * AquaBloom sustainable distribution network. Publicly compliant: excludes
 * private contact information and unauthenticated internal evaluations.
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import {
  Building2,
  MapPin,
  Users,
  Warehouse,
  Search,
  Sparkles,
  ShieldCheck,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';

interface PublicVenue {
  venueId: string;
  publicAccountId: string;
  venueName: string;
  venueType: string;
  description: string;
  location: {
    city: string;
    stateRegion: string;
    country: string;
  };
  audienceCategory: string;
  monthlyVisitors: number;
  availableBottleCapacity: number;
  campaignAvailability: string;
  placementPossibilities: string[];
}

interface PublicVenueDirectoryProps {
  navigate?: (path: string) => void;
}

export const PublicVenueDirectory: React.FC<PublicVenueDirectoryProps> = ({ navigate }) => {
  const [venues, setVenues] = useState<PublicVenue[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  useEffect(() => {
    async function loadVenues() {
      try {
        const res = await api.getPublicVenues();
        if (res.data) {
          setVenues(res.data);
        }
      } catch (err) {
        console.error('Failed to load public venues:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadVenues();
  }, []);

  const filteredVenues = venues.filter((v) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      v.venueName.toLowerCase().includes(q) ||
      v.location.city.toLowerCase().includes(q) ||
      v.venueType.toLowerCase().includes(q) ||
      v.audienceCategory.toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-[#08080a] text-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Directory Header */}
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 rounded-full border border-[#c5a059]/40 bg-[#161622] px-3.5 py-1 text-xs font-semibold text-[#d4af37]">
            <Building2 className="h-3.5 w-3.5 text-[#c5a059]" />
            <span>Host Venue Network &bull; Public Discovery</span>
          </div>
          <h1 className="text-3xl font-display font-bold text-white sm:text-4xl">
            Premier Verified Host Venues
          </h1>
          <p className="text-sm text-[#9e9eb0] leading-relaxed">
            Explore convention centers, luxury hospitality lounges, corporate enterprise headquarters, and sports arenas distributing branded sustainable spring water.
          </p>
        </div>

        {/* Search Input */}
        <div className="max-w-xl mx-auto relative">
          <Search className="absolute left-4 top-3.5 h-4 w-4 text-[#717185]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search verified host properties by city, name, or venue type..."
            className="w-full rounded-2xl border border-[#262635] bg-[#111118] pl-11 pr-4 py-3 text-xs text-white placeholder-[#5e5e70] focus:border-[#c5a059] focus:outline-none shadow-lg"
          />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="rounded-2xl border border-[#21212d] bg-[#0c0c11] p-12 text-center text-xs text-[#8e8e9f]">
            Loading verified host properties...
          </div>
        )}

        {/* Venue Cards Grid */}
        {!isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredVenues.map((v) => (
              <div
                key={v.venueId}
                className="rounded-2xl border border-[#21212e] bg-[#0e0e14] p-6 space-y-4 hover:border-[#353549] transition flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-[11px] font-semibold text-[#c5a059] bg-[#1a1a24] px-2 py-0.5 rounded">
                        {v.publicAccountId}
                      </span>
                      <span className="rounded bg-[#1a1a24] px-2 py-0.5 text-[11px] font-medium text-[#9d9db3]">
                        {v.venueType}
                      </span>
                    </div>
                    <span className="rounded-full border border-emerald-800/40 bg-emerald-950/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                      Verified Host
                    </span>
                  </div>

                  <h3 className="text-xl font-display font-bold text-white">
                    {v.venueName}
                  </h3>

                  <div className="flex items-center space-x-3 text-xs text-[#8e8e9f]">
                    <span className="flex items-center space-x-1">
                      <MapPin className="h-3.5 w-3.5 text-[#c5a059]" />
                      <span>{v.location.city}, {v.location.country}</span>
                    </span>
                    <span>&bull;</span>
                    <span className="flex items-center space-x-1">
                      <Users className="h-3.5 w-3.5 text-[#c5a059]" />
                      <span>{v.monthlyVisitors.toLocaleString()} Monthly Footfall</span>
                    </span>
                  </div>

                  <p className="text-xs text-[#9d9db3] leading-relaxed line-clamp-3">
                    {v.description}
                  </p>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="rounded bg-[#161622] border border-[#232332] px-2 py-0.5 text-[10px] text-[#d2d2e0]">
                      Audience: {v.audienceCategory}
                    </span>
                    {v.placementPossibilities?.slice(0, 2).map((p, idx) => (
                      <span key={idx} className="rounded bg-[#161622] border border-[#232332] px-2 py-0.5 text-[10px] text-[#a0a0b2]">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-[#1c1c28] flex items-center justify-between text-xs">
                  <div className="text-[#848496]">
                    Storage Capacity:{' '}
                    <span className="font-mono text-white font-semibold">
                      {v.availableBottleCapacity.toLocaleString()} bottles
                    </span>
                  </div>

                  {navigate && (
                    <button
                      onClick={() => navigate('/login')}
                      className="text-[#c5a059] hover:text-[#d4af37] font-semibold flex items-center space-x-1 transition"
                    >
                      <span>Match Campaign</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
