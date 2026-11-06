package usage

import (
	"testing"
	"time"
)

func f(v float64) *float64 { return &v }

func TestPeriodsAndLowerBounds(t *testing.T) {
	now := time.Date(2026, 11, 6, 9, 0, 0, 0, time.Local)
	today, yesterday, old := DayKey(now), DayKey(now.AddDate(0, 0, -1)), DayKey(now.AddDate(0, 0, -40))
	var a Accumulator
	a.Add(today, 100, f(0.5), "A 10/17", "A")
	a.Add(today, 50, nil, "B", "")
	a.AddNamedUnpriced(today, "B")
	a.Add(yesterday, 10, f(0.1), "A Fast", "A")
	a.Add(old, 999, f(9), "A", "A")
	a.MarkPartial(yesterday)
	days := a.Build()
	if days[0].Date != today {
		t.Fatalf("days must be newest first: %+v", days)
	}
	p := StandardPeriods(days, now)
	if p[0].Tokens != 150 || p[0].CostUSD == nil || *p[0].CostUSD != 0.5 || !p[0].CostLowerBound {
		t.Fatalf("today = %+v", p[0])
	}
	if !p[1].Partial || p[1].Tokens != 10 {
		t.Fatalf("yesterday = %+v", p[1])
	}
	if p[2].Tokens != 160 {
		t.Fatalf("30 days = %+v (40-day-old usage must be excluded)", p[2])
	}
	var aRow *ModelRow
	for i := range p[2].Models {
		if p[2].Models[i].Name == "A" {
			aRow = &p[2].Models[i]
		}
	}
	if aRow == nil || aRow.Tokens != 110 || len(aRow.Variants) != 2 {
		t.Fatalf("grouped row = %+v", aRow)
	}
}
