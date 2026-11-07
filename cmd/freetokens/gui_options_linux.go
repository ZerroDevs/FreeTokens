//go:build gui && linux && cgo

package main

import (
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

func applyPlatformOptions(o *options.App) {
	// GTK compositors honour a transparent window but not the Windows acrylic API.
	o.Linux = &linux.Options{WindowIsTranslucent: true}
}
