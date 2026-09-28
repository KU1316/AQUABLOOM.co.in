/**
 * AquaBloom Step 5: Deterministic Venue Matching & Eligibility Engine
 * 
 * CORE ARCHITECTURAL PRINCIPLES:
 * 1. DETERMINISTIC: Pure mathematical & rule-based scoring (NO AI model).
 * 2. EXPLAINABLE: Every score delta produces a structured MatchReason with code, delta, and source.
 * 3. REPEATABLE: Same Campaign + Same Venue + Same Config = EXACT SAME Score & Reasons.
 * 4. TESTABLE: Isolated, versioned configuration with clear dimension weights.
 * 5. SEPARATION: Hard Eligibility (can venue participate?) vs. Match Quality (how well does it fit?).
 * 6. CAPACITY AS DECISION THRESHOLD: Overage produces a Warning, NOT an automatic rejection.
 * 7. SANITIZED DATA PROJECTION: Strips private coordinator contacts, dock notes, and internal risk data.
 */

import {
  User,
  VenueProfile,
  Campaign,
  CapacityEvaluation,
  MatchReason,
  MatchEvaluation,
  MarketplaceVenue,
} from '../types.js';

export interface MatchingConfiguration {
  configVersion: string;
  weights: {
    locationMatch: number;          // Default 20
    venueTypeMatch: number;         // Default 20
    audienceMatch: number;          // Default 15
    footfallSuitability: number;    // Default 15
    bottleConsumption: number;      // Default 10
    capacityCompatibility: number;  // Default 10
    placementCompatibility: number; // Default 10
  };
}

export const DEFAULT_MATCHING_CONFIGURATION_V1: MatchingConfiguration = {
  configVersion: 'v1.0.0',
  weights: {
    locationMatch: 20,
    venueTypeMatch: 20,
    audienceMatch: 15,
    footfallSuitability: 15,
    bottleConsumption: 10,
    capacityCompatibility: 10,
    placementCompatibility: 10,
  },
};

/**
 * Evaluates hard marketplace eligibility for a venue.
 * Separate from scoring: answers "Can this venue participate in marketplace evaluation?"
 */
export function evaluateVenueEligibility(
  venueUser: User,
  venueProfile: VenueProfile,
  campaign?: Campaign
): { isEligible: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // 1. Account must be active
  if (venueUser.status !== 'ACTIVE') {
    reasons.push(`Venue account status is '${venueUser.status}', but must be ACTIVE.`);
  }

  // 2. Profile completion must be complete
  if (!venueProfile.completion?.isComplete) {
    reasons.push('Venue profile is incomplete. All mandatory operational fields must be completed.');
  }

  // 3. Visibility state must not be PRIVATE
  if (venueProfile.visibilityState === 'PRIVATE') {
    reasons.push('Venue visibility is set to PRIVATE. Must be PUBLIC_ELIGIBLE or PUBLIC.');
  }

  // 4. Campaign-specific hard restrictions
  if (campaign) {
    // Check forbidden categories
    const forbidden = venueProfile.campaignPreferences?.forbiddenCategories || [];
    if (forbidden.some((c) => c.toLowerCase() === campaign.category.toLowerCase())) {
      reasons.push(`Campaign category '${campaign.category}' is explicitly excluded by venue preferences.`);
    }

    // Check campaign excluded venue types
    const excludedTypes = campaign.eligibilityRequirements?.excludedVenueTypes || [];
    if (excludedTypes.some((t) => t.toLowerCase() === venueProfile.venueType.toLowerCase())) {
      reasons.push(`Venue type '${venueProfile.venueType}' is excluded by campaign eligibility criteria.`);
    }
  }

  return {
    isEligible: reasons.length === 0,
    reasons,
  };
}

/**
 * Authoritative capacity calculation:
 * AVAILABLE_BOTTLE_CAPACITY = MAX_BOTTLE_HOLDING_CAPACITY - CURRENT_ONGOING_BOTTLE_COMMITMENT
 * 
 * Capacity overage is a WARNING / DECISION threshold, not an automatic blocker.
 */
