# ADR 0001 — ETF 目标配置与 3:2:1 资本切分

- 状态：已采纳
- 相关：[capital-pool](../notes/capital-pool.md)、[rebalancing](../notes/rebalancing.md)
- 原文来自 `docs/03-architecture/decisions/stock-increase-decision.md`

## 最终建议的ETF分配占比

```text
XUS   30%
XQQ   30%
XIC   15%
XEF   15%
BTCC  ~8%（随市值浮动）
```

资本配置：
按3:2:1  
3 = 在1-2年内没有必须动用的可能的资金，用于投资股市的总股本a   
2 = 从a中取2份用于当前投资  
1 = 本金储备，应急和应对股票暴跌  
