// LINQ, Dictionary, and Regex in C#
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

var nums = new List<int> { 2, 6, 3, 9, 4, 8 };
var big = nums.Where(x => x > 5).ToList();
var doubled = big.Select(x => x * 2).ToList();
var total = big.Sum();
Console.WriteLine($"big=[{string.Join(", ", big)}], doubled=[{string.Join(", ", doubled)}], total={total}");

var stock = new Dictionary<string, int> { ["pens"] = 12, ["pads"] = 4 };
foreach (var (k, v) in stock) {
  Console.WriteLine($"{k}: {v}");
}
Console.WriteLine($"{stock.GetValueOrDefault("tape", 0)} {stock.ContainsKey("pens")}");

var qtys = Regex.Matches("pens:12, clips:3, folders:8", @"\d+")
  .Select(m => int.Parse(m.Value))
  .Where(n => n > 5)
  .ToList();
Console.WriteLine($"[{string.Join(", ", qtys)}]");
