import { BenchmarkTrend } from '@ghostfolio/common/types/';

import { EnhancedSymbolProfile } from './enhanced-symbol-profile.interface';

export interface Benchmark {
  currency?: EnhancedSymbolProfile['currency'];
  dataSource: EnhancedSymbolProfile['dataSource'];
  marketCondition: 'ALL_TIME_HIGH' | 'BEAR_MARKET' | 'NEUTRAL_MARKET';
  marketPrice?: number;
  name: EnhancedSymbolProfile['name'];
  performances: {
    allTimeHigh: {
      date: Date;
      performancePercent: number;
    };
  };
  symbol: EnhancedSymbolProfile['symbol'];
  trend50d: BenchmarkTrend;
  trend200d: BenchmarkTrend;
}
