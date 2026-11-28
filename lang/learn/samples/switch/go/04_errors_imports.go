// Error values and JSON in Go
package main

import (
	"encoding/json"
	"fmt"
	"strconv"
)

func parseTimeout(raw string) (int, error) {
	ms, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("bad timeout: %s", raw)
	}
	if ms <= 0 {
		return 0, fmt.Errorf("timeout must be > 0")
	}
	return ms, nil
}

func main() {
	if v, err := parseTimeout("250"); err != nil {
		fmt.Println("err:", err)
	} else {
		fmt.Println(v * 2)
	}
	out, _ := json.Marshal(map[string]float64{"sum": 6.0})
	fmt.Println(string(out))
}
