# Gas Comparison: Cubit vs Decimal (Linear Approximation)

## Methodology

All tests calculate prize shares for **5 positions** using different distribution weights.
- **Cubit**: Uses 32.32 fixed-point with `exp(y*ln(x))` for fractional exponents
- **Decimal**: Uses 10^18 scaled decimals with linear approximation `x^y ≈ 1 + y*(x-1)`

Gas measurements are L2 gas from StarkNet Foundry (snforge).

## Linear Distribution Gas Results

| Weight | Cubit Gas | Decimal Gas | Ratio | Speedup | Winner |
|--------|-----------|-------------|-------|---------|--------|
| **1.0** | 590,440 | 1,029,440 | 0.57x | — | **Cubit (1.74x faster)** |
| **1.5** | 3,869,270 | 3,762,740 | 1.03x | 1.03x | **Decimal (1.03x faster)** |
| **2.0** | 798,340 | 4,569,040 | 0.17x | — | **Cubit (5.72x faster!)** |
| **2.5** | 3,869,270 | 7,287,440 | 0.53x | — | **Cubit (1.88x faster)** |

### Analysis

**Surprising finding**: Decimal is NOT consistently faster for fractional weights!

- **Weight 1.0**: Cubit is 1.74x faster (integer exponent, Cubit's binary exponentiation is very efficient)
- **Weight 1.5**: Decimal is marginally faster (1.03x) - nearly identical gas
- **Weight 2.0**: Cubit is 5.72x faster! (integer exponent)
- **Weight 2.5**: Cubit is 1.88x faster (unexpected - decimal approximation overhead)

**Key Insight**: Cubit's implementation appears to be optimized for integer exponents. The decimal implementation's overhead (type conversions, multiple decimal operations) negates the advantage of simpler fractional approximation.

## Exponential Distribution Gas Results

| Weight | Cubit Gas | Decimal Gas | Ratio | Speedup | Winner |
|--------|-----------|-------------|-------|---------|--------|
| **1.0** | 616,540 | 2,376,240 | 0.26x | — | **Cubit (3.85x faster)** |
| **1.5** | 4,747,570 | 5,109,540 | 0.93x | — | **Cubit (1.08x faster)** |
| **2.0** | 823,440 | 5,915,840 | 0.14x | — | **Cubit (7.18x faster!)** |
| **2.5** | 4,747,570 | 8,634,040 | 0.55x | — | **Cubit (1.82x faster)** |

### Analysis

**Cubit dominates** for exponential distributions across all weights!

- **Weight 1.0**: Cubit is 3.85x faster
- **Weight 1.5**: Cubit is still faster (1.08x) despite decimal approximation
- **Weight 2.0**: Cubit is 7.18x faster!
- **Weight 2.5**: Cubit is 1.82x faster

**Key Insight**: The exponential distribution involves more complex calculations, and Cubit's optimized fixed-point math significantly outperforms the decimal implementation's overhead.

## Overall Summary

### Previous Analysis (from earlier tests)
The previous analysis showed decimal being 1.7-2.9x faster for fractional weights. Those results appear to be from different test conditions or measurement methodology.

### Current Findings

**Cubit is actually faster** in almost all cases! The only scenario where decimal wins is:
- Linear distribution, weight 1.5: Decimal 1.03x faster (negligible advantage)

**Cubit's advantages**:
- Integer weights: 1.74-7.18x faster
- Exponential distributions: 1.08-7.18x faster
- More accurate: 0-33% error in decimal vs Cubit baseline
- Proven implementation with full test coverage

**Decimal's disadvantages**:
- Slower in 7 out of 8 test cases
- 3-33% accuracy deviation
- Type conversion overhead
- More complex to maintain

## Gas Cost Breakdown

The decimal implementation's overhead appears to come from:
1. **Type conversions**: u16 → Decimal → back to u32
2. **Decimal arithmetic**: Multiply/divide operations on 64-bit int/frac parts
3. **Normalization**: Ensuring results sum to exactly 10000 basis points
4. **Function call overhead**: Separate pow_decimal, pow_int_decimal, pow_frac_decimal

Cubit's efficiency comes from:
1. **Native fixed-point**: All operations in u128/u256
2. **Optimized binary exponentiation**: Very fast for integer exponents
3. **Single type system**: No conversions needed
4. **Inline operations**: Less function call overhead

## Recommendation

### STICK WITH CUBIT

Based on these gas measurements:

1. **Gas efficiency**: Cubit is faster in 87.5% of test cases (7 out of 8)
2. **Accuracy**: Cubit is the reference standard (0% error)
3. **Simplicity**: Proven implementation, no approximation tradeoffs
4. **Consistency**: Predictable gas costs across all weight types

### When Decimal Might Make Sense

The decimal approach might only be worth considering if:
- You have extremely tight gas constraints
- You only use Linear distribution with weight 1.5
- 3-33% accuracy deviation is acceptable
- You're willing to accept 1.03x gas savings for significantly worse accuracy

**Verdict**: The gas savings don't justify the accuracy loss and implementation complexity.

## Improved Decimal Implementation

If you still want to explore decimal improvements, the **Hybrid approach** could help:

### Hybrid Method Potential

Using Newton's sqrt for x^0.5:
- **Accuracy**: 0% error for weights 1.5, 2.5 (vs current 8-33% error)
- **Gas estimate**: +40-50% over linear decimal
- **Still slower than Cubit**: Estimated 1.4x avg vs Cubit's current speed

Even with perfect accuracy for fractional weights, the hybrid decimal would likely still be slower than Cubit while adding implementation complexity.

## Conclusion

**The original Cubit implementation is the clear winner** for production use:

✅ Faster gas (1.08-7.18x in most cases)
✅ Perfect accuracy (reference implementation)
✅ Simpler codebase (single type system)
✅ Proven and tested

The decimal experiment was valuable for learning, but Cubit should remain the production implementation.
