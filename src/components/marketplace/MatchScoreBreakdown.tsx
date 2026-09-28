/**
 * AquaBloom Deterministic Match Score Breakdown Component
 * 
 * Step 5: Explains the multi-dimensional algorithm weights, criteria,
 * match reasons, and penalties with full transparency and zero AI black-box scoring.
 */

import React from 'react';
import { MatchEvaluation } from '../../types.js';
import { ShieldCheck, Info, CheckCircle, AlertTriangle, Cpu, Tag } from 'lucide-react';

interface MatchScoreBreakdownProps {
  evaluation: MatchEvaluation;
  venueName: string;
}

export const MatchScoreBreakdown: React.FC<MatchScoreBreakdownProps> = ({ evaluation, venueName }) => {
  const { score, reasons, scoreLabel, ruleVersion } = evaluation;

  if (score === null) {
    return (
      <div className="rounded-xl border border-[#232330] bg-[#121218] p-4 text-xs text-[#8e8e9f]">
        Select an active campaign to evaluate this venue's deterministic Match Score.
      </div>
    );
  }

  // Tier color & badge
  let scoreBadgeColor = 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40';
  if (score < 70) {
    scoreBadgeColor = 'text-amber-400 bg-amber-950/40 border-amber-800/40';
  }
  if (score < 50) {
    scoreBadgeColor = 'text-rose-400 bg-rose-950/40 border-rose-800/40';
  }

  const positiveReasons = reasons.filter((r) => r.reasonType === 'POSITIVE');
  const warningOrNeutral = reasons.filter((r) => r.reasonType !== 'POSITIVE');

  return (
    <div className="space-y-4 rounded-xl border border-[#262635] bg-[#0d0d12] p-5">
      {/* Header & Score Metric */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1f1f2a] pb-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Cpu className="h-4 w-4 text-[#c5a059]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[#c5a059]">
              Deterministic Match Evaluation
            </span>
            <span className="rounded bg-[#1a1a24] px-2 py-0.5 text-[10px] font-mono text-[#8b8b9e]">
              Engine {ruleVersion}
            </span>
          </div>
          <h4 className="text-base font-display font-bold text-white">
            Matching Analysis for {venueName}
          </h4>
          <p className="text-xs text-[#8c8ca0]">
            Computed via mathematical weighted dimension modeling against active campaign parameters.
          </p>
        </div>

        <div className="flex items-center space-x-3 sm:text-right">
          <div>
            <div className="text-[10px] uppercase font-semibold text-[#7e7e92] tracking-wider">
              Compatibility
            </div>
            <div className="text-xs font-bold text-white">{scoreLabel}</div>
          </div>
          <div className={`rounded-xl border px-3.5 py-2 font-mono text-xl font-bold ${scoreBadgeColor}`}>
            {score}/100
          </div>
        </div>
      </div>

      {/* Explanatory Reasons & Detailed Scoring Audit */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-[#8b8b9e]">
          <span>Dimension Impact &amp; Reason Audit</span>
          <span className="text-[11px] text-[#717185] font-normal font-mono">
            {reasons.length} criteria evaluated
          </span>
        </div>

        <div className="space-y-2">
          {reasons.map((r, idx) => {
            const isPos = r.reasonType === 'POSITIVE';
            const isWarn = r.reasonType === 'WARNING' || r.reasonType === 'NEGATIVE';

            return (
              <div
                key={idx}
                className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-xs ${
                  isPos
                    ? 'border-emerald-900/30 bg-emerald-950/15 text-emerald-300'
                    : isWarn
                    ? 'border-amber-900/40 bg-amber-950/20 text-amber-200'
                    : 'border-[#21212e] bg-[#14141d] text-[#a0a0b3]'
                }`}
              >
                <div className="flex items-start space-x-2.5">
                  {isPos ? (
                    <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : isWarn ? (
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-4 w-4 text-[#7d7d91] shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#9d9db3] bg-black/40 px-1.5 py-0.2 rounded">
                        {r.reasonCode}
                      </span>
                      <span className="text-[10px] text-[#717185]">{r.sourceField}</span>
                    </div>
                    <p className="text-white font-medium">{r.description}</p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span
                    className={`font-mono text-xs font-bold rounded px-2 py-0.5 ${
                      r.impact > 0
                        ? 'text-emerald-400 bg-emerald-950/50'
                        : r.impact < 0
                        ? 'text-rose-400 bg-rose-950/50'
                        : 'text-[#848496] bg-[#1a1a24]'
                    }`}
                  >
                    {r.impact > 0 ? `+${r.impact}` : r.impact} pts
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Master Consistency Disclaimer */}
      <div className="rounded-lg border border-[#20202d] bg-[#09090d] p-3 text-[11px] text-[#6e6e80] flex items-start space-x-2">
        <ShieldCheck className="h-4 w-4 text-[#c5a059] shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-[#d4af37]">Deterministic Invariant: </span>
          Scores are mathematically calculated from campaign requirements and venue operational profiles. No AI models determine ranking. The same venue will generate different scores when evaluated against different campaign requirements.
        </div>
      </div>
    </div>
  );
};