export function evaluateCapacity(
  capacity: {
    maxBottleHoldingCapacity: number;
    currentOngoingBottleCommitment: number;
    availableBottleCapacity?: number;
  },
  proposedQuantity: number
): CapacityEvaluation {
  const maxHolding = Math.max(0, capacity.maxBottleHoldingCapacity || 0);
  const currentCommitment = Math.max(0, capacity.currentOngoingBottleCommitment || 0);
  const available = Math.max(0, maxHolding - currentCommitment);
  const proposed = Math.max(0, proposedQuantity || 0);

  const isOver = proposed > available;
  const overage = isOver ? proposed - available : 0;

  return {
    status: isOver ? 'OVER_CAPACITY' : 'WITHIN_CAPACITY',
    maxBottleHoldingCapacity: maxHolding,
    currentOngoingBottleCommitment: currentCommitment,
    availableBottleCapacity: available,
    proposedCampaignQuantity: proposed,
    capacityOverage: overage,
    isWarning: isOver,
    warningMessage: isOver
      ? `Proposed quantity (${proposed.toLocaleString()} bottles) exceeds available holding capacity (${available.toLocaleString()} bottles) by ${overage.toLocaleString()} bottles. Venue may accept via split shipments or expanded holding in Step 6 negotiation.`
      : undefined,
  };
}

/**
 * Deterministic, explainable, and repeatable Match Score calculator.
 * Strictly adheres to isolated configuration without external API calls or AI hallucinations.
 */
