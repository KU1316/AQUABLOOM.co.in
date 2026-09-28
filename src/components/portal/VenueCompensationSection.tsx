/**
 * AquaBloom Venue Compensation & Settlement View
 * 
 * Step 12E & 12G: Counterparty Role Isolation.
 * Shows ONLY the venue's own agreed compensation and settlement status.
 * Strictly prevents exposure of advertiser total payment, logistics costs,
 * supplier internal costs, or platform margins.
 */

import React, { useState, useEffect } from 'react';
import { VenueCompensationSettlementView } from '../../types.js';
import { api } from '../../lib/api.js';
import { Coins, ShieldCheck, Clock, CheckCircle2, AlertCircle, RefreshCw, Building2 } from 'lucide-react';

export const VenueCompensationSection: React.FC = () => {
  const [agreements, setAgreements] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [compensationView, setCompensationView] = useState<VenueCompensationSettlementView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgreements = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getAgreements();
        if (res.data) {
          setAgreements(res.data);
          // If there are agreements, check if there are associated orders
          if (res.data.length > 0) {
            // Check first agreement
            const firstAgr = res.data[0];
            if (firstAgr.id) {
              fetchCompensation(firstAgr.id);
            }
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load agreements');
      } finally {
        setLoading(false);
      }
    };

    fetchAgreements();
  }, []);

  const fetchCompensation = async (id: string) => {
    setLoadingDetails(true);
    setError(null);
    try {
      const res = await api.getOrderVenueCompensation(id);
      if (res.data) {
        setCompensationView(res.data);
        setSelectedOrderId(id);
      } else if (res.error) {
        setCompensationView(null);
      }
    } catch (err: any) {
      console.warn('Compensation view not yet generated for order/agreement', id);
      setCompensationView(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#232330] bg-[#0d0d12] p-6">
        <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
          <Coins className="h-4 w-4" />
          <span>Venue Property Compensation &amp; Settlements</span>
        </div>
        <p className="mt-2 text-xs text-[#9595a6] leading-relaxed">
          As a hosting venue partner, you have visibility exclusively into your property's agreed distribution allowance and settlement milestones. Advertiser payment totals and upstream supply costs are strictly isolated.
        </p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-zinc-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#c5a059] border-t-transparent mx-auto mb-2" />
          Loading compensation records...
        </div>
      ) : compensationView ? (
        <div className="rounded-xl border border-[#21212b] bg-[#0c0c11] p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1c1c28] pb-4">
            <div>
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                Compensation Record ID: {compensationView.compensationPublicId}
              </span>
              <h3 className="text-base font-bold text-white mt-1">
                {compensationView.campaignName}
              </h3>
              <p className="text-xs text-zinc-400">
                Host Venue: <span className="text-zinc-200">{compensationView.venueName}</span> &bull; Order Ref: <span className="font-mono text-[#c5a059]">{compensationView.orderPublicId}</span>
              </p>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[10px] uppercase font-semibold text-zinc-400 block tracking-wider">
                Agreed Venue Allowance ({compensationView.compensationRatePercentage}%)
              </span>
              <span className="font-mono text-2xl font-bold text-[#c5a059] tabular-nums">
                {compensationView.compensationAmountFormatted}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2">
            <div className="bg-[#121218] p-3 rounded-lg border border-[#1d1d28]">
              <span className="text-zinc-500 block text-[11px]">Settlement Status</span>
              <span className="font-semibold text-emerald-400 uppercase mt-0.5 block">
                {compensationView.compensationStatus}
              </span>
            </div>

            <div className="bg-[#121218] p-3 rounded-lg border border-[#1d1d28]">
              <span className="text-zinc-500 block text-[11px]">Eligible Basis</span>
              <span className="text-zinc-200 mt-0.5 block">
                {compensationView.eligibleBaseDescription}
              </span>
            </div>

            <div className="bg-[#121218] p-3 rounded-lg border border-[#1d1d28]">
              <span className="text-zinc-500 block text-[11px]">Accrual Date</span>
              <span className="text-zinc-200 mt-0.5 block">
                {new Date(compensationView.accruedAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="pt-2 text-[11px] text-zinc-400 flex items-center space-x-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>{compensationView.expectedSettlementInformation}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#21212b] bg-[#0c0c11] p-8 text-center space-y-2">
          <Building2 className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-white">No Active Compensation Settlements</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Venue compensation records are automatically generated when an advertiser completes payment on a confirmed campaign order.
          </p>
        </div>
      )}
    </div>
  );
};
