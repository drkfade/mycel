// Hello in C++
#include <cmath>
#include <iomanip>
#include <iostream>
#include <string>

int main() {
  std::string name = "Ada";
  double exact = 7.0 / 2.0;
  int whole = 7 / 2;
  std::cout << std::fixed << std::setprecision(1);
  std::cout << "Hello, " << name << "! sqrt(25)=" << std::sqrt(25.0) << "\n";
  std::cout << "exact=" << exact << ", whole=" << whole << "\n";
}
