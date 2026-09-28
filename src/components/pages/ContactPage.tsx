/**
 * AquaBloom Public Website — Contact (/contact)
 * 
 * Institutional enterprise inquiry form and regional coordination desks.
 */

import React, { useState } from 'react';
import { Mail, MapPin, Phone, Send, CheckCircle2 } from 'lucide-react';
import { validateEmail, validateRequiredString } from '../../lib/validation.js';

interface ContactPageProps {
  navigate: (path: string) => void;
}

export const ContactPage: React.FC<ContactPageProps> = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    organization: '',
    participantType: 'Advertiser',
    message: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    const nameErr = validateRequiredString(formData.name, 'Full name', 2);
    if (nameErr) newErrors.name = nameErr;

    const emailErr = validateEmail(formData.email);
    if (emailErr) newErrors.email = emailErr;

    const orgErr = validateRequiredString(formData.organization, 'Organization', 2);
    if (orgErr) newErrors.organization = orgErr;

    const msgErr = validateRequiredString(formData.message, 'Message', 10);
    if (msgErr) newErrors.message = msgErr;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setSubmitted(true);
  };

  return (
    <div className="bg-[#08080a] text-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="text-center max-w-3xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-widest text-[#c5a059]">
            Communications & Advisory
          </span>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Institutional Inquiries
          </h1>
          <p className="mt-4 text-sm text-[#9b9ba8] leading-relaxed">
            Connect with our enterprise partnerships team to discuss custom campaigns, venue network integrations, or supplier certifications.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Desk details */}
          <div className="space-y-6">
            <div className="rounded-xl border border-[#23232e] bg-[#0d0d12] p-6">
              <div className="flex items-center space-x-3 text-[#c5a059]">
                <MapPin className="h-5 w-5" />
                <h4 className="font-display text-base font-bold text-white">Global Headquarters</h4>
              </div>
              <p className="mt-2 text-xs text-[#8c8c9e] leading-relaxed">
                AquaBloom Technologies Inc.<br />
                Financial Center Tower, Suite 4800<br />
                International Commercial District
              </p>
            </div>

            <div className="rounded-xl border border-[#23232e] bg-[#0d0d12] p-6">
              <div className="flex items-center space-x-3 text-[#c5a059]">
                <Mail className="h-5 w-5" />
                <h4 className="font-display text-base font-bold text-white">Direct Advisory</h4>
              </div>
              <p className="mt-2 text-xs text-[#8c8c9e]">
                partnerships@aquabloom.corp<br />
                operations@aquabloom.corp
              </p>
            </div>

            <div className="rounded-xl border border-[#23232e] bg-[#0d0d12] p-6">
              <div className="flex items-center space-x-3 text-[#c5a059]">
                <Phone className="h-5 w-5" />
                <h4 className="font-display text-base font-bold text-white">Enterprise Desk</h4>
              </div>
              <p className="mt-2 text-xs text-[#8c8c9e]">
                +1 (800) 555-AQUA<br />
                Mon – Fri: 08:00 – 18:00 EST
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-2 rounded-2xl border border-[#23232f] bg-[#0c0c11] p-8">
            {submitted ? (
              <div className="py-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#16291a] border border-[#22c55e]/40 text-[#22c55e]">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="mt-4 font-display text-xl font-bold text-white">Inquiry Received</h3>
                <p className="mt-2 text-xs text-[#8c8c9e] max-w-md mx-auto">
                  Thank you for contacting AquaBloom. An enterprise relationship coordinator will review your organization details and reply within 1 business day.
                </p>
                <button
                  onClick={() => {
                    setSubmitted(false);
                    setFormData({ name: '', email: '', organization: '', participantType: 'Advertiser', message: '' });
                  }}
                  className="mt-6 rounded-lg border border-[#2d2d38] px-4 py-2 text-xs font-semibold text-white hover:border-[#c5a059]"
                >
                  Send Another Inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#9f9fb0]">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[#272733] bg-[#121217] px-3.5 py-2.5 text-xs text-white placeholder-[#505060] focus:border-[#c5a059] focus:outline-none"
                      placeholder="e.g. Victoria Sterling"
                    />
                    {errors.name && <p className="mt-1 text-[11px] text-red-400">{errors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#9f9fb0]">
                      Corporate Email *
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[#272733] bg-[#121217] px-3.5 py-2.5 text-xs text-white placeholder-[#505060] focus:border-[#c5a059] focus:outline-none"
                      placeholder="v.sterling@company.com"
                    />
                    {errors.email && <p className="mt-1 text-[11px] text-red-400">{errors.email}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#9f9fb0]">
                      Organization Name *
                    </label>
                    <input
                      type="text"
                      value={formData.organization}
                      onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[#272733] bg-[#121217] px-3.5 py-2.5 text-xs text-white placeholder-[#505060] focus:border-[#c5a059] focus:outline-none"
                      placeholder="e.g. Apex Global Hospitality"
                    />
                    {errors.organization && <p className="mt-1 text-[11px] text-red-400">{errors.organization}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#9f9fb0]">
                      Participant Category
                    </label>
                    <select
                      value={formData.participantType}
                      onChange={(e) => setFormData({ ...formData, participantType: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[#272733] bg-[#121217] px-3.5 py-2.5 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                    >
                      <option value="Advertiser">Advertiser (Brand Sponsor)</option>
                      <option value="Venue">Hosting Venue / Property</option>
                      <option value="Supplier">Bottling / Label Supplier</option>
                      <option value="Logistics">Logistics / Distribution Partner</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#9f9fb0]">
                    Inquiry Details *
                  </label>
                  <textarea
                    rows={4}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#272733] bg-[#121217] px-3.5 py-2.5 text-xs text-white placeholder-[#505060] focus:border-[#c5a059] focus:outline-none"
                    placeholder="Briefly state your campaign targets, venue capacity, or manufacturing volume..."
                  />
                  {errors.message && <p className="mt-1 text-[11px] text-red-400">{errors.message}</p>}
                </div>

                <button
                  type="submit"
                  className="flex items-center space-x-2 rounded-lg bg-[#c5a059] px-6 py-3 text-xs font-bold uppercase tracking-wider text-black transition hover:opacity-95"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Submit Institutional Inquiry</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