export function calculateMatchScore(
  campaign: Campaign,
  venueProfile: VenueProfile,
  config: MatchingConfiguration = DEFAULT_MATCHING_CONFIGURATION_V1
): MatchEvaluation {
  const reasons: MatchReason[] = [];
  const ruleVer = config.configVersion;
  const weights = config.weights;

  // Check if minimum operational fields exist
  const hasSufficientData = !!(
    venueProfile.location?.city &&
    venueProfile.venueType &&
    venueProfile.audienceCategory &&
    venueProfile.footfall &&
    venueProfile.capacity
  );

  if (!hasSufficientData) {
    return {
      campaignId: campaign.id,
      venueId: venueProfile.accountId,
      score: null,
      scoreLabel: 'LIMITED MATCH DATA',
      hasSufficientData: false,
      reasons: [
        {
          reasonCode: 'INSUFFICIENT_VENUE_DATA',
          reasonType: 'WARNING',
          description: 'Venue profile lacks essential operational metrics required for match scoring.',
          impact: 0,
          sourceField: 'profile',
          ruleVersion: ruleVer,
        },
      ],
      ruleVersion: ruleVer,
      calculatedAt: new Date().toISOString(),
    };
  }

  let totalScore = 0;

  // 1. LOCATION COMPATIBILITY (Weight: 20)
  const venueCity = (venueProfile.location.city || '').trim().toLowerCase();
  const venueRegion = (venueProfile.location.stateRegion || '').trim().toLowerCase();
  const venueCountry = (venueProfile.location.country || '').trim().toLowerCase();

  const preferredLocations = campaign.venueRequirements?.preferredLocations || [];
  const maxLocWeight = weights.locationMatch;

  if (preferredLocations.length === 0) {
    // Campaign has no geographic constraint -> High neutral score
    const impact = Math.round(maxLocWeight * 0.85); // 17
    totalScore += impact;
    reasons.push({
      reasonCode: 'LOCATION_FLEXIBLE_NATIONWIDE',
      reasonType: 'POSITIVE',
      description: 'Campaign has nationwide/flexible location criteria; venue location is fully eligible.',
      impact,
      sourceField: 'location.city',
      ruleVersion: ruleVer,
    });
  } else {
    let bestLocScore = 0;
    let bestLocReason: MatchReason | null = null;

    for (const loc of preferredLocations) {
      const prefCity = (loc.city || '').trim().toLowerCase();
      const prefRegion = (loc.stateRegion || '').trim().toLowerCase();
      const prefCountry = (loc.country || '').trim().toLowerCase();

      if (prefCity && venueCity === prefCity) {
        bestLocScore = maxLocWeight; // 20
        bestLocReason = {
          reasonCode: 'LOCATION_CITY_EXACT_MATCH',
          reasonType: 'POSITIVE',
          description: `Venue city (${venueProfile.location.city}) is an exact match for target campaign market.`,
          impact: maxLocWeight,
          sourceField: 'location.city',
          ruleVersion: ruleVer,
        };
        break;
      } else if (prefRegion && venueRegion && venueRegion === prefRegion) {
        const score = Math.round(maxLocWeight * 0.65); // 13
        if (score > bestLocScore) {
          bestLocScore = score;
          bestLocReason = {
            reasonCode: 'LOCATION_REGION_MATCH',
            reasonType: 'POSITIVE',
            description: `Venue region (${venueProfile.location.stateRegion}) matches target campaign region.`,
            impact: score,
            sourceField: 'location.stateRegion',
            ruleVersion: ruleVer,
          };
        }
      } else if (prefCountry && venueCountry && venueCountry === prefCountry) {
        const score = Math.round(maxLocWeight * 0.4); // 8
        if (score > bestLocScore) {
          bestLocScore = score;
          bestLocReason = {
            reasonCode: 'LOCATION_COUNTRY_MATCH',
            reasonType: 'NEUTRAL',
            description: `Venue operates in the target national market (${venueProfile.location.country}).`,
            impact: score,
            sourceField: 'location.country',
            ruleVersion: ruleVer,
          };
        }
      }
    }

    if (bestLocReason) {
      totalScore += bestLocScore;
      reasons.push(bestLocReason);
    } else {
      reasons.push({
        reasonCode: 'LOCATION_OUTSIDE_PRIORITY_MARKETS',
        reasonType: 'WARNING',
        description: `Venue location (${venueProfile.location.city}) is outside the campaign's prioritized geographic markets.`,
        impact: 0,
        sourceField: 'location.city',
        ruleVersion: ruleVer,
      });
    }
  }

  // 2. VENUE TYPE COMPATIBILITY (Weight: 20)
  const venueType = (venueProfile.venueType || '').trim().toLowerCase();
  const preferredTypes = campaign.venueRequirements?.preferredVenueTypes || [];
  const maxTypeWeight = weights.venueTypeMatch;

  if (preferredTypes.length === 0) {
    const impact = Math.round(maxTypeWeight * 0.8); // 16
    totalScore += impact;
    reasons.push({
      reasonCode: 'VENUE_TYPE_BROAD_ELIGIBILITY',
      reasonType: 'POSITIVE',
      description: 'Campaign accepts all verified commercial venue formats.',
      impact,
      sourceField: 'venueType',
      ruleVersion: ruleVer,
    });
  } else {
    const isPreferred = preferredTypes.some((t) => {
      const target = t.trim().toLowerCase();
      return venueType === target || venueType.includes(target) || target.includes(venueType);
    });

    if (isPreferred) {
      totalScore += maxTypeWeight;
      reasons.push({
        reasonCode: 'VENUE_TYPE_PREFERRED_MATCH',
        reasonType: 'POSITIVE',
        description: `Venue type "${venueProfile.venueType}" directly matches campaign placement requirements.`,
        impact: maxTypeWeight,
        sourceField: 'venueType',
        ruleVersion: ruleVer,
      });
    } else {
      reasons.push({
        reasonCode: 'VENUE_TYPE_NON_PRIORITY',
        reasonType: 'NEUTRAL',
        description: `Venue format "${venueProfile.venueType}" is not among the campaign's specified priority types.`,
        impact: 0,
        sourceField: 'venueType',
        ruleVersion: ruleVer,
      });
    }
  }

  // 3. TARGET AUDIENCE COMPATIBILITY (Weight: 15)
  const venueAudience = (venueProfile.audienceCategory || '').toLowerCase();
  const campaignAudience = [
    campaign.targetAudience?.demographics || '',
    ...(campaign.targetAudience?.characteristics || []),
    ...(campaign.targetAudience?.interests || []),
  ].join(' ').toLowerCase();

  const maxAudienceWeight = weights.audienceMatch;

  // Keyword overlap check
  const keywords = ['corporate', 'tech', 'executives', 'luxury', 'sports', 'students', 'travelers', 'affluent', 'professionals', 'creative', 'general'];
  let matchedKeywordsCount = 0;
  for (const kw of keywords) {
    if (venueAudience.includes(kw) && campaignAudience.includes(kw)) {
      matchedKeywordsCount++;
    }
  }

  if (matchedKeywordsCount >= 2) {
    totalScore += maxAudienceWeight; // 15
    reasons.push({
      reasonCode: 'AUDIENCE_HIGH_CONVERGENCE',
      reasonType: 'POSITIVE',
      description: `Strong audience alignment between venue visitors (${venueProfile.audienceCategory}) and target demographics.`,
      impact: maxAudienceWeight,
      sourceField: 'audienceCategory',
      ruleVersion: ruleVer,
    });
  } else if (matchedKeywordsCount === 1 || venueAudience.length > 5) {
    const impact = Math.round(maxAudienceWeight * 0.65); // 10
    totalScore += impact;
    reasons.push({
      reasonCode: 'AUDIENCE_PARTIAL_CONVERGENCE',
      reasonType: 'NEUTRAL',
      description: `Moderate demographic compatibility with venue visitor profile (${venueProfile.audienceCategory}).`,
      impact,
      sourceField: 'audienceCategory',
      ruleVersion: ruleVer,
    });
  } else {
    const impact = Math.round(maxAudienceWeight * 0.3); // 5
    totalScore += impact;
    reasons.push({
      reasonCode: 'AUDIENCE_GENERAL_BASELINE',
      reasonType: 'NEUTRAL',
      description: 'General audience profile reaches broad consumer exposure.',
      impact,
      sourceField: 'audienceCategory',
      ruleVersion: ruleVer,
    });
  }

  // 4. FOOTFALL SUITABILITY (Weight: 15)
  const monthlyVisitors = venueProfile.footfall?.monthlyVisitors || 0;
  const minRequiredFootfall = campaign.eligibilityRequirements?.minimumFootfall;
  const maxFootfallWeight = weights.footfallSuitability;

  if (minRequiredFootfall && minRequiredFootfall > 0) {
    if (monthlyVisitors >= minRequiredFootfall) {
      totalScore += maxFootfallWeight; // 15
      reasons.push({
        reasonCode: 'FOOTFALL_CRITERIA_SATISFIED',
        reasonType: 'POSITIVE',
        description: `Monthly footfall of ${monthlyVisitors.toLocaleString()} satisfies campaign minimum requirement (${minRequiredFootfall.toLocaleString()}).`,
        impact: maxFootfallWeight,
        sourceField: 'footfall.monthlyVisitors',
        ruleVersion: ruleVer,
      });
    } else {
      reasons.push({
        reasonCode: 'FOOTFALL_BELOW_CAMPAIGN_CRITERIA',
        reasonType: 'WARNING',
        description: `Monthly footfall (${monthlyVisitors.toLocaleString()}) is below campaign threshold (${minRequiredFootfall.toLocaleString()}).`,
        impact: 0,
        sourceField: 'footfall.monthlyVisitors',
        ruleVersion: ruleVer,
      });
    }
  } else {
    // General footfall scale
    if (monthlyVisitors >= 40000) {
      totalScore += maxFootfallWeight; // 15
      reasons.push({
        reasonCode: 'FOOTFALL_EXCEPTIONAL_TRAFFIC',
        reasonType: 'POSITIVE',
        description: `Tier-1 high traffic venue with ${monthlyVisitors.toLocaleString()} monthly visitors.`,
        impact: maxFootfallWeight,
        sourceField: 'footfall.monthlyVisitors',
        ruleVersion: ruleVer,
      });
    } else if (monthlyVisitors >= 15000) {
      const impact = Math.round(maxFootfallWeight * 0.7); // 11
      totalScore += impact;
      reasons.push({
        reasonCode: 'FOOTFALL_SOLID_TRAFFIC',
        reasonType: 'POSITIVE',
        description: `Solid monthly visitor volume of ${monthlyVisitors.toLocaleString()}.`,
        impact,
        sourceField: 'footfall.monthlyVisitors',
        ruleVersion: ruleVer,
      });
    } else {
      const impact = Math.round(maxFootfallWeight * 0.35); // 5
      totalScore += impact;
      reasons.push({
        reasonCode: 'FOOTFALL_BOUTIQUE_VOLUME',
        reasonType: 'NEUTRAL',
        description: `Boutique footfall scale of ${monthlyVisitors.toLocaleString()} monthly visitors.`,
        impact,
        sourceField: 'footfall.monthlyVisitors',
        ruleVersion: ruleVer,
      });
    }
  }

  // 5. BOTTLE CONSUMPTION & DISTRIBUTION VELOCITY (Weight: 10)
  const monthlyConsumption = venueProfile.bottleConsumption?.estimatedMonthlyBottles || 0;
  const campaignQty = campaign.bottleRequirements?.requiredQuantity || 1000;
  const durationMonths =
    campaign.timing?.duration?.unit === 'MONTHS'
      ? Math.max(1, campaign.timing.duration.value)
      : Math.max(1, Math.round((campaign.timing?.duration?.value || 4) / 4.33));
  const monthlyPaceNeeded = Math.round(campaignQty / durationMonths);
  const maxConsWeight = weights.bottleConsumption;

  if (monthlyConsumption >= monthlyPaceNeeded) {
    totalScore += maxConsWeight; // 10
    reasons.push({
      reasonCode: 'CONSUMPTION_PACE_OPTIMAL',
      reasonType: 'POSITIVE',
      description: `Venue monthly consumption (${monthlyConsumption.toLocaleString()} bottles) comfortably absorbs required campaign distribution pace (${monthlyPaceNeeded.toLocaleString()}/mo).`,
      impact: maxConsWeight,
      sourceField: 'bottleConsumption.estimatedMonthlyBottles',
      ruleVersion: ruleVer,
    });
  } else if (monthlyConsumption >= monthlyPaceNeeded * 0.5) {
    const impact = Math.round(maxConsWeight * 0.6); // 6
    totalScore += impact;
    reasons.push({
      reasonCode: 'CONSUMPTION_PACE_MODERATE',
      reasonType: 'NEUTRAL',
      description: `Venue monthly consumption (${monthlyConsumption.toLocaleString()} bottles) provides moderate distribution throughput.`,
      impact,
      sourceField: 'bottleConsumption.estimatedMonthlyBottles',
      ruleVersion: ruleVer,
    });
  } else {
    const impact = Math.round(maxConsWeight * 0.2); // 2
    totalScore += impact;
    reasons.push({
      reasonCode: 'CONSUMPTION_PACE_PACING_REQUIRED',
      reasonType: 'WARNING',
      description: `Required campaign volume exceeds venue's estimated natural consumption rate (${monthlyConsumption.toLocaleString()}/mo); extended pacing or multi-point placement will be needed.`,
      impact,
      sourceField: 'bottleConsumption.estimatedMonthlyBottles',
      ruleVersion: ruleVer,
    });
  }

  // 6. CAPACITY COMPATIBILITY (Weight: 10)
  const capacityEval = evaluateCapacity(venueProfile.capacity, campaignQty);
  const maxCapWeight = weights.capacityCompatibility;

  if (capacityEval.status === 'WITHIN_CAPACITY') {
    totalScore += maxCapWeight; // 10
    reasons.push({
      reasonCode: 'CAPACITY_SUFFICIENT_HOLDING',
      reasonType: 'POSITIVE',
      description: `Available venue holding capacity (${capacityEval.availableBottleCapacity.toLocaleString()} bottles) fully accommodates the ${campaignQty.toLocaleString()} requested bottles.`,
      impact: maxCapWeight,
      sourceField: 'capacity.availableBottleCapacity',
      ruleVersion: ruleVer,
    });
  } else {
    // Capacity overage: WARNING, not rejection. 0 score delta for this dimension.
    reasons.push({
      reasonCode: 'CAPACITY_OVERAGE_DETECTED',
      reasonType: 'WARNING',
      description: `Campaign batch (${campaignQty.toLocaleString()} bottles) exceeds available holding capacity (${capacityEval.availableBottleCapacity.toLocaleString()} bottles) by ${capacityEval.capacityOverage.toLocaleString()} units. Requires split delivery agreement in Step 6.`,
      impact: 0,
      sourceField: 'capacity.availableBottleCapacity',
      ruleVersion: ruleVer,
    });
  }

  // 7. PLACEMENT & PREFERENCE ALIGNMENT (Weight: 10)
  const venuePlacements = venueProfile.placementPossibilities || [];
  const campaignPlacementReqs = [
    ...(campaign.venueRequirements?.placementRequirements || []),
    campaign.distributionRequirements?.placementDetails || '',
  ].join(' ').toLowerCase();

  const maxPlacementWeight = weights.placementCompatibility;

  let placementMatch = false;
  for (const p of venuePlacements) {
    if (campaignPlacementReqs.includes(p.toLowerCase())) {
      placementMatch = true;
      break;
    }
  }

  if (placementMatch || venuePlacements.length >= 2) {
    totalScore += maxPlacementWeight; // 10
    reasons.push({
      reasonCode: 'PLACEMENT_POSSIBILITIES_VERIFIED',
      reasonType: 'POSITIVE',
      description: 'Venue offers versatile placement zones (reception desk, executive lounge, meeting suites) compatible with distribution requirements.',
      impact: maxPlacementWeight,
      sourceField: 'placementPossibilities',
      ruleVersion: ruleVer,
    });
  } else {
    const impact = Math.round(maxPlacementWeight * 0.5); // 5
    totalScore += impact;
    reasons.push({
      reasonCode: 'PLACEMENT_STANDARD_BASELINE',
      reasonType: 'NEUTRAL',
      description: 'Standard physical placement supported.',
      impact,
      sourceField: 'placementPossibilities',
      ruleVersion: ruleVer,
    });
  }

  // Final score clamping
  const finalScore = Math.min(100, Math.max(0, Math.round(totalScore)));

  // Generate Score Label
  let scoreLabel = 'Low Match';
  if (finalScore >= 85) scoreLabel = 'Excellent Match';
  else if (finalScore >= 70) scoreLabel = 'Strong Match';
  else if (finalScore >= 50) scoreLabel = 'Moderate Match';
  else if (finalScore === 0) scoreLabel = 'Minimal Match';

  return {
    campaignId: campaign.id,
    venueId: venueProfile.accountId,
    score: finalScore,
    scoreLabel,
    hasSufficientData: true,
    reasons,
    ruleVersion: ruleVer,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Sanitizes a venue for advertiser marketplace discovery.
 * Strictly adheres to privacy boundaries:
 * - NO coordinator phone numbers or personal emails
 * - NO exact street address or dock security codes
 * - NO internal risk indicators or financial records
 */
export function sanitizeVenueForMarketplace(
  venueUser: User,
  venueProfile: VenueProfile,
  campaign?: Campaign,
  config: MatchingConfiguration = DEFAULT_MATCHING_CONFIGURATION_V1
): MarketplaceVenue {
  const isEligible = evaluateVenueEligibility(venueUser, venueProfile, campaign).isEligible;

  let capacityEvaluation: CapacityEvaluation | undefined;
  let matchEvaluation: MatchEvaluation | undefined;

  if (campaign) {
    const proposedQty = campaign.bottleRequirements?.requiredQuantity || 1000;
    capacityEvaluation = evaluateCapacity(venueProfile.capacity, proposedQty);
    matchEvaluation = calculateMatchScore(campaign, venueProfile, config);
  }

  return {
    id: venueUser.id,
    publicAccountId: venueUser.publicAccountId,
    venueName: venueProfile.venueName,
    venueType: venueProfile.venueType,
    description: venueProfile.description,
    location: {
      city: venueProfile.location?.city || '',
      stateRegion: venueProfile.location?.stateRegion,
      country: venueProfile.location?.country || '',
    },
    audienceCategory: venueProfile.audienceCategory,
    footfall: {
      monthlyVisitors: venueProfile.footfall?.monthlyVisitors || 0,
      peakTrafficTimes: venueProfile.footfall?.peakTrafficTimes,
    },
    bottleConsumption: {
      estimatedMonthlyBottles: venueProfile.bottleConsumption?.estimatedMonthlyBottles || 0,
      consumptionRateNotes: venueProfile.bottleConsumption?.consumptionRateNotes,
    },
    capacity: {
      maxBottleHoldingCapacity: venueProfile.capacity?.maxBottleHoldingCapacity || 0,
      currentOngoingBottleCommitment: venueProfile.capacity?.currentOngoingBottleCommitment || 0,
      availableBottleCapacity:
        venueProfile.capacity?.availableBottleCapacity ??
        Math.max(
          0,
          (venueProfile.capacity?.maxBottleHoldingCapacity || 0) -
            (venueProfile.capacity?.currentOngoingBottleCommitment || 0)
        ),
    },
    campaignAvailability: venueProfile.campaignAvailability || 'YEAR_ROUND',
    campaignPreferences: venueProfile.campaignPreferences,
    placementPossibilities: venueProfile.placementPossibilities || ['Front Desk / Reception Display'],
    visibilityState: venueProfile.visibilityState,
    capacityEvaluation,
    matchEvaluation,
    isMarketplaceEligible: isEligible,
  };
}
