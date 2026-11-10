package usage

import "sort"

// MergeDays combines day snapshots from independent scanners. Days with the same local date are
// summed, and a merged day stays complete only when every source was complete.
func MergeDays(groups ...[]Day) []Day {
	byDate := map[string]*Day{}
	var order []string
	for _, days := range groups {
		for _, day := range days {
			dst := byDate[day.Date]
			if dst == nil {
				copied := cloneDay(day)
				byDate[day.Date] = &copied
				order = append(order, day.Date)
				continue
			}
			dst.Tokens = satAdd(dst.Tokens, day.Tokens)
			dst.CostUSD = addCost(dst.CostUSD, day.CostUSD)
			dst.CostComplete = dst.CostComplete && day.CostComplete
			dst.Partial = dst.Partial || day.Partial
			dst.UnknownModels = union(dst.UnknownModels, day.UnknownModels)
			dst.Hours = mergeHours(dst.Hours, day.Hours)
			for _, model := range day.Models {
				mergeModel(dst, model)
			}
		}
	}

	out := make([]Day, 0, len(order))
	for _, date := range order {
		day := byDate[date]
		sortModels(day.Models)
		out = append(out, *day)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date > out[j].Date })
	return out
}

func cloneDay(day Day) Day {
	out := day
	out.Models = make([]ModelRow, len(day.Models))
	for i, model := range day.Models {
		out.Models[i] = model
		out.Models[i].Variants = append([]Variant(nil), model.Variants...)
		if model.Kinds != nil {
			kinds := *model.Kinds
			out.Models[i].Kinds = &kinds
		}
	}
	out.UnknownModels = append([]string(nil), day.UnknownModels...)
	out.Hours = append([]Hour(nil), day.Hours...)
	return out
}

func mergeHours(into, add []Hour) []Hour {
	for _, hour := range add {
		found := false
		for i := range into {
			if into[i].Hour == hour.Hour {
				into[i].Tokens = satAdd(into[i].Tokens, hour.Tokens)
				into[i].CostUSD = addCost(into[i].CostUSD, hour.CostUSD)
				found = true
				break
			}
		}
		if !found {
			into = append(into, hour)
		}
	}
	sort.Slice(into, func(i, j int) bool { return into[i].Hour < into[j].Hour })
	return into
}

func addCost(a, b *float64) *float64 {
	switch {
	case a == nil:
		return b
	case b == nil:
		return a
	}
	sum := *a + *b
	return &sum
}

func mergeModel(day *Day, model ModelRow) {
	for i := range day.Models {
		if day.Models[i].Name != model.Name || day.Models[i].Project != model.Project {
			continue
		}
		day.Models[i].Tokens = satAdd(day.Models[i].Tokens, model.Tokens)
		day.Models[i].CostUSD = addCost(day.Models[i].CostUSD, model.CostUSD)
		day.Models[i].CostComplete = day.Models[i].CostComplete && model.CostComplete
		if model.Kinds != nil {
			day.Models[i].Kinds = mergeKinds(day.Models[i].Kinds, *model.Kinds)
		}
		day.Models[i].Variants = mergeVariants(day.Models[i].Variants, model.Variants)
		return
	}
	model.Variants = append([]Variant(nil), model.Variants...)
	day.Models = append(day.Models, model)
}

func union(a, b []string) []string {
	if len(b) == 0 {
		return a
	}
	seen := make(map[string]bool, len(a)+len(b))
	out := make([]string, 0, len(a)+len(b))
	for _, list := range [][]string{a, b} {
		for _, v := range list {
			if !seen[v] {
				seen[v] = true
				out = append(out, v)
			}
		}
	}
	sort.Strings(out)
	return out
}
