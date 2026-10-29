export const REVENUE_DATA_SOURCE = Symbol('REVENUE_DATA_SOURCE');

export interface MonthlyRevenue {
  month: string;
  revenue: number;
  confirmedPayments: number;
}

export interface RevenueSummary {
  configured: boolean;
  totalRevenue: number;
  confirmedPayments: number;
  pendingPayments: number;
  monthlyRevenue: MonthlyRevenue[];
}

export interface RevenueDataSource {
  getSummary(): Promise<RevenueSummary>;
}
