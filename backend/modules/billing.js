const PLAN_ORDER = ['starter', 'growth', 'pro'];

const FEATURE_MIN_TIER = {
  'dashboard.appointments': 'starter',
  'dashboard.clients': 'starter',
  'dashboard.services': 'starter',
  'dashboard.staff': 'growth',
  'dashboard.settings': 'growth',
  'dashboard.legal': 'growth',
  'dashboard.revenue': 'pro',
  'dashboard.agent': 'growth'
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trial']);

function normalizeTier(tier) {
  const fallback = String(process.env.DEFAULT_PLAN_TIER || 'growth').trim().toLowerCase();
  const normalizedFallback = PLAN_ORDER.includes(fallback) ? fallback : 'growth';
  const normalized = String(tier || '').trim().toLowerCase();
  return PLAN_ORDER.includes(normalized) ? normalized : normalizedFallback;
}

function normalizeSubscriptionStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized || 'active';
}

function getTierRank(tier) {
  return PLAN_ORDER.indexOf(normalizeTier(tier));
}

function getRequiredTierForFeature(featureKey) {
  return FEATURE_MIN_TIER[featureKey] || 'starter';
}

function hasFeatureAccess(tier, featureKey) {
  const currentRank = getTierRank(tier);
  const requiredRank = getTierRank(getRequiredTierForFeature(featureKey));
  return currentRank >= requiredRank;
}

function isSubscriptionActive(status) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(normalizeSubscriptionStatus(status));
}

function buildFeatureAccessMap(tier) {
  const map = {};
  Object.keys(FEATURE_MIN_TIER).forEach((featureKey) => {
    map[featureKey] = hasFeatureAccess(tier, featureKey);
  });
  return map;
}

function getBillingSnapshot(customer) {
  const tier = normalizeTier(customer?.tier);
  const status = normalizeSubscriptionStatus(customer?.status);
  return {
    tier,
    status,
    features: buildFeatureAccessMap(tier)
  };
}

function evaluateFeatureAccess(context, featureKey) {
  const currentTier = normalizeTier(context?.tier);
  const status = normalizeSubscriptionStatus(context?.status);
  const requiredTier = getRequiredTierForFeature(featureKey);

  if (!isSubscriptionActive(status)) {
    return {
      allowed: false,
      code: 'subscription_inactive',
      currentTier,
      requiredTier,
      status
    };
  }

  if (!hasFeatureAccess(currentTier, featureKey)) {
    return {
      allowed: false,
      code: 'plan_upgrade_required',
      currentTier,
      requiredTier,
      status
    };
  }

  return {
    allowed: true,
    code: null,
    currentTier,
    requiredTier,
    status
  };
}

const checkBilling = async (req, res, next) => {
  const envStatus = normalizeSubscriptionStatus(process.env.BILLING_STATUS || 'active');
  if (!isSubscriptionActive(envStatus)) {
    return res.status(402).json({ error: 'Subscription inactive.', code: 'subscription_inactive' });
  }
  next();
};

module.exports = {
  PLAN_ORDER,
  FEATURE_MIN_TIER,
  normalizeTier,
  normalizeSubscriptionStatus,
  getRequiredTierForFeature,
  hasFeatureAccess,
  isSubscriptionActive,
  buildFeatureAccessMap,
  getBillingSnapshot,
  evaluateFeatureAccess,
  checkBilling
};