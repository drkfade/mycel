// Vec, HashMap, iterators, and filtering in Rust
use std::collections::HashMap;

fn main() {
    let nums = vec![2, 6, 3, 9, 4, 8];
    let big: Vec<i64> = nums.iter().copied().filter(|&x| x > 5).collect();
    let doubled: Vec<i64> = big.iter().map(|x| x * 2).collect();
    let total: i64 = big.iter().sum();
    println!("big={:?}, doubled={:?}, total={}", big, doubled, total);

    let counts = HashMap::from([("ok", 3), ("err", 1)]);
    for (k, v) in &counts {
        println!("{}: {}", k, v);
    }
    println!("{} {}", counts.get("warn").unwrap_or(&0), counts.contains_key("ok"));

    let ports: Vec<i64> = "ports 22, 443, 8080, 3"
        .split(|c: char| !c.is_ascii_digit())
        .filter_map(|s| s.parse::<i64>().ok())
        .filter(|&n| n > 5)
        .collect();
    println!("{:?}", ports);
}
