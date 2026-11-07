package antigravity

import (
	"context"
	"database/sql"
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/tverma101/FreeTokens/internal/pricing"
	"github.com/tverma101/FreeTokens/internal/usage"
)

func pbVarint(dst []byte, num int, value uint64) []byte {
	dst = binary.AppendUvarint(dst, uint64(num)<<3)
	return binary.AppendUvarint(dst, value)
}

func pbBytes(dst []byte, num int, value []byte) []byte {
	dst = binary.AppendUvarint(dst, uint64(num)<<3|2)
	dst = binary.AppendUvarint(dst, uint64(len(value)))
	return append(dst, value...)
}

func usageBlob(input, output, cache int64) []byte {
	b := pbVarint(nil, 2, uint64(input))
	b = pbVarint(b, 3, uint64(output))
	return pbVarint(b, 5, uint64(cache))
}

func genBlob(id, name string, input, output, cache int64) []byte {
	top := pbBytes(nil, 19, []byte(id))
	top = pbBytes(top, 21, []byte(name))
	top = pbBytes(top, 4, usageBlob(input, output, cache))
	return pbBytes(nil, 1, top)
}

func stepBlob(at time.Time, input, output, cache int64) []byte {
	timestamp := pbVarint(nil, 1, uint64(at.Unix()))
	timestamp = pbVarint(timestamp, 2, uint64(at.Nanosecond()))
	meta := pbBytes(nil, 1, timestamp)
	return pbBytes(meta, 9, usageBlob(input, output, cache))
}

func testPricing() *pricing.Snapshot {
	return pricing.NewSnapshot(pricing.BundledSupplement(), map[string]pricing.Rates{
		"gemini-3.8-flash": {Input: 1, Output: 2, CacheRead: 0.5, CacheReadExplicit: true},
	})
}

func writeConversation(t *testing.T, path string, gens, steps [][]byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, q := range []string{
		`CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB, size INTEGER)`,
		`CREATE TABLE steps (idx INTEGER PRIMARY KEY, step_type INTEGER, metadata BLOB)`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	for i, data := range gens {
		if _, err := db.Exec(`INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)`, i, data, len(data)); err != nil {
			t.Fatal(err)
		}
	}
	for i, data := range steps {
		if _, err := db.Exec(`INSERT INTO steps (idx, step_type, metadata) VALUES (?, 15, ?)`, i, data); err != nil {
			t.Fatal(err)
		}
	}
}

func TestParseGeneration(t *testing.T) {
	g, ok := parseGeneration(genBlob("gemini-3.8-flash-n", "Gemini 3.8 Flash (High)", 100, 20, 30))
	if !ok {
		t.Fatal("generation was not parsed")
	}
	if g.modelID != "gemini-3.8-flash-n" || g.model != "Gemini 3.8 Flash (High)" {
		t.Fatalf("model = %q / %q", g.modelID, g.model)
	}
	if g.input != 100 || g.output != 20 || g.cache != 30 {
		t.Fatalf("usage = %+v", g.usage3)
	}
	if _, ok := parseGeneration([]byte{0xff}); ok {
		t.Fatal("truncated generation was accepted")
	}
}

func TestScanFoldsMismatchedSteps(t *testing.T) {
	root := t.TempDir()
	first := time.Date(2026, 11, 5, 12, 0, 0, 0, time.Local)
	second := time.Date(2026, 11, 6, 12, 0, 0, 0, time.Local)
	writeConversation(t, filepath.Join(root, "conversations", "one.db"),
		[][]byte{
			genBlob("gemini-3.8-flash-n", "Gemini 3.8 Flash (High)", 100, 20, 30),
			genBlob("gemini-3.8-flash-n", "Gemini 3.8 Flash (High)", 200, 40, 10),
		},
		[][]byte{
			stepBlob(first, 100, 20, 30),
			stepBlob(first, 7, 8, 9), // a subagent step with no generation record
			stepBlob(second, 200, 40, 10),
		})

	scanner := &Scanner{Roots: []Root{{Dir: root, Source: "Antigravity"}}}
	days, err := scanner.Scan(context.Background(), second.Add(time.Hour), testPricing())
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 2 {
		t.Fatalf("days = %d, want 2", len(days))
	}
	byDate := map[string]usage.Day{}
	for _, day := range days {
		byDate[day.Date] = day
	}
	old := byDate["2026-11-05"]
	if old.Tokens != 150 {
		t.Fatalf("first day tokens = %d, want 150", old.Tokens)
	}
	if old.CostUSD == nil || math.Abs(*old.CostUSD-155.0/1e6) > 1e-12 {
		t.Fatalf("first day cost = %v, want 155/1e6", old.CostUSD)
	}
	if len(old.Models) != 1 || old.Models[0].Name != "Antigravity · Gemini 3.8 Flash (High)" {
		t.Fatalf("models = %+v", old.Models)
	}
	if !old.CostComplete {
		t.Fatal("priced day was marked incomplete")
	}
	newest := byDate["2026-11-06"]
	if newest.Tokens != 250 {
		t.Fatalf("second day tokens = %d, want 250", newest.Tokens)
	}
}

func TestScanDeduplicatesConversationAcrossRoots(t *testing.T) {
	app := t.TempDir()
	ide := t.TempDir()
	at := time.Date(2026, 11, 5, 12, 0, 0, 0, time.Local)
	writeConversation(t, filepath.Join(app, "conversations", "same.db"),
		[][]byte{genBlob("gemini-3.8-flash-n", "From App", 10, 1, 0)},
		[][]byte{stepBlob(at, 10, 1, 0)})
	writeConversation(t, filepath.Join(ide, "conversations", "same.db"),
		[][]byte{genBlob("gemini-3.8-flash-n", "From IDE", 999, 1, 0)},
		[][]byte{stepBlob(at, 999, 1, 0)})

	scanner := &Scanner{Roots: []Root{
		{Dir: app, Source: "Antigravity"},
		{Dir: ide, Source: "Antigravity IDE"},
	}}
	days, err := scanner.Scan(context.Background(), at.Add(time.Hour), testPricing())
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 1 || len(days[0].Models) != 1 {
		t.Fatalf("days = %+v", days)
	}
	if days[0].Tokens != 11 || days[0].Models[0].Name != "Antigravity · From App" {
		t.Fatalf("duplicate conversation was not taken from the first root: %+v", days[0])
	}
}

func TestDisplayModelFallsBackToID(t *testing.T) {
	if got := displayModel(genRow{modelID: "gemini-3.8-flash-n"}); got != "Gemini 3.8 Flash" {
		t.Fatalf("display = %q", got)
	}
	if got := displayModel(genRow{modelID: "gemini-3.8-flash-high"}); got != "Gemini 3.8 Flash (High)" {
		t.Fatalf("display = %q", got)
	}
}
