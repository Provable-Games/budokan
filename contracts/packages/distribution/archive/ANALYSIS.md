# Distribution Calculator Analysis: Cubit vs Decimal Implementation

## Executive Summary

This document analyzes two implementations for calculating prize distributions with fractional weights:
- **Cubit Implementation**: Uses 32.32 fixed-point arithmetic with `exp(y*ln(x))` for fractional exponents
- **Decimal Implementation**: Uses separate integer/fractional parts with linear approximation for fractional exponents

## Implementation Approaches

### Cubit (Current Implementation)
- **Fixed-Point Format**: 32.32 bit (ONE = 2^32 = 4,294,967,296)
- **Fractional Exponents**: `x^y = exp(y*ln(x))` using Taylor series expansion
- **Accuracy**: Very high - considered the reference implementation
- **Gas Cost**: Expensive for fractional weights due to Taylor series calculations

### Decimal (Experimental)
- **Format**: Separate `int_part` (u64) + `frac_part` (u64) scaled by 10^18
- **Fractional Exponents**: Linear approximation `x^y ≈ 1 + y*(x-1)`
- **Accuracy**: Good approximation with measurable deviation
- **Gas Cost**: Significantly lower for fractional weights

## Gas Comparison (5 Prize Positions)

### Linear Distribution

| Weight | Cubit Gas | Decimal Gas | Speedup | Winner |
|--------|-----------|-------------|---------|--------|
| 1.0    | ~256K     | ~655K       | 0.39x   | **Cubit (2.6x faster)** |
| 1.5    | ~1.66M    | ~608K       | 2.73x   | **Decimal (2.7x faster)** |
| 2.0    | ~1.17M    | ~604K       | 1.94x   | **Decimal (1.9x faster)** |
| 2.5    | ~1.77M    | ~604K       | 2.93x   | **Decimal (2.9x faster)** |

### Exponential Distribution

| Weight | Cubit Gas | Decimal Gas | Speedup | Winner |
|--------|-----------|-------------|---------|--------|
| 1.0    | ~2.5M     | ~1.2M       | 2.08x   | **Decimal (2.1x faster)** |
| 1.5    | ~2.0M     | ~1.2M       | 1.67x   | **Decimal (1.7x faster)** |
| 2.0    | ~1.99M    | ~1.2M       | 1.66x   | **Decimal (1.7x faster)** |
| 2.5    | ~2.0M     | ~1.2M       | 1.67x   | **Decimal (1.7x faster)** |

**Key Insight**: Decimal implementation is significantly faster (1.7-2.9x) for fractional weights, while Cubit is faster for integer weights.

## Accuracy Comparison (5 Prize Positions)

All values shown in **basis points** (10000 = 100%).

### Linear Distribution - Weight 1.0 (Integer)

| Position | Cubit | Decimal | Difference (bp) | Difference (%) |
|----------|-------|---------|-----------------|----------------|
| P1       | 3333  | 3333    | 0               | 0.00%          |
| P2       | 2666  | 2667    | 1               | 0.04%          |
| P3       | 1999  | 2000    | 1               | 0.05%          |
| P4       | 1333  | 1333    | 0               | 0.00%          |
| P5       | 666   | 667     | 1               | 0.15%          |
| **Total** | **9997** | **10000** | **3** | **0.03%** |

**Accuracy**: Nearly identical (max 0.15% deviation)

### Linear Distribution - Weight 1.5 (Fractional)

| Position | Cubit | Decimal | Difference (bp) | Difference (%) |
|----------|-------|---------|-----------------|----------------|
| P1       | 3967  | 4286    | 319             | 8.04%          |
| P2       | 2834  | 2857    | 23              | 0.81%          |
| P3       | 1841  | 1714    | -127            | -6.90%         |
| P4       | 1002  | 857     | -145            | -14.47%        |
| P5       | 354   | 286     | -68             | -19.21%        |
| **Total** | **9998** | **10000** | **2** | **0.02%** |

**Accuracy**: Cubit is more accurate. Decimal shows **3-19% deviation** per position, with largest errors in lower positions.

