/**
 * AquaBloom Campaign Editor Modal
 * 
 * Step 4: Authoritative multi-section progressive form for:
 * 1. Campaign Basics (Name, Category, Objective, Description)
 * 2. Target Audience (Characteristics, Demographics, Age Groups)
 * 3. Venue Requirements (Preferred Types, Geographic Locations, Preferences)
 * 4. Bottle Requirements (Quantity, Volume, Material, Shape, Finish, Cap, Label)
 * 5. Campaign Timing (Duration, Unit, Preferred Start Period)
 * 6. Distribution & Placement (Placement Details, Pace, Refrigeration)
 * 7. Collaboration (Status, Terms)
 * 8. Eligibility & Guidelines (Footfall, Exclusions, Criteria)
 * 9. Budget & Opportunity Preview (Published Budget, Range, Live Preview)
 */

import React, { useState } from 'react';
import {
  Campaign,
  CreateCampaignInput,
  UpdateCampaignInput,
  CampaignValidationResult,
} from '../../types.js';
import { api } from '../../lib/api.js';
import {
  X,
  Save,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Layers,
  MapPin,
  Clock,
  Eye,
  DollarSign,
  ChevronRight,
  Plus,
  Trash2,
} from 'lucide-react';

interface CampaignEditorModalProps {
  campaign?: Campaign | null; // Null if creating new
  onClose: () => void;
  onSuccess: (savedCampaign: Campaign) => void;
}

const COMMON_VENUE_TYPES = [
  'Corporate Tech Park',
  'Gym & Fitness Studio',
  'Coworking Space',
  'Boutique Hotel & Resort',
  'Luxury Salon & Spa',
  'Conference & Expo Center',
  'Private Golf & Country Club',
  'Premium Healthcare Clinic',
  'University Campus Hub',
  'Airport VIP Lounge',
];

const COMMON_MATERIALS = [
  '100% rPET (Recycled Eco-PET)',
  'Aluminum Sleek Can',
  'Flint Glass Bottle',
  'Virgin Bio-PET',
];

const COMMON_OBJECTIVES = [
  'High-Impact Brand Awareness',
  'Direct Product / App Launch',
  'Targeted Footfall Drive',
  'Event / Conference Sponsorship',
  'Audience Dwell-Time Immersion',
];

