package update

import (
	"testing"

	"github.com/creativeprojects/go-selfupdate"
)

type fakeAsset struct{ name string }

func (f fakeAsset) GetID() int64                  { return 0 }
func (f fakeAsset) GetName() string               { return f.name }
func (f fakeAsset) GetSize() int                  { return 0 }
func (f fakeAsset) GetBrowserDownloadURL() string { return "https://example.invalid/" + f.name }

func TestPickAppImage(t *testing.T) {
	assets := []selfupdate.SourceAsset{
		fakeAsset{"freetokens_1.2.3_linux_amd64.tar.gz"},
		fakeAsset{"FreeTokens-1.2.3-aarch64.AppImage"},
		fakeAsset{"FreeTokens-1.2.3-x86_64.AppImage"},
	}

	// The archive and the other architecture's image must never be picked.
	got := pickAppImage(assets, "x86_64")
	if got == nil || got.GetName() != "FreeTokens-1.2.3-x86_64.AppImage" {
		t.Fatalf("pickAppImage(x86_64) = %v", got)
	}
	if got := pickAppImage(assets, "i686"); got != nil {
		t.Fatalf("pickAppImage(i686) picked %q", got.GetName())
	}
	if got := pickAppImage(nil, "x86_64"); got != nil {
		t.Fatalf("pickAppImage(no assets) picked %q", got.GetName())
	}
}

func TestAppImageArch(t *testing.T) {
	for goarch, want := range map[string]string{
		"amd64":   "x86_64",
		"arm64":   "aarch64",
		"386":     "i686",
		"arm":     "armhf",
		"riscv64": "riscv64",
	} {
		if got := AppImageArch(goarch); got != want {
			t.Errorf("AppImageArch(%q) = %q, want %q", goarch, got, want)
		}
	}
}
