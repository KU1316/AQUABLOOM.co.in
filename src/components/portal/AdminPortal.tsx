/**
 * AquaBloom Structural Portal — Admin Area (/portal/admin)
 * 
 * INTERNAL ONLY Protected Boundary.
 * Strictly inaccessible from public navigation or public registration.
 * Step 2: Adds Administrative Partner Application Review console
 * for approving/declining/requesting info from Suppliers and Logistics Partners.
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { ShieldAlert, Terminal, Lock, CheckCircle2, RefreshCw, Users, FileText, Activity } from 'lucide-react';
import { AppEvent } from '../../types.js';
import { api } from '../../lib/api.js';
import { AdminApplicationReview } from '../profile/AdminApplicationReview.js';

export const AdminPortal: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'PARTNER_REVIEWS' | 'AUDIT_STREAM' | 'SYSTEM_STATUS'>('PARTNER_REVIEWS');
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await api.getAuditEvents();
      if (res.data) {
        setEvents(res.data);
      }
    } catch (err) {
      console.error('Failed to load audit events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'AUDIT_STREAM') {
      fetchEvents();
    }
  }, [activeTab]);

  return (
    <div className="bg-[#08080a] text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Protected boundary banner */}
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 mb-6 text-xs text-amber-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Lock className="h-4 w-4 text-[#c5a059]" />
            <span>
              <strong>Internal Administrative Boundary</strong> — Restricted to system operators. Never exposed via public registration or public navigation.
            </span>
          </div>
          <span className="rounded bg-amber-900/40 px-2 py-0.5 text-[10px] font-mono text-[#f3e5ab]">
            SCOPE: INTERNAL_ADMIN
          </span>
        </div>

        {/* Portal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#21212b] pb-6">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-red-400">
              <ShieldAlert className="h-4 w-4" />
              <span>Platform Integrity &amp; Partner Governance</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">
              System Administration Console
            </h1>
            <p className="mt-1 text-xs text-[#8e8e9f]">
              Operator: <span className="text-white font-medium">{user?.contactName}</span> ({user?.email}) &bull; Public ID:{' '}
              <span className="font-mono text-[#c5a059]">{user?.publicAccountId}</span>
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="rounded-full border border-red-800/40 bg-red-950/30 px-3 py-1 text-xs font-semibold text-red-400">
              Role: ADMIN
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 flex space-x-2 border-b border-[#1c1c28] pb-3">
          <button
            onClick={() => setActiveTab('PARTNER_REVIEWS')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'PARTNER_REVIEWS'
                ? 'bg-[#c5a059] text-black'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Partner Approvals</span>
          </button>

          <button
            onClick={() => setActiveTab('AUDIT_STREAM')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'AUDIT_STREAM'
                ? 'bg-[#c5a059] text-black'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white'
            }`}
          >
            <Terminal className="h-4 w-4" />
            <span>System Audit &amp; Event Stream</span>
          </button>

          <button
            onClick={() => setActiveTab('SYSTEM_STATUS')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'SYSTEM_STATUS'
                ? 'bg-[#c5a059] text-black'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white'
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>Integrity Telemetry</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'PARTNER_REVIEWS' && <AdminApplicationReview />}

          {activeTab === 'AUDIT_STREAM' && (
            <div className="rounded-2xl border border-[#23232f] bg-[#0c0c11] p-6">
              <div className="flex items-center justify-between border-b border-[#1d1d28] pb-4">
                <div>
                  <h3 className="font-display text-base font-bold text-white">System Audit &amp; Event Stream</h3>
                  <p className="text-xs text-[#717180]">Logged real-time events across the AquaBloom platform foundation</p>
                </div>
                <button
                  onClick={fetchEvents}
                  disabled={loading}
                  className="flex items-center space-x-1.5 rounded-lg border border-[#2e2e3d] px-3 py-1.5 text-xs text-[#a3a3b2] hover:text-white"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="mt-4 overflow-x-auto">
                {events.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[#6e6e7d]">No audit events recorded yet.</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#1a1a24] text-[#636373]">
                        <th className="py-2.5 font-semibold">Timestamp</th>
                        <th className="py-2.5 font-semibold">Category</th>
                        <th className="py-2.5 font-semibold">Event Type</th>
                        <th className="py-2.5 font-semibold">Actor Role</th>
                        <th className="py-2.5 font-semibold">Visibility Scope</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#171720]">
                      {events.map((evt) => (
                        <tr key={evt.id} className="text-[#b2b2c0]">
                          <td className="py-2.5 font-mono text-[11px] text-[#717182]">
                            {new Date(evt.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="py-2.5 font-mono text-[11px] text-[#c5a059]">{evt.category}</td>
                          <td className="py-2.5 font-semibold text-white">{evt.eventType}</td>
                          <td className="py-2.5">
                            <span className="rounded bg-[#171722] px-2 py-0.5 text-[10px] text-[#a0a0b0]">
                              {evt.role || 'ANONYMOUS'}
                            </span>
                          </td>
                          <td className="py-2.5 font-mono text-[10px] text-[#8e8e9e]">{evt.scope}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === 'SYSTEM_STATUS' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="rounded-xl border border-[#21212d] bg-[#0c0c11] p-5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
                  Authorization Matrix
                </span>
                <div className="mt-2 flex items-center space-x-2 text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-semibold">Backend Role Enforced</span>
                </div>
                <p className="mt-1 text-[11px] text-[#6b6b7a]">UI hiding disabled; API level guards active</p>
              </div>

              <div className="rounded-xl border border-[#21212d] bg-[#0c0c11] p-5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
                  Event Architecture
                </span>
                <div className="mt-2 flex items-center space-x-2 text-[#d4af37]">
                  <Terminal className="h-4 w-4" />
                  <span className="font-semibold">Event Dispatcher Online</span>
                </div>
                <p className="mt-1 text-[11px] text-[#6b6b7a]">Auditing, Timeline, and Analytics streams initialized</p>
              </div>

              <div className="rounded-xl border border-[#21212d] bg-[#0c0c11] p-5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
                  Reliability Engine
                </span>
                <div className="mt-2 flex items-center space-x-2 text-[#d4af37]">
                  <span className="h-2 w-2 rounded-full bg-[#c5a059]" />
                  <span className="font-semibold">Idempotency Active</span>
                </div>
                <p className="mt-1 text-[11px] text-[#6b6b7a]">Duplicate requests blocked on sensitive mutations</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
