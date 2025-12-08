// SPDX-License-Identifier: MIT
// Comparison test: Cubit vs Decimal (linear) vs Decimal (hybrid)

use budokan_distribution::models::Distribution;
use budokan_distribution::{calculator, calculator_decimal, calculator_decimal_improved};

const BASIS_POINTS_U32: u32 = 10000;
const BASIS_POINTS_U16: u16 = 10000;

// Helper to convert weight to decimal
fn weight_to_decimal(weight: u16) -> calculator_decimal::Decimal {
    let decimal_weight = weight.into() / 10; // Convert 10 -> 1, 15 -> 1.5, etc
    let frac_part = (weight.into() % 10) * 100000000000000000; // Scale fractional part
    calculator_decimal::DecimalTrait::from_raw_parts(decimal_weight, frac_part)
}

#[test]
fn test_linear_weight_10_gas() {
    let positions = 5_u32;
    let weight = 10_u16;
    let dist = Distribution::Linear(weight);

    // Cubit
    let _c1 = calculator::calculate_share(dist, 1, positions, BASIS_POINTS_U16);
    let _c2 = calculator::calculate_share(dist, 2, positions, BASIS_POINTS_U16);
    let _c3 = calculator::calculate_share(dist, 3, positions, BASIS_POINTS_U16);
    let _c4 = calculator::calculate_share(dist, 4, positions, BASIS_POINTS_U16);
    let _c5 = calculator::calculate_share(dist, 5, positions, BASIS_POINTS_U16);
}

#[test]
fn test_linear_weight_10_gas_decimal() {
    let positions = 5_u32;
    let weight = 10_u16;
    let dist = Distribution::Linear(weight);

    // Decimal (linear)
    let _d1 = calculator_decimal::calculate_share(dist, 1, positions, BASIS_POINTS_U32);
    let _d2 = calculator_decimal::calculate_share(dist, 2, positions, BASIS_POINTS_U32);
    let _d3 = calculator_decimal::calculate_share(dist, 3, positions, BASIS_POINTS_U32);
    let _d4 = calculator_decimal::calculate_share(dist, 4, positions, BASIS_POINTS_U32);
    let _d5 = calculator_decimal::calculate_share(dist, 5, positions, BASIS_POINTS_U32);
}

#[test]
fn test_linear_weight_15_gas() {
    let positions = 5_u32;
    let weight = 15_u16;
    let dist = Distribution::Linear(weight);

    let _c1 = calculator::calculate_share(dist, 1, positions, BASIS_POINTS_U16);
    let _c2 = calculator::calculate_share(dist, 2, positions, BASIS_POINTS_U16);
    let _c3 = calculator::calculate_share(dist, 3, positions, BASIS_POINTS_U16);
    let _c4 = calculator::calculate_share(dist, 4, positions, BASIS_POINTS_U16);
    let _c5 = calculator::calculate_share(dist, 5, positions, BASIS_POINTS_U16);
}

#[test]
fn test_linear_weight_15_gas_decimal() {
    let positions = 5_u32;
    let weight = 15_u16;
    let dist = Distribution::Linear(weight);

    let _d1 = calculator_decimal::calculate_share(dist, 1, positions, BASIS_POINTS_U32);
    let _d2 = calculator_decimal::calculate_share(dist, 2, positions, BASIS_POINTS_U32);
    let _d3 = calculator_decimal::calculate_share(dist, 3, positions, BASIS_POINTS_U32);
    let _d4 = calculator_decimal::calculate_share(dist, 4, positions, BASIS_POINTS_U32);
    let _d5 = calculator_decimal::calculate_share(dist, 5, positions, BASIS_POINTS_U32);
}

#[test]
fn test_linear_weight_20_gas() {
    let positions = 5_u32;
    let weight = 20_u16;
    let dist = Distribution::Linear(weight);

    let _c1 = calculator::calculate_share(dist, 1, positions, BASIS_POINTS_U16);
    let _c2 = calculator::calculate_share(dist, 2, positions, BASIS_POINTS_U16);
    let _c3 = calculator::calculate_share(dist, 3, positions, BASIS_POINTS_U16);
    let _c4 = calculator::calculate_share(dist, 4, positions, BASIS_POINTS_U16);
    let _c5 = calculator::calculate_share(dist, 5, positions, BASIS_POINTS_U16);
}

