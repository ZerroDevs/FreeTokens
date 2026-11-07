//go:build gui && !windows && cgo && (darwin || linux)

package main

import "context"

func windowPosition(ctx context.Context) (int, int) { return topRight(ctx) }
