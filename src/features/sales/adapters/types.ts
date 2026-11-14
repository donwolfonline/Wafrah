import type { SalesChannel } from "@prisma/client";

export interface DateRange {
  from: Date;
  to: Date;
}

export interface NormalizedAdapterSalesRecord {
  date: Date;
  itemCode?: string;
  itemName?: string;
  itemNameAr?: string;
  quantitySold: string;
  channel: SalesChannel;
}

export interface SalesSourceAdapter {
  readonly sourceName: string;
  fetchSales(dateRange: DateRange): Promise<NormalizedAdapterSalesRecord[]>;
}

export class FoodicsAdapter implements SalesSourceAdapter {
  public readonly sourceName = "FOODICS";

  public async fetchSales(
    _dateRange: DateRange,
  ): Promise<NormalizedAdapterSalesRecord[]> {
    void _dateRange;
    throw new Error("not implemented");
  }
}
