# Budokan Distribution Calculator

Prize distribution calculator for Budokan tournaments using Cubit fixed-point mathematics.

## Overview

This package provides accurate and gas-efficient distribution calculations for tournament prize pools. It supports multiple distribution types with configurable weights to create different prize curve shapes.

## Features

- **Linear Distribution**: Gradually decreasing prizes (`position^weight`)
- **Exponential Distribution**: Steeper decay for winner-focused tournaments
- **Uniform Distribution**: Equal prizes for all positions
- **Custom Distribution**: Define specific share amounts
- **Fractional Weights**: Fine-tune curve steepness (1.0, 1.5, 2.0, 2.5, etc.)
- **Dust Handling**: Ensures prizes sum to exactly 100% of available pool

## Implementation

Built on **Cubit** (32.32 fixed-point arithmetic) for:
- ✅ High accuracy (reference implementation)
- ✅ Gas efficiency (fastest in 87.5% of scenarios)
- ✅ Proven reliability (full test coverage)
- ✅ Fractional weight support

## Usage

```cairo
use budokan_distribution::calculator;
use budokan_distribution::models::Distribution;

// Linear distribution with weight 2.0
let dist = Distribution::Linear(20); // 20 = 2.0 (scaled by 10)

// Calculate share for position 1 out of 5, with 10000 basis points available
let share = calculator::calculate_share(dist, 1, 5, 10000);
// Returns basis points (10000 = 100%)
```

## Distribution Types

### Linear: `Distribution::Linear(weight)`
```
weight = 10 (1.0):  Gradual decrease
weight = 15 (1.5):  Moderate curve
weight = 20 (2.0):  Steep curve
weight = 30 (3.0):  Very steep
```

**Example** (5 positions, weight 2.0):
```
Position 1: 45.45%
Position 2: 29.09%
Position 3: 16.36%
Position 4:  7.27%
Position 5:  1.81%
```

### Exponential: `Distribution::Exponential(weight)`
More aggressive winner-take-all curves.

**Example** (5 positions, weight 2.0):
```
Position 1: 45.45%
Position 2: 29.09%
Position 3: 16.36%
Position 4:  7.27%
Position 5:  1.81%
```

### Uniform: `Distribution::Uniform`
Equal shares for all positions.

**Example** (5 positions):
```
Position 1: 20%
Position 2: 20%
Position 3: 20%
Position 4: 20%
Position 5: 20%
```

### Custom: `Distribution::Custom(shares)`
Define exact shares for each position.

```cairo
let shares = array![5000_u16, 3000, 1500, 500]; // Basis points
let dist = Distribution::Custom(shares);
```

## Gas Costs

Based on 5-position calculations:

| Distribution | Weight | Gas Cost | Notes |
|--------------|--------|----------|-------|
| Linear | 1.0 | ~590K | Very efficient |
| Linear | 1.5 | ~3.9M | Fractional weight |
| Linear | 2.0 | ~798K | Integer weight |
| Exponential | 1.0 | ~617K | Very efficient |
| Exponential | 1.5 | ~4.7M | Fractional weight |
| Exponential | 2.0 | ~823K | Integer weight |
| Uniform | N/A | ~14K | Fastest |
| Custom | N/A | ~22K | Fastest |

**Recommendation**: Use integer weights (1.0, 2.0, 3.0) for better gas efficiency when possible.

## Testing

Run all tests:
```bash
snforge test budokan_distribution
```

**Test coverage**: 45 tests covering:
- All distribution types
- Various weights (1.0, 1.5, 2.0, 2.5, 5.0, 10.0)
- Different position counts (3, 5, 10, 20)
- Edge cases (single position, zero available)
- Dust calculation and distribution
- Partial pool allocation

**Test results**: ✅ 45/45 passing

## Architecture

```
src/
├── calculator.cairo  - Main distribution calculation logic
├── models.cairo      - Distribution type definitions
└── lib.cairo         - Module exports

archive/              - Experimental implementations and analysis
└── README.md         - Documentation of explored alternatives
```

## Experimental Research

The `archive/` directory contains:
- Alternative implementations (decimal-based, bit-shift exponential)
- Comprehensive gas and accuracy analysis
- Improvement experiments and findings

**TL;DR**: Cubit is the fastest and most accurate approach. Alternatives were 1.08-7.18x slower.

## Dependencies

- `math` package: Cubit fixed-point math library
- `starknet`: Cairo core library

## License

BUSL-1.1

## Maintained By

Budokan tournament platform team
