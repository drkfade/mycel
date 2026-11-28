// Structs and methods in C++
#include <cmath>
#include <iomanip>
#include <iostream>

struct Vec2 {
  double x;
  double y;
  double norm() const { return std::sqrt(x * x + y * y); }
};

int main() {
  int steps = 0;
  steps += 1;
  const Vec2 v{3.0, 4.0};
  std::cout << steps << " " << std::fixed << std::setprecision(1) << v.norm() << "\n";
}
