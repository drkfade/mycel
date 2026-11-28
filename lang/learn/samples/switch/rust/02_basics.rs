// Structs, mutability, and functions in Rust
struct Point {
    x: i64,
    y: i64,
}

fn shift(p: &Point, dx: i64, dy: i64) -> Point {
    Point { x: p.x + dx, y: p.y + dy }
}

fn main() {
    let mut count: i64 = 0;
    count += 2;
    let p = shift(&Point { x: 3, y: 4 }, 1, 5);
    println!("{} {} {}", count, p.x, p.y);
}
