// Option, Result, and ? propagation in Rust
fn half(n: i64) -> Result<i64, String> {
    if n % 2 != 0 {
        return Err(format!("{} is odd", n));
    }
    Ok(n / 2)
}

fn quarter(n: i64) -> Result<i64, String> {
    let h = half(n)?;
    half(h)
}

fn main() {
    let maybe: Option<i64> = Some(42);
    if let Some(v) = maybe {
        println!("got {}", v);
    }
    println!("{:?} {:?}", quarter(8), quarter(6));
}
