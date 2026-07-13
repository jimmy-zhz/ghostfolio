export interface LineChartItem<T = number> {
  date: string;
  quantity?: number;
  value: T;
}

export type NullableLineChartItem = LineChartItem<number | null>;
