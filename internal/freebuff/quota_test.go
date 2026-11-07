package freebuff

import (
	"encoding/json"
	"errors"
	"testing"
)

func body(t *testing.T, bucks any, extras map[string]any) []byte {
	t.Helper()
	root := map[string]any{"status": "none"}
	for k, v := range extras {
		root[k] = v
	}
	if bucks != nil {
		root["freebucks"] = bucks
	}
	b, err := json.Marshal(root)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

var daily = map[string]any{"limit": 265, "spent": 0, "remaining": 265}

func TestDailyPoolAndWalletStayDisjoint(t *testing.T) {
	q, err := MapQuota(200, body(t, map[string]any{"balance": 633, "daily": daily, "wallet": map[string]any{"balance": 368}}, nil))
	if err != nil {
		t.Fatal(err)
	}
	if q.HoursBalance == nil || *q.HoursBalance != 73 {
		t.Fatalf("balance = %v, want 73 (daily 53 h must not be included)", q.HoursBalance)
	}
	m := q.Meter("Daily Hours")
	if m == nil || m.Used != 0 || m.Limit != 53 {
		t.Fatalf("Daily Hours = %+v, want 0/53", m)
	}
}

func TestExhaustedPoolAndZeroWalletAreRealZeros(t *testing.T) {
	q, err := MapQuota(200, body(t, map[string]any{"balance": 0, "daily": map[string]any{"limit": 265, "spent": 300, "remaining": 0}, "wallet": map[string]any{"balance": 0}}, nil))
	if err != nil {
		t.Fatal(err)
	}
	if q.HoursBalance == nil || *q.HoursBalance != 0 || q.Warning != "" {
		t.Fatalf("balance=%v warning=%q", q.HoursBalance, q.Warning)
	}
}

func TestOlderCombinedMeterSubtractsDailyRemainder(t *testing.T) {
	q, err := MapQuota(200, body(t, map[string]any{"balance": 633, "daily": map[string]any{"limit": 265, "spent": 5}}, nil))
	if err != nil {
		t.Fatal(err)
	}
	if q.HoursBalance == nil || *q.HoursBalance != 74 {
		t.Fatalf("balance = %v, want 74", q.HoursBalance)
	}
}

func TestNullMeterWarnsAndSuppressesLegacyCaps(t *testing.T) {
	b := []byte(`{"status":"none","freebucks":null,"freeWindows":{"dayUsed":0,"dayLimit":3}}`)
	q, err := MapQuota(200, b)
	if err != nil {
		t.Fatal(err)
	}
	if q.HoursBalance != nil || q.Meter("Daily") != nil || q.Meter("Daily Hours") != nil || q.Warning == "" {
		t.Fatalf("got %+v", q)
	}
}

func TestMalformedPresentMeterIsAnError(t *testing.T) {
	invalid := []any{"garbled", map[string]any{"balance": 633},
		map[string]any{"balance": 633, "daily": daily, "wallet": nil},
		map[string]any{"balance": 633, "daily": map[string]any{"limit": true, "spent": 0}},
		map[string]any{"balance": 633, "daily": daily, "wallet": map[string]any{"balance": -1}},
		map[string]any{"balance": 1, "daily": daily}}
	for i, bucks := range invalid {
		b := body(t, bucks, nil)
		if i == 2 { // json.Marshal drops nothing; keep an explicit null wallet
			b = []byte(`{"status":"none","freebucks":{"balance":633,"daily":{"limit":265,"spent":0,"remaining":265},"wallet":null}}`)
		}
		if _, err := MapQuota(200, b); !errors.Is(err, ErrInvalidResponse) {
			t.Errorf("case %d: err = %v, want ErrInvalidResponse", i, err)
		}
	}
}

func TestOmittedMeterHasNoBalance(t *testing.T) {
	q, err := MapQuota(200, body(t, nil, nil))
	if err != nil {
		t.Fatal(err)
	}
	if q.HoursBalance != nil || len(q.Meters) != 0 {
		t.Fatalf("got %+v", q)
	}
}

func TestNotFoundIsNoSession(t *testing.T) {
	q, err := MapQuota(404, []byte("<html>"))
	if err != nil || q.Status != "none" {
		t.Fatalf("q=%+v err=%v", q, err)
	}
}

func TestLegacyWindowsAndActiveSession(t *testing.T) {
	b := []byte(`{"status":"active","expiresAt":"2099-01-01T00:00:00Z","accessTier":"free",
		"freeWindows":{"dayUsed":1,"dayLimit":3,"weekUsed":2,"weekLimit":10}}`)
	q, err := MapQuota(200, b)
	if err != nil {
		t.Fatal(err)
	}
	if q.Meter("Daily") == nil || q.Meter("Weekly") == nil || q.Plan != "Free" {
		t.Fatalf("got %+v", q)
	}
	if len(q.ActiveSessions) != 1 {
		t.Fatalf("sessions = %v", q.ActiveSessions)
	}
}
