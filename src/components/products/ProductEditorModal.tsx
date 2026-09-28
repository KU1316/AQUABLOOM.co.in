/**
 * AquaBloom Product Editor & Versioning Modal — Step 3
 * 
 * Supports:
 * 1. Creating new product master record (initial v1)
 * 2. Creating a new pricing/specification version (effective-dated revision)
 * 3. Editing non-material product metadata
 */

import React, { useState } from 'react';
import {
  Product,
  CreateProductInput,
  CreateProductVersionInput,
  ProductSpecifications,
  ProductAvailability,
  LeadTimeUnit,
} from '../../types.js';
import {
  X,
  Package,
  Layers,
  IndianRupee,
  Clock,
  Sparkles,
  AlertCircle,
  Calendar,
} from 'lucide-react';

interface ProductEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveProduct: (input: CreateProductInput) => Promise<boolean>;
  onSaveVersion: (productId: string, input: CreateProductVersionInput) => Promise<boolean>;
  existingProduct?: Product | null;
  mode: 'CREATE' | 'NEW_VERSION' | 'EDIT_METADATA';
  isApprovedSupplier: boolean;
}

const DEFAULT_SPECS: ProductSpecifications = {
  bottleMaterial: '100% rPET (Post-Consumer Recycled)',
  bottleCapacityMl: 500,
  volumeLabel: '500 ml Standard',
  bottleShape: 'Classic Cylinder',
  bottleType: 'Standard Bottle',
  capType: 'Screw Cap (Tamper-Evident)',
  bottleFinish: 'Clear Gloss',
  labelType: 'Full-Wrap Shrink Sleeve',
  printingCapability: 'Up to 8 Colors UV Flexo',
  finishingOptions: ['Matte Soft-Touch', 'Spot UV Highlighting'],
  packagingConfiguration: '24 bottles per case, shrink-wrapped corrugated tray',
};

const CATEGORIES = [
  'Natural Spring Water',
  'Sparkling Mineral Water',
  'Alkaline Electrolyte Water',
  'Purified Artesian Water',
  'Botanical Infusion (Unsweetened)',
  'Custom Mineral Profile',
];

const MATERIALS = [
  '100% rPET (Post-Consumer Recycled)',
  'Virgin Eco-PET (BPA-Free)',
  'Recycled Aluminum Can',
  'Flint Glass Bottle (Premium)',
  'Amber Glass Bottle (UV-Shielded)',
];

const FINISHES = [
  'Matte Soft-Touch',
  'Spot UV Highlighting',
  'Metallic Hot Foil Stamping',
  'Embossed Texture',
  'Gloss Protective Varnish',
  'Tactile Screen Varnish',
];

