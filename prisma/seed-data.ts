import type { Shift, Unit, WasteReason } from "@prisma/client";

export const SEED_CREDENTIALS = {
  platformAdmin: {
    email: "admin@wafrah.sa",
    username: "platform-admin",
    password: "WafrahAdmin!2026",
  },
  jeddahRestaurant: {
    code: "SHAMI-JED",
    name: "Al Bait Al Shami",
    nameAr: "البيت الشامي",
    owner: {
      email: "manager@shami.sa",
      username: "manager",
      password: "ShamiManager!2026",
    },
    staff: [
      { username: "ahmed", name: "Ahmed Al-Zahrani", pin: "1234" },
      { username: "omar", name: "Omar Al-Ghamdi", pin: "5678" },
    ],
  },
  makkahRestaurant: {
    code: "DIWAN-MKH",
    name: "Diwan Al Hijaz",
    nameAr: "ديوان الحجاز",
    owner: {
      email: "manager@diwan-makkah.sa",
      username: "manager",
      password: "DiwanManager!2026",
    },
    staff: [{ username: "salem", name: "Salem Al-Qurashi", pin: "4321" }],
  },
} as const;

export interface SeedMenuItemSpec {
  code: string;
  name: string;
  nameAr: string;
  category: string;
  unit: Unit;
  salesUnitFactor: string;
  unitCost: string;
  shortageCost: string;
  baseDailySold: number;
  baseDailyWaste: number;
  isAnomalyTarget?: boolean;
}

export const JEDDAH_MENU_ITEMS: SeedMenuItemSpec[] = [
  {
    code: "SHM-RICE",
    name: "Rice",
    nameAr: "أرز بسمتي مندي",
    category: "Grains",
    unit: "KG",
    salesUnitFactor: "0.2500",
    unitCost: "14.50",
    shortageCost: "21.75",
    baseDailySold: 160,
    baseDailyWaste: 4.8,
    isAnomalyTarget: true,
  },
  {
    code: "SHM-CHKN",
    name: "Chicken",
    nameAr: "دجاج مشوي على الفحم",
    category: "Poultry",
    unit: "KG",
    salesUnitFactor: "0.5000",
    unitCost: "24.00",
    shortageCost: "36.00",
    baseDailySold: 95,
    baseDailyWaste: 3.1,
  },
  {
    code: "SHM-LAMB",
    name: "Lamb",
    nameAr: "لحم غنم حنيذ طازج",
    category: "Meat",
    unit: "KG",
    salesUnitFactor: "0.3500",
    unitCost: "68.00",
    shortageCost: "102.00",
    baseDailySold: 65,
    baseDailyWaste: 1.7,
  },
  {
    code: "SHM-BRED",
    name: "Bread",
    nameAr: "خبز تنور شامي",
    category: "Bakery",
    unit: "PIECE",
    salesUnitFactor: "1.0000",
    unitCost: "1.20",
    shortageCost: "1.80",
    baseDailySold: 280,
    baseDailyWaste: 18,
  },
  {
    code: "SHM-SALD",
    name: "Salad",
    nameAr: "سلطة فتوش وخضراء",
    category: "Salads",
    unit: "PORTION",
    salesUnitFactor: "1.0000",
    unitCost: "6.50",
    shortageCost: "9.75",
    baseDailySold: 110,
    baseDailyWaste: 6.5,
  },
  {
    code: "SHM-HUMS",
    name: "Hummus",
    nameAr: "حمص بيروتي",
    category: "Appetizers",
    unit: "KG",
    salesUnitFactor: "0.2000",
    unitCost: "18.00",
    shortageCost: "27.00",
    baseDailySold: 95,
    baseDailyWaste: 2.0,
  },
  {
    code: "SHM-FRIS",
    name: "Fries",
    nameAr: "بطاطس مقلية متبلة",
    category: "Sides",
    unit: "KG",
    salesUnitFactor: "0.2000",
    unitCost: "11.00",
    shortageCost: "16.50",
    baseDailySold: 130,
    baseDailyWaste: 2.6,
  },
  {
    code: "SHM-DSRT",
    name: "Dessert",
    nameAr: "كنافة نابلسية",
    category: "Desserts",
    unit: "PORTION",
    salesUnitFactor: "1.0000",
    unitCost: "9.50",
    shortageCost: "14.25",
    baseDailySold: 75,
    baseDailyWaste: 4.5,
  },
];

