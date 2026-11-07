// Package icon draws the tray icon at runtime (no binary assets): a coin with a token notch.
package icon

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"math"
	"runtime"
)

// draw renders a size×size anti-aliased glyph in c. Supersampling keeps edges smooth.
func draw(size int, c color.NRGBA, warn bool) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	const ss = 4
	s := float64(size)
	cx, cy := s/2, s/2
	outer, ring := s*0.46, s*0.36
	inner := s * 0.16
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			hits := 0
			for sy := 0; sy < ss; sy++ {
				for sx := 0; sx < ss; sx++ {
					px := float64(x) + (float64(sx)+0.5)/ss - cx
					py := float64(y) + (float64(sy)+0.5)/ss - cy
					d := math.Hypot(px, py)
					on := d <= outer && d >= ring
					// Inner diamond: the "token".
					if math.Abs(px)+math.Abs(py) <= inner*1.4 {
						on = true
					}
					if warn {
						// Small dot at the top-right signals a problem.
						if math.Hypot(px-s*0.32, py+s*0.32) <= s*0.14 {
							on = true
						}
					}
					if on {
						hits++
					}
				}
			}
			if hits > 0 {
				a := uint8(int(c.A) * hits / (ss * ss))
				img.SetNRGBA(x, y, color.NRGBA{c.R, c.G, c.B, a})
			}
		}
	}
	return img
}

func pngBytes(img image.Image) []byte {
	var b bytes.Buffer
	_ = png.Encode(&b, img)
	return b.Bytes()
}

// ico wraps one PNG image in an ICO container (supported by Windows Vista and later).
func ico(pngData []byte, size int) []byte {
	var b bytes.Buffer
	dim := byte(size)
	if size >= 256 {
		dim = 0
	}
	_ = binary.Write(&b, binary.LittleEndian, []uint16{0, 1, 1})
	b.Write([]byte{dim, dim, 0, 0})
	_ = binary.Write(&b, binary.LittleEndian, []uint16{1, 32})
	_ = binary.Write(&b, binary.LittleEndian, []uint32{uint32(len(pngData)), 22})
	b.Write(pngData)
	return b.Bytes()
}

// Tray returns (template, regular) icon bytes in the format the current OS's tray expects.
// The macOS template is black-on-transparent so the menu bar can tint it.
func Tray(warn bool) (template, regular []byte) {
	switch runtime.GOOS {
	case "windows":
		r := ico(pngBytes(draw(32, color.NRGBA{0x2e, 0xb8, 0x72, 0xff}, warn)), 32)
		return r, r
	case "darwin":
		t := pngBytes(draw(44, color.NRGBA{0, 0, 0, 0xff}, warn))
		return t, pngBytes(draw(44, color.NRGBA{0x2e, 0xb8, 0x72, 0xff}, warn))
	default:
		r := pngBytes(draw(64, color.NRGBA{0x2e, 0xb8, 0x72, 0xff}, warn))
		return r, r
	}
}

// PNG returns a large colored PNG (README and packaging).
func PNG(size int) []byte { return pngBytes(draw(size, color.NRGBA{0x2e, 0xb8, 0x72, 0xff}, false)) }
