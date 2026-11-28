// Hello in Go
package main

import (
	"fmt"
	"math"
)

func main() {
	name := "Ada"
	exact := 7.0 / 2.0
	whole := 7 / 2
	fmt.Printf("Hello, %s! sqrt(25)=%.1f\n", name, math.Sqrt(25.0))
	fmt.Printf("exact=%.1f, whole=%d\n", exact, whole)
}