#[test]
fn test_linear_weight_20_gas_decimal() {
    let positions = 5_u32;
    let weight = 20_u16;
    let dist = Distribution::Linear(weight);

    let _d1 = calculator_decimal::calculate_share(dist, 1, positions, BASIS_POINTS_U32);
    let _d2 = calculator_decimal::calculate_share(dist, 2, positions, BASIS_POINTS_U32);
    let _d3 = calculator_decimal::calculate_share(dist, 3, positions, BASIS_POINTS_U32);
    let _d4 = calculator_decimal::calculate_share(dist, 4, positions, BASIS_POINTS_U32);
    let _d5 = calculator_decimal::calculate_share(dist, 5, positions, BASIS_POINTS_U32);
}

#[test]
fn test_linear_weight_25_gas() {
    let positions = 5_u32;
    let weight = 25_u16;
    let dist = Distribution::Linear(weight);

    let _c1 = calculator::calculate_share(dist, 1, positions, BASIS_POINTS_U16);
    let _c2 = calculator::calculate_share(dist, 2, positions, BASIS_POINTS_U16);
    let _c3 = calculator::calculate_share(dist, 3, positions, BASIS_POINTS_U16);
    let _c4 = calculator::calculate_share(dist, 4, positions, BASIS_POINTS_U16);
    let _c5 = calculator::calculate_share(dist, 5, positions, BASIS_POINTS_U16);
}

#[test]
fn test_linear_weight_25_gas_decimal() {
    let positions = 5_u32;
    let weight = 25_u16;
    let dist = Distribution::Linear(weight);

    let _d1 = calculator_decimal::calculate_share(dist, 1, positions, BASIS_POINTS_U32);
    let _d2 = calculator_decimal::calculate_share(dist, 2, positions, BASIS_POINTS_U32);
    let _d3 = calculator_decimal::calculate_share(dist, 3, positions, BASIS_POINTS_U32);
    let _d4 = calculator_decimal::calculate_share(dist, 4, positions, BASIS_POINTS_U32);
    let _d5 = calculator_decimal::calculate_share(dist, 5, positions, BASIS_POINTS_U32);
}

#[test]
fn test_exponential_weight_10_gas() {
    let positions = 5_u32;
    let weight = 10_u16;
    let dist = Distribution::Exponential(weight);

    let _c1 = calculator::calculate_share(dist, 1, positions, BASIS_POINTS_U16);
    let _c2 = calculator::calculate_share(dist, 2, positions, BASIS_POINTS_U16);
    let _c3 = calculator::calculate_share(dist, 3, positions, BASIS_POINTS_U16);
    let _c4 = calculator::calculate_share(dist, 4, positions, BASIS_POINTS_U16);
    let _c5 = calculator::calculate_share(dist, 5, positions, BASIS_POINTS_U16);
}

#[test]
fn test_exponential_weight_10_gas_decimal() {
    let positions = 5_u32;
    let weight = 10_u16;
    let dist = Distribution::Exponential(weight);

    let _d1 = calculator_decimal::calculate_share(dist, 1, positions, BASIS_POINTS_U32);
    let _d2 = calculator_decimal::calculate_share(dist, 2, positions, BASIS_POINTS_U32);
    let _d3 = calculator_decimal::calculate_share(dist, 3, positions, BASIS_POINTS_U32);
    let _d4 = calculator_decimal::calculate_share(dist, 4, positions, BASIS_POINTS_U32);
    let _d5 = calculator_decimal::calculate_share(dist, 5, positions, BASIS_POINTS_U32);
}

#[test]
fn test_exponential_weight_15_gas() {
    let positions = 5_u32;
    let weight = 15_u16;
    let dist = Distribution::Exponential(weight);

    let _c1 = calculator::calculate_share(dist, 1, positions, BASIS_POINTS_U16);
    let _c2 = calculator::calculate_share(dist, 2, positions, BASIS_POINTS_U16);
    let _c3 = calculator::calculate_share(dist, 3, positions, BASIS_POINTS_U16);
    let _c4 = calculator::calculate_share(dist, 4, positions, BASIS_POINTS_U16);
    let _c5 = calculator::calculate_share(dist, 5, positions, BASIS_POINTS_U16);
}

