// Hello in Rust
fn main() {
    let name = "Ada";
    let exact = 7.0_f64 / 2.0;
    let whole = 7_i64.div_euclid(2);
    let neg_div = (-7_i64).div_euclid(2);
    let neg_mod = (-7_i64).rem_euclid(3);
    println!("Hello, {}! sqrt(25)={:.1}", name, 25.0_f64.sqrt());
    println!(
        "exact={:.1}, whole={}, neg_div={}, neg_mod={}",
        exact, whole, neg_div, neg_mod
    );
}
