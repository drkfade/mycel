// Optionals and throwing functions in Swift
import Foundation

enum PaceError: Error { case badNumber(String) }

func parseMinutes(_ raw: String) throws -> Int {
  guard let m = Int(raw), m > 0 else { throw PaceError.badNumber(raw) }
  return m
}

let maybe: Int? = 24
if let n = maybe { print("got \(n)") }
print(maybe ?? 0)
print((try? parseMinutes("24")) as Any, (try? parseMinutes("bad")) as Any)
