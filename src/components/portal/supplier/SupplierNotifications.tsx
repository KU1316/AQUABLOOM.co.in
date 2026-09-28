/**
 * AquaBloom Step 9: Supplier Notifications Panel
 * 
 * Connected to existing Notification architecture:
 * - Lists operational alerts for supplier (New Offers, Expirations, Confirmed Assignments)
 * - Marks individual or all notifications as read
 * - Handles empty states gracefully
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../../lib/api.js';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Info,
  CheckCheck,
  Clock,
  RefreshCw,
} from 'lucide-react';

interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';
  read: boolean;
  createdAt: string;
  relatedEntityId?: string;
  relatedEntityPublicId?: string;
}

export const SupplierNotifications: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getNotifications();
      if (res.error) {
        throw new Error(res.error.message || 'Failed to fetch notifications.');
      }
      setNotifications((res.data as any) || []);
    } catch (err: any) {
      setError(err.message || 'Error loading notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#21212d] pb-5">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <Bell className="h-4 w-4" />
            <span>Operational Dispatch Notifications</span>
          </div>
          <h2 className="mt-1 font-display text-xl sm:text-2xl font-bold text-white">
            Notifications Center
          </h2>
          <p className="mt-1 text-xs text-[#8e8e9f]">
            Stay updated on new production offers, expiration notices, and confirmed bottling assignments.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {unreadCount > 0 && (
            <span className="rounded-full bg-amber-950/80 border border-amber-800/50 px-3 py-1 text-xs font-semibold text-amber-300">
              {unreadCount} Unread
            </span>
          )}
          <button
            onClick={fetchNotifications}
            disabled={loading}
            className="p-2 rounded-lg border border-[#262634] bg-[#12121a] hover:bg-[#1a1a24] text-zinc-400 hover:text-white transition disabled:opacity-50"
            title="Refresh notifications"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className="rounded-2xl border border-[#21212d] bg-[#0c0c12] p-12 text-center text-xs text-zinc-400">
          Loading operational notifications...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-900/40 bg-[#12080a] p-8 text-center space-y-2">
          <AlertTriangle className="h-6 w-6 text-red-400 mx-auto" />
          <p className="text-xs text-red-300">{error}</p>
          <button
            onClick={fetchNotifications}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs text-white hover:bg-zinc-700 transition"
          >
            Retry
          </button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-2xl border border-[#21212d] bg-[#0c0c12] p-12 text-center space-y-3">
          <Bell className="h-10 w-10 text-[#555566] mx-auto mb-2" />
          <h3 className="text-sm font-bold text-white">No new notifications</h3>
          <p className="text-xs text-[#838396] max-w-sm mx-auto">
            You are all caught up! Operational notices regarding offer dispatches and assignment confirmations will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => {
            const isUnread = !item.read;

            return (
              <div
                key={item.id}
                className={`rounded-xl border p-4 transition flex items-start justify-between gap-4 ${
                  isUnread
                    ? 'border-[#3a3a4c] bg-[#12121b]'
                    : 'border-[#1e1e28] bg-[#0c0c12] opacity-80'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className="mt-0.5 shrink-0">
                    {item.type === 'SUCCESS' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : item.type === 'WARNING' ? (
                      <AlertTriangle className="h-5 w-5 text-amber-400" />
                    ) : (
                      <Info className="h-5 w-5 text-[#c5a059]" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">{item.title}</span>
                      {isUnread && (
                        <span className="h-2 w-2 rounded-full bg-[#c5a059]" />
                      )}
                    </div>
                    <p className="text-xs text-[#a6a6b8] leading-relaxed">{item.message}</p>
                    <span className="text-[10px] text-[#6b6b7d] block font-mono">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                {isUnread && (
                  <button
                    onClick={() => handleMarkAsRead(item.id)}
                    className="p-1.5 rounded-lg hover:bg-[#1f1f2e] text-zinc-400 hover:text-white transition shrink-0"
                    title="Mark as read"
                  >
                    <CheckCheck className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
