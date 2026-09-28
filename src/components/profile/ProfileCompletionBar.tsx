/**
 * AquaBloom Profile Completion & Version Header
 * 
 * Computes and displays true mathematical completion progress.
 * Renders honest indicators for missing required fields and version metadata.
 */

import React from 'react';
import { ProfileCompletion, BaseProfileMetadata } from '../../types.js';
import { CheckCircle2, AlertCircle, GitCommit, Layers } from 'lucide-react';

interface ProfileCompletionBarProps {
  completion?: ProfileCompletion;
  metadata?: Partial<BaseProfileMetadata>;
  roleLabel: string;
}

export const ProfileCompletionBar: React.FC<ProfileCompletionBarProps> = ({
  completion,
  metadata,
  roleLabel,
}) => {
  const percentage = completion?.percentage ?? 0;
  const isComplete = completion?.isComplete ?? false;
  const missing = completion?.missingRequiredFields ?? [];
  const version = metadata?.version ?? 1;

  return (
    <div className="rounded-xl border border-[#232330] bg-[#0e0e14] p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-[#c5a059]">
            <Layers className="h-4 w-4" />
            <span>{roleLabel} Profile Health</span>
          </div>
          <h2 className="mt-1 font-display text-lg font-bold text-white">
            {isComplete ? 'Operational Profile Complete' : 'Profile Setup in Progress'}
          </h2>
          <p className="text-xs text-[#8e8e9f]">
            {isComplete
              ? 'All required operational parameters are satisfied for marketplace readiness.'
              : `${missing.length} mandatory field${missing.length > 1 ? 's' : ''} require attention to achieve full operational eligibility.`}
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right">
            <span className="font-mono text-2xl font-bold text-white">{percentage}%</span>
            <p className="text-[10px] uppercase tracking-wider text-[#737385]">Calculated Completion</p>
          </div>
          <div className="flex items-center space-x-1.5 rounded-lg border border-[#232332] bg-[#14141c] px-3 py-2 text-xs text-[#9d9db3]">
            <GitCommit className="h-3.5 w-3.5 text-[#c5a059]" />
            <span>v{version}.0</span>
          </div>
        </div>
      </div>

      {/* Progress Track */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#1b1b24]">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            isComplete
              ? 'bg-gradient-to-r from-[#c5a059] to-emerald-400'
              : percentage >= 50
              ? 'bg-[#c5a059]'
              : 'bg-amber-600'
          }`}
          style={{ width: `${Math.max(5, percentage)}%` }}
        />
      </div>

      {/* Missing Required Fields Notice */}
      {!isComplete && missing.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-900/30 bg-amber-950/20 p-3.5 text-xs">
          <div className="flex items-center space-x-2 text-amber-400 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Missing Mandatory Operational Information:</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {missing.map((field) => (
              <span
                key={field}
                className="rounded border border-amber-800/40 bg-amber-900/20 px-2.5 py-0.5 text-[11px] font-medium text-amber-300"
              >
                {field}
              </span>
            ))}
          </div>
        </div>
      )}

      {isComplete && (
        <div className="mt-4 flex items-center space-x-2 rounded-lg border border-emerald-900/30 bg-emerald-950/20 px-3.5 py-2.5 text-xs text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>All required business criteria validated. Ready for Step 3 campaign interactions.</span>
        </div>
      )}
    </div>
  );
};
