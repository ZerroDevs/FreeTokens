package update

import "testing"

// A skip stores a normalized version, but release tags and config values can both carry a leading
// "v", so the comparison has to normalize and must not treat an empty skip as a match.
func TestIsSkipped(t *testing.T) {
	for _, tc := range []struct {
		name    string
		latest  string
		skipped string
		want    bool
	}{
		{name: "same release", latest: "0.2.0", skipped: "0.2.0", want: true},
		{name: "tag has a v", latest: "v0.2.0", skipped: "0.2.0", want: true},
		{name: "skip has a v", latest: "0.2.0", skipped: "v0.2.0", want: true},
		{name: "newer release", latest: "0.3.0", skipped: "0.2.0", want: false},
		{name: "nothing skipped", latest: "0.2.0", skipped: "", want: false},
		{name: "no release found", latest: "", skipped: "0.2.0", want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsSkipped(tc.latest, tc.skipped); got != tc.want {
				t.Fatalf("IsSkipped(%q, %q) = %v, want %v", tc.latest, tc.skipped, got, tc.want)
			}
		})
	}
}
