/**
 * AquaBloom Advertiser Orders List Component
 * 
 * Lists orders for the logged-in Advertiser, allowing them to inspect status
 * and open the AdvertiserOrderReviewPage.
 */

import React, { useState, useEffect } from 'react';
import { Order, OrderPaymentHandoffResult } from '../../types.js';
import { api } from '../../lib/api.js';
import { AdvertiserOrderReviewPage } from './AdvertiserOrderReviewPage.js';
import {
  FileText,
  Search,
  ArrowRight,
  CreditCard,
  CheckCircle2,
  Calendar,
  Building2,
  Megaphone,
  Lock,
  RefreshCw,
} from 'lucide-react';

interface Props {
  initialOrderId?: string;
}

export const OrderList: React.FC<Props> = ({ initialOrderId }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId || null);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOrders();
      if (res.error) {
        throw new Error(res.error.message || 'Failed to fetch orders.');
      }
      setOrders(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Error loading orders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // If an order is selected, render the dedicated Step 11D Order Review Page
  if (selectedOrderId) {
    return (
      <AdvertiserOrderReviewPage
        orderId={selectedOrderId}
        onBack={() => {
          setSelectedOrderId(null);
          fetchOrders();
        }}
        onHandoffSuccess={(_handoff: OrderPaymentHandoffResult) => {
          // Re-fetch to reflect state if needed
          fetchOrders();
        }}
      />
    );
  }

  const filteredOrders = orders.filter((ord) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      ord.publicId.toLowerCase().includes(q) ||
      ord.orderReference.toLowerCase().includes(q) ||
      ord.references?.campaignName?.toLowerCase().includes(q) ||
      ord.references?.venueName?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Order ID, Reference, Campaign, or Venue..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-[#12121b] border border-[#232332] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#c5a059]"
          />
        </div>

        <button
          onClick={fetchOrders}
          className="flex items-center justify-center space-x-2 px-3 py-2.5 bg-[#14141e] border border-[#232332] rounded-xl text-xs font-medium text-zinc-300 hover:text-white hover:border-zinc-600 transition"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="min-h-[300px] flex flex-col items-center justify-center p-8 text-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#c5a059] border-t-transparent mb-3" />
          <p className="text-xs text-zinc-400">Loading advertiser orders...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl border border-red-900/30 bg-red-950/10 text-center">
          <p className="text-xs text-red-300">{error}</p>
          <button
            onClick={fetchOrders}
            className="mt-3 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 text-white hover:bg-zinc-700"
          >
            Retry
          </button>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-[#21212b] bg-[#0c0c11]">
          <FileText className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white">No Orders Found</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1 leading-relaxed">
            {searchQuery
              ? 'No orders matched your search criteria.'
              : 'Orders are created once your Campaign Agreements are commercially locked and logistics assignments are confirmed.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredOrders.map((order) => {
            const isPaymentRequired = order.status === 'PAYMENT_REQUIRED';

            return (
              <div
                key={order.id}
                className="rounded-xl border border-[#21212b] bg-[#0c0c11] hover:border-[#38384a] p-5 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-[#c5a059]">{order.publicId}</span>
                    <span className="text-zinc-600">&bull;</span>
                    <span className="font-mono text-zinc-400">{order.orderReference}</span>
                    <span className="text-zinc-600">&bull;</span>
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        isPaymentRequired
                          ? 'bg-amber-950/50 text-amber-400 border border-amber-800/40'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {order.status === 'PAYMENT_REQUIRED' ? 'PAYMENT REQUIRED' : order.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                    <div className="flex items-center space-x-1.5 text-zinc-300">
                      <Megaphone className="h-3.5 w-3.5 text-[#c5a059] shrink-0" />
                      <span className="truncate">{order.references?.campaignName || 'Campaign'}</span>
                    </div>

                    <div className="flex items-center space-x-1.5 text-zinc-300">
                      <Building2 className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{order.references?.venueName || 'Venue'}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 text-xs text-zinc-400 pt-1">
                    <span>
                      Quantity: <strong className="text-white font-mono">{order.pricing?.contractedQuantity?.toLocaleString()}</strong> bottles
                    </span>
                    <span>&bull;</span>
                    <span>
                      Total: <strong className="text-[#c5a059] font-mono tabular-nums">{order.pricing?.grandTotalFormatted}</strong>
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-[#1c1c28]">
                  <button
                    onClick={() => setSelectedOrderId(order.id)}
                    className="flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-[#c5a059] text-black hover:bg-[#d4af37] transition shadow-sm"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    <span>Review Order & Pay</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
