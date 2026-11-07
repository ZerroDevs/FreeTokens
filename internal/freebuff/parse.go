package freebuff

import (
	"encoding/json"
	"math"
	"strconv"
	"strings"
	"time"
)

// number mirrors QuotaBar's ProviderParse.number: finite JSON numbers or numeric strings, never booleans.
func number(v any) (float64, bool) {
	switch n := v.(type) {
	case json.Number:
		f, err := n.Float64()
		return f, err == nil && !math.IsInf(f, 0) && !math.IsNaN(f)
	case float64:
		return n, !math.IsInf(n, 0) && !math.IsNaN(n)
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(n), 64)
		return f, err == nil && !math.IsInf(f, 0) && !math.IsNaN(f)
	}
	return 0, false
}

func nonnegative(v any) (float64, bool) {
	f, ok := number(v)
	return f, ok && f >= 0
}

// ParseTime accepts RFC 3339 with or without fractional seconds.
func ParseTime(v any) (time.Time, bool) {
	s, _ := v.(string)
	if s == "" {
		return time.Time{}, false
	}
	t, err := time.Parse(time.RFC3339Nano, s)
	return t, err == nil
}

// decodeObject decodes JSON keeping numbers exact.
func decodeObject(b []byte) (map[string]any, bool) {
	dec := json.NewDecoder(strings.NewReader(string(b)))
	dec.UseNumber()
	var m map[string]any
	if dec.Decode(&m) != nil || m == nil {
		return nil, false
	}
	return m, true
}

func obj(v any) (map[string]any, bool) {
	m, ok := v.(map[string]any)
	return m, ok
}

func str(v any) string {
	s, _ := v.(string)
	return s
}
