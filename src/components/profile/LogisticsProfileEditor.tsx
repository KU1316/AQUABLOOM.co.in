/**
 * AquaBloom Logistics Partner Profile Editor
 * 
 * Manages operational parameters for Freight & Logistics Partners:
 * - Carrier Business Name, Description, Hub Location
 * - Service Regions & Coverage Areas
 * - Fleet vehicle types, climate-controlled status, pallet weekly capacity
 * - Pickup / Delivery capabilities & Operating Dispatch Schedule
 * - Dedicated Approval Status Banner with admin review notes
 */

import React, { useState, useEffect } from 'react';
import { LogisticsProfile } from '../../types.js';
import { useAuth } from '../../context/AuthContext.js';
import { ProfileCompletionBar } from './ProfileCompletionBar.js';
import {
  Truck,
  MapPin,
  User,
  Navigation,
  Layers,
  Clock,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  XCircle,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
} from 'lucide-react';

interface LogisticsProfileEditorProps {
  profile: LogisticsProfile;
}

export const LogisticsProfileEditor: React.FC<LogisticsProfileEditorProps> = ({ profile: initialProfile }) => {
  const { updateProfile } = useAuth();
  const [formData, setFormData] = useState<Partial<LogisticsProfile>>(initialProfile);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [newRegion, setNewRegion] = useState('');

  useEffect(() => {
    setFormData(initialProfile);
  }, [initialProfile]);

  const handleTextChange = (field: keyof LogisticsProfile, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setSaveSuccess(false);
  };

  const handleNestedChange = <K extends 'primaryContact' | 'operatingLocation' | 'fleetCapabilities' | 'shipmentCapacity'>(
    parent: K,
    key: string,
    value: unknown
  ) => {
    setFormData((prev) => ({
      ...prev,
      [parent]: {
        ...((prev[parent] as Record<string, unknown>) || {}),
        [key]: value,
      },
    }));
    setSaveSuccess(false);
  };

  const handleVehicleToggle = (vehicleType: string) => {
    const current = formData.fleetCapabilities?.vehicleTypes || [];
    const updated = current.includes(vehicleType)
      ? current.filter((v) => v !== vehicleType)
      : [...current, vehicleType];
    handleNestedChange('fleetCapabilities', 'vehicleTypes', updated);
  };

  const addRegion = () => {
    if (!newRegion.trim()) return;
    const current = formData.serviceAreas || [];
    if (!current.includes(newRegion.trim())) {
      handleTextChange('serviceAreas', [...current, newRegion.trim()]);
    }
    setNewRegion('');
  };

  const removeRegion = (region: string) => {
    const current = formData.serviceAreas || [];
    handleTextChange(
      'serviceAreas',
      current.filter((r) => r !== region)
    );
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
        setErrorMessage(res.error || 'Failed to save logistics profile.');
      }
    } catch (err) {
      setErrorMessage('Network error while updating logistics profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const vehicleOptions = [
    '26ft Freight Box Truck (Hydraulic Liftgate)',
    'Sprinter Cargo Van (High-Roof Urban Delivery)',
    '53ft Dry Van Commercial Freight Semi',
    'Refrigerated Reefer Trailer (Cold-Chain)',
  ];

  const renderApprovalBanner = () => {
    const status = formData.approvalStatus || 'PENDING_REVIEW';
    switch (status) {
      case 'APPROVED':
        return (
          <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-5">
            <div className="flex items-start space-x-3">
              <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Carrier Authorization Approved
                  </span>
                  <span className="rounded-full border border-emerald-700 bg-emerald-900/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    VERIFIED CARRIER
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#a3a3b5]">
                  Carrier terminal, fleet insurance, and freight capacity have been authorized by AquaBloom administration for dispatch scheduling.
                </p>
                {formData.approvalNotes && (
                  <p className="mt-2 text-xs italic text-emerald-300/80">Admin Note: &ldquo;{formData.approvalNotes}&rdquo;</p>
                )}
              </div>
            </div>
          </div>
        );

      case 'PENDING_REVIEW':
        return (
          <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-5">
            <div className="flex items-start space-x-3">
              <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Carrier Review Underway
                  </span>
                  <span className="rounded-full border border-amber-700 bg-amber-900/40 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    PENDING REVIEW
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#a3a3b5]">
                  Your operating corridors and vehicle fleet parameters are under administrative review prior to route assignment.
                </p>
              </div>
            </div>
          </div>
        );

      case 'MORE_INFORMATION':
        return (
          <div className="rounded-xl border border-sky-800/40 bg-sky-950/20 p-5">
            <div className="flex items-start space-x-3">
              <HelpCircle className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                    Clarification Required
                  </span>
                  <span className="rounded-full border border-sky-700 bg-sky-900/40 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                    ACTION REQUIRED
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#a3a3b5]">
                  Administration requires clarification regarding terminal coverage or pallet weight ceilings.
                </p>
                {formData.approvalNotes && (
                  <div className="mt-2.5 rounded border border-sky-800/30 bg-sky-900/20 p-2.5 text-xs text-sky-300">
                    <strong>Admin Inquiry:</strong> {formData.approvalNotes}
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'REJECTED':
        return (
          <div className="rounded-xl border border-rose-800/40 bg-rose-950/20 p-5">
            <div className="flex items-start space-x-3">
              <XCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-400">
                    Carrier Application Declined
                  </span>
                  <span className="rounded-full border border-rose-700 bg-rose-900/40 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                    REJECTED
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#a3a3b5]">
                  The carrier profile does not fulfill current regional transit network requirements.
                </p>
                {formData.approvalNotes && (
                  <p className="mt-2 text-xs italic text-rose-300/80">Declination Note: &ldquo;{formData.approvalNotes}&rdquo;</p>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <ProfileCompletionBar
        completion={initialProfile.completion}
        metadata={{ version: initialProfile.version }}
        roleLabel="Logistics Partner"
      />

      {renderApprovalBanner()}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Carrier Info */}
        <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <Truck className="h-4 w-4" />
            <span>Carrier Identity &amp; Terminal Operations</span>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Carrier Enterprise Name</label>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <input
                type="text"
                value={formData.businessName || ''}
                onChange={(e) => handleTextChange('businessName', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2.5 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                placeholder="e.g. Velocity Freight & Express Transit"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Dispatch Operating Window</label>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <input
                type="text"
                value={formData.operationalAvailability || ''}
                onChange={(e) => handleTextChange('operationalAvailability', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2.5 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                placeholder="e.g. Monday - Saturday 06:00 - 20:00 PST"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Fleet &amp; Service Description</label>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <textarea
                rows={3}
                value={formData.description || ''}
                onChange={(e) => handleTextChange('description', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2.5 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                placeholder="Provide details on transit hub locations, security measures, and fleet compliance..."
                required
              />
            </div>
          </div>
        </div>

        {/* Contact & Terminal Location */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <User className="h-4 w-4" />
              <span>Dispatch &amp; Operations Contact</span>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-white">Coordinator Name</label>
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
                  <label className="block text-xs font-semibold text-white">Dispatch Email</label>
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
                  <label className="block text-xs font-medium text-[#9d9db3]">Title</label>
                  <input
                    type="text"
                    value={formData.primaryContact?.dispatchTitle || ''}
                    onChange={(e) => handleNestedChange('primaryContact', 'dispatchTitle', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                    placeholder="Chief Dispatcher"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#9d9db3]">Phone</label>
                  <input
                    type="tel"
                    value={formData.primaryContact?.phone || ''}
                    onChange={(e) => handleNestedChange('primaryContact', 'phone', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <MapPin className="h-4 w-4" />
              <span>Primary Operating Hub</span>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-white">Hub City</label>
                  <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
                </div>
                <input
                  type="text"
                  value={formData.operatingLocation?.hubCity || ''}
                  onChange={(e) => handleNestedChange('operatingLocation', 'hubCity', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  placeholder="e.g. Seattle"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#9d9db3]">State / Region</label>
                <input
                  type="text"
                  value={formData.operatingLocation?.stateRegion || ''}
                  onChange={(e) => handleNestedChange('operatingLocation', 'stateRegion', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  placeholder="e.g. Washington"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-white">Country</label>
                  <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
                </div>
                <input
                  type="text"
                  value={formData.operatingLocation?.country || ''}
                  onChange={(e) => handleNestedChange('operatingLocation', 'country', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  placeholder="e.g. United States"
                  required
                />
              </div>
            </div>
          </div>
        </div>

        {/* Coverage Areas */}
        <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <Navigation className="h-4 w-4" />
            <span>Service Corridors &amp; Coverage Areas</span>
          </div>

          <div className="mt-4">
            <div className="flex space-x-2">
              <input
                type="text"
                value={newRegion}
                onChange={(e) => setNewRegion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRegion())}
                placeholder="e.g. San Francisco Bay Area, Los Angeles Metro, Seattle Corridor"
                className="w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
              />
              <button
                type="button"
                onClick={addRegion}
                className="rounded-lg bg-[#c5a059] px-4 py-2 text-xs font-bold text-black hover:bg-[#d4af37]"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {formData.serviceAreas?.map((region: string) => (
                <span
                  key={region}
                  className="inline-flex items-center space-x-1.5 rounded-lg border border-[#303042] bg-[#14141c] px-3 py-1 text-xs text-white"
                >
                  <span>{region}</span>
                  <button type="button" onClick={() => removeRegion(region)}>
                    <X className="h-3.5 w-3.5 text-[#737385] hover:text-white" />
                  </button>
                </span>
              ))}
              {(!formData.serviceAreas || formData.serviceAreas.length === 0) && (
                <span className="text-xs text-[#737385]">No coverage regions designated yet. At least 1 required.</span>
              )}
            </div>
          </div>
        </div>

        {/* Fleet & Shipment Capacity */}
        <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <Layers className="h-4 w-4" />
            <span>Fleet Specifications &amp; Pallet Volume Capacity</span>
          </div>

          <div className="mt-6 space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Vehicle Fleet Classifications</span>
                <span className="text-[10px] font-bold text-[#c5a059]">AT LEAST 1 REQUIRED</span>
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {vehicleOptions.map((v) => {
                  const isChecked = formData.fleetCapabilities?.vehicleTypes?.includes(v);
                  return (
                    <button
                      type="button"
                      key={v}
                      onClick={() => handleVehicleToggle(v)}
                      className={`flex items-center space-x-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                        isChecked
                          ? 'border-[#c5a059] bg-[#c5a059]/10 text-[#d4af37]'
                          : 'border-[#242432] bg-[#111116] text-[#8e8e9f]'
                      }`}
                    >
                      <span
                        className={`h-3 w-3 rounded-full border ${
                          isChecked ? 'border-[#c5a059] bg-[#c5a059]' : 'border-[#444455]'
                        }`}
                      />
                      <span className="truncate">{v}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-white">Max Pallets Per Week</label>
                  <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
                </div>
                <input
                  type="number"
                  min="0"
                  value={formData.shipmentCapacity?.palletsPerWeek ?? 0}
                  onChange={(e) =>
                    handleNestedChange('shipmentCapacity', 'palletsPerWeek', parseInt(e.target.value, 10) || 0)
                  }
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2 text-xs text-white font-mono focus:border-[#c5a059] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white">Max Payload Weight (kg)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.shipmentCapacity?.maxPayloadWeightKg ?? 0}
                  onChange={(e) =>
                    handleNestedChange('shipmentCapacity', 'maxPayloadWeightKg', parseInt(e.target.value, 10) || 0)
                  }
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2 text-xs text-white font-mono focus:border-[#c5a059] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.fleetCapabilities?.temperatureControlled ?? false}
                  onChange={(e) =>
                    handleNestedChange('fleetCapabilities', 'temperatureControlled', e.target.checked)
                  }
                  className="h-4 w-4 rounded border-[#343444] bg-[#121218] text-[#c5a059] focus:ring-[#c5a059]"
                />
                <span className="text-xs font-medium text-white">
                  Active temperature-controlled (climate-monitored refrigerated) transport capability
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-white">Pickup &amp; Dock Loading Capability</label>
                  <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
                </div>
                <input
                  type="text"
                  value={formData.pickupCapability || ''}
                  onChange={(e) => handleTextChange('pickupCapability', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  placeholder="e.g. Direct Supplier Dock Loading, Hydraulic Liftgate"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-white">Venue Delivery &amp; Unloading Capability</label>
                  <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
                </div>
                <input
                  type="text"
                  value={formData.deliveryCapability || ''}
                  onChange={(e) => handleTextChange('deliveryCapability', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  placeholder="e.g. Inside White-Glove Placement, Scheduled Window"
                  required
                />
              </div>
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
            <span>Logistics partner profile saved and version incremented.</span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[#1c1c28] pt-6">
          <p className="text-[11px] text-[#6b6b7a]">
            Changes are saved to the AquaBloom freight network database.
          </p>
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center space-x-2 rounded-lg bg-[#c5a059] px-5 py-2.5 text-xs font-bold text-black hover:bg-[#d4af37] disabled:opacity-50 transition"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Saving Profile...' : 'Save Logistics Profile'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
