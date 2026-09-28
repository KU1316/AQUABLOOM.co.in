/**
 * AquaBloom Advertiser Profile Editor
 * 
 * Manages operational data for Advertiser accounts:
 * - Brand Name, Industry, Description
 * - Contact information, HQ location, Website URL
 * - Target Audience & Campaign Preferences
 * - Displays required vs optional badges & live completion calculations
 */

import React, { useState, useEffect } from 'react';
import { AdvertiserProfile } from '../../types.js';
import { useAuth } from '../../context/AuthContext.js';
import { ProfileCompletionBar } from './ProfileCompletionBar.js';
import { Building2, User, MapPin, Globe, Target, Sliders, Save, CheckCircle2, AlertCircle } from 'lucide-react';

interface AdvertiserProfileEditorProps {
  profile: AdvertiserProfile;
}

export const AdvertiserProfileEditor: React.FC<AdvertiserProfileEditorProps> = ({ profile: initialProfile }) => {
  const { updateProfile } = useAuth();
  const [formData, setFormData] = useState<Partial<AdvertiserProfile>>(initialProfile);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setFormData(initialProfile);
  }, [initialProfile]);

  const handleTextChange = (field: keyof AdvertiserProfile, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setSaveSuccess(false);
  };

  const handleNestedChange = (parent: 'primaryContact' | 'location' | 'targetAudience' | 'campaignPreferences', key: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [parent]: {
        ...((prev[parent] as any) || {}),
        [key]: value,
      },
    }));
    setSaveSuccess(false);
  };

  const handleVenueTypeToggle = (venueType: string) => {
    const current = formData.targetAudience?.targetVenueTypes || [];
    const updated = current.includes(venueType)
      ? current.filter((v) => v !== venueType)
      : [...current, venueType];
    handleNestedChange('targetAudience', 'targetVenueTypes', updated);
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
        setErrorMessage(res.error || 'Failed to save profile changes.');
      }
    } catch (err) {
      setErrorMessage('A network error occurred while updating profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const venueTypeOptions = [
    'Luxury Hotels & Resorts',
    'Convention Centers & Expos',
    'Private Aviation FBOs',
    'Executive Coworking & Clubs',
    'Golf & Country Clubs',
    'Fine Dining & Lounges',
  ];

  return (
    <div className="space-y-6">
      {/* Profile Completion Status */}
      <ProfileCompletionBar
        completion={initialProfile.completion}
        metadata={{ version: initialProfile.version }}
        roleLabel="Advertiser"
      />

      {/* Profile Edit Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Brand Identity */}
        <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <Building2 className="h-4 w-4" />
            <span>Brand Identity & Industry</span>
          </div>
          <p className="mt-1 text-xs text-[#8e8e9f]">
            Identify the commercial brand entity sponsoring advertising campaigns.
          </p>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Brand / Business Name</label>
                <span className="rounded bg-[#1a1a24] px-2 py-0.5 text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <input
                type="text"
                value={formData.brandName || ''}
                onChange={(e) => handleTextChange('brandName', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2.5 text-xs text-white placeholder-[#5d5d6e] focus:border-[#c5a059] focus:outline-none"
                placeholder="e.g. Aura Luxury Beverage Group"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Industry / Business Type</label>
                <span className="rounded bg-[#1a1a24] px-2 py-0.5 text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <input
                type="text"
                value={formData.industry || ''}
                onChange={(e) => handleTextChange('industry', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2.5 text-xs text-white placeholder-[#5d5d6e] focus:border-[#c5a059] focus:outline-none"
                placeholder="e.g. Luxury Goods, Fintech, Beverage"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Brand &amp; Business Overview</label>
                <span className="rounded bg-[#1a1a24] px-2 py-0.5 text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <textarea
                rows={3}
                value={formData.description || ''}
                onChange={(e) => handleTextChange('description', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2.5 text-xs text-white placeholder-[#5d5d6e] focus:border-[#c5a059] focus:outline-none"
                placeholder="Provide a comprehensive summary of brand positioning and products..."
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Official Website URL</label>
                <span className="text-[10px] font-medium text-[#737385]">OPTIONAL</span>
              </div>
              <div className="relative mt-1.5">
                <Globe className="absolute left-3 top-3 h-3.5 w-3.5 text-[#6c6c7d]" />
                <input
                  type="url"
                  value={formData.websiteUrl || ''}
                  onChange={(e) => handleTextChange('websiteUrl', e.target.value)}
                  className="w-full rounded-lg border border-[#282836] bg-[#121218] pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-[#5d5d6e] focus:border-[#c5a059] focus:outline-none"
                  placeholder="https://brand.example"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Advertising Category</label>
                <span className="text-[10px] font-medium text-[#737385]">OPTIONAL</span>
              </div>
              <input
                type="text"
                value={formData.advertisingCategory || ''}
                onChange={(e) => handleTextChange('advertisingCategory', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2.5 text-xs text-white placeholder-[#5d5d6e] focus:border-[#c5a059] focus:outline-none"
                placeholder="e.g. Premium Hospitality, Eco-Beverage"
              />
            </div>
          </div>
        </div>

        {/* Primary Contact & Location */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <User className="h-4 w-4" />
              <span>Primary Authorized Contact</span>
            </div>
            <p className="mt-1 text-xs text-[#8e8e9f]">
              Direct commercial liaison for campaign agreements.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-white">Contact Full Name</label>
                  <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
                </div>
                <input
                  type="text"
                  value={formData.primaryContact?.name || ''}
                  onChange={(e) => handleNestedChange('primaryContact', 'name', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-white">Contact Email</label>
                  <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
                </div>
                <input
                  type="email"
                  value={formData.primaryContact?.email || ''}
                  onChange={(e) => handleNestedChange('primaryContact', 'email', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[#9d9db3]">Job Title</label>
                  <input
                    type="text"
                    value={formData.primaryContact?.title || ''}
                    onChange={(e) => handleNestedChange('primaryContact', 'title', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                    placeholder="e.g. VP Brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#9d9db3]">Phone Number</label>
                  <input
                    type="tel"
                    value={formData.primaryContact?.phone || ''}
                    onChange={(e) => handleNestedChange('primaryContact', 'phone', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <MapPin className="h-4 w-4" />
              <span>Headquarters Location</span>
            </div>
            <p className="mt-1 text-xs text-[#8e8e9f]">
              Jurisdiction and primary operating territory.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-white">City</label>
                  <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
                </div>
                <input
                  type="text"
                  value={formData.location?.city || ''}
                  onChange={(e) => handleNestedChange('location', 'city', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  placeholder="e.g. San Francisco"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#9d9db3]">State / Region / Province</label>
                <input
                  type="text"
                  value={formData.location?.stateRegion || ''}
                  onChange={(e) => handleNestedChange('location', 'stateRegion', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  placeholder="e.g. California"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-white">Country</label>
                  <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
                </div>
                <input
                  type="text"
                  value={formData.location?.country || ''}
                  onChange={(e) => handleNestedChange('location', 'country', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  placeholder="e.g. United States"
                  required
                />
              </div>
            </div>
          </div>
        </div>

        {/* Target Audience & Matching Parameters */}
        <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <Target className="h-4 w-4" />
            <span>Target Audience &amp; Desired Venue Reach</span>
          </div>
          <p className="mt-1 text-xs text-[#8e8e9f]">
            Configure audience matching criteria used in future venue agreement proposals.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#9d9db3]">Audience Demographics &amp; Persona</label>
              <input
                type="text"
                value={formData.targetAudience?.demographics || ''}
                onChange={(e) => handleNestedChange('targetAudience', 'demographics', e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2.5 text-xs text-white placeholder-[#5d5d6e] focus:border-[#c5a059] focus:outline-none"
                placeholder="e.g. Affluent professionals, business travelers, luxury hospitality guests aged 28-55"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9d9db3]">Preferred Venue Environments</label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {venueTypeOptions.map((vType) => {
                  const isChecked = formData.targetAudience?.targetVenueTypes?.includes(vType);
                  return (
                    <button
                      type="button"
                      key={vType}
                      onClick={() => handleVenueTypeToggle(vType)}
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
                      <span className="truncate">{vType}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9d9db3]">Target Bottle Reach Horizon</label>
              <input
                type="text"
                value={formData.targetAudience?.preferredReach || ''}
                onChange={(e) => handleNestedChange('targetAudience', 'preferredReach', e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2.5 text-xs text-white placeholder-[#5d5d6e] focus:border-[#c5a059] focus:outline-none"
                placeholder="e.g. 25,000 - 50,000 bottles across 3 metropolitan regions"
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
            <span>Advertiser profile successfully updated and version incremented.</span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[#1c1c28] pt-6">
          <p className="text-[11px] text-[#6b6b7a]">
            Changes are saved server-side with audit logging.
          </p>
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center space-x-2 rounded-lg bg-[#c5a059] px-5 py-2.5 text-xs font-bold text-black hover:bg-[#d4af37] disabled:opacity-50 transition"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Updating Profile...' : 'Save Profile Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