#[test]
fn test_exponential_weight_15_gas_decimal() {
    let positions = 5_u32;
    let weight = 15_u16;
    let dist = Distribution::Exponential(weight);

    let _d1 = calculator_decimal::calculate_share(dist, 1, positions, BASIS_POINTS_U32);
    let _d2 = calculator_decimal::calculate_share(dist, 2, positions, BASIS_POINTS_U32);
    let _d3 = calculator_decimal::calculate_share(dist, 3, positions, BASIS_POINTS_U32);
    let _d4 = calculator_decimal::calculate_share(dist, 4, positions, BASIS_POINTS_U32);
    let _d5 = calculator_decimal::calculate_share(dist, 5, positions, BASIS_POINTS_U32);
}

#[test]
fn test_exponential_weight_20_gas() {
    let positions = 5_u32;
    let weight = 20_u16;
    let dist = Distribution::Exponential(weight);

    let _c1 = calculator::calculate_share(dist, 1, positions, BASIS_POINTS_U16);
    let _c2 = calculator::calculate_share(dist, 2, positions, BASIS_POINTS_U16);
    let _c3 = calculator::calculate_share(dist, 3, positions, BASIS_POINTS_U16);
    let _c4 = calculator::calculate_share(dist, 4, positions, BASIS_POINTS_U16);
    let _c5 = calculator::calculate_share(dist, 5, positions, BASIS_POINTS_U16);
}

#[test]
fn test_exponential_weight_20_gas_decimal() {
    let positions = 5_u32;
    let weight = 20_u16;
    let dist = Distribution::Exponential(weight);

    let _d1 = calculator_decimal::calculate_share(dist, 1, positions, BASIS_POINTS_U32);
    let _d2 = calculator_decimal::calculate_share(dist, 2, positions, BASIS_POINTS_U32);
    let _d3 = calculator_decimal::calculate_share(dist, 3, positions, BASIS_POINTS_U32);
    let _d4 = calculator_decimal::calculate_share(dist, 4, positions, BASIS_POINTS_U32);
    let _d5 = calculator_decimal::calculate_share(dist, 5, positions, BASIS_POINTS_U32);
}

#[test]
fn test_exponential_weight_25_gas() {
    let positions = 5_u32;
    let weight = 25_u16;
    let dist = Distribution::Exponential(weight);

    let _c1 = calculator::calculate_share(dist, 1, positions, BASIS_POINTS_U16);
    let _c2 = calculator::calculate_share(dist, 2, positions, BASIS_POINTS_U16);
    let _c3 = calculator::calculate_share(dist, 3, positions, BASIS_POINTS_U16);
    let _c4 = calculator::calculate_share(dist, 4, positions, BASIS_POINTS_U16);
    let _c5 = calculator::calculate_share(dist, 5, positions, BASIS_POINTS_U16);
}

#[test]
fn test_exponential_weight_25_gas_decimal() {
    let positions = 5_u32;
    let weight = 25_u16;
    let dist = Distribution::Exponential(weight);

    let _d1 = calculator_decimal::calculate_share(dist, 1, positions, BASIS_POINTS_U32);
    let _d2 = calculator_decimal::calculate_share(dist, 2, positions, BASIS_POINTS_U32);
    let _d3 = calculator_decimal::calculate_share(dist, 3, positions, BASIS_POINTS_U32);
    let _d4 = calculator_decimal::calculate_share(dist, 4, positions, BASIS_POINTS_U32);
    let _d5 = calculator_decimal::calculate_share(dist, 5, positions, BASIS_POINTS_U32);
}

