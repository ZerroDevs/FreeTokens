package pricing

import (
	"encoding/json"
	"errors"
	"math"
	"strconv"
	"strings"
)

// ErrIncompleteModelList means OpenRouter returned a page instead of the full list.
var ErrIncompleteModelList = errors.New("OpenRouter returned a paginated or incomplete model list")

// OpenRouterPage is one page of /api/v1/models with its pagination metadata.
type OpenRouterPage struct {
	Models     []json.RawMessage
	TotalCount int
	NextOffset *int
}

// ParseOpenRouterPage reads data/total_count/links.next.
func ParseOpenRouterPage(data []byte) (*OpenRouterPage, error) {
	var root struct {
		Data       []json.RawMessage `json:"data"`
		TotalCount *json.Number      `json:"total_count"`
		Links      *struct {
			Next *string `json:"next"`
		} `json:"links"`
	}
	dec := json.NewDecoder(strings.NewReader(string(data)))
	dec.UseNumber()
	if err := dec.Decode(&root); err != nil || root.Data == nil {
		return nil, ErrIncompleteModelList
	}
	p := &OpenRouterPage{Models: root.Data, TotalCount: len(root.Data)}
	if root.TotalCount != nil {
		n, err := root.TotalCount.Int64()
		if err != nil {
			return nil, ErrIncompleteModelList
		}
		p.TotalCount = int(n)
	}
	if root.Links != nil && root.Links.Next != nil {
		next := *root.Links.Next
		i := strings.Index(next, "offset=")
		if i < 0 {
			return nil, ErrIncompleteModelList
		}
		v := next[i+len("offset="):]
		if j := strings.IndexByte(v, '&'); j >= 0 {
			v = v[:j]
		}
		off, err := strconv.Atoi(v)
		if err != nil || off < 0 {
			return nil, ErrIncompleteModelList
		}
		p.NextOffset = &off
	}
	return p, nil
}

func perMillion(v any) (float64, bool) {
	var f float64
	switch x := v.(type) {
	case string:
		p, err := strconv.ParseFloat(x, 64)
		if err != nil {
			return 0, false
		}
		f = p
	case json.Number:
		p, err := x.Float64()
		if err != nil {
			return 0, false
		}
		f = p
	default:
		return 0, false
	}
	if math.IsNaN(f) || math.IsInf(f, 0) || f < 0 || f > math.MaxFloat64/1e6 {
		return 0, false
	}
	return f * 1e6, true
}

func optRate(v any) *float64 {
	if f, ok := perMillion(v); ok {
		return &f
	}
	return nil
}

func intValue(v any) (int, bool) {
	n, ok := v.(json.Number)
	if !ok {
		return 0, false
	}
	f, err := n.Float64()
	if err != nil || f < 0 || f != math.Trunc(f) || f > math.MaxInt32 {
		return 0, false
	}
	return int(f), true
}

// utcMinute converts OpenRouter's HHMM integers.
func utcMinute(hhmm int) (int, bool) {
	if hhmm < 0 || hhmm > 2400 {
		return 0, false
	}
	h, m := hhmm/100, hhmm%100
	if h > 24 || m >= 60 || (h == 24 && m != 0) {
		return 0, false
	}
	return h*60 + m, true
}

func utcOverrides(v any) []UTCOverride {
	list, _ := v.([]any)
	valid := map[string]bool{"monday": true, "tuesday": true, "wednesday": true, "thursday": true, "friday": true, "saturday": true, "sunday": true}
	var out []UTCOverride
	for _, item := range list {
		o, _ := item.(map[string]any)
		if o == nil {
			continue
		}
		if _, tiered := o["min_prompt_tokens"]; tiered {
			continue
		}
		var ov UTCOverride
		if raw, ok := o["utc_days"]; ok && raw != nil {
			days, _ := raw.([]any)
			if len(days) == 0 {
				continue
			}
			okAll := true
			for _, d := range days {
				s, _ := d.(string)
				s = strings.ToLower(s)
				if !valid[s] {
					okAll = false
					break
				}
				ov.Days = append(ov.Days, s)
			}
			if !okAll {
				continue
			}
		}
		var rawStart, rawEnd *int
		if raw, ok := o["utc_start"]; ok && raw != nil {
			n, ok := intValue(raw)
			if !ok {
				continue
			}
			rawStart = &n
		}
		if raw, ok := o["utc_end"]; ok && raw != nil {
			n, ok := intValue(raw)
			if !ok {
				continue
			}
			rawEnd = &n
		}
		if ov.Days == nil && rawStart == nil && rawEnd == nil {
			continue
		}
		if rawStart != nil {
			m, ok := utcMinute(*rawStart)
			if !ok {
				continue
			}
			ov.StartMinute = &m
		}
		if rawEnd != nil {
			m, ok := utcMinute(*rawEnd)
			if !ok {
				continue
			}
			if *rawEnd == 0 && ov.StartMinute != nil && *ov.StartMinute > 0 {
				m = 1440 // an end of 0 after a positive start is midnight at the end of that day
			}
			ov.EndMinute = &m
		}
		ov.Input, ov.Output = optRate(o["prompt"]), optRate(o["completion"])
		ov.CacheWrite, ov.CacheRead = optRate(o["input_cache_write"]), optRate(o["input_cache_read"])
		if ov.Input == nil && ov.Output == nil && ov.CacheWrite == nil && ov.CacheRead == nil {
			continue
		}
		out = append(out, ov)
	}
	return out
}

// CatalogFromOpenRouter builds exact route rates plus bare aliases owned by exactly one route.
func CatalogFromOpenRouter(models []json.RawMessage) (map[string]Rates, error) {
	routes := map[string]Rates{}
	aliases := map[string][]string{}
	for _, raw := range models {
		dec := json.NewDecoder(strings.NewReader(string(raw)))
		dec.UseNumber()
		var m map[string]any
		if dec.Decode(&m) != nil {
			continue
		}
		id, _ := m["id"].(string)
		key := strings.TrimSpace(id)
		if key == "" {
			continue
		}
		if _, dup := routes[key]; dup {
			continue
		}
		p, _ := m["pricing"].(map[string]any)
		in, ok1 := perMillion(p["prompt"])
		out, ok2 := perMillion(p["completion"])
		if p == nil || !ok1 || !ok2 {
			continue
		}
		r := Rates{Input: in, Output: out, CacheWrite: in, CacheRead: in}
		if cw := optRate(p["input_cache_write"]); cw != nil {
			r.CacheWrite = *cw
		}
		if cr := optRate(p["input_cache_read"]); cr != nil {
			r.CacheRead, r.CacheReadExplicit = *cr, true
		}
		r.UTC = utcOverrides(p["overrides"])
		for _, o := range r.UTC {
			if o.CacheRead != nil {
				r.CacheReadExplicit = true
			}
		}
		routes[key] = r
		parts := strings.Split(key, "/")
		if len(parts) == 2 && parts[1] != "" && !strings.Contains(parts[1], ":") {
			alias := strings.ToLower(parts[1])
			aliases[alias] = append(aliases[alias], key)
		}
	}
	if len(routes) == 0 {
		return nil, errors.New("OpenRouter returned no usable prices")
	}
	entries := map[string]Rates{}
	for k, v := range routes {
		entries[k] = v
	}
	for alias, ids := range aliases {
		if _, exists := entries[alias]; len(ids) == 1 && !exists {
			entries[alias] = routes[ids[0]]
		}
	}
	return entries, nil
}
