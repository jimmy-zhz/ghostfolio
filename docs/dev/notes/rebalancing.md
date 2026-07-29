
## Rebalancing 工作原理
```text
输入：
  allocations[]  — 用户设置的目标权重（symbol, targetWeight%, rebalanceThreshold%）
  holdings{}     — 组合实际持仓值（symbol → valueInBaseCurrency）

核心计算（每个 symbol）：
  totalValue       = sum(所有持仓市值)
  currentWeight%   = holding.value / totalValue × 100
  deviation        = currentWeight% − targetWeight%       ← 正=超配，负=欠配
  adjustmentValue  = totalValue × (targetWeight% − currentWeight%) / 100
                     正=需买入，负=需卖出
  type             = |deviation| >= threshold ? BUY/SELL : OK
  amount           = |adjustmentValue|

输出：
  actions[]       — 每个 symbol 的操作建议
  hasTriggered    — 至少一个超过阈值时 = true
  totalValue      — 总持仓市值
```

## 测试数据与结果（25 tests, 7 cases）

|Case|场景|数据|结果|
|---|---|---|---|
|G1|无配置|allocations=[]|`{actions:[],hasTriggered:false}`|
|G2|无持仓|holdings={}|`{actions:[],hasTriggered:false,totalValue:0}`|
|1|完美平衡|$10k: XIC 40%/4000, XEF 30%/3000, VCN 30%/3000|全 OK，hasTriggered=false|
|2|超配+欠配|XIC→$4800(48%), XEF→$2800(28%), VCN→$2400(24%)|XIC SELL $800, XEF OK, VCN BUY $600|
|3|持仓中无此 symbol|XIC $10k / VCN $0（未持有）|XIC SELL $4k, VCN BUY $4k|
|4|阈值边界|deviation=5.0% (threshold=5%) → 触发；deviation=4.9% → 不触发||
|5|每 symbol 不同阈值|QQQ threshold=10%偏10%→SELL；SPY threshold=20%偏10%→OK||
|6|reason 字符串|超配含"overweight"，欠配含"underweight"||
|7|真实加拿大三基金组合 $27k|XIC $12k(44.4%), XEF $8100(30%), XBB $6900(25.6%)|XEF BUY $1350（恰好达5%阈值），其余 OK|
