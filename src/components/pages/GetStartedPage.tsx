/**
 * AquaBloom Public Website — Get Started (/get-started)
 * 
 * Public participant registration.
 * Allows selection of the 4 public participant roles:
 * - ADVERTISER
 * - VENUE
 * - SUPPLIER
 * - LOGISTICS_PARTNER
 * 
 * STRICT CONSTRAINT:
 * Admin must NEVER appear as a public registration option.
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { UserRole } from '../../types.js';
import { Layers, Building2, Factory, Truck, Check, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

interface GetStartedPageProps {
  navigate: (path: string) => void;
}

export const GetStartedPage: React.FC<GetStartedPageProps> = ({ navigate }) => {
  const { register } = useAuth();

  const [selectedRole, setSelectedRole] = useState<UserRole>('ADVERTISER');
  const [formData, setFormData] = useState({
    organizationName: '',
    contactName: '',
    email: '',
    password: '',
    phone: '',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const publicRoleOptions = [
    {
      role: 'ADVERTISER' as UserRole,
      title: 'Enterprise Advertiser',
      description: 'Sponsor branded refreshment campaigns across high-attention commercial venues.',
      icon: Layers,
    },
    {
      role: 'VENUE' as UserRole,
      title: 'Hosting Venue',
      description: 'Distribute complimentary, premium bottled water to guests at zero beverage cost.',
      icon: Building2,
    },
    {
      role: 'SUPPLIER' as UserRole,
      title: 'Production Supplier',
      description: 'Certified bottling facility or label printer fulfilling standardized production batches.',
      icon: Factory,
    },
    {
      role: 'LOGISTICS_PARTNER' as UserRole,
      title: 'Logistics Partner',
      description: 'Commercial freight carrier delivering palletized inventory from plants to venue docks.',
      icon: Truck,
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const result = await register({
        role: selectedRole,
        organizationName: formData.organizationName,
        contactName: formData.contactName,
        email: formData.email,
        password: formData.password,
        phone: formData.phone,
      });

      if (!result.success) {
        if (result.fieldErrors && result.fieldErrors.length > 0) {
          const map: Record<string, string> = {};
          result.fieldErrors.forEach((err) => {
            if (err.field) map[err.field] = err.message;
          });
          setFieldErrors(map);
        }
        setGeneralError(result.error || 'Registration could not be completed.');
        return;
      }

      // Role-aware post-registration routing
      switch (result.role) {
        case 'ADVERTISER':
          navigate('/portal/advertiser');
          break;
        case 'VENUE':
          navigate('/portal/venue');
          break;
        case 'SUPPLIER':
          navigate('/portal/supplier');
          break;
        case 'LOGISTICS_PARTNER':
          navigate('/portal/logistics');
          break;
        default:
          navigate('/');
      }
    } catch (err: unknown) {
      setGeneralError(err instanceof Error ? err.message : 'An unexpected error occurred during registration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[#08080a] text-white py-14 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-[#c5a059]">
            Participant Registration
          </span>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Join the AquaBloom Ecosystem
          </h1>
          <p className="mt-3 text-xs sm:text-sm text-[#9595a6] max-w-xl mx-auto leading-relaxed">
            Select your organization’s role in the physical bottle advertising marketplace. All participant accounts are protected by enterprise role-aware permissions.
          </p>
        </div>

        {generalError && (
          <div className="mt-6 flex items-center space-x-3 rounded-xl border border-red-900/50 bg-red-950/30 p-4 text-xs text-red-200">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <span>{generalError}</span>
          </div>
        )}

        {/* Step 1: Role Selection (4 Public Roles ONLY) */}
        <div className="mt-10">
          <label className="block text-xs font-bold uppercase tracking-wider text-[#d2d2de] mb-4">
            1. Select Your Commercial Role
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {publicRoleOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = selectedRole === opt.role;
              return (
                <button
                  key={opt.role}
                  type="button"
                  onClick={() => setSelectedRole(opt.role)}
                  className={`group relative flex items-start space-x-4 rounded-xl border p-5 text-left transition ${
                    isSelected
                      ? 'border-[#c5a059] bg-[#14141c] shadow-lg shadow-[#c5a059]/5'
                      : 'border-[#22222d] bg-[#0c0c11] hover:border-[#353545]'
                  }`}
                >
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition ${
                      isSelected
                        ? 'border-[#c5a059] bg-[#1c1c28] text-[#c5a059]'
                        : 'border-[#272733] bg-[#121217] text-[#8e8e9e]'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-bold text-white">
                        {opt.title}
                      </span>
                      {isSelected && (
                        <span className="rounded-full bg-[#c5a059]/20 p-1 text-[#c5a059]">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-[#838394] leading-relaxed">
                      {opt.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Organization & Contact Form */}
        <div className="mt-10 rounded-2xl border border-[#23232f] bg-[#0c0c11] p-8 sm:p-10">
          <div className="border-b border-[#1f1f2b] pb-4 mb-6">
            <h3 className="font-display text-lg font-bold text-white">
              2. Organization Information & Identity
            </h3>
            <p className="text-xs text-[#808090] mt-0.5">
              Registering authorized contact for <span className="text-[#c5a059] font-bold">{selectedRole.replace('_', ' ')}</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#9d9dae]">
                  Organization / Entity Legal Name *
                </label>
                <input
                  type="text"
                  value={formData.organizationName}
                  onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                  placeholder="e.g. Zenith Beverage Holdings LLC"
                  className="mt-1 w-full rounded-lg border border-[#272733] bg-[#121217] px-3.5 py-2.5 text-xs text-white placeholder-[#505060] focus:border-[#c5a059] focus:outline-none"
                />
                {fieldErrors.organizationName && (
                  <p className="mt-1 text-[11px] text-red-400">{fieldErrors.organizationName}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#9d9dae]">
                  Primary Authorized Contact Name *
                </label>
                <input
                  type="text"
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  placeholder="e.g. Alexander Cole"
                  className="mt-1 w-full rounded-lg border border-[#272733] bg-[#121217] px-3.5 py-2.5 text-xs text-white placeholder-[#505060] focus:border-[#c5a059] focus:outline-none"
                />
                {fieldErrors.contactName && (
                  <p className="mt-1 text-[11px] text-red-400">{fieldErrors.contactName}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#9d9dae]">
                  Corporate Email Address *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="alexander@zenithbeverage.com"
                  className="mt-1 w-full rounded-lg border border-[#272733] bg-[#121217] px-3.5 py-2.5 text-xs text-white placeholder-[#505060] focus:border-[#c5a059] focus:outline-none"
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-[11px] text-red-400">{fieldErrors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#9d9dae]">
                  Direct Phone (Optional)
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 019-2834"
                  className="mt-1 w-full rounded-lg border border-[#272733] bg-[#121217] px-3.5 py-2.5 text-xs text-white placeholder-[#505060] focus:border-[#c5a059] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#9d9dae]">
                Account Password * (Minimum 8 Characters)
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••••••"
                className="mt-1 w-full rounded-lg border border-[#272733] bg-[#121217] px-3.5 py-2.5 text-xs text-white placeholder-[#505060] focus:border-[#c5a059] focus:outline-none"
              />
              {fieldErrors.password && (
                <p className="mt-1 text-[11px] text-red-400">{fieldErrors.password}</p>
              )}
            </div>

            <div className="pt-4 border-t border-[#1f1f2b] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-2 text-[11px] text-[#717182]">
                <ShieldCheck className="h-4 w-4 text-[#c5a059]" />
                <span>Encrypted session architecture & audit-logged identity</span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto flex items-center justify-center space-x-2 rounded-lg bg-gradient-to-r from-[#c5a059] to-[#d4af37] px-8 py-3 text-xs font-bold uppercase tracking-wider text-[#0a0a0d] transition hover:opacity-95 disabled:opacity-50"
              >
                <span>{isSubmitting ? 'Registering Account...' : 'Complete Registration'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        </div>

        <div className="mt-8 text-center text-xs text-[#717182]">
          Already have an existing AquaBloom participant account?{' '}
          <button
            onClick={() => navigate('/login')}
            className="text-[#c5a059] font-bold hover:underline ml-1"
          >
            Access Login
          </button>
        </div>
      </div>
    </div>
  );
};