export const MAKKAH_MENU_ITEMS: SeedMenuItemSpec[] = [
  {
    code: "DWN-RICE",
    name: "Saleeg Rice",
    nameAr: "أرز سليق حجازي",
    category: "Grains",
    unit: "KG",
    salesUnitFactor: "0.3000",
    unitCost: "15.00",
    shortageCost: "22.50",
    baseDailySold: 140,
    baseDailyWaste: 3.5,
  },
  {
    code: "DWN-LAMB",
    name: "Makkah Mandi Lamb",
    nameAr: "لحم مندي مكي",
    category: "Meat",
    unit: "KG",
    salesUnitFactor: "0.3500",
    unitCost: "70.00",
    shortageCost: "105.00",
    baseDailySold: 80,
    baseDailyWaste: 1.9,
  },
  {
    code: "DWN-MTBQ",
    name: "Hijazi Mutabbaq",
    nameAr: "مطبق حجازي",
    category: "Appetizers",
    unit: "PORTION",
    salesUnitFactor: "1.0000",
    unitCost: "5.50",
    shortageCost: "8.25",
    baseDailySold: 150,
    baseDailyWaste: 7.0,
  },
  {
    code: "DWN-DSRT",
    name: "Maasoob Royal",
    nameAr: "معصوب ملكي",
    category: "Desserts",
    unit: "PORTION",
    salesUnitFactor: "1.0000",
    unitCost: "8.50",
    shortageCost: "12.75",
    baseDailySold: 90,
    baseDailyWaste: 4.2,
  },
];

export const GLOBAL_EVENT_CALENDAR = [
  {
    name: "Ramadan 1446",
    nameAr: "شهر رمضان ١٤٤٦",
    startDate: new Date("2025-03-01T00:00:00.000Z"),
    endDate: new Date("2025-03-29T00:00:00.000Z"),
    demandMultiplier: "1.000",
  },
  {
    name: "Eid Al-Fitr 1446",
    nameAr: "عيد الفطر ١٤٤٦",
    startDate: new Date("2025-03-30T00:00:00.000Z"),
    endDate: new Date("2025-04-02T00:00:00.000Z"),
    demandMultiplier: "1.000",
  },
  {
    name: "Hajj Season 1446 (1-13 Dhul Hijjah)",
    nameAr: "موسم الحج ١٤٤٦ (١-١٣ ذو الحجة)",
    startDate: new Date("2025-05-28T00:00:00.000Z"),
    endDate: new Date("2025-06-09T00:00:00.000Z"),
    demandMultiplier: "1.000",
  },
  {
    name: "Eid Al-Adha 1446",
    nameAr: "عيد الأضحى ١٤٤٦",
    startDate: new Date("2025-06-06T00:00:00.000Z"),
    endDate: new Date("2025-06-09T00:00:00.000Z"),
    demandMultiplier: "1.000",
  },
  {
    name: "Ramadan 1447",
    nameAr: "شهر رمضان ١٤٤٧",
    startDate: new Date("2026-02-18T00:00:00.000Z"),
    endDate: new Date("2026-03-19T00:00:00.000Z"),
    demandMultiplier: "1.000",
  },
  {
    name: "Eid Al-Fitr 1447",
    nameAr: "عيد الفطر ١٤٤٧",
    startDate: new Date("2026-03-20T00:00:00.000Z"),
    endDate: new Date("2026-03-23T00:00:00.000Z"),
    demandMultiplier: "1.000",
  },
  {
    name: "Hajj Season 1447 (1-13 Dhul Hijjah)",
    nameAr: "موسم الحج ١٤٤٧ (١-١٣ ذو الحجة)",
    startDate: new Date("2026-05-18T00:00:00.000Z"),
    endDate: new Date("2026-05-30T00:00:00.000Z"),
    demandMultiplier: "1.000",
  },
  {
    name: "Eid Al-Adha 1447",
    nameAr: "عيد الأضحى ١٤٤٧",
    startDate: new Date("2026-05-27T00:00:00.000Z"),
    endDate: new Date("2026-05-30T00:00:00.000Z"),
    demandMultiplier: "1.000",
  },
  {
    name: "Summer School Holiday 2026",
    nameAr: "الإجازة الصيفية للمدارس ٢٠٢٦",
    startDate: new Date("2026-06-25T00:00:00.000Z"),
    endDate: new Date("2026-08-23T00:00:00.000Z"),
    demandMultiplier: "1.000",
  },
  {
    name: "Autumn School Break 2026",
    nameAr: "إجازة الخريف المدرسية ٢٠٢٦",
    startDate: new Date("2026-10-15T00:00:00.000Z"),
    endDate: new Date("2026-10-24T00:00:00.000Z"),
    demandMultiplier: "1.000",
  },
];

export const WASTE_REASONS: WasteReason[] = [
  "OVER_PREPARATION",
  "EXPIRED",
  "DAMAGED_IN_PREP",
  "CUSTOMER_RETURN",
  "ORDER_ERROR",
  "OTHER",
];

export const SHIFTS: Shift[] = ["MORNING", "EVENING", "NIGHT"];