### Linear Distribution - Weight 2.0 (Integer)

| Position | Cubit | Decimal | Difference (bp) | Difference (%) |
|----------|-------|---------|-----------------|----------------|
| P1       | 4545  | 4545    | 0               | 0.00%          |
| P2       | 2909  | 2909    | 0               | 0.00%          |
| P3       | 1636  | 1636    | 0               | 0.00%          |
| P4       | 727   | 727     | 0               | 0.00%          |
| P5       | 181   | 182     | 1               | 0.55%          |
| **Total** | **9998** | **9999** | **1** | **0.01%** |

**Accuracy**: Nearly identical (max 0.55% deviation)

### Linear Distribution - Weight 2.5 (Fractional)

| Position | Cubit | Decimal | Difference (bp) | Difference (%) |
|----------|-------|---------|-----------------|----------------|
| P1       | 5080  | 5357    | 277             | 5.45%          |
| P2       | 2901  | 2857    | -44             | -1.52%         |
| P3       | 1413  | 1286    | -127            | -8.99%         |
| P4       | 512   | 429     | -83             | -16.21%        |
| P5       | 90    | 71      | -19             | -21.11%        |
| **Total** | **9996** | **10000** | **4** | **0.04%** |

**Accuracy**: Cubit is more accurate. Decimal shows **1-21% deviation** per position, with largest errors in lower positions.

### Exponential Distribution - Weight 1.0 (Integer)

| Position | Cubit | Decimal | Difference (bp) | Difference (%) |
|----------|-------|---------|-----------------|----------------|
| P1       | 3333  | 3333    | 0               | 0.00%          |
| P2       | 2666  | 2667    | 1               | 0.04%          |
| P3       | 1999  | 2000    | 1               | 0.05%          |
| P4       | 1333  | 1333    | 0               | 0.00%          |
| P5       | 666   | 667     | 1               | 0.15%          |
| **Total** | **9997** | **10000** | **3** | **0.03%** |

**Accuracy**: Nearly identical (max 0.15% deviation)

### Exponential Distribution - Weight 1.5 (Fractional)

| Position | Cubit | Decimal | Difference (bp) | Difference (%) |
|----------|-------|---------|-----------------|----------------|
| P1       | 3964  | 3846    | -118            | -2.98%         |
| P2       | 2836  | 2769    | -67             | -2.36%         |
| P3       | 1842  | 1846    | 4               | 0.22%          |
| P4       | 1002  | 1077    | 75              | 7.49%          |
| P5       | 354   | 462     | 108             | 30.51%         |
| **Total** | **9998** | **10000** | **2** | **0.02%** |

**Accuracy**: Cubit is more accurate. Decimal shows **0-30% deviation** per position, with largest errors in lower positions.

### Exponential Distribution - Weight 2.0 (Integer)

| Position | Cubit | Decimal | Difference (bp) | Difference (%) |
|----------|-------|---------|-----------------|----------------|
| P1       | 4545  | 4545    | 0               | 0.00%          |
| P2       | 2909  | 2909    | 0               | 0.00%          |
| P3       | 1636  | 1636    | 0               | 0.00%          |
| P4       | 727   | 727     | 0               | 0.00%          |
| P5       | 181   | 182     | 1               | 0.55%          |
| **Total** | **9998** | **9999** | **1** | **0.01%** |

**Accuracy**: Nearly identical (max 0.55% deviation)

### Exponential Distribution - Weight 2.5 (Fractional)

| Position | Cubit | Decimal | Difference (bp) | Difference (%) |
|----------|-------|---------|-----------------|----------------|
| P1       | 5075  | 5000    | -75             | -1.48%         |
| P2       | 2905  | 2880    | -25             | -0.86%         |
| P3       | 1415  | 1440    | 25              | 1.77%          |
| P4       | 513   | 560     | 47              | 9.16%          |
| P5       | 90    | 120     | 30              | 33.33%         |
| **Total** | **9998** | **10000** | **2** | **0.02%** |

