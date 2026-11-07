//go:build gui && darwin && cgo

package main

import (
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

func applyPlatformOptions(o *options.App) {
	o.Mac = &mac.Options{
		WebviewIsTransparent: true,
		WindowIsTranslucent:  true,
		Appearance:           mac.NSAppearanceNameDarkAqua,
	}
}
