// Structs, variables, and functions in Go
package main

import "fmt"

type Point struct {
	X int
	Y int
}

func movePoint(p Point, dx, dy int) Point {
	return Point{X: p.X + dx, Y: p.Y + dy}
}

func main() {
	p := Point{X: 2, Y: 3}
	p = movePoint(p, 1, 4)
	fmt.Printf("(%d, %d)\n", p.X, p.Y)
}