export const CampaignEditorModal: React.FC<CampaignEditorModalProps> = ({
  campaign,
  onClose,
  onSuccess,
}) => {
  const isEditing = !!campaign;

  // Active step in progressive form
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<CampaignValidationResult | null>(null);

  // Form State
  const [name, setName] = useState(campaign?.name || '');
  const [description, setDescription] = useState(campaign?.description || '');
  const [category, setCategory] = useState(campaign?.category || 'Technology & SaaS');
  const [objective, setObjective] = useState(campaign?.objective || COMMON_OBJECTIVES[0]);

  // Target Audience
  const [characteristics, setCharacteristics] = useState<string[]>(
    campaign?.targetAudience?.characteristics || ['Tech-savvy Professionals', 'Fitness Enthusiasts']
  );
  const [newChar, setNewChar] = useState('');
  const [demographics, setDemographics] = useState(campaign?.targetAudience?.demographics || 'Ages 22-45, Urban Tier-1');
  const [ageGroups, setAgeGroups] = useState<string[]>(campaign?.targetAudience?.ageGroups || ['22-34', '35-44']);

  // Venue Requirements
  const [preferredVenueTypes, setPreferredVenueTypes] = useState<string[]>(
    campaign?.venueRequirements?.preferredVenueTypes || ['Corporate Tech Park', 'Coworking Space']
  );
  const [preferredLocations, setPreferredLocations] = useState<
    Array<{ city: string; stateRegion?: string; area?: string; country: string }>
  >(
    campaign?.venueRequirements?.preferredLocations || [
      { city: 'Bengaluru', stateRegion: 'Karnataka', area: 'Outer Ring Road / Whitefield', country: 'India' },
    ]
  );
  const [newCity, setNewCity] = useState('');
  const [newArea, setNewArea] = useState('');

  const [placementRequirements, setPlacementRequirements] = useState<string[]>(
    campaign?.venueRequirements?.placementRequirements || ['Reception / Front Desk Chiller', 'Executive Meeting Rooms']
  );
  const [newPlacement, setNewPlacement] = useState('');

  // Bottle Requirements
  const [requiredQuantity, setRequiredQuantity] = useState<number>(
    campaign?.bottleRequirements?.requiredQuantity || 10000
  );
  const [preferredVolumeMl, setPreferredVolumeMl] = useState<number>(
    campaign?.bottleRequirements?.preferredVolumeMl || 500
  );
  const [preferredMaterial, setPreferredMaterial] = useState<string>(
    campaign?.bottleRequirements?.preferredMaterial || COMMON_MATERIALS[0]
  );
  const [preferredShape, setPreferredShape] = useState<string>(
    campaign?.bottleRequirements?.preferredShape || 'Classic Cylinder'
  );
  const [bottleFinish, setBottleFinish] = useState<string>(
    campaign?.bottleRequirements?.bottleFinish || 'Clear Gloss'
  );
  const [labelType, setLabelType] = useState<string>(
    campaign?.bottleRequirements?.labelType || 'Full-Wrap Shrink Sleeve (CMYK)'
  );

  // Timing
  const [durationValue, setDurationValue] = useState<number>(campaign?.timing?.duration?.value || 4);
  const [durationUnit, setDurationUnit] = useState<'DAYS' | 'WEEKS' | 'MONTHS'>(
    campaign?.timing?.duration?.unit || 'WEEKS'
  );
  const [startPeriodLabel, setStartPeriodLabel] = useState<string>(
    campaign?.timing?.preferredStartPeriod?.label || 'Immediate (Next 30 Days)'
  );
  const [startWindowStart, setStartWindowStart] = useState<string>(
    campaign?.timing?.preferredStartPeriod?.windowStart || ''
  );
  const [startWindowEnd, setStartWindowEnd] = useState<string>(
    campaign?.timing?.preferredStartPeriod?.windowEnd || ''
  );

  // Distribution
  const [placementDetails, setPlacementDetails] = useState<string>(
    campaign?.distributionRequirements?.placementDetails ||
      'Placement in prominent front desk chiller and board meeting hospitality stations.'
  );
  const [refrigerationRequired, setRefrigerationRequired] = useState<boolean>(
    campaign?.distributionRequirements?.refrigerationRequired ?? true
  );

  // Collaboration
  const [collabStatus, setCollabStatus] = useState<'NOT_REQUIRED' | 'OPEN_TO_COLLABORATION' | 'REQUIRED'>(
    campaign?.collaborationRequirement?.status || 'OPEN_TO_COLLABORATION'
  );
  const [collabTerms, setCollabTerms] = useState<string>(
    campaign?.collaborationRequirement?.preferredTerms || 'Open to co-branded venue signage or digital screen tie-ins.'
  );

  // Eligibility
  const [minFootfall, setMinFootfall] = useState<number | undefined>(
    campaign?.eligibilityRequirements?.minimumFootfall || 5000
  );
  const [venueCriteriaText, setVenueCriteriaText] = useState<string>(
    campaign?.eligibilityRequirements?.venueCriteria?.join('\n') ||
      'No concurrent direct beverage competitor advertising.\nClean branded chiller placement.'
  );

  // Budget
  const [budgetDisclosed, setBudgetDisclosed] = useState<boolean>(
    campaign?.publishedBudget?.disclosed ?? true
  );
  const [minBudget, setMinBudget] = useState<number>(campaign?.publishedBudget?.minAmount || 150000);
  const [maxBudget, setMaxBudget] = useState<number>(campaign?.publishedBudget?.maxAmount || 350000);

  // Change Reason (for updates)
  const [changeReason, setChangeReason] = useState<string>('');

  // Helpers
  const addCharacteristic = () => {
    if (newChar.trim() && !characteristics.includes(newChar.trim())) {
      setCharacteristics([...characteristics, newChar.trim()]);
      setNewChar('');
    }
  };

  const removeCharacteristic = (item: string) => {
    setCharacteristics(characteristics.filter((c) => c !== item));
  };

  const toggleVenueType = (vt: string) => {
    if (preferredVenueTypes.includes(vt)) {
      setPreferredVenueTypes(preferredVenueTypes.filter((t) => t !== vt));
    } else {
      setPreferredVenueTypes([...preferredVenueTypes, vt]);
    }
  };

  const addLocation = () => {
    if (newCity.trim()) {
      setPreferredLocations([
        ...preferredLocations,
        {
          city: newCity.trim(),
          area: newArea.trim() || undefined,
          country: 'India',
        },
      ]);
      setNewCity('');
      setNewArea('');
    }
  };

  const removeLocation = (index: number) => {
    setPreferredLocations(preferredLocations.filter((_, idx) => idx !== index));
  };

  const addPlacement = () => {
    if (newPlacement.trim() && !placementRequirements.includes(newPlacement.trim())) {
      setPlacementRequirements([...placementRequirements, newPlacement.trim()]);
      setNewPlacement('');
    }
  };

  const removePlacement = (item: string) => {
    setPlacementRequirements(placementRequirements.filter((p) => p !== item));
  };

  // Build payload
  const buildPayload = (): CreateCampaignInput => {
    return {
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      objective: objective.trim(),
      targetAudience: {
        characteristics,
        demographics: demographics.trim(),
        ageGroups,
      },
      venueRequirements: {
        preferredVenueTypes,
        preferredLocations,
        campaignPreferences: ['High-dwell-time immersion', 'Premium physical display'],
        placementRequirements,
      },
      bottleRequirements: {
        requiredQuantity: Number(requiredQuantity),
        preferredVolumeMl: Number(preferredVolumeMl),
        volumeLabel: `${preferredVolumeMl} ml`,
        preferredMaterial,
        preferredShape,
        bottleFinish,
        labelType,
      },
      timing: {
        duration: {
          value: Number(durationValue),
          unit: durationUnit,
        },
        preferredStartPeriod: {
          label: startPeriodLabel.trim(),
          windowStart: startWindowStart || undefined,
          windowEnd: startWindowEnd || undefined,
        },
      },
      distributionRequirements: {
        placementDetails: placementDetails.trim(),
        refrigerationRequired,
      },
      collaborationRequirement: {
        status: collabStatus,
        preferredTerms: collabTerms.trim(),
      },
      eligibilityRequirements: {
        minimumFootfall: minFootfall ? Number(minFootfall) : undefined,
        venueCriteria: venueCriteriaText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      },
      publishedBudget: {
        disclosed: budgetDisclosed,
        minAmount: budgetDisclosed ? Number(minBudget) : undefined,
        maxAmount: budgetDisclosed ? Number(maxBudget) : undefined,
        currency: 'INR',
      },
    };
  };

  // Handle Save as DRAFT
  const handleSaveDraft = async () => {
    setErrorMessage(null);
    if (!name.trim()) {
      setErrorMessage('Campaign name is required.');
      setActiveStep(1);
      return;
    }
    if (name.trim().length < 3) {
      setErrorMessage('Campaign name must be at least 3 characters.');
      setActiveStep(1);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = buildPayload();

      if (isEditing && campaign) {
        const updatePayload: UpdateCampaignInput = {
          ...payload,
          changeReason: changeReason.trim() || 'Updated campaign draft',
        };
        const res = await api.updateCampaign(campaign.id, updatePayload);
        if (res.error) {
          setErrorMessage(res.error.message);
        } else if (res.data) {
          onSuccess(res.data.campaign);
        }
      } else {
        const res = await api.createCampaign({ ...payload, status: 'DRAFT' });
        if (res.error) {
          setErrorMessage(res.error.message);
        } else if (res.data) {
          onSuccess(res.data.campaign);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save campaign draft.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Submit for Matching
  const handleSubmitForMatching = async () => {
    setErrorMessage(null);
    if (!name.trim()) {
      setErrorMessage('Campaign name is required.');
      setActiveStep(1);
      return;
    }
    if (name.trim().length < 3) {
      setErrorMessage('Campaign name must be at least 3 characters.');
      setActiveStep(1);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = buildPayload();

      if (isEditing && campaign) {
        // First update with latest values
        const updateRes = await api.updateCampaign(campaign.id, {
          ...payload,
          changeReason: changeReason.trim() || 'Submitting campaign for venue matching',
        });
        if (updateRes.error) {
          setErrorMessage(updateRes.error.message);
          setIsSubmitting(false);
          return;
        }

        // Then execute backend prepare-for-matching transition
        const matchRes = await api.prepareCampaignForMatching(campaign.id);
        if (matchRes.error) {
          setErrorMessage(matchRes.error.message);
          if (matchRes.data?.validationResult) {
            setValidationResult(matchRes.data.validationResult);
          }
        } else if (matchRes.data) {
          onSuccess(matchRes.data.campaign);
        }
      } else {
        // Create directly as READY_FOR_MATCHING
        const createRes = await api.createCampaign({ ...payload, status: 'READY_FOR_MATCHING' });
        if (createRes.error) {
          setErrorMessage(createRes.error.message);
        } else if (createRes.data) {
          onSuccess(createRes.data.campaign);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit campaign for matching.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { id: 1, label: 'Basics & Objective' },
    { id: 2, label: 'Target Audience' },
    { id: 3, label: 'Venues & Geography' },
    { id: 4, label: 'Bottle Specifications' },
    { id: 5, label: 'Timing & Placement' },
    { id: 6, label: 'Budget & Visibility' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#0c0c12] border border-[#232332] rounded-2xl shadow-2xl text-white my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1c1c28] bg-[#11111a]">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Sparkles className="h-4 w-4" />
              <span>Advertiser Campaign Engine</span>
            </div>
            <h2 className="text-xl font-display font-bold text-white mt-1">
              {isEditing ? `Edit Campaign: ${campaign.name}` : 'Author Advertising Campaign'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[#7d7d91] hover:bg-[#1a1a26] hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step Navigation Bar */}
        <div className="flex border-b border-[#1c1c28] bg-[#09090e] px-6 overflow-x-auto text-xs font-medium">
          {steps.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveStep(s.id)}
              className={`py-3 px-4 flex items-center space-x-2 whitespace-nowrap border-b-2 transition ${
                activeStep === s.id
                  ? 'border-[#c5a059] text-[#c5a059] font-bold'
                  : 'border-transparent text-[#7e7e94] hover:text-white'
              }`}
            >
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${
                activeStep === s.id ? 'bg-[#c5a059] text-black font-bold' : 'bg-[#181824] text-[#8e8ea6]'
              }`}>
                {s.id}
              </span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Error notification banner */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-4 rounded-xl border border-red-800/50 bg-red-950/30 text-xs text-red-300 flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{errorMessage}</p>
              {validationResult?.errors && validationResult.errors.length > 0 && (
                <ul className="mt-2 list-disc list-inside space-y-1 text-red-400/90 text-[11px]">
                  {validationResult.errors.map((e, idx) => (
                    <li key={idx}>{e.message}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Modal Form Body */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
          {/* STEP 1: BASICS & OBJECTIVE */}
          {activeStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#b8b8cc]">
                  Campaign Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Summer FinTech Hydration Showcase"
                  className="mt-1 w-full rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white placeholder-[#5d5d73] focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#b8b8cc]">
                    Industry Category <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Technology, Financial Services, Luxury Fashion"
                    className="mt-1 w-full rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white placeholder-[#5d5d73] focus:border-[#c5a059] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#b8b8cc]">
                    Primary Objective <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white focus:border-[#c5a059] focus:outline-none"
                  >
                    {COMMON_OBJECTIVES.map((obj) => (
                      <option key={obj} value={obj}>
                        {obj}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#b8b8cc]">
                  Campaign Narrative &amp; Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your brand message, key value proposition, and how you want attendees to interact with the bottles..."
                  className="mt-1 w-full rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white placeholder-[#5d5d73] focus:border-[#c5a059] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* STEP 2: TARGET AUDIENCE */}
          {activeStep === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#b8b8cc]">
                  Target Demographics
                </label>
                <input
                  type="text"
                  value={demographics}
                  onChange={(e) => setDemographics(e.target.value)}
                  placeholder="e.g. Urban Professionals, Ages 24-45, High-Disposable Income"
                  className="mt-1 w-full rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white placeholder-[#5d5d73] focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#b8b8cc]">
                  Audience Characteristics &amp; Traits <span className="text-red-400">*</span>
                </label>
                <div className="flex space-x-2 mt-1">
                  <input
                    type="text"
                    value={newChar}
                    onChange={(e) => setNewChar(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCharacteristic())}
                    placeholder="e.g. Enterprise Decision Makers, Eco-Conscious"
                    className="flex-1 rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white placeholder-[#5d5d73] focus:border-[#c5a059] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addCharacteristic}
                    className="rounded-lg bg-[#c5a059] px-4 py-2 text-xs font-bold text-black hover:bg-[#d4af37]"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  {characteristics.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center space-x-1.5 rounded-full border border-[#2a2a3c] bg-[#14141f] px-3 py-1 text-xs text-[#cfcfe0]"
                    >
                      <span>{c}</span>
                      <button
                        type="button"
                        onClick={() => removeCharacteristic(c)}
                        className="text-[#7d7d91] hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: VENUES & GEOGRAPHY */}
          {activeStep === 3 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-[#b8b8cc]">
                  Preferred Venue Types <span className="text-red-400">*</span>
                </label>
                <p className="text-[11px] text-[#78788c] mt-0.5 mb-2">
                  Select which physical environments align with your target audience dwell time.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {COMMON_VENUE_TYPES.map((vt) => {
                    const selected = preferredVenueTypes.includes(vt);
                    return (
                      <button
                        key={vt}
                        type="button"
                        onClick={() => toggleVenueType(vt)}
                        className={`rounded-lg p-2.5 text-left text-xs font-medium border transition ${
                          selected
                            ? 'border-[#c5a059] bg-[#c5a059]/10 text-[#d4af37]'
                            : 'border-[#222230] bg-[#11111a] text-[#8e8ea6] hover:border-[#38384d]'
                        }`}
                      >
                        {vt}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#b8b8cc]">
                  Target Geographic Locations (City &amp; Hubs) <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
                  <input
                    type="text"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    placeholder="City (e.g. Mumbai, Bengaluru)"
                    className="rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white placeholder-[#5d5d73] focus:border-[#c5a059] focus:outline-none"
                  />
                  <input
                    type="text"
                    value={newArea}
                    onChange={(e) => setNewArea(e.target.value)}
                    placeholder="Area/Hub (e.g. BKC, Koramangala)"
                    className="rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white placeholder-[#5d5d73] focus:border-[#c5a059] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addLocation}
                    className="rounded-lg bg-[#1e1e2c] border border-[#313145] px-4 py-2 text-xs font-semibold text-white hover:border-[#c5a059]"
                  >
                    Add Location
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {preferredLocations.map((loc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-[#212130] bg-[#11111a] px-3 py-2 text-xs"
                    >
                      <div className="flex items-center space-x-2">
                        <MapPin className="h-3.5 w-3.5 text-[#c5a059]" />
                        <span className="font-semibold text-white">{loc.city}</span>
                        {loc.area && <span className="text-[#88889c]">({loc.area})</span>}
                        <span className="text-[#656578]">&bull; {loc.country}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLocation(idx)}
                        className="text-[#7d7d91] hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: BOTTLE SPECIFICATIONS */}
          {activeStep === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#b8b8cc]">
                    Required Bottle Quantity <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    min={500}
                    step={100}
                    value={requiredQuantity}
                    onChange={(e) => setRequiredQuantity(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white placeholder-[#5d5d73] focus:border-[#c5a059] focus:outline-none"
                  />
                  <span className="text-[10px] text-[#737385] mt-1 block">
                    Planned production run for campaign distribution.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#b8b8cc]">
                    Preferred Bottle Volume <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={preferredVolumeMl}
                    onChange={(e) => setPreferredVolumeMl(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white focus:border-[#c5a059] focus:outline-none"
                  >
                    <option value={250}>250 ml (Event Compact)</option>
                    <option value={330}>330 ml (Sleek)</option>
                    <option value={500}>500 ml (Standard)</option>
                    <option value={750}>750 ml (Premium Hospitality)</option>
                    <option value={1000}>1,000 ml (Table Bottle)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#b8b8cc]">
                    Eco Material Preferred
                  </label>
                  <select
                    value={preferredMaterial}
                    onChange={(e) => setPreferredMaterial(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white focus:border-[#c5a059] focus:outline-none"
                  >
                    {COMMON_MATERIALS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#b8b8cc]">
                    Label &amp; Print Technique
                  </label>
                  <input
                    type="text"
                    value={labelType}
                    onChange={(e) => setLabelType(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white placeholder-[#5d5d73] focus:border-[#c5a059] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: TIMING & PLACEMENT */}
          {activeStep === 5 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#b8b8cc]">
                    Campaign Duration <span className="text-red-400">*</span>
                  </label>
                  <div className="flex space-x-2 mt-1">
                    <input
                      type="number"
                      min={1}
                      value={durationValue}
                      onChange={(e) => setDurationValue(Number(e.target.value))}
                      className="w-24 rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white focus:border-[#c5a059] focus:outline-none"
                    />
                    <select
                      value={durationUnit}
                      onChange={(e) => setDurationUnit(e.target.value as any)}
                      className="flex-1 rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white focus:border-[#c5a059] focus:outline-none"
                    >
                      <option value="DAYS">Days</option>
                      <option value="WEEKS">Weeks</option>
                      <option value="MONTHS">Months</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#b8b8cc]">
                    Preferred Start Period <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={startPeriodLabel}
                    onChange={(e) => setStartPeriodLabel(e.target.value)}
                    placeholder="e.g. Q4 2026, Immediate, November 2026"
                    className="mt-1 w-full rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white placeholder-[#5d5d73] focus:border-[#c5a059] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#b8b8cc]">
                  On-Site Placement Details <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={2}
                  value={placementDetails}
                  onChange={(e) => setPlacementDetails(e.target.value)}
                  placeholder="Specify where and how the bottles should be presented to attendees..."
                  className="mt-1 w-full rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white placeholder-[#5d5d73] focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-3 rounded-lg border border-[#21212d] bg-[#111118] p-3">
                <input
                  type="checkbox"
                  id="refrigerationCheckbox"
                  checked={refrigerationRequired}
                  onChange={(e) => setRefrigerationRequired(e.target.checked)}
                  className="rounded border-[#313145] text-[#c5a059] focus:ring-0"
                />
                <label htmlFor="refrigerationCheckbox" className="text-xs text-[#cfcfe0]">
                  Refrigerated display required (Venue must provide chilled display unit or AquaBloom Chiller)
                </label>
              </div>
            </div>
          )}

          {/* STEP 6: BUDGET & VISIBILITY */}
          {activeStep === 6 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#232332] bg-[#11111a] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                      Published Budget Range (Optional)
                    </h4>
                    <p className="text-[11px] text-[#7f7f94] mt-0.5">
                      You may disclose a target budget range to attract high-tier matching venues.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={budgetDisclosed}
                      onChange={(e) => setBudgetDisclosed(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#20202e] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#c5a059]"></div>
                  </label>
                </div>

                {budgetDisclosed && (
                  <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-[#1e1e2c]">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#a5a5bb]">
                        Minimum Budget (INR ₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={10000}
                        value={minBudget}
                        onChange={(e) => setMinBudget(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-[#262638] bg-[#141420] px-3.5 py-1.5 text-sm text-white focus:border-[#c5a059] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#a5a5bb]">
                        Maximum Budget (INR ₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={10000}
                        value={maxBudget}
                        onChange={(e) => setMaxBudget(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-[#262638] bg-[#141420] px-3.5 py-1.5 text-sm text-white focus:border-[#c5a059] focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {isEditing && (
                <div>
                  <label className="block text-xs font-semibold text-[#b8b8cc]">
                    Reason for Revision (Audit Log)
                  </label>
                  <input
                    type="text"
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    placeholder="e.g. Expanded target volume from 5,000 to 10,000 bottles"
                    className="mt-1 w-full rounded-lg border border-[#262638] bg-[#12121c] px-3.5 py-2 text-sm text-white placeholder-[#5d5d73] focus:border-[#c5a059] focus:outline-none"
                  />
                </div>
              )}

              {/* Strict Public Boundary Notice */}
              <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 p-4 text-xs text-blue-200/90 leading-relaxed">
                <div className="flex items-center space-x-2 font-bold text-blue-300 mb-1">
                  <Eye className="h-4 w-4" />
                  <span>Public Boundary Guarantee</span>
                </div>
                Only sanitized opportunity specs (objective, venue types, volume, timing) are shared during matching.
                Private advertiser account details, internal billing records, margins, and private contact info are strictly isolated.
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-[#1c1c28] bg-[#0c0c12]">
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            {activeStep > 1 && (
              <button
                type="button"
                onClick={() => setActiveStep(activeStep - 1)}
                className="rounded-lg border border-[#2a2a3b] bg-[#14141f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1f1f2e]"
              >
                Previous Step
              </button>
            )}
            {activeStep < steps.length && (
              <button
                type="button"
                onClick={() => setActiveStep(activeStep + 1)}
                className="rounded-lg border border-[#c5a059]/40 bg-[#161622] px-4 py-2 text-xs font-semibold text-[#d4af37] hover:bg-[#1e1e2d] flex items-center space-x-1"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSubmitting}
              className="rounded-lg border border-[#303042] bg-[#161622] px-4 py-2 text-xs font-semibold text-white hover:bg-[#202030] disabled:opacity-50 flex items-center space-x-1.5"
            >
              <Save className="h-3.5 w-3.5 text-[#c5a059]" />
              <span>Save as Draft</span>
            </button>

            <button
              type="button"
              onClick={handleSubmitForMatching}
              disabled={isSubmitting}
              className="rounded-lg bg-[#c5a059] px-4 py-2 text-xs font-bold text-black hover:bg-[#d4af37] disabled:opacity-50 flex items-center space-x-1.5"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              <span>Validate &amp; Submit for Matching</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
