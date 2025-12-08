# Distribution Calculator - Experimental Implementations Archive

This directory contains experimental implementations and analysis documents from exploring alternative approaches to distribution calculations.

## Archived Implementations

### calculator_decimal.cairo
**Decimal-based implementation with linear approximation**
- Uses separate int/frac parts scaled by 10^18
- Fractional exponents: `x^y ≈ 1 + y*(x-1)` (linear approximation)
- **Result**: 3-33% accuracy deviation, slower than Cubit in 7/8 test cases
- **Conclusion**: Type conversion overhead negates theoretical benefits

### calculator_decimal_improved.cairo
**Improved decimal with better fractional power approximations**
- Three methods: Second-order Taylor, Padé approximant, Hybrid (Newton's sqrt)
- **Best result**: Hybrid with Newton's sqrt achieves 0.00% error for x^0.5
- **Gas cost**: ~40% overhead vs linear decimal
- **Conclusion**: Better accuracy but still slower than Cubit overall

### calculator_bitshift_exp.cairo
**Optimized bit-shift exponential (64.64 fixed-point)**
- Bit manipulation with pre-computed constants for `e^x`
- **Gas cost**: ~1.4M per exp call
- **Accuracy**: <0.4% error, very accurate
- **Conclusion**: 2-3x slower than Cubit for typical distributions

## Archived Tests

### comparison_test.cairo
Side-by-side comparison of Cubit vs Decimal (linear) for all weights and distribution types.

### cubit_showcase.cairo
Comprehensive output showcase for Cubit implementation across various weights (1.0-5.0).

### hybrid_comparison_test.cairo
Gas measurement tests for all combinations of weights, distribution types, and implementations.

## Analysis Documents

### ANALYSIS.md
**Comprehensive accuracy analysis** comparing Cubit (reference) vs Decimal implementations:
- Detailed tables showing position-by-position accuracy deviations
- Linear distribution: 3-21% max error for fractional weights
- Exponential distribution: Up to 33% max error for fractional weights
- Integer weights: <1% deviation (nearly identical)

### IMPROVEMENTS.md
**Three improvement options** for decimal pow implementation:
1. Second-order Taylor expansion (+10-15% gas, ~24% error)
2. Padé approximant (+20-30% gas, ~13% error)
3. Hybrid approach (+40% gas, 0% error for common cases)

**Key finding**: Hybrid with Newton's sqrt gives perfect accuracy for x^0.5 (used in weights 1.5, 2.5).

### GAS_COMPARISON.md
**Surprising gas measurement findings**:
- Cubit is FASTER in 7/8 test scenarios
- Integer weights: Cubit 1.74-7.18x faster
- Fractional weights: Only weight 1.5 Linear was marginally faster with Decimal (1.03x)
- **Conclusion**: Decimal's type conversion overhead negates approximation benefits

**Gas breakdown**:
```
Linear 1.0:  Cubit 590K  vs  Decimal 1,029K  →  Cubit 1.74x faster
Linear 2.0:  Cubit 798K  vs  Decimal 4,569K  →  Cubit 5.72x faster!
Exp 1.0:     Cubit 617K  vs  Decimal 2,376K  →  Cubit 3.85x faster
Exp 2.0:     Cubit 823K  vs  Decimal 5,916K  →  Cubit 7.18x faster!
```

### EXPONENTIAL_METHODS_COMPARISON.md
**Complete comparison of all methods** including bit-shift exponential:

| Method | Gas (e^1) | Accuracy | Notes |
|--------|-----------|----------|-------|
| Cubit | ~500-800K | Perfect | Production choice |
| Decimal Linear | ~300-400K | 3-33% error | Slower overall due to overhead |
| Decimal Hybrid | ~600-800K | 0% for x^0.5 | Complex, still slower than Cubit |
| Bit-Shift | ~1.4M | <0.4% error | Constant-time but expensive |

**Key insight**: Bit-shift exp would only make sense for pure exponential curves `e^(weight*position)` instead of power curves `position^weight`, but still 2-3x more gas than Cubit.

## Final Recommendation

**Use Cubit (production implementation)** for all distribution calculations:

✅ **Fastest**: 1.08-7.18x faster than alternatives in most cases
✅ **Most accurate**: Reference implementation with 0% error
✅ **Proven**: Full test coverage, battle-tested
✅ **Flexible**: Supports linear, exponential, and custom distributions
✅ **Simple**: Single type system (32.32 fixed-point)

## Experimental Learnings

1. **Simple approximations don't help**: Linear approximation for x^y has too much error
2. **Type overhead matters**: Converting between u16/Decimal/u32 costs more than accurate math
3. **Cubit is well-optimized**: Binary exponentiation for integer powers is very efficient
4. **Bit-shift is elegant but impractical**: Constant-time exp is neat but too expensive
5. **Newton's method works**: Perfect sqrt accuracy, but doesn't justify the complexity

## Future Optimization Ideas

Instead of changing calculation methods, consider:
- Pre-compute distributions for common weight/position combinations
- Cache results on-chain for frequently-used tournament sizes
- Use lookup tables for standard distributions (5, 10, 20 positions)
- Approximate fractional weights to nearest integer if acceptable

These would likely save more gas than any implementation change.

## Archive Date

December 5, 2025

## Maintained By

Budokan distribution calculator team
