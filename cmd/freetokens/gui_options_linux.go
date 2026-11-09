//go:build gui && linux && cgo

package main

/*
#cgo LDFLAGS: -lX11
#include <X11/Xlib.h>

// X11 only shows what is behind a translucent window when a compositing manager owns the
// _NET_WM_CM_S0 selection. Without one the transparent margin around the rounded shell paints
// black, which looks like a broken window rather than a popover.
static int hasCompositor(void) {
	Display *d = XOpenDisplay(NULL);
	if (d == NULL) {
		// No X connection: a Wayland session always composites.
		return 1;
	}
	Atom sel = XInternAtom(d, "_NET_WM_CM_S0", False);
	int owned = 0;
	if (sel != None) {
		owned = XGetSelectionOwner(d, sel) != None;
	}
	XCloseDisplay(d);
	return owned;
}
*/
import "C"

import (
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

func applyPlatformOptions(o *options.App) {
	// GTK compositors honour a transparent window but not the Windows acrylic API. The panel is
	// small and static, so software rendering costs nothing and sidesteps the blank or flickering
	// WebKit views Linux desktops report with GPU acceleration; it is also what Wails picks when
	// Linux options are absent (wails#2977).
	composited := C.hasCompositor() != 0
	windowOpaque = !composited
	o.Linux = &linux.Options{
		WindowIsTranslucent: composited,
		WebviewGpuPolicy:    linux.WebviewGpuPolicyNever,
	}
	if !composited {
		// Square off the shell instead: the window is the panel, edge to edge, in the shell colour.
		o.BackgroundColour = &options.RGBA{R: 0x16, G: 0x15, B: 0x12, A: 0xff}
	}
}
