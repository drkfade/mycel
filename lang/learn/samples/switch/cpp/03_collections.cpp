// std::vector, std::map, algorithms, and regex in C++
#include <iostream>
#include <map>
#include <numeric>
#include <regex>
#include <string>
#include <vector>

int main() {
  std::vector<int> nums{2, 6, 3, 9, 4, 8};
  std::vector<int> big, doubled;
  for (int x : nums) {
    if (x > 5) {
      big.push_back(x);
      doubled.push_back(x * 2);
    }
  }
  int total = std::accumulate(big.begin(), big.end(), 0);
  std::cout << "total=" << total << "\n";

  std::map<std::string, int> sensors{{"temp", 24}, {"volt", 12}};
  for (const auto& [k, v] : sensors) {
    std::cout << k << "=" << v << "\n";
  }

  std::string text = "t=4ms ok=12ms warn=88ms";
  std::regex re("\\d+");
  std::vector<int> readings;
  for (auto it = std::sregex_iterator(text.begin(), text.end(), re); it != std::sregex_iterator(); ++it) {
    int n = std::stoi(it->str());
    if (n > 5) readings.push_back(n);
  }
  std::cout << "readings=" << readings.size() << "\n";
}
