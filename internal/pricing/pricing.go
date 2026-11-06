package pricing

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"
)

// Snapshot is an immutable pricing view used for one accounting pass.
type Snapshot struct {
	Supplement *Supplement
	OpenRouter map[string]Rates
	token      string
}

// NewSnapshot builds a snapshot and its content token.
func NewSnapshot(s *Supplement, openRouter map[string]Rates) *Snapshot {
	if s == nil {
		s = &Supplement{Pricing: map[string]Rates{}}
	}
	if openRouter == nil {
		openRouter = map[string]Rates{}
	}
	var b strings.Builder
	b.WriteString("pricing-v1\n")
	s.fingerprint(&b)
	keys := make([]string, 0, len(openRouter))
	for k := range openRouter {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		r, _ := json.Marshal(openRouter[k])
		b.WriteString("or:" + k + string(r) + "\n")
	}
	sum := sha256.Sum256([]byte(b.String()))
	return &Snapshot{Supplement: s, OpenRouter: openRouter, token: hex.EncodeToString(sum[:])}
}

// Token changes only when prices or aliases change.
func (p *Snapshot) Token() string { return p.token }

// HasExactRoute reports whether model is itself an OpenRouter or supplement key.
func (p *Snapshot) HasExactRoute(model string) bool {
	_, a := p.OpenRouter[model]
	_, b := p.Supplement.Pricing[model]
	return a || b
}

// NormalizedKey replaces '.', '@', '_' and ' ' with '-'.
func NormalizedKey(v string) string {
	return strings.NewReplacer(".", "-", "@", "-", " ", "-", "_", "-").Replace(v)
}

func (p *Snapshot) lookup(name string) (Rates, bool) {
	if r, ok := p.Supplement.Pricing[name]; ok {
		return r, true
	}
	if r, ok := p.OpenRouter[name]; ok {
		return r, true
	}
	if n := NormalizedKey(name); n != name {
		if r, ok := p.Supplement.Pricing[n]; ok {
			return r, true
		}
		if r, ok := p.OpenRouter[n]; ok {
			return r, true
		}
	}
	return Rates{}, false
}

// Resolve follows QuotaBar's order for exact routes: a supplement alias's canonical key first,
// then the raw name; supplement before OpenRouter.
func (p *Snapshot) Resolve(model string) (Rates, bool) {
	if canonical, ok := p.Supplement.CanonicalName(model); ok && canonical != model {
		if r, ok := p.lookup(canonical); ok {
			return r, true
		}
	}
	return p.lookup(model)
}
