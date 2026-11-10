package usage

import (
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func f(v float64) *float64 { return &v }

func TestSourcesSplitFreebuffAndAntigravityStores(t *testing.T) {
	now := time.Date(2026, 11, 6, 9, 0, 0, 0, time.Local)
	today := DayKey(now)
	var a Accumulator
	a.Add(today, 10, f(1), "DeepSeek V4.1 Flash", "")
	a.Add(today, 20, nil, "Antigravity · Gemini 3.8 Flash", "")
	a.Add(today, 30, nil, "Antigravity IDE · Gemini 3.8 Flash", "")
	a.Add(today, 40, nil, "Agy CLI · Claude Sonnet 5", "")
	a.Add(today, 50, nil, "Claude · Sonnet 4.5", "")
	a.Add(today, 60, nil, "Codex · GPT 6 Luna", "")
	period := StandardPeriods(a.Build(), now)[0]
	want := []SourceRow{
		{Name: "Freebuff", Tokens: 10},
		{Name: "Antigravity app", Tokens: 20},
		{Name: "Antigravity IDE", Tokens: 30},
		{Name: "Agy CLI", Tokens: 40},
		{Name: "Claude", Tokens: 50},
		{Name: "Codex", Tokens: 60},
	}
	if !reflect.DeepEqual(period.Sources, want) {
		t.Fatalf("sources = %+v, want %+v", period.Sources, want)
	}
	if period.Tokens != 210 {
		t.Fatalf("period tokens = %d, want 210", period.Tokens)
	}
}

func TestSourcesSkipOriginsWithoutUsage(t *testing.T) {
	now := time.Date(2026, 11, 6, 9, 0, 0, 0, time.Local)
	var a Accumulator
	a.Add(DayKey(now), 5, nil, "Agy CLI · Gemini 3.8 Flash", "")
	period := StandardPeriods(a.Build(), now)[0]
	want := []SourceRow{{Name: "Agy CLI", Tokens: 5}}
	if !reflect.DeepEqual(period.Sources, want) {
		t.Fatalf("sources = %+v, want %+v", period.Sources, want)
	}
}

func TestPeriodsAndLowerBounds(t *testing.T) {
	now := time.Date(2026, 11, 6, 9, 0, 0, 0, time.Local)
	today, yesterday, old := DayKey(now), DayKey(now.AddDate(0, 0, -1)), DayKey(now.AddDate(0, 0, -40))
	mid := DayKey(now.AddDate(0, 0, -10))
	var a Accumulator
	a.Add(today, 100, f(0.5), "A 10/17", "A")
	a.Add(today, 50, nil, "B", "")
	a.Add(yesterday, 10, f(0.1), "A Fast", "A")
	a.Add(mid, 20, f(2), "A", "A")
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
		t.Fatalf("week = %+v (10-day-old usage must be excluded)", p[2])
	}
	if p[3].Tokens != 180 {
		t.Fatalf("30 days = %+v (40-day-old usage must be excluded)", p[3])
	}
	var aRow *ModelRow
	for i := range p[3].Models {
		if p[3].Models[i].Name == "A" {
			aRow = &p[3].Models[i]
		}
	}
	if aRow == nil || aRow.Tokens != 130 || len(aRow.Variants) != 2 {
		t.Fatalf("grouped row = %+v", aRow)
	}
}

// A row's kinds must add up to its token total, merging must sum them, and a row from a source that
// reported no split keeps a nil Kinds rather than a misleading zero.
func TestKindsMergeAndStayConsistentWithTokens(t *testing.T) {
	now := time.Date(2026, 11, 6, 9, 0, 0, 0, time.Local)
	today := DayKey(now)
	var a Accumulator
	a.AddKinds(today, 100, f(1), "A", "", Kinds{Input: 40, Output: 20, CacheRead: 35, CacheWrite: 5})
	a.AddKinds(today, 50, f(1), "B", "", Kinds{Input: 10, Output: 30, CacheRead: 10})
	a.Add(today, 10, nil, "C", "")
	period := StandardPeriods(a.Build(), now)[0]
	want := Kinds{Input: 50, Output: 50, CacheRead: 45, CacheWrite: 5}
	if period.Kinds == nil || *period.Kinds != want {
		t.Fatalf("period kinds = %+v, want %+v", period.Kinds, want)
	}
	for _, row := range period.Models {
		switch row.Name {
		case "C":
			if row.Kinds != nil {
				t.Fatalf("row C kinds = %+v, want nil", row.Kinds)
			}
		default:
			if row.Kinds == nil {
				t.Fatalf("row %s lost its kinds", row.Name)
			}
			k := *row.Kinds
			if k.Input+k.Output+k.CacheRead+k.CacheWrite != row.Tokens {
				t.Fatalf("row %s kinds %+v do not sum to %d tokens", row.Name, k, row.Tokens)
			}
		}
	}
}

