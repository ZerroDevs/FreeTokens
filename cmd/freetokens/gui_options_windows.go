//go:build gui && windows

package main

import (
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

// The popover keeps a translucent window so the rounded CSS shell floats on the desktop, but no
// system backdrop: acrylic blurs the whole desktop behind the window, which reads as a halo of
// smeared colour around the panel and washes out the rows nearest its edges.
func applyPlatformOptions(o *options.App) {
	o.Windows = &windows.Options{
		WebviewIsTransparent: true,
		WindowIsTranslucent:  true,
		BackdropType:         windows.None,
		Theme:                windows.Dark,
	}
}