#[test]
fn test_full_comparison_output() {
    println!("\n=== FULL 3-WAY COMPARISON: Cubit vs Decimal Linear vs Decimal Hybrid ===\n");

    let positions = 5_u32;
    let weights = array![10_u16, 15, 20, 25];

    println!("LINEAR DISTRIBUTION (5 positions):");
    println!("-----------------------------------\n");

    let mut i = 0;
    loop {
        if i >= weights.len() {
            break;
        }
        let weight = *weights.at(i);
        let dist = Distribution::Linear(weight);

        // Cubit
        let c1 = calculator::calculate_share(dist, 1, positions, BASIS_POINTS_U16);
        let c2 = calculator::calculate_share(dist, 2, positions, BASIS_POINTS_U16);
        let c3 = calculator::calculate_share(dist, 3, positions, BASIS_POINTS_U16);
        let c4 = calculator::calculate_share(dist, 4, positions, BASIS_POINTS_U16);
        let c5 = calculator::calculate_share(dist, 5, positions, BASIS_POINTS_U16);
        let cubit_total = c1 + c2 + c3 + c4 + c5;

        // Decimal (original linear)
        let d1 = calculator_decimal::calculate_share(dist, 1, positions, BASIS_POINTS_U32);
        let d2 = calculator_decimal::calculate_share(dist, 2, positions, BASIS_POINTS_U32);
        let d3 = calculator_decimal::calculate_share(dist, 3, positions, BASIS_POINTS_U32);
        let d4 = calculator_decimal::calculate_share(dist, 4, positions, BASIS_POINTS_U32);
        let d5 = calculator_decimal::calculate_share(dist, 5, positions, BASIS_POINTS_U32);
        let decimal_total = d1 + d2 + d3 + d4 + d5;

        let weight_display: ByteArray = if weight == 10 {
            "1.0"
        } else if weight == 15 {
            "1.5"
        } else if weight == 20 {
            "2.0"
        } else {
            "2.5"
        };

        println!("Weight {}:", weight_display);
        println!(
            "  Cubit:  P1={} P2={} P3={} P4={} P5={} (total={})", c1, c2, c3, c4, c5, cubit_total,
        );
        println!(
            "  Linear: P1={} P2={} P3={} P4={} P5={} (total={})", d1, d2, d3, d4, d5, decimal_total,
        );
        println!("");

        i += 1;
    }

    println!("\nEXPONENTIAL DISTRIBUTION (5 positions):");
    println!("----------------------------------------\n");

    i = 0;
    loop {
        if i >= weights.len() {
            break;
        }
        let weight = *weights.at(i);
        let dist = Distribution::Exponential(weight);

        // Cubit
        let c1 = calculator::calculate_share(dist, 1, positions, BASIS_POINTS_U16);
        let c2 = calculator::calculate_share(dist, 2, positions, BASIS_POINTS_U16);
        let c3 = calculator::calculate_share(dist, 3, positions, BASIS_POINTS_U16);
        let c4 = calculator::calculate_share(dist, 4, positions, BASIS_POINTS_U16);
        let c5 = calculator::calculate_share(dist, 5, positions, BASIS_POINTS_U16);
        let cubit_total = c1 + c2 + c3 + c4 + c5;

        // Decimal (original linear)
        let d1 = calculator_decimal::calculate_share(dist, 1, positions, BASIS_POINTS_U32);
        let d2 = calculator_decimal::calculate_share(dist, 2, positions, BASIS_POINTS_U32);
        let d3 = calculator_decimal::calculate_share(dist, 3, positions, BASIS_POINTS_U32);
        let d4 = calculator_decimal::calculate_share(dist, 4, positions, BASIS_POINTS_U32);
        let d5 = calculator_decimal::calculate_share(dist, 5, positions, BASIS_POINTS_U32);
        let decimal_total = d1 + d2 + d3 + d4 + d5;

        let weight_display: ByteArray = if weight == 10 {
            "1.0"
        } else if weight == 15 {
            "1.5"
        } else if weight == 20 {
            "2.0"
        } else {
            "2.5"
        };

        println!("Weight {}:", weight_display);
        println!(
            "  Cubit:  P1={} P2={} P3={} P4={} P5={} (total={})", c1, c2, c3, c4, c5, cubit_total,
        );
        println!(
            "  Linear: P1={} P2={} P3={} P4={} P5={} (total={})", d1, d2, d3, d4, d5, decimal_total,
        );
        println!("");

        i += 1;
    }

    println!("=== END COMPARISON ===\n");
}
