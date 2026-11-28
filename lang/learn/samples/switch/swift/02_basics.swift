// let, var, structs, and functions in Swift
import Foundation

struct Pace {
  let km: Double
  let mins: Int
}

func formatPace(_ p: Pace, unit: String = "km") -> String {
  let minsPerUnit = Double(p.mins) / p.km
  return String(format: "%.2f min/%@", minsPerUnit, unit)
}

var runs = 1
runs += 1
let today = Pace(km: 5.0, mins: 24)
print(runs, formatPace(today))
