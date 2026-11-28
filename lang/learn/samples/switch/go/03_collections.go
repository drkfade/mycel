// Slices, maps, loops, and regexp in Go
package main

import (
	"fmt"
	"regexp"
	"strconv"
)

func main() {
	nums := []int{2, 6, 3, 9, 4, 8}
	var big, doubled []int
	total := 0
	for _, x := range nums {
		if x > 5 {
			big = append(big, x)
			doubled = append(doubled, x*2)
			total += x
		}
	}
	fmt.Printf("big=%v, doubled=%v, total=%d\n", big, doubled, total)

	counts := map[string]int{"ok": 3, "err": 1}
	for k, v := range counts {
		fmt.Printf("%s=%d\n", k, v)
	}
	fmt.Println(counts["warn"], counts["ok"] > 0)

	re := regexp.MustCompile(`\d+`)
	var spikes []int
	for _, s := range re.FindAllString("cpu=4% mem=72% disk=91%", -1) {
		if n, err := strconv.Atoi(s); err == nil && n > 5 {
			spikes = append(spikes, n)
		}
	}
	fmt.Println(spikes)
}
