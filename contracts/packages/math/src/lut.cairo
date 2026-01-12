// SPDX-License-Identifier: MIT
// Based on Cubit by Influence - https://github.com/influenceth/cubit

// Lookup table for exp2(x) where x is an integer
pub fn exp2(x: u64) -> u64 {
    if x == 0 {
        return 1;
    } else if x == 1 {
        return 2;
    } else if x == 2 {
        return 4;
    } else if x == 3 {
        return 8;
    } else if x == 4 {
        return 16;
    } else if x == 5 {
        return 32;
    } else if x == 6 {
        return 64;
    } else if x == 7 {
        return 128;
    } else if x == 8 {
        return 256;
    } else if x == 9 {
        return 512;
    } else if x == 10 {
        return 1024;
    } else if x == 11 {
        return 2048;
    } else if x == 12 {
        return 4096;
    } else if x == 13 {
        return 8192;
    } else if x == 14 {
        return 16384;
    } else if x == 15 {
        return 32768;
    } else if x == 16 {
        return 65536;
    } else if x == 17 {
        return 131072;
    } else if x == 18 {
        return 262144;
    } else if x == 19 {
        return 524288;
    } else if x == 20 {
        return 1048576;
    } else if x == 21 {
        return 2097152;
    } else if x == 22 {
        return 4194304;
    } else if x == 23 {
        return 8388608;
    } else if x == 24 {
        return 16777216;
    } else if x == 25 {
        return 33554432;
    } else if x == 26 {
        return 67108864;
    } else if x == 27 {
        return 134217728;
    } else if x == 28 {
        return 268435456;
    } else if x == 29 {
        return 536870912;
    } else if x == 30 {
        return 1073741824;
    } else if x == 31 {
        return 2147483648;
    } else if x == 32 {
        return 4294967296;
    } else {
        panic!("exp2: input too large");
    }
}

// Most significant bit and the power of 2 ceiling
// Returns (msb, 2^msb) where 2^msb >= x
pub fn msb(x: u64) -> (u64, u64) {
    if x <= 1 {
        return (0, 1);
    } else if x <= 2 {
        return (1, 2);
    } else if x <= 4 {
        return (2, 4);
    } else if x <= 8 {
        return (3, 8);
    } else if x <= 16 {
        return (4, 16);
    } else if x <= 32 {
        return (5, 32);
    } else if x <= 64 {
        return (6, 64);
    } else if x <= 128 {
        return (7, 128);
    } else if x <= 256 {
        return (8, 256);
    } else if x <= 512 {
        return (9, 512);
    } else if x <= 1024 {
        return (10, 1024);
    } else if x <= 2048 {
        return (11, 2048);
    } else if x <= 4096 {
        return (12, 4096);
    } else if x <= 8192 {
        return (13, 8192);
    } else if x <= 16384 {
        return (14, 16384);
    } else if x <= 32768 {
        return (15, 32768);
    } else if x <= 65536 {
        return (16, 65536);
    } else if x <= 131072 {
        return (17, 131072);
    } else if x <= 262144 {
        return (18, 262144);
    } else if x <= 524288 {
        return (19, 524288);
    } else if x <= 1048576 {
        return (20, 1048576);
    } else if x <= 2097152 {
        return (21, 2097152);
    } else if x <= 4194304 {
        return (22, 4194304);
    } else if x <= 8388608 {
        return (23, 8388608);
    } else if x <= 16777216 {
        return (24, 16777216);
    } else if x <= 33554432 {
        return (25, 33554432);
    } else if x <= 67108864 {
        return (26, 67108864);
    } else if x <= 134217728 {
        return (27, 134217728);
    } else if x <= 268435456 {
        return (28, 268435456);
    } else if x <= 536870912 {
        return (29, 536870912);
    } else if x <= 1073741824 {
        return (30, 1073741824);
    } else if x <= 2147483648 {
        return (31, 2147483648);
    } else {
        return (32, 4294967296);
    }
}
