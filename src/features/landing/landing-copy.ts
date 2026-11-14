import type { HeroMockCopy } from "./hero-product-mock";
import type { FeatureCardItem } from "./features";
import type { FaqItem } from "./faq";
import type { PricingTierItem } from "./pilot-pricing";
import type { SavingsCalculatorCopy } from "./savings-calculator";

type LandingTranslator = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

export interface LandingViewCopy {
  brandWordmark: string;
  navItems: Array<{ href: string; label: string }>;
  steps: Array<{ number: string; title: string; description: string }>;
  featureCards: FeatureCardItem[];
  calculator: SavingsCalculatorCopy;
  pricingTiers: PricingTierItem[];
  faqItems: FaqItem[];
  mock: HeroMockCopy;
}

export function buildLandingViewCopy(
  t: LandingTranslator,
  brandWordmark: string,
): LandingViewCopy {
  return {
    brandWordmark,
    navItems: [
      { href: "#problem", label: t("header.navProblem") },
      { href: "#how-it-works", label: t("header.navHowItWorks") },
      { href: "#features", label: t("header.navFeatures") },
      { href: "#calculator", label: t("header.navCalculator") },
      { href: "#pricing", label: t("header.navPricing") },
      { href: "#faq", label: t("header.navFaq") },
    ],
    steps: [
      {
        number: t("howItWorks.step1.number"),
        title: t("howItWorks.step1.title"),
        description: t("howItWorks.step1.description"),
      },
      {
        number: t("howItWorks.step2.number"),
        title: t("howItWorks.step2.title"),
        description: t("howItWorks.step2.description"),
      },
      {
        number: t("howItWorks.step3.number"),
        title: t("howItWorks.step3.title"),
        description: t("howItWorks.step3.description"),
      },
    ],
    featureCards: [
      {
        key: "offline",
        title: t("features.cards.offlineLogging.title"),
        description: t("features.cards.offlineLogging.description"),
      },
      {
        key: "alerts",
        title: t("features.cards.spikeAlerts.title"),
        description: t("features.cards.spikeAlerts.description"),
      },
      {
        key: "recommendations",
        title: t("features.cards.weeklyRecommendations.title"),
        description: t("features.cards.weeklyRecommendations.description"),
      },
      {
        key: "report",
        title: t("features.cards.monthlyReport.title"),
        description: t("features.cards.monthlyReport.description"),
      },
      {
        key: "bilingual",
        title: t("features.cards.bilingual.title"),
        description: t("features.cards.bilingual.description"),
      },
      {
        key: "csv",
        title: t("features.cards.csvPosImport.title"),
        description: t("features.cards.csvPosImport.description"),
      },
    ],
    calculator: {
      heading: t("calculator.heading"),
      subheading: t("calculator.subheading"),
      estimateBadge: t("calculator.estimateBadge"),
      purchasesLabel: t("calculator.purchasesLabel"),
      purchasesHint: t("calculator.purchasesHint"),
      purchasesRangeLabel: t("calculator.purchasesRangeLabel"),
      wastePctLabel: t("calculator.wastePctLabel"),
      wastePctHint: t("calculator.wastePctHint"),
      reductionPctLabel: t("calculator.reductionPctLabel"),
      reductionPctHint: t("calculator.reductionPctHint"),
      reductionMinLabel: t("calculator.reductionMinLabel"),
      reductionMaxLabel: t("calculator.reductionMaxLabel"),
      clampedNotice: t("calculator.clampedNotice"),
      resultsRegionLabel: t("calculator.resultsRegionLabel"),
      monthlyWasteResultLabel: t("calculator.monthlyWasteResultLabel"),
      monthlySavingsResultLabel: t("calculator.monthlySavingsResultLabel"),
      annualSavingsResultLabel: t("calculator.annualSavingsResultLabel"),
      planComparisonTitle: t("calculator.planComparisonTitle"),
      recommendedPlanLabel: t("calculator.recommendedPlanLabel"),
      planFeeLabel: t("calculator.planFeeLabel"),
      netAfterPlanLabel: t("calculator.netAfterPlanLabel"),
      belowPlanFeeNote: t("calculator.belowPlanFeeNote", { price: "{price}" }),
      tierNames: {
        small: t("pricing.tiers.small.name"),
        medium: t("pricing.tiers.medium.name"),
        enterprise: t("pricing.tiers.enterprise.name"),
      },
      tierThresholds: {
        small: t("calculator.tierThresholds.small"),
        medium: t("calculator.tierThresholds.medium"),
        enterprise: t("calculator.tierThresholds.enterprise"),
      },
      sarAmountTemplate: t("calculator.sarAmount", { amount: "{amount}" }),
      sarPerMonthTemplate: t("calculator.sarPerMonth", { amount: "{amount}" }),
      sarPerYearTemplate: t("calculator.sarPerYear", { amount: "{amount}" }),
      sarUnit: t("calculator.sarUnit"),
      disclaimer: t("calculator.disclaimer"),
      cta: t("calculator.cta"),
    },
    pricingTiers: [
      {
        id: "small",
        name: t("pricing.tiers.small.name"),
        price: t("pricing.tiers.small.price"),
        summary: t("pricing.tiers.small.summary"),
        features: [
          t("pricing.tiers.small.features.item1"),
          t("pricing.tiers.small.features.item2"),
          t("pricing.tiers.small.features.item3"),
          t("pricing.tiers.small.features.item4"),
        ],
      },
      {
        id: "medium",
        name: t("pricing.tiers.medium.name"),
        price: t("pricing.tiers.medium.price"),
        summary: t("pricing.tiers.medium.summary"),
        features: [
          t("pricing.tiers.medium.features.item1"),
          t("pricing.tiers.medium.features.item2"),
          t("pricing.tiers.medium.features.item3"),
          t("pricing.tiers.medium.features.item4"),
        ],
      },
      {
        id: "enterprise",
        name: t("pricing.tiers.enterprise.name"),
        price: t("pricing.tiers.enterprise.price"),
        summary: t("pricing.tiers.enterprise.summary"),
        features: [
          t("pricing.tiers.enterprise.features.item1"),
          t("pricing.tiers.enterprise.features.item2"),
          t("pricing.tiers.enterprise.features.item3"),
          t("pricing.tiers.enterprise.features.item4"),
        ],
      },
    ],
    faqItems: [
      { id: "q1", question: t("faq.q1.question"), answer: t("faq.q1.answer") },
      { id: "q2", question: t("faq.q2.question"), answer: t("faq.q2.answer") },
      { id: "q3", question: t("faq.q3.question"), answer: t("faq.q3.answer") },
      { id: "q4", question: t("faq.q4.question"), answer: t("faq.q4.answer") },
      { id: "q5", question: t("faq.q5.question"), answer: t("faq.q5.answer") },
      { id: "q6", question: t("faq.q6.question"), answer: t("faq.q6.answer") },
    ],
    mock: {
      frameRegionLabel: t("hero.mock.frameRegionLabel"),
      urlLabel: t("hero.mock.urlLabel"),
      demoBadge: t("hero.mock.demoBadge"),
      dashboardTitle: t("hero.mock.dashboardTitle"),
      kpiWasteLabel: t("hero.mock.kpiWasteLabel"),
      kpiWasteValue: t("hero.mock.kpiWasteValue"),
      kpiDeltaValue: t("hero.mock.kpiDeltaValue"),
      kpiShareLabel: t("hero.mock.kpiShareLabel"),
      kpiShareValue: t("hero.mock.kpiShareValue"),
      kpiTopDriverLabel: t("hero.mock.kpiTopDriverLabel"),
      kpiTopDriverValue: t("hero.mock.kpiTopDriverValue"),
      chartTitle: t("hero.mock.chartTitle"),
      chartWeek1: t("hero.mock.chartWeek1"),
      chartWeek2: t("hero.mock.chartWeek2"),
      chartWeek3: t("hero.mock.chartWeek3"),
      chartWeek4: t("hero.mock.chartWeek4"),
      phoneFrameLabel: t("hero.mock.phoneFrameLabel"),
      phoneTitle: t("hero.mock.phoneTitle"),
      phoneShiftBadge: t("hero.mock.phoneShiftBadge"),
      phoneOfflineReady: t("hero.mock.phoneOfflineReady"),
      phoneItemLabel: t("hero.mock.phoneItemLabel"),
      phoneQty1: t("hero.mock.phoneQty1"),
      phoneQty2: t("hero.mock.phoneQty2"),
      phoneQty3: t("hero.mock.phoneQty3"),
      phoneReason1: t("hero.mock.phoneReason1"),
      phoneReason2: t("hero.mock.phoneReason2"),
      phoneSubmit: t("hero.mock.phoneSubmit"),
    },
  };
}
