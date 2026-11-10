package usage

import (
	"sort"
	"strconv"
	"strings"
)

// CSV renders the daily rollups oldest first, one row per local day. An unpriced day leaves its
// cost cell empty instead of writing zero, which would read as a measured free day.
func CSV(days []Day) string {
	ordered := append([]Day(nil), days...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Date < ordered[j].Date })

	var b strings.Builder
	b.WriteString("date,tokens,cost_usd,cost_complete,partial\n")
	for _, day := range ordered {
		cost := ""
		if day.CostUSD != nil {
			cost = strconv.FormatFloat(*day.CostUSD, 'f', 4, 64)
		}
		b.WriteString(day.Date)
		b.WriteByte(',')
		b.WriteString(strconv.FormatInt(day.Tokens, 10))
		b.WriteByte(',')
		b.WriteString(cost)
		b.WriteByte(',')
		b.WriteString(strconv.FormatBool(day.CostComplete))
		b.WriteByte(',')
		b.WriteString(strconv.FormatBool(day.Partial))
		b.WriteByte('\n')
	}
	return b.String()
}
