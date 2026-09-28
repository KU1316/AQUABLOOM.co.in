/**
 * AquaBloom Supplier & Bottler Profile Editor
 * 
 * Manages operational parameters for Production & Bottling Partners:
 * - Plant Business Name, Description, Primary Contact
 * - Bottling Facility Location (City, State/Province, Country)
 * - Material & Packaging Capabilities (Water types, materials, sizes, finishes)
 * - Monthly capacity (bottles/mo) & standard turnaround lead times
 * - Approval Status Lifecycle Banner & Review Notes
 */

import React, { useState, useEffect } from 'react';
import { SupplierProfile } from '../../types.js';
import { useAuth } from '../../context/AuthContext.js';
import { ProfileCompletionBar } from './ProfileCompletionBar.js';
import {
  Factory,
  MapPin,
  User,
  Layers,
  Sparkles,
  Clock,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  XCircle,
  Save,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface SupplierProfileEditorProps {
  profile: SupplierProfile;
}

export const SupplierProfileEditor: React.FC<SupplierProfileEditorProps> = ({ profile: initialProfile }) => {
  const { updateProfile } = useAuth();
  const [formData, setFormData] = useState<Partial<SupplierProfile>>(initialProfile);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setFormData(initialProfile);
  }, [initialProfile]);

  const handleTextChange = (field: keyof SupplierProfile, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setSaveSuccess(false);
  };

  const handleNestedChange = <K extends 'primaryContact' | 'operatingLocation' | 'capabilities' | 'productionCapacity' | 'leadTimeInfo'>(
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

  const handleCapabilityToggle = (
    category: 'waterTypes' | 'bottleMaterials' | 'bottleSizes' | 'bottleShapes' | 'printingFinishes',
    item: string
  ) => {
    const current = formData.capabilities?.[category] || [];
    const updated = current.includes(item)
      ? current.filter((i) => i !== item)
      : [...current, item];
    handleNestedChange('capabilities', category, updated);
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
        setErrorMessage(res.error || 'Failed to save supplier profile.');
      }
    } catch (err) {
      setErrorMessage('Network error while updating supplier profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const waterTypeOptions = ['Purified Spring Water', 'Electrolyte Alkaline Water', 'Sparkling Mineral Water', 'Distilled Deionized'];
  const materialOptions = ['100% rPET (Recycled Plastic)', 'Virgin Eco-PET', 'Glass (Classic Flint)', 'Recyclable Aluminum Bottle'];
  const sizeOptions = ['330ml (Slim Pocket)', '500ml (Standard Event)', '750ml (Premium Dining)', '1000ml (1 Liter)'];
  const finishOptions = ['Full-Wrap Waterproof Matte', 'High-Gloss Metallic Foil', 'Transparent Direct Screen Print', 'Textured Embossed Paper'];

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
                    Production Authorization Approved
                  </span>
                  <span className="rounded-full border border-emerald-700 bg-emerald-900/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    APPROVED
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#a3a3b5]">
                  Your bottling facility is verified and authorized to receive batch work orders and artwork proofs.
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
                    Supplier Review Underway
                  </span>
                  <span className="rounded-full border border-amber-700 bg-amber-900/40 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    PENDING REVIEW
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#a3a3b5]">
                  Your production capabilities and sanitation certifications are undergoing review by AquaBloom administration.
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
                    Additional Information Requested
                  </span>
                  <span className="rounded-full border border-sky-700 bg-sky-900/40 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                    ACTION REQUIRED
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#a3a3b5]">
                  AquaBloom administrative team has requested clarification regarding facility capacity or water certifications.
                </p>
                {formData.approvalNotes && (
                  <div className="mt-2.5 rounded border border-sky-800/30 bg-sky-900/20 p-2.5 text-xs text-sky-300">
                    <strong>Admin Note:</strong> {formData.approvalNotes}
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
                    Application Declined
                  </span>
                  <span className="rounded-full border border-rose-700 bg-rose-900/40 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                    REJECTED
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#a3a3b5]">
                  This bottling profile does not currently fulfill AquaBloom platform criteria.
                </p>
                {formData.approvalNotes && (
                  <p className="mt-2 text-xs italic text-rose-300/80">Declination Reason: &ldquo;{formData.approvalNotes}&rdquo;</p>
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
        roleLabel="Production Supplier"
      />

      {renderApprovalBanner()}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Facility Info */}
        <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <Factory className="h-4 w-4" />
            <span>Bottling Facility &amp; Operational Enterprise</span>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Supplier Enterprise Name</label>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <input
                type="text"
                value={formData.supplierBusinessName || ''}
                onChange={(e) => handleTextChange('supplierBusinessName', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2.5 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                placeholder="e.g. Apex Pure Beverage Bottling Co."
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Plant Operational Status</label>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <select
                value={formData.operationalStatus || 'OPERATING'}
                onChange={(e) => handleTextChange('operationalStatus', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2.5 text-xs text-white focus:border-[#c5a059] focus:outline-none"
              >
                <option value="OPERATING">Full Operating Capacity</option>
                <option value="MAINTENANCE">Scheduled Line Maintenance</option>
                <option value="UPGRADING">Equipment Upgrade in Progress</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Facility Overview &amp; Specifications</label>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <textarea
                rows={3}
                value={formData.description || ''}
                onChange={(e) => handleTextChange('description', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2.5 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                placeholder="Detail bottling lines, automated labeling systems, quality control standards..."
                required
              />
            </div>
          </div>
        </div>

        {/* Contact & Physical Location */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <User className="h-4 w-4" />
              <span>Plant Contact &amp; Commercial Liaison</span>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-white">Contact Name</label>
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
                  <label className="block text-xs font-medium text-[#9d9db3]">Title</label>
                  <input
                    type="text"
                    value={formData.primaryContact?.role || ''}
                    onChange={(e) => handleNestedChange('primaryContact', 'role', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                    placeholder="Plant Operations Director"
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
              <span>Plant Location &amp; Freight Hub</span>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-white">Facility City</label>
                  <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
                </div>
                <input
                  type="text"
                  value={formData.operatingLocation?.facilityCity || ''}
                  onChange={(e) => handleNestedChange('operatingLocation', 'facilityCity', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  placeholder="e.g. Portland"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#9d9db3]">State / Province</label>
                <input
                  type="text"
                  value={formData.operatingLocation?.stateProvince || ''}
                  onChange={(e) => handleNestedChange('operatingLocation', 'stateProvince', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  placeholder="e.g. Oregon"
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

        {/* Packaging Capabilities */}
        <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <Layers className="h-4 w-4" />
            <span>Bottling Specifications &amp; Material Formats</span>
          </div>

          <div className="mt-6 space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Water Purification Capabilities</span>
                <span className="text-[10px] font-bold text-[#c5a059]">AT LEAST 1 REQUIRED</span>
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {waterTypeOptions.map((opt) => {
                  const isChecked = formData.capabilities?.waterTypes?.includes(opt);
                  return (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => handleCapabilityToggle('waterTypes', opt)}
                      className={`flex items-center space-x-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                        isChecked
                          ? 'border-[#c5a059] bg-[#c5a059]/10 text-[#d4af37]'
                          : 'border-[#242432] bg-[#111116] text-[#8e8e9f]'
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-full border ${isChecked ? 'border-[#c5a059] bg-[#c5a059]' : 'border-[#444455]'}`} />
                      <span className="truncate">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Bottle Substrate Materials</span>
                <span className="text-[10px] font-bold text-[#c5a059]">AT LEAST 1 REQUIRED</span>
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {materialOptions.map((opt) => {
                  const isChecked = formData.capabilities?.bottleMaterials?.includes(opt);
                  return (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => handleCapabilityToggle('bottleMaterials', opt)}
                      className={`flex items-center space-x-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                        isChecked
                          ? 'border-[#c5a059] bg-[#c5a059]/10 text-[#d4af37]'
                          : 'border-[#242432] bg-[#111116] text-[#8e8e9f]'
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-full border ${isChecked ? 'border-[#c5a059] bg-[#c5a059]' : 'border-[#444455]'}`} />
                      <span className="truncate">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Size Volumes</span>
                <span className="text-[10px] font-bold text-[#c5a059]">AT LEAST 1 REQUIRED</span>
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sizeOptions.map((opt) => {
                  const isChecked = formData.capabilities?.bottleSizes?.includes(opt);
                  return (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => handleCapabilityToggle('bottleSizes', opt)}
                      className={`flex items-center space-x-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                        isChecked
                          ? 'border-[#c5a059] bg-[#c5a059]/10 text-[#d4af37]'
                          : 'border-[#242432] bg-[#111116] text-[#8e8e9f]'
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-full border ${isChecked ? 'border-[#c5a059] bg-[#c5a059]' : 'border-[#444455]'}`} />
                      <span className="truncate">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-white">Label Finishes &amp; Printing Capabilities</span>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {finishOptions.map((opt) => {
                  const isChecked = formData.capabilities?.printingFinishes?.includes(opt);
                  return (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => handleCapabilityToggle('printingFinishes', opt)}
                      className={`flex items-center space-x-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                        isChecked
                          ? 'border-[#c5a059] bg-[#c5a059]/10 text-[#d4af37]'
                          : 'border-[#242432] bg-[#111116] text-[#8e8e9f]'
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-full border ${isChecked ? 'border-[#c5a059] bg-[#c5a059]' : 'border-[#444455]'}`} />
                      <span className="truncate">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Capacity & Lead Times */}
        <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <Clock className="h-4 w-4" />
            <span>Throughput &amp; Lead Time Metrics</span>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Monthly Bottling Capacity</label>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <input
                type="number"
                min="0"
                value={formData.productionCapacity?.bottlesPerMonth ?? 0}
                onChange={(e) =>
                  handleNestedChange('productionCapacity', 'bottlesPerMonth', parseInt(e.target.value, 10) || 0)
                }
                className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2 text-xs text-white font-mono focus:border-[#c5a059] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-white">Minimum Order Run Size</label>
              <input
                type="number"
                min="0"
                value={formData.productionCapacity?.minimumRunSize ?? 500}
                onChange={(e) =>
                  handleNestedChange('productionCapacity', 'minimumRunSize', parseInt(e.target.value, 10) || 0)
                }
                className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2 text-xs text-white font-mono focus:border-[#c5a059] focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-white">Standard Turnaround (Days)</label>
                <span className="text-[10px] font-bold text-[#c5a059]">REQUIRED</span>
              </div>
              <input
                type="number"
                min="0"
                value={formData.leadTimeInfo?.standardTurnaroundDays ?? 14}
                onChange={(e) =>
                  handleNestedChange('leadTimeInfo', 'standardTurnaroundDays', parseInt(e.target.value, 10) || 0)
                }
                className="mt-1 w-full rounded-lg border border-[#282836] bg-[#121218] px-3.5 py-2 text-xs text-white font-mono focus:border-[#c5a059] focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.leadTimeInfo?.rushOrderAvailable ?? false}
                onChange={(e) => handleNestedChange('leadTimeInfo', 'rushOrderAvailable', e.target.checked)}
                className="h-4 w-4 rounded border-[#343444] bg-[#121218] text-[#c5a059] focus:ring-[#c5a059]"
              />
              <span className="text-xs font-medium text-white">Expedited rush bottling available for priority campaigns</span>
            </label>
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
            <span>Supplier profile saved and version incremented.</span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[#1c1c28] pt-6">
          <p className="text-[11px] text-[#6b6b7a]">
            Changes are saved to the AquaBloom bottling registry.
          </p>
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center space-x-2 rounded-lg bg-[#c5a059] px-5 py-2.5 text-xs font-bold text-black hover:bg-[#d4af37] disabled:opacity-50 transition"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Saving Profile...' : 'Save Supplier Profile'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
