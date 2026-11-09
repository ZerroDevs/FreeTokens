//go:build gui && linux && cgo

package main

import (
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

// The Linux popover is drawn as one opaque card.
//
// A translucent window looked broken in practice: xfwm4 here owns _NET_WM_CM_S0 and the
// window really is ARGB (depth 32), yet WebKitGTK still paints an opaque black backdrop
// behind the page — with software rendering and with the GPU policy, on both the software
// and compositing paths. The margin around the rounded shell therefore rendered as a black
// rectangle. Filling the window with the shell colour and squaring the corners (styles.css,
// the opaqueWindow preference) looks the same on every desktop and needs no compositor.
func applyPlatformOptions(o *options.App) {
	windowOpaque = true
	o.Linux = &linux.Options{
		WindowIsTranslucent: false,
		// Software rendering sidesteps the blank or flickering WebKit views Linux desktops
		// report with GPU acceleration (wails#2977).
		WebviewGpuPolicy: linux.WebviewGpuPolicyNever,
	}
	// Backing colour for the frame before the page paints, and for any gap it leaves.
	o.BackgroundColour = &options.RGBA{R: 0x16, G: 0x15, B: 0x12, A: 0xff}
}
