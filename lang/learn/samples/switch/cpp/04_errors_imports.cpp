// std::optional and exception-based parsing in C++
#include <iostream>
#include <optional>
#include <stdexcept>
#include <string>

int parseReading(const std::string& raw) {
  size_t pos = 0;
  int v = std::stoi(raw, &pos);
  if (pos != raw.size()) throw std::invalid_argument("bad reading: " + raw);
  if (v < 0) throw std::invalid_argument("negative reading");
  return v;
}

int main() {
  std::optional<int> fallback = std::nullopt;
  std::cout << fallback.value_or(-1) << "\n";
  std::cout << parseReading("42") << "\n";
  try {
    std::cout << parseReading("err") << "\n";
  } catch (const std::exception& e) {
    std::cout << "err: " << e.what() << "\n";
  }
}
