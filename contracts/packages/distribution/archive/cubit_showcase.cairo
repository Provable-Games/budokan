// SPDX-License-Identifier: MIT
// Cubit implementation showcase with same weights as decimal

use budokan_distribution::calculator;
use budokan_distribution::models::Distribution;

const BASIS_POINTS: u16 = 10000;

#[test]
fn test_cubit_distribution_showcase() {
    println!("\n=== CUBIT DISTRIBUTION SHOWCASE ===\n");

    // Test with 5 positions for better visualization
    let positions = 5_u32;

    // Linear distributions with various weights
    println!("LINEAR DISTRIBUTION (5 positions, 10000 basis points):");
    println!("--------------------------------------------------------");

    let weights = array![10_u16, 15, 20, 25, 30, 50]; // 1.0, 1.5, 2.0, 2.5, 3.0, 5.0
    let mut i = 0;
    loop {
        if i >= weights.len() {
            break;
        }
        let weight = *weights.at(i);
        let dist = Distribution::Linear(weight);

        let s1 = calculator::calculate_share(dist, 1, positions, BASIS_POINTS);
        let s2 = calculator::calculate_share(dist, 2, positions, BASIS_POINTS);
        let s3 = calculator::calculate_share(dist, 3, positions, BASIS_POINTS);
        let s4 = calculator::calculate_share(dist, 4, positions, BASIS_POINTS);
        let s5 = calculator::calculate_share(dist, 5, positions, BASIS_POINTS);
        let total = s1 + s2 + s3 + s4 + s5;

        let weight_display: ByteArray = if weight == 10 {
            "1.0"
        } else if weight == 15 {
            "1.5"
        } else if weight == 20 {
            "2.0"
        } else if weight == 25 {
            "2.5"
        } else if weight == 30 {
            "3.0"
        } else {
            "5.0"
        };

        println!(
            "Weight {}: P1={} P2={} P3={} P4={} P5={} (total={})",
            weight_display,
            s1,
            s2,
            s3,
            s4,
            s5,
            total,
        );

        i += 1;
    }

    println!("\nEXPONENTIAL DISTRIBUTION (5 positions, 10000 basis points):");
    println!("-----------------------------------------------------------");

    i = 0;
    loop {
        if i >= weights.len() {
            break;
        }
        let weight = *weights.at(i);
        let dist = Distribution::Exponential(weight);

        let s1 = calculator::calculate_share(dist, 1, positions, BASIS_POINTS);
        let s2 = calculator::calculate_share(dist, 2, positions, BASIS_POINTS);
        let s3 = calculator::calculate_share(dist, 3, positions, BASIS_POINTS);
        let s4 = calculator::calculate_share(dist, 4, positions, BASIS_POINTS);
        let s5 = calculator::calculate_share(dist, 5, positions, BASIS_POINTS);
        let total = s1 + s2 + s3 + s4 + s5;

        let weight_display: ByteArray = if weight == 10 {
            "1.0"
        } else if weight == 15 {
            "1.5"
        } else if weight == 20 {
            "2.0"
        } else if weight == 25 {
            "2.5"
        } else if weight == 30 {
            "3.0"
        } else {
            "5.0"
        };

        println!(
            "Weight {}: P1={} P2={} P3={} P4={} P5={} (total={})",
            weight_display,
            s1,
            s2,
            s3,
            s4,
            s5,
            total,
        );

        i += 1;
    }

    // Test with 10 positions to show scalability
    println!("\nLINEAR DISTRIBUTION (10 positions, weight 2.0):");
    println!("------------------------------------------------");
    let dist = Distribution::Linear(20);
    let positions_10 = 10_u32;

    let mut pos: u8 = 1;
    loop {
        if pos > 10 {
            break;
        }
        let share = calculator::calculate_share(dist, pos, positions_10, BASIS_POINTS);
        println!("Position {}: {}", pos, share);
        pos += 1;
    }

    println!("\n=== END SHOWCASE ===\n");
}
