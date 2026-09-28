import React from 'react';
import { CampaignAgreementStatus } from '../../types.js';
import { Lock, Clock, CheckCircle2, AlertTriangle, FileText, Ban } from 'lucide-react';

interface Props {
  status: CampaignAgreementStatus;
  size?: 'sm' | 'md' | 'lg';
}

export const AgreementStatusBadge: React.FC<Props> = ({ status, size = 'md' }) => {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2',
  }[size];

  switch (status) {
    case 'LOCKED':
      return (
        <span
          className={`inline-flex items-center font-bold rounded-full bg-emerald-950/60 border border-emerald-500/50 text-emerald-400 ${sizeClasses}`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>COMMERCIALLY LOCKED</span>
        </span>
      );

    case 'READY_TO_LOCK':
      return (
        <span
          className={`inline-flex items-center font-bold rounded-full bg-amber-950/60 border border-amber-500/60 text-amber-300 animate-pulse ${sizeClasses}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>READY TO LOCK</span>
        </span>
      );

    case 'AWAITING_ADVERTISER_CONFIRMATION':
      return (
        <span
          className={`inline-flex items-center font-medium rounded-full bg-blue-950/50 border border-blue-600/40 text-blue-300 ${sizeClasses}`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Awaiting Advertiser Confirmation</span>
        </span>
      );

    case 'AWAITING_VENUE_CONFIRMATION':
      return (
        <span
          className={`inline-flex items-center font-medium rounded-full bg-purple-950/50 border border-purple-600/40 text-purple-300 ${sizeClasses}`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Awaiting Venue Confirmation</span>
        </span>
      );

    case 'DRAFT':
      return (
        <span
          className={`inline-flex items-center font-medium rounded-full bg-stone-900 border border-stone-700 text-stone-300 ${sizeClasses}`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Agreement Draft</span>
        </span>
      );

    case 'SUPERSEDED':
      return (
        <span
          className={`inline-flex items-center font-medium rounded-full bg-zinc-900 border border-zinc-700 text-zinc-400 ${sizeClasses}`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Superseded</span>
        </span>
      );

    case 'TERMINATED':
      return (
        <span
          className={`inline-flex items-center font-bold rounded-full bg-rose-950/60 border border-rose-800 text-rose-400 ${sizeClasses}`}
        >
          <Ban className="w-3.5 h-3.5" />
          <span>Terminated</span>
        </span>
      );

    default:
      return (
        <span
          className={`inline-flex items-center font-medium rounded-full bg-zinc-800 text-zinc-300 ${sizeClasses}`}
        >
          <span>{status}</span>
        </span>
      );
  }
};
