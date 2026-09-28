import React from 'react';
import { ProposalStatus } from '../../types.js';
import {
  Clock,
  Send,
  Eye,
  MessageSquare,
  CheckCircle2,
  FileCheck2,
  XCircle,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';

interface ProposalStatusBadgeProps {
  status: ProposalStatus;
  className?: string;
  showIcon?: boolean;
}

export const ProposalStatusBadge: React.FC<ProposalStatusBadgeProps> = ({
  status,
  className = '',
  showIcon = true,
}) => {
  switch (status) {
    case 'DRAFT':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-[#2e2e3f] bg-[#1a1a24] px-2.5 py-0.5 text-[11px] font-semibold text-[#a5a5bb] ${className}`}
        >
          {showIcon && <Clock className="h-3 w-3" />}
          <span>Draft</span>
        </span>
      );

    case 'SENT':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-sky-800/40 bg-sky-950/30 px-2.5 py-0.5 text-[11px] font-semibold text-sky-400 ${className}`}
        >
          {showIcon && <Send className="h-3 w-3" />}
          <span>Sent to Venue</span>
        </span>
      );

    case 'VIEWED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-indigo-800/40 bg-indigo-950/30 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300 ${className}`}
        >
          {showIcon && <Eye className="h-3 w-3" />}
          <span>Viewed by Venue</span>
        </span>
      );

    case 'UNDER_NEGOTIATION':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-amber-800/50 bg-amber-950/30 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300 ${className}`}
        >
          {showIcon && <MessageSquare className="h-3 w-3" />}
          <span>Under Negotiation</span>
        </span>
      );

    case 'ACCEPTED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-teal-800/50 bg-teal-950/30 px-2.5 py-0.5 text-[11px] font-semibold text-teal-300 ${className}`}
        >
          {showIcon && <CheckCircle2 className="h-3 w-3" />}
          <span>Partially Confirmed</span>
        </span>
      );

    case 'READY_FOR_AGREEMENT':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-950/40 px-3 py-1 text-xs font-bold text-emerald-300 shadow-sm shadow-emerald-950/50 ${className}`}
        >
          {showIcon && <FileCheck2 className="h-3.5 w-3.5 text-emerald-400" />}
          <span>Ready for Agreement</span>
        </span>
      );

    case 'DECLINED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-rose-900/40 bg-rose-950/30 px-2.5 py-0.5 text-[11px] font-semibold text-rose-400 ${className}`}
        >
          {showIcon && <XCircle className="h-3 w-3" />}
          <span>Declined</span>
        </span>
      );

    case 'WITHDRAWN':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-[#3b3b4d] bg-[#1c1c26] px-2.5 py-0.5 text-[11px] font-semibold text-[#8e8ea6] ${className}`}
        >
          {showIcon && <RotateCcw className="h-3 w-3" />}
          <span>Withdrawn</span>
        </span>
      );

    case 'EXPIRED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-amber-900/30 bg-amber-950/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-500/80 ${className}`}
        >
          {showIcon && <AlertTriangle className="h-3 w-3" />}
          <span>Expired</span>
        </span>
      );

    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-[#2e2e3f] bg-[#1a1a24] px-2.5 py-0.5 text-[11px] font-semibold text-[#a5a5bb] ${className}`}
        >
          <span>{status}</span>
        </span>
      );
  }
};