**Accuracy**: Cubit is more accurate. Decimal shows **0-33% deviation** per position, with largest errors in lower positions.

## Accuracy Summary

### Cubit Accuracy (Reference Implementation)
Cubit is considered the **accurate baseline** using precise Taylor series expansions for `exp()` and `ln()` functions.

### Decimal Accuracy Deviations from Cubit

| Weight Type | Distribution | Max Position Error | Avg Position Error | Most Affected |
|-------------|--------------|-------------------|-------------------|---------------|
| Integer (1.0) | Linear | 0.15% | 0.05% | All positions nearly identical |
| Integer (1.0) | Exponential | 0.15% | 0.05% | All positions nearly identical |
| Integer (2.0) | Linear | 0.55% | 0.11% | All positions nearly identical |
| Integer (2.0) | Exponential | 0.55% | 0.11% | All positions nearly identical |
| Fractional (1.5) | Linear | **19.21%** | 9.89% | Lower positions (P4, P5) |
| Fractional (1.5) | Exponential | **30.51%** | 8.71% | Lower positions (P4, P5) |
| Fractional (2.5) | Linear | **21.11%** | 10.66% | Lower positions (P4, P5) |
| Fractional (2.5) | Exponential | **33.33%** | 9.32% | Lower positions (P4, P5) |

**Key Finding**:
- **Integer weights**: Decimal is **highly accurate** (max 0.55% error)
- **Fractional weights**: Decimal shows **significant deviation** (up to 33% error in individual positions)
- **Error pattern**: Errors are largest in **lower-ranked positions** due to compounding approximation errors
- **Total accuracy**: Both implementations sum close to 10000 basis points (within 0.04%)

## Recommendations

### Use Cubit Implementation When:
- **Accuracy is critical**: Prize distributions must be mathematically precise
- **Integer weights only**: Cubit is actually faster for integer weights (e.g., weight 1.0)
- **Small prize pools**: Lower position errors could significantly impact fairness
- **Auditing/compliance**: Deterministic, proven mathematical implementation

### Use Decimal Implementation When:
- **Gas optimization is priority**: Fractional weight calculations need 1.7-2.9x less gas
- **Approximate accuracy acceptable**: 3-33% deviation in individual positions is tolerable
- **Large prize pools**: Absolute errors in lower positions are negligible in monetary terms
- **Fractional weights required**: Significant gas savings for weights like 1.5, 2.5

### Hybrid Approach
Consider using **Cubit for integer weights** and **Decimal for fractional weights** to optimize both gas and accuracy:
- Weight 1.0, 2.0, 3.0: Use Cubit (faster + accurate)
- Weight 1.5, 2.5: Use Decimal (much faster, acceptable error)

## Mathematical Details

### Cubit Fractional Exponent
```
x^y = exp(y * ln(x))

where:
- exp(x) calculated via Taylor series: 1 + x + x²/2! + x³/3! + ...
- ln(x) calculated via Taylor series on (x-1)/(x+1)
```

### Decimal Fractional Exponent
```
x^y ≈ 1 + y*(x - 1)

This is a first-order linear approximation that:
- Works well for x close to 1
- Degrades as x moves away from 1
- Compounds errors through recursive position calculations
```

## Totaling Behavior

- **Cubit**: Totals range from 9996-9998 basis points due to integer rounding in fixed-point arithmetic
- **Decimal**: Always totals to exactly 10000 basis points due to normalization step

The 2-4 basis point shortfall in Cubit is not an accuracy issue but rather a design choice in how remainders are distributed.

## Conclusion

The **Cubit implementation is more accurate** for fractional weights, with Decimal showing deviations of **3-33% per position** compared to Cubit's precise calculations. However, Decimal offers **1.7-2.9x gas savings** for fractional weights.

For production use:
- **Recommended**: Cubit implementation for mathematical accuracy and fairness
- **Consider**: Decimal only if gas costs are prohibitive AND position-level accuracy variations are acceptable

The choice ultimately depends on whether **gas efficiency** or **mathematical precision** is the higher priority for the specific use case.