// Projects split one model's usage per workspace, which is what the opt-in project grouping reads.
func TestProjectsStaySeparateRows(t *testing.T) {
	now := time.Date(2026, 11, 6, 9, 0, 0, 0, time.Local)
	today := DayKey(now)
	var a Accumulator
	a.AddProject(today, 10, f(0.1), "Claude · Sonnet 4.6", "", "web", Kinds{Input: 10})
	a.AddProject(today, 30, f(0.3), "Claude · Sonnet 4.6", "", "api", Kinds{Input: 30})
	a.AddProject(today, 5, f(0.05), "Claude · Sonnet 4.6", "", "", Kinds{Input: 5})
	period := StandardPeriods(a.Build(), now)[0]
	if len(period.Models) != 3 {
		t.Fatalf("models = %+v, want one row per project plus the unprojected one", period.Models)
	}
	projects := map[string]int64{}
	for _, row := range period.Models {
		projects[row.Project] = row.Tokens
	}
	if projects["web"] != 10 || projects["api"] != 30 || projects[""] != 5 {
		t.Fatalf("project tokens = %v", projects)
	}
}

// The hour-of-week grid uses the local weekday of the day key and keeps cost complete only where
// every contributing hour was priced.
func TestBuildSlotsUsesLocalWeekdayAndHour(t *testing.T) {
	sunday := time.Date(2026, 11, 8, 10, 0, 0, 0, time.Local)
	key := DayKey(sunday)
	var a Accumulator
	a.Add(key, 40, f(1), "A", "")
	a.AddHour(key, 10, 40, f(1))
	slots := BuildSlots(a.Build())
	if slots == nil {
		t.Fatal("slots = nil, want the measured hour")
	}
	slot := slots[int(time.Sunday)*24+10]
	if slot.Tokens != 40 || slot.CostUSD == nil || *slot.CostUSD != 1 || !slot.CostComplete {
		t.Fatalf("Sunday 10:00 = %+v", slot)
	}
	if (*slots)[int(time.Sunday)*24+11].Tokens != 0 {
		t.Fatal("an unmeasured hour must stay empty")
	}
}

func TestBuildSlotsWithoutHoursIsNil(t *testing.T) {
	now := time.Date(2026, 11, 6, 9, 0, 0, 0, time.Local)
	var a Accumulator
	a.Add(DayKey(now), 10, nil, "A", "")
	if BuildSlots(a.Build()) != nil {
		t.Fatal("a day rollup without hours must not invent a slot")
	}
}

func TestCSVWritesOldestFirstAndLeavesUnpricedCostEmpty(t *testing.T) {
	days := []Day{
		{Date: "2026-11-06", Tokens: 20, CostUSD: f(0.5), CostComplete: true},
		{Date: "2026-11-05", Tokens: 10, CostComplete: false, Partial: true},
	}
	got := CSV(days)
	want := "date,tokens,cost_usd,cost_complete,partial\n" +
		"2026-11-05,10,,false,true\n" +
		"2026-11-06,20,0.5000,true,false\n"
	if got != want {
		t.Fatalf("csv =\n%q\nwant\n%q", got, want)
	}
}

func TestProjectNameUsesLastPathSegment(t *testing.T) {
	sep := string(filepath.Separator)
	cases := map[string]string{
		"":                    "",
		"/Users/me/code/web/": "web",
		"work" + sep + "api":  "api",
		"single":              "single",
	}
	for dir, want := range cases {
		if got := ProjectName(dir); got != want {
			t.Fatalf("ProjectName(%q) = %q, want %q", dir, got, want)
		}
	}
}

func TestKeepSinceDropsOldAndUndated(t *testing.T) {
	type item struct {
		at time.Time
	}
	now := time.Date(2026, 11, 7, 12, 0, 0, 0, time.Local)
	items := []item{
		{at: now.AddDate(0, 0, -60)},
		{},
		{at: now.Add(-time.Hour)},
		{at: HistoryCutoff(now)},
	}
	kept := KeepSince(items, HistoryCutoff(now), func(i item) time.Time { return i.at })
	if len(kept) != 2 {
		t.Fatalf("kept = %d, want the recent turn and the cutoff instant", len(kept))
	}
	if !kept[0].at.Equal(now.Add(-time.Hour)) || !kept[1].at.Equal(HistoryCutoff(now)) {
		t.Fatalf("kept = %+v", kept)
	}
}
