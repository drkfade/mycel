// Arrays, dictionaries, closures, and ranges in Swift
let nums = [2, 6, 3, 9, 4, 8]
let big = nums.filter { $0 > 5 }
let doubled = big.map { $0 * 2 }
let total = big.reduce(0) { $0 + $1 }
print("big=\(big), doubled=\(doubled), total=\(total)")

let splits = ["1k": 285, "2k": 292]
for (k, v) in splits.sorted(by: { $0.key < $1.key }) {
  print("\(k): \(v)s")
}
for i in 0..<3 { print(i, terminator: " ") }
print("")

let text = "5k in 24m, 10k in 51m, 3k in 13m"
let paces = text.split { !$0.isNumber }.compactMap { Int($0) }.filter { $0 > 5 }
print(paces)
