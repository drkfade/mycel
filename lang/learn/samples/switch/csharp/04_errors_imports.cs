// Nullable types, TryParse, and System.Text.Json in C#
using System;
using System.Text.Json;

int? discount = null;
Console.WriteLine(discount ?? 0);

if (int.TryParse("12", out int q) && q > 0) {
  Console.WriteLine($"Ok({q})");
}
if (!int.TryParse("abc", out _)) {
  Console.WriteLine("Err(not a number: abc)");
}

Console.WriteLine(JsonSerializer.Serialize(new { total = 18.0 }));
