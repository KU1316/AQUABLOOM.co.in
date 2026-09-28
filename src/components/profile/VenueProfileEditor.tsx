/**
 * AquaBloom Venue Profile Editor
 * 
 * Manages operational parameters for Hosting Venues:
 * - Venue Name, Type, Description, Physical Location
 * - Audience Category, Footfall & Bottle Consumption estimates
 * - Bottle Holding Capacity with dynamic Available Capacity calculation
 * - Campaign Availability, Acceptance & Forbidden Preferences
 * - Placement Possibilities & Dock/Coordinator Contact
 * - Public Visibility state indicator (PRIVATE vs PUBLIC_ELIGIBLE)
 */

import React, { useState, useEffect } from 'react';
import { VenueProfile, VenueVisibilityState } from '../../types.js';
import { useAuth } from '../../context/AuthContext.js';
import { ProfileCompletionBar } from './ProfileCompletionBar.js';
import {
  Building,
  MapPin,
  Users,
  Box,
  Truck,
  Eye,
  Lock,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
} from 'lucide-react';

interface VenueProfileEditorProps {
  profile: VenueProfile;
}

export const VenueProfileEditor: React.FC<VenueProfileEditorProps> = ({ profile: initialProfile }) => {
  const { updateProfile } = useAuth();
  const [formData, setFormData] = useState<Partial<VenueProfile>>(initialProfile);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Quick inputs for tags
  const [newAcceptedCategory, setNewAcceptedCategory] = useState('');
  const [newForbiddenCategory, setNewForbiddenCategory] = useState('');

  useEffect(() => {
    setFormData(initialProfile);
  }, [initialProfile]);

  const handleTextChange = (field: keyof VenueProfile, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setSaveSuccess(false);
  };

  const handleNestedChange = (
    parent: 'location' | 'footfall' | 'bottleConsumption' | 'capacity' | 'operationalContact',
    key: string,
    value: unknown
  ) => {
    setFormData((prev) => {
      const updatedParent = {
        ...((prev[parent] as any) || {}),
        [key]: value,
      };

      // If updating capacity, dynamically compute availableBottleCapacity
      if (parent === 'capacity') {
        const max = Number(key === 'maxBottleHoldingCapacity' ? value : updatedParent.maxBottleHoldingCapacity) || 0;
        const commit = Number(key === 'currentOngoingBottleCommitment' ? value : updatedParent.currentOngoingBottleCommitment) || 0;
        updatedParent.availableBottleCapacity = Math.max(0, max - commit);
      }

      return {
        ...prev,
        [parent]: updatedParent,
      };
    });
    setSaveSuccess(false);
  };

  const handlePlacementToggle = (placement: string) => {
    const current = formData.placementPossibilities || [];
    const updated = current.includes(placement)
      ? current.filter((p) => p !== placement)
      : [...current, placement];
    handleTextChange('placementPossibilities', updated);
  };

  const addAcceptedCategory = () => {
    if (!newAcceptedCategory.trim()) return;
    const current = formData.campaignPreferences?.acceptedCategories || [];
    if (!current.includes(newAcceptedCategory.trim())) {
      setFormData((prev) => ({
        ...prev,
        campaignPreferences: {
          ...(prev.campaignPreferences || {}),
          acceptedCategories: [...current, newAcceptedCategory.trim()],
        },
      }));
    }
    setNewAcceptedCategory('');
  };

  const removeAcceptedCategory = (cat: string) => {
    const current = formData.campaignPreferences?.acceptedCategories || [];
    setFormData((prev) => ({
      ...prev,
      campaignPreferences: {
        ...(prev.campaignPreferences || {}),
        acceptedCategories: current.filter((c) => c !== cat),
      },
    }));
  };

  const addForbiddenCategory = () => {
    if (!newForbiddenCategory.trim()) return;
    const current = formData.campaignPreferences?.forbiddenCategories || [];
    if (!current.includes(newForbiddenCategory.trim())) {
      setFormData((prev) => ({
        ...prev,
        campaignPreferences: {
          ...(prev.campaignPreferences || {}),
          forbiddenCategories: [...current, newForbiddenCategory.trim()],
        },
      }));
    }
    setNewForbiddenCategory('');
  };

  const removeForbiddenCategory = (cat: string) => {
    const current = formData.campaignPreferences?.forbiddenCategories || [];
    setFormData((prev) => ({
      ...prev,
      campaignPreferences: {
        ...(prev.campaignPreferences || {}),
        forbiddenCategories: current.filter((c) => c !== cat),
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const res = await updateProfile(formData);
      if (res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      } else {
        setErrorMessage(res.error || 'Failed to save venue profile.');
      }
    } catch (err) {
      setErrorMessage('Network communication failure during profile update.');
    } finally {
      setIsSaving(false);
    }
  };

  const placementOptions = [
    'Lobby Welcome Stations',
    'VIP Lounges & Club Floors',
    'Main Conference Keynote Suites',
    'Valet & Concierge Desks',
    'Executive Boardrooms',
    'Exhibition Hall Beverage Pavilions',
  ];

  const maxCapacity = Number(formData.capacity?.maxBottleHoldingCapacity) || 0;
  const ongoingCommit = Number(formData.capacity?.currentOngoingBottleCommitment) || 0;
  const availableCapacity = Math.max(0, maxCapacity - ongoingCommit);

  const isPublicEligible = formData.visibilityState === 'PUBLIC_ELIGIBLE' || formData.visibilityState === 'PUBLIC';

  return (
    <div className="space-y-6">
      {/* Completion Bar */}
      <ProfileCompletionBar
        completion={initialProfile.completion}
        metadata={{ version: initialProfile.version }}
        roleLabel="Venue"
      />

      {/* Visibility State Card */}
      <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3">
            <div
              className={`rounded-lg p-2.5 ${
                isPublicEligible
                  ? 'border border-emerald-800/50 bg-emerald-950/30 text-emerald-400'
                  : 'border border-[#2a2a38] bg-[#14141c] text-[#8e8e9f]'
              }`}
            >
              {isPublicEligible ? <Eye className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                  Marketplace Discovery Status
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    isPublicEligible
                      ? 'border border-emerald-700/50 bg-emerald-900/30 text-emerald-300'
                      : 'border border-[#343444] bg-[#161622] text-[#9090a2]'
                  }`}
                >
                  {formData.visibilityState}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#9d9db3] max-w-xl leading-relaxed">
                {isPublicEligible
                  ? 'Venue profile meets all mandatory verification criteria and is eligible for advertiser campaign proposal discovery.'
                  : 'Profile remains strictly PRIVATE until all required fields (venue type, description, location, audience, footfall, and capacity) are completed.'}
              </p>
            </div>
          </div>
          <div className="text-xs text-[#6e6e80]">
            Sanitized Public View: <span className="font-semibold text-white">Active</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Venue Profile */}
        <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <Building className="h-4 w-4" />
            <span>Property &amp; Venue Details</span>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Venue Name</label>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <input
                type="text"
                value={formData.venueName || ''}
                onChange={(e) => handleTextChange('venueName', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2.5 text-xs text-white placeholder-[#5d5d6e] focus:border-[#c5a059] focus:outline-none"
                placeholder="e.g. Grand Millennium Convention Center"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Venue Type</label>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <select
                value={formData.venueType || ''}
                onChange={(e) => handleTextChange('venueType', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2.5 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                required
              >
                <option value="">Select Venue Category</option>
                <option value="Convention Center & Exhibition Hall">Convention Center &amp; Exhibition Hall</option>
                <option value="Luxury Hotel & Resort">Luxury Hotel &amp; Resort</option>
                <option value="Executive Coworking & Private Club">Executive Coworking &amp; Private Club</option>
                <option value="Transit & Aviation Terminal">Transit &amp; Aviation Terminal</option>
                <option value="Golf & Country Club">Golf &amp; Country Club</option>
                <option value="Cultural Center & Museum">Cultural Center &amp; Museum</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Venue Description</label>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <textarea
                rows={3}
                value={formData.description || ''}
                onChange={(e) => handleTextChange('description', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2.5 text-xs text-white placeholder-[#5d5d6e] focus:border-[#c5a059] focus:outline-none"
                placeholder="Detailed description of the property, event spaces, and daily traffic flow..."
                required
              />
            </div>
          </div>
        </div>

        {/* Location & Audience */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <MapPin className="h-4 w-4" />
              <span>Physical Property Location</span>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#9d9db3]">Street Address</label>
                <input
                  type="text"
                  value={formData.location?.address || ''}
                  onChange={(e) => handleNestedChange('location', 'address', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  placeholder="e.g. 700 Millennium Plaza"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-white">City</label>
                    <span className="text-[10px] font-bold text-[#c5a059]">REQ</span>
                  </div>
                  <input
                    type="text"
                    value={formData.location?.city || ''}
                    onChange={(e) => handleNestedChange('location', 'city', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#9d9db3]">State / Region</label>
                  <input
                    type="text"
                    value={formData.location?.stateRegion || ''}
                    onChange={(e) => handleNestedChange('location', 'stateRegion', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-white">Country</label>
                    <span className="text-[10px] font-bold text-[#c5a059]">REQ</span>
                  </div>
                  <input
                    type="text"
                    value={formData.location?.country || ''}
                    onChange={(e) => handleNestedChange('location', 'country', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#9d9db3]">Postal / ZIP Code</label>
                  <input
                    type="text"
                    value={formData.location?.postalCode || ''}
                    onChange={(e) => handleNestedChange('location', 'postalCode', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Users className="h-4 w-4" />
              <span>Audience &amp; Footfall Indicators</span>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-white">Audience Profile Category</label>
                  <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
                </div>
                <input
                  type="text"
                  value={formData.audienceCategory || ''}
                  onChange={(e) => handleTextChange('audienceCategory', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  placeholder="e.g. Corporate Executives &amp; Tech Delegates"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-white">Estimated Monthly Visitors (Footfall)</label>
                  <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
                </div>
                <input
                  type="number"
                  min="0"
                  value={formData.footfall?.monthlyVisitors ?? 0}
                  onChange={(e) => handleNestedChange('footfall', 'monthlyVisitors', parseInt(e.target.value, 10) || 0)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#9d9db3]">Peak Traffic Schedule</label>
                <input
                  type="text"
                  value={formData.footfall?.peakTrafficTimes || ''}
                  onChange={(e) => handleNestedChange('footfall', 'peakTrafficTimes', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  placeholder="e.g. Tuesday - Thursday 08:00 - 18:00"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Capacity & Usage (Strict Non-negative verification) */}
        <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <Box className="h-4 w-4" />
            <span>Bottle Capacity &amp; Storage Architecture</span>
          </div>
          <p className="mt-1 text-xs text-[#8e8e9f]">
            Quantifies physical holding limits to prevent venue overcrowding during active campaigns.
          </p>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-[#252535] bg-[#121218] p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-[#c5a059]">MAX HOLDING CAPACITY</span>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <input
                type="number"
                min="0"
                value={formData.capacity?.maxBottleHoldingCapacity ?? 0}
                onChange={(e) =>
                  handleNestedChange('capacity', 'maxBottleHoldingCapacity', parseInt(e.target.value, 10) || 0)
                }
                className="mt-2 w-full rounded-md border border-[#303042] bg-[#0c0c10] px-3 py-1.5 font-mono text-base font-bold text-white focus:border-[#c5a059] focus:outline-none"
                required
              />
              <span className="mt-1 block text-[10px] text-[#707080]">Physical stock limit in bottles</span>
            </div>

            <div className="rounded-lg border border-[#252535] bg-[#121218] p-4">
              <span className="text-[10px] font-bold uppercase text-[#888899]">CURRENT COMMITMENT</span>
              <p className="mt-2 font-mono text-base font-bold text-[#b4b4c6]">
                {ongoingCommit.toLocaleString()} bottles
              </p>
              <span className="mt-1 block text-[10px] text-[#707080]">Reserved by active agreements</span>
            </div>

            <div className="rounded-lg border border-[#252535] bg-[#121218] p-4">
              <span className="text-[10px] font-bold uppercase text-emerald-400">AVAILABLE CAPACITY</span>
              <p className="mt-2 font-mono text-base font-bold text-emerald-400">
                {availableCapacity.toLocaleString()} bottles
              </p>
              <span className="mt-1 block text-[10px] text-[#707080]">Live calculated headroom</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Estimated Monthly Consumption</label>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <input
                type="number"
                min="0"
                value={formData.bottleConsumption?.estimatedMonthlyBottles ?? 0}
                onChange={(e) =>
                  handleNestedChange('bottleConsumption', 'estimatedMonthlyBottles', parseInt(e.target.value, 10) || 0)
                }
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none font-mono"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Campaign Availability Window</label>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <select
                value={formData.campaignAvailability || 'YEAR_ROUND'}
                onChange={(e) => handleTextChange('campaignAvailability', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                required
              >
                <option value="YEAR_ROUND">Continuous Year-Round Acceptance</option>
                <option value="SEASONAL">Seasonal Schedule</option>
                <option value="EVENT_BASED">Specific Event Schedule</option>
                <option value="CURRENTLY_ACCEPTING">Immediate Activation Ready</option>
              </select>
            </div>
          </div>
        </div>

        {/* Placement Possibilities & Category Preferences */}
        <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <Building className="h-4 w-4" />
            <span>Placement Spots &amp; Content Governance</span>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#9d9db3]">Approved Placement Locations</label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {placementOptions.map((spot) => {
                  const isChecked = formData.placementPossibilities?.includes(spot);
                  return (
                    <button
                      type="button"
                      key={spot}
                      onClick={() => handlePlacementToggle(spot)}
                      className={`flex items-center space-x-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                        isChecked
                          ? 'border-[#c5a059] bg-[#c5a059]/10 text-[#d4af37]'
                          : 'border-[#242432] bg-[#111116] text-[#8e8e9f] hover:border-[#353545]'
                      }`}
                    >
                      <span
                        className={`h-3 w-3 rounded-full border ${
                          isChecked ? 'border-[#c5a059] bg-[#c5a059]' : 'border-[#444455]'
                        }`}
                      />
                      <span className="truncate">{spot}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[#1a1a24] pt-4">
              <div>
                <label className="block text-xs font-medium text-emerald-400">Accepted Advertiser Categories</label>
                <div className="mt-2 flex space-x-2">
                  <input
                    type="text"
                    value={newAcceptedCategory}
                    onChange={(e) => setNewAcceptedCategory(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAcceptedCategory())}
                    placeholder="e.g. Clean Energy, Fintech"
                    className="w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addAcceptedCategory}
                    className="rounded-lg border border-emerald-800/40 bg-emerald-950/40 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-900/50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {formData.campaignPreferences?.acceptedCategories?.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center space-x-1 rounded border border-emerald-800/40 bg-emerald-950/30 px-2 py-0.5 text-[11px] text-emerald-300"
                    >
                      <span>{cat}</span>
                      <button type="button" onClick={() => removeAcceptedCategory(cat)}>
                        <X className="h-3 w-3 hover:text-emerald-100" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-rose-400">Forbidden / Excluded Categories</label>
                <div className="mt-2 flex space-x-2">
                  <input
                    type="text"
                    value={newForbiddenCategory}
                    onChange={(e) => setNewForbiddenCategory(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addForbiddenCategory())}
                    placeholder="e.g. Gambling, Tobacco"
                    className="w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-1.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addForbiddenCategory}
                    className="rounded-lg border border-rose-800/40 bg-rose-950/40 px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-900/50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {formData.campaignPreferences?.forbiddenCategories?.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center space-x-1 rounded border border-rose-800/40 bg-rose-950/30 px-2 py-0.5 text-[11px] text-rose-300"
                    >
                      <span>{cat}</span>
                      <button type="button" onClick={() => removeForbiddenCategory(cat)}>
                        <X className="h-3 w-3 hover:text-rose-100" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Operational Dock & Coordinator Contact */}
        <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <Truck className="h-4 w-4" />
            <span>Loading Dock &amp; Operational Coordinator</span>
          </div>
          <p className="mt-1 text-xs text-[#8e8e9f]">
            Strictly internal operational contact for deliveries; never exposed in public marketplace views.
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Coordinator Name</label>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <input
                type="text"
                value={formData.operationalContact?.coordinatorName || ''}
                onChange={(e) => handleNestedChange('operationalContact', 'coordinatorName', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Coordinator Email</label>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <input
                type="email"
                value={formData.operationalContact?.email || ''}
                onChange={(e) => handleNestedChange('operationalContact', 'email', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9d9db3]">Dock Phone</label>
              <input
                type="tel"
                value={formData.operationalContact?.phone || ''}
                onChange={(e) => handleNestedChange('operationalContact', 'phone', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-[#9d9db3]">Delivery Dock Notes &amp; Access Instructions</label>
              <input
                type="text"
                value={formData.operationalContact?.dockNotes || ''}
                onChange={(e) => handleNestedChange('operationalContact', 'dockNotes', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                placeholder="e.g. Loading Bay C with hydraulic liftgate, delivery window 06:00 - 10:00"
              />
            </div>
          </div>
        </div>

        {/* Feedback & Actions */}
        {errorMessage && (
          <div className="flex items-center space-x-2 rounded-lg border border-rose-900/40 bg-rose-950/20 p-3.5 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {saveSuccess && (
          <div className="flex items-center space-x-2 rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Venue profile successfully updated and version incremented.</span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[#1c1c28] pt-6">
          <p className="text-[11px] text-[#6b6b7a]">
            Visibility automatically updates to PUBLIC_ELIGIBLE once all mandatory fields are complete.
          </p>
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center space-x-2 rounded-lg bg-[#c5a059] px-5 py-2.5 text-xs font-bold text-black hover:bg-[#d4af37] disabled:opacity-50 transition"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Updating Profile...' : 'Save Venue Profile'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
