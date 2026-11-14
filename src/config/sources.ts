export interface LandingSource {
  id: "national_food_waste_loss" | "restaurant_purchase_waste_share";
  number: 1 | 2;
  /** Clearly marked TODO placeholder title until verified source is added */
  titleAr: string;
  /** Clearly marked TODO placeholder title until verified source is added */
  titleEn: string;
  /** Issuing body and publication year once verified */
  publisherYear: string | null;
  /** Verified canonical URL; leave null while TODO to avoid unverified links */
  url: string | null;
  isPlaceholder: boolean;
}

/**
 * Source registry for numeric statistics shown in the Problem section.
 * Never invent URLs — replace TODO placeholders once primary references are verified.
 */
export const LANDING_SOURCES: readonly LandingSource[] = [
  {
    id: "national_food_waste_loss",
    number: 1,
    titleAr:
      "TODO: أضف المرجع الرسمي الموثق لإحصائية خسائر هدر الطعام السنوية في السعودية (47 مليار ريال) والرابط المعتمد.",
    titleEn:
      "TODO: Add verified primary study title, year, and official URL for the SAR 47B Saudi annual food-waste loss statistic.",
    publisherYear: null,
    url: null,
    isPlaceholder: true,
  },
  {
    id: "restaurant_purchase_waste_share",
    number: 2,
    titleAr:
      "TODO: أضف المرجع الموثق لنسبة متوسط هدر المطاعم من مشترياتها (26%) والرابط المعتمد.",
    titleEn:
      "TODO: Add verified benchmark report title, year, and official URL for the 26% average restaurant waste share of purchases.",
    publisherYear: null,
    url: null,
    isPlaceholder: true,
  },
];