export const ProductEditorModal: React.FC<ProductEditorModalProps> = ({
  isOpen,
  onClose,
  onSaveProduct,
  onSaveVersion,
  existingProduct,
  mode,
  isApprovedSupplier,
}) => {
  // Form State
  const [name, setName] = useState(existingProduct?.name || '');
  const [category, setCategory] = useState(existingProduct?.category || CATEGORIES[0]);
  const [description, setDescription] = useState(existingProduct?.description || '');
  const [status, setStatus] = useState<'DRAFT' | 'ACTIVE'>(
    isApprovedSupplier ? 'ACTIVE' : 'DRAFT'
  );
  const [availability, setAvailability] = useState<ProductAvailability>(
    existingProduct?.availability || 'AVAILABLE'
  );

  // Specifications State
  const [specs, setSpecs] = useState<ProductSpecifications>(
    existingProduct?.specifications || DEFAULT_SPECS
  );

  // Commercials State
  const [customerFacingPrice, setCustomerFacingPrice] = useState<number>(
    existingProduct?.customerFacingPrice.amount || 18.5
  );
  const [minimumOrderQuantity, setMinimumOrderQuantity] = useState<number>(
    existingProduct?.minimumOrderQuantity || 2500
  );
  const [leadTimeValue, setLeadTimeValue] = useState<number>(
    existingProduct?.productionLeadTime.value || 14
  );
  const [leadTimeUnit, setLeadTimeUnit] = useState<LeadTimeUnit>(
    existingProduct?.productionLeadTime.unit || 'DAYS'
  );
  const [monthlyCapacity, setMonthlyCapacity] = useState<number | ''>(
    existingProduct?.productionCapacity?.unitsPerMonth || ''
  );

  // Version-specific State
  const [changeReason, setChangeReason] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFinishToggle = (option: string) => {
    setSpecs((prev) => {
      const current = prev.finishingOptions || [];
      if (current.includes(option)) {
        return { ...prev, finishingOptions: current.filter((f) => f !== option) };
      } else {
        return { ...prev, finishingOptions: [...current, option] };
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (name.trim().length < 3) {
      setErrorMsg('Product name must be at least 3 characters.');
      return;
    }

    if (customerFacingPrice <= 0) {
      setErrorMsg('Customer-facing price must be greater than zero.');
      return;
    }

    if (minimumOrderQuantity <= 0 || !Number.isInteger(minimumOrderQuantity)) {
      setErrorMsg('MOQ must be a positive integer.');
      return;
    }

    if (leadTimeValue <= 0) {
      setErrorMsg('Lead time duration must be positive.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'CREATE') {
        const payload: CreateProductInput = {
          name: name.trim(),
          category: category.trim(),
          description: description.trim(),
          status: isApprovedSupplier ? status : 'DRAFT',
          availability,
          specifications: {
            ...specs,
            volumeLabel: `${specs.bottleCapacityMl} ml ${specs.bottleType}`,
          },
          customerFacingPrice: {
            amount: Number(customerFacingPrice),
            currency: 'INR',
          },
          minimumOrderQuantity: Number(minimumOrderQuantity),
          productionLeadTime: {
            value: Number(leadTimeValue),
            unit: leadTimeUnit,
          },
          productionCapacity: monthlyCapacity
            ? { unitsPerMonth: Number(monthlyCapacity) }
            : undefined,
        };

        const success = await onSaveProduct(payload);
        if (success) onClose();
      } else if (mode === 'NEW_VERSION' && existingProduct) {
        const payload: CreateProductVersionInput = {
          effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : undefined,
          customerFacingPrice: {
            amount: Number(customerFacingPrice),
            currency: 'INR',
          },
          minimumOrderQuantity: Number(minimumOrderQuantity),
          productionLeadTime: {
            value: Number(leadTimeValue),
            unit: leadTimeUnit,
          },
          specifications: {
            ...specs,
            volumeLabel: `${specs.bottleCapacityMl} ml ${specs.bottleType}`,
          },
          changeReason: changeReason.trim() || undefined,
        };

        const success = await onSaveVersion(existingProduct.id, payload);
        if (success) onClose();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save product record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl border border-[#2d2d3d] bg-[#0d0d14] text-white shadow-2xl my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#21212f] bg-[#12121c] px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#c5a059]/30 bg-[#c5a059]/10 text-[#d4af37]">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                {mode === 'CREATE' && 'Add Manufacturing Product to Catalog'}
                {mode === 'NEW_VERSION' && `Create Revised Version for ${existingProduct?.publicProductId}`}
                {mode === 'EDIT_METADATA' && `Update Product Metadata (${existingProduct?.publicProductId})`}
              </h2>
              <p className="text-xs text-[#8c8c9e]">
                {mode === 'CREATE' && 'Define authoritative bottle, volume, and inclusive pricing master data.'}
                {mode === 'NEW_VERSION' && 'Increments product version and applies effective-dated pricing.'}
                {mode === 'EDIT_METADATA' && 'Update non-material catalog fields without breaking historical orders.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[#7e7e91] hover:bg-[#1a1a26] hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="flex items-center space-x-2 rounded-lg border border-rose-900/50 bg-rose-950/40 p-3 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 1: Identification */}
          <div className="space-y-4">
            <h3 className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>1. Product Master Identification</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#c0c0d0]">
                  Product Commercial Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Pure Spring 500ml rPET Standard"
                  className="mt-1 w-full rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs text-white placeholder-[#5d5d6e] focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c0c0d0]">Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#c0c0d0]">
                Product Description &amp; Technical Summary
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="High-definition cylindrical packaging optimized for fast-run advertising wraps and chilled retail distribution..."
                className="mt-1 w-full rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs text-white placeholder-[#5d5d6e] focus:border-[#c5a059] focus:outline-none"
              />
            </div>
          </div>

          {/* Section 2: Physical Specifications */}
          <div className="space-y-4 border-t border-[#1e1e2b] pt-5">
            <h3 className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Layers className="h-3.5 w-3.5" />
              <span>2. Bottle Architecture &amp; Physical Specifications</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#c0c0d0]">Material *</label>
                <select
                  value={specs.bottleMaterial}
                  onChange={(e) => setSpecs({ ...specs, bottleMaterial: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                >
                  {MATERIALS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c0c0d0]">
                  Capacity / Volume (ml) *
                </label>
                <input
                  type="number"
                  required
                  min={50}
                  step={10}
                  value={specs.bottleCapacityMl}
                  onChange={(e) =>
                    setSpecs({ ...specs, bottleCapacityMl: parseInt(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c0c0d0]">Bottle Shape</label>
                <input
                  type="text"
                  value={specs.bottleShape}
                  onChange={(e) => setSpecs({ ...specs, bottleShape: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c0c0d0]">Cap Type</label>
                <input
                  type="text"
                  value={specs.capType}
                  onChange={(e) => setSpecs({ ...specs, capType: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c0c0d0]">Bottle Finish</label>
                <input
                  type="text"
                  value={specs.bottleFinish}
                  onChange={(e) => setSpecs({ ...specs, bottleFinish: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c0c0d0]">Label Format</label>
                <input
                  type="text"
                  value={specs.labelType}
                  onChange={(e) => setSpecs({ ...specs, labelType: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#c0c0d0]">
                Printing Capability &amp; Technology
              </label>
              <input
                type="text"
                value={specs.printingCapability}
                onChange={(e) => setSpecs({ ...specs, printingCapability: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
              />
            </div>

            {/* Finishing Options Chips */}
            <div>
              <label className="block text-xs font-medium text-[#c0c0d0] mb-2">
                Supported Finishes (Included in configuration)
              </label>
              <div className="flex flex-wrap gap-2">
                {FINISHES.map((option) => {
                  const selected = specs.finishingOptions?.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleFinishToggle(option)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        selected
                          ? 'border border-[#c5a059] bg-[#c5a059]/20 text-[#d4af37]'
                          : 'border border-[#2a2a38] bg-[#14141e] text-[#7d7d8f] hover:text-white'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 3: Commercials & Pricing */}
          <div className="space-y-4 border-t border-[#1e1e2b] pt-5">
            <h3 className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <IndianRupee className="h-3.5 w-3.5" />
              <span>3. Commercial Pricing &amp; Production Parameters</span>
            </h3>

            <div className="rounded-xl border border-[#c5a059]/20 bg-[#16140f] p-4 text-xs text-[#d8c399] leading-relaxed">
              <span className="font-bold text-[#c5a059]">AquaBloom Inclusive Pricing Mandate:</span>{' '}
              The customer-facing unit price MUST incorporate all bottle container, full-wrap label, printing, and finishing costs. AquaBloom strictly prohibits exposing separate customer-facing label or printing surcharges.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#c0c0d0]">
                  Customer-Facing Price (INR ₹) *
                </label>
                <div className="relative mt-1">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-[#c5a059] font-bold">
                    ₹
                  </span>
                  <input
                    type="number"
                    required
                    min={0.1}
                    step={0.05}
                    value={customerFacingPrice}
                    onChange={(e) => setCustomerFacingPrice(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-[#2a2a38] bg-[#14141e] pl-8 pr-3 py-2 text-xs font-mono font-bold text-white focus:border-[#c5a059] focus:outline-none"
                  />
                </div>
                <span className="mt-1 block text-[10px] text-[#717182]">Per unit / bottle</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c0c0d0]">
                  Minimum Order Quantity (MOQ) *
                </label>
                <input
                  type="number"
                  required
                  min={100}
                  step={100}
                  value={minimumOrderQuantity}
                  onChange={(e) => setMinimumOrderQuantity(parseInt(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs font-mono text-white focus:border-[#c5a059] focus:outline-none"
                />
                <span className="mt-1 block text-[10px] text-[#717182]">Units per campaign run</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c0c0d0]">
                  Turnaround Lead Time *
                </label>
                <div className="mt-1 flex space-x-2">
                  <input
                    type="number"
                    required
                    min={1}
                    value={leadTimeValue}
                    onChange={(e) => setLeadTimeValue(parseInt(e.target.value) || 0)}
                    className="w-1/2 rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs font-mono text-white focus:border-[#c5a059] focus:outline-none"
                  />
                  <select
                    value={leadTimeUnit}
                    onChange={(e) => setLeadTimeUnit(e.target.value as LeadTimeUnit)}
                    className="w-1/2 rounded-lg border border-[#2a2a38] bg-[#14141e] px-2 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  >
                    <option value="DAYS">Days</option>
                    <option value="WEEKS">Weeks</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#c0c0d0]">
                  Monthly Plant Capacity (Optional)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={monthlyCapacity}
                  onChange={(e) =>
                    setMonthlyCapacity(e.target.value === '' ? '' : parseInt(e.target.value))
                  }
                  placeholder="e.g. 150000"
                  className="mt-1 w-full rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs font-mono text-white placeholder-[#5d5d6e] focus:border-[#c5a059] focus:outline-none"
                />
                <span className="mt-1 block text-[10px] text-[#717182]">
                  Dedicated volume units per month (leave blank if unconstrained)
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#c0c0d0]">
                  Operational Availability
                </label>
                <select
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value as ProductAvailability)}
                  className="mt-1 w-full rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                >
                  <option value="AVAILABLE">AVAILABLE — Immediate Production Line Allocation</option>
                  <option value="LIMITED">LIMITED — Constrained Queue / Seasonal Run</option>
                  <option value="UNAVAILABLE">UNAVAILABLE — Temporarily Paused</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 4: Versioning Details (If NEW_VERSION) */}
          {mode === 'NEW_VERSION' && (
            <div className="space-y-4 border-t border-[#1e1e2b] pt-5">
              <h3 className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                <Calendar className="h-3.5 w-3.5" />
                <span>4. Version Increment &amp; Effective Dating</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#c0c0d0]">
                    Effective From Date (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                  />
                  <span className="mt-1 block text-[10px] text-[#717182]">
                    Leave blank to take effect immediately upon saving.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#c0c0d0]">
                    Change Reason / Commercial Audit Note
                  </label>
                  <input
                    type="text"
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    placeholder="e.g. Q3 resin cost update and recycled aluminum tooling adjustment"
                    className="mt-1 w-full rounded-lg border border-[#2a2a38] bg-[#14141e] px-3 py-2 text-xs text-white placeholder-[#5d5d6e] focus:border-[#c5a059] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 5: Initial Status (If CREATE) */}
          {mode === 'CREATE' && (
            <div className="border-t border-[#1e1e2b] pt-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-white">Initial Catalog Status</span>
                <p className="text-[11px] text-[#7e7e91]">
                  {isApprovedSupplier
                    ? 'You can save this as an ACTIVE catalog product ready for campaign selection, or keep in DRAFT.'
                    : 'Unapproved accounts are limited to DRAFT status until approved by Administration.'}
                </p>
              </div>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setStatus('DRAFT')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    status === 'DRAFT'
                      ? 'border border-[#c5a059] bg-[#c5a059]/20 text-[#d4af37]'
                      : 'border border-[#232330] bg-[#121218] text-[#717182]'
                  }`}
                >
                  DRAFT
                </button>
                <button
                  type="button"
                  disabled={!isApprovedSupplier}
                  onClick={() => setStatus('ACTIVE')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    !isApprovedSupplier
                      ? 'opacity-40 cursor-not-allowed border border-[#232330] text-[#555]'
                      : status === 'ACTIVE'
                      ? 'border border-emerald-500 bg-emerald-950/40 text-emerald-400'
                      : 'border border-[#232330] bg-[#121218] text-[#717182]'
                  }`}
                >
                  ACTIVE
                </button>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end space-x-3 border-t border-[#1e1e2b] pt-5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#2a2a38] px-4 py-2 text-xs font-semibold text-[#8c8c9e] hover:bg-[#151520] hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-[#c5a059] px-6 py-2 text-xs font-bold text-black hover:bg-[#d4af37] transition disabled:opacity-50 flex items-center space-x-2"
            >
              <Clock className="h-4 w-4" />
              <span>
                {isSubmitting
                  ? 'Saving Master Record...'
                  : mode === 'CREATE'
                  ? 'Create Master Product'
                  : mode === 'NEW_VERSION'
                  ? 'Publish Revised Version'
                  : 'Save Changes'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
