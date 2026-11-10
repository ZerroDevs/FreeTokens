//go:build gui && (windows || (linux && cgo))

package main

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"log"
	"math"
	"os"
	goruntime "runtime"
	"sync"
	"time"

	"fyne.io/systray"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/tverma101/FreeTokens/internal/autostart"
	"github.com/tverma101/FreeTokens/internal/browser"
	"github.com/tverma101/FreeTokens/internal/config"
	"github.com/tverma101/FreeTokens/internal/freebuff"
	"github.com/tverma101/FreeTokens/internal/icon"
	"github.com/tverma101/FreeTokens/internal/notify"
	"github.com/tverma101/FreeTokens/internal/tracker"
	"github.com/tverma101/FreeTokens/internal/update"
	"github.com/tverma101/FreeTokens/internal/usage"
	"github.com/tverma101/FreeTokens/internal/view"
)

//go:embed all:web/dist
var assets embed.FS

// hasPopover reports whether this build embeds the Wails popover instead of only the tray menu.
const hasPopover = true

// windowOpaque is set by a platform that cannot composite the transparent margin around the
// panel shell, so the frontend fills the window instead.
var windowOpaque bool

const (
	windowWidth  = 380
	windowHeight = 560
	// hideDelay lets a tray click cancel the blur that the click itself causes.
	hideDelay = 220 * time.Millisecond
	// showRefreshAge is how stale the snapshot may be before opening the popover refreshes it.
	// Opening is when the numbers have to be current; re-opening shouldn't hammer the API.
	showRefreshAge = 20 * time.Second
	// trayMenuSuppression keeps a tray menu click from closing the popover: that click steals focus,
	// which the frontend reports as a click away.
	trayMenuSuppression = 2 * time.Second
)

func runGUIUI(t *tracker.Tracker, cfg *config.Store) {
	a := &App{tracker: t, cfg: cfg, version: version, wake: make(chan struct{}, 1), notifier: notify.New()}
	opts := &options.App{
		Title:            "FreeTokens",
		Width:            windowWidth,
		Height:           windowHeight,
		Frameless:        true,
		DisableResize:    true,
		AlwaysOnTop:      true,
		StartHidden:      true,
		BackgroundColour: &options.RGBA{R: 0, G: 0, B: 0, A: 0},
		AssetServer:      &assetserver.Options{Assets: assets},
		OnStartup:        a.startup,
		OnDomReady:       a.domReady,
		OnBeforeClose:    a.beforeClose,
		OnShutdown:       a.shutdown,
		Bind:             []interface{}{a},
	}
	applyPlatformOptions(opts)
	// macOS owns one AppKit event loop and Wails runs it on the main thread. systray.Run would
	// start a second [NSApp run] from a background goroutine, so on macOS the tray joins Wails'
	// loop and its menu bar item is created in domReady, on the main thread.
	if goruntime.GOOS == "darwin" {
		a.startTray, _ = systray.RunWithExternalLoop(a.trayReady, nil)
	}
	if err := wails.Run(opts); err != nil {
		log.Printf("gui: %v", err)
		fmt.Fprintln(os.Stderr, "FreeTokens:", err)
	}
}

// App is the Wails bridge. The tracker serializes refreshes; this type serializes the
// snapshot that the frontend reads and the window state that the tray toggles.
type App struct {
	ctx      context.Context
	tracker  *tracker.Tracker
	cfg      *config.Store
	version  string
	notifier *notify.Notifier

	mu          sync.Mutex
	snap        *tracker.Snapshot
	refreshing  bool
	visible     bool
	quitting    bool
	hideTimer   *time.Timer
	showItem    *systray.MenuItem
	historyItem *systray.MenuItem
	wake        chan struct{}

	lastRefresh      time.Time
	trayWarn         bool
	suppressHideTill time.Time

	// startTray creates the native tray on platforms where it can't own the event loop.
	startTray func()
	trayOnce  sync.Once
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if a.startTray == nil {
		go a.tray()
	}
	go a.refreshLoop()
	go a.refresh(false)
}

// domReady places the hidden popover before the first paint, so it never flashes
// in the middle of the screen.
func (a *App) domReady(ctx context.Context) {
	// macOS: the tray joins this AppKit loop, so it is added here on the main thread.
	a.trayOnce.Do(func() {
		if a.startTray != nil {
			a.startTray()
		}
	})
	x, y := windowPosition(ctx)
	runtime.WindowSetPosition(ctx, x, y)
	// Keep the popover hidden on startup (including auto-start at login).
	// Only an explicit tray action should show the window.
}

func (a *App) shutdown(context.Context) {
	systray.Quit()
}

// beforeClose keeps the process in the tray instead of ending it.
func (a *App) beforeClose(context.Context) bool {
	a.mu.Lock()
	quitting := a.quitting
	a.mu.Unlock()
	if quitting {
		return false
	}
	a.hide()
	return true
}

func (a *App) tray() {
	systray.Run(a.trayReady, func() {})
}

// trayReady builds the tray menu once the platform has created the icon.
func (a *App) trayReady() {
	t, r := icon.Tray(false)
	systray.SetTemplateIcon(t, r)
	systray.SetTooltip("FreeTokens")
	systray.SetOnTapped(a.ToggleWindow)

	a.showItem = systray.AddMenuItem("Show FreeTokens", "Open the usage popover")
	refresh := systray.AddMenuItem("Refresh Now", "Refresh now (may ask for keychain access)")
	dashboard := systray.AddMenuItem("Open Freebuff Account", freebuff.DashboardURL)
	// The strip is off by default, so the popover leads with the selected period until asked for more.
	history := systray.AddMenuItemCheckbox("Usage History", "Show the 14-day strip in the popover", a.cfg.Load().ShowHistory)
	a.mu.Lock()
	a.historyItem = history
	a.mu.Unlock()
	settings := systray.AddMenuItem("Settings", "Refresh interval and login item")
	systray.AddSeparator()
	quit := systray.AddMenuItem(guiQuitLabel(), "")

	go func() {
		for {
			select {
			case <-a.showItem.ClickedCh:
				a.ToggleWindow()
			case <-refresh.ClickedCh:
				// Without this the menu click's blur reads as a click away and hides the panel the
				// refresh was meant to update.
				a.suppressHide()
				go a.refresh(true)
			case <-dashboard.ClickedCh:
				_ = browser.Open(freebuff.DashboardURL)
			case <-history.ClickedCh:
				a.toggleShowHistory()
			case <-settings.ClickedCh:
				a.openSettings()
			case <-quit.ClickedCh:
				a.Quit()
				return
			}
		}
	}()
}

func (a *App) refreshLoop() {
	for {
		minutes := a.cfg.Load().RefreshMinutes
		select {
		case <-time.After(time.Duration(minutes) * time.Minute):
		case <-a.wake:
		}
		a.mu.Lock()
		quitting := a.quitting
		a.mu.Unlock()
		if quitting {
			return
		}
		a.refresh(false)
	}
}

func (a *App) refresh(interactive bool) *tracker.Snapshot {
	a.mu.Lock()
	if a.refreshing {
		snap := a.snap
		a.mu.Unlock()
		return snap
	}
	a.refreshing = true
	ctx := a.ctx
	a.mu.Unlock()

	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	snap := a.tracker.Refresh(ctx, interactive)
	cancel()

	a.mu.Lock()
	a.snap = snap
	a.lastRefresh = time.Now()
	a.refreshing = false
	ctx = a.ctx
	a.mu.Unlock()
	if ctx != nil {
		runtime.EventsEmit(ctx, "snapshot", snap)
	}
	a.updateTray(snap)
	a.notifier.Check(snap.Quota, time.Now())
	return snap
}

func guiQuitLabel() string {
	if goruntime.GOOS == "windows" {
		return "Exit FreeTokens"
	}
	return "Quit FreeTokens"
}

func (a *App) updateTray(snap *tracker.Snapshot) {
	if snap == nil || a.showItem == nil {
		return
	}
	cfg := a.cfg.Load()
	title, line := view.TrayTitle(snap, cfg.TrayTitle, cfg.ShowTimers, time.Now())
	if line == "" {
		line = "FreeTokens"
	}
	// The menu bar title only draws on macOS; the tooltip carries the same figure elsewhere.
	systray.SetTitle(title)
	systray.SetTooltip(line)
	a.setTrayWarn(trayNeedsAttention(snap))
}

// setTrayWarn redraws the tray glyph only when the state flips.
func (a *App) setTrayWarn(warn bool) {
	a.mu.Lock()
	if a.trayWarn == warn {
		a.mu.Unlock()
		return
	}
	a.trayWarn = warn
	a.mu.Unlock()
	t, r := icon.Tray(warn)
	systray.SetTemplateIcon(t, r)
}

func max0(v float64) float64 {
	if v < 0 {
		return 0
	}
	return v
}

// GetSnapshot returns the latest refresh, or nil while the first one is running.
func (a *App) GetSnapshot() *tracker.Snapshot {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.snap
}

// RefreshNow runs a manual refresh. A manual refresh may show a keychain prompt.
func (a *App) RefreshNow() *tracker.Snapshot { return a.refresh(true) }

func (a *App) OpenDashboard() error { return browser.Open(freebuff.DashboardURL) }

// Preferences holds the settings the popover exposes.
type Preferences struct {
	RefreshMinutes int     `json:"refreshMinutes"`
	StartAtLogin   bool    `json:"startAtLogin"`
	Theme          string  `json:"theme"`
	ShowTimers     bool    `json:"showTimers"`
	ShowHistory    bool    `json:"showHistory"`
	BudgetUSD      float64 `json:"budgetUsd"`
	TrayTitle      string  `json:"trayTitle"`
	ShowProjects   bool    `json:"showProjects"`
	AutoUpdate     string  `json:"autoUpdate"`
	Version        string  `json:"version"`
	Platform       string  `json:"platform"`
	// OpaqueWindow is true when the window has no transparent margin to blend (no compositor).
	OpaqueWindow bool `json:"opaqueWindow"`
}

func (a *App) GetPreferences() Preferences {
	cfg := a.cfg.Load()
	return Preferences{
		RefreshMinutes: cfg.RefreshMinutes,
		StartAtLogin:   autostart.Enabled(),
		Theme:          cfg.Theme,
		ShowTimers:     cfg.ShowTimers,
		ShowHistory:    cfg.ShowHistory,
		BudgetUSD:      cfg.BudgetUSD,
		TrayTitle:      cfg.TrayTitle,
		ShowProjects:   cfg.ShowProjects,
		AutoUpdate:     cfg.AutoUpdate,
		Version:        a.version,
		Platform:       goruntime.GOOS,
		OpaqueWindow:   windowOpaque,
	}
}

func (a *App) SaveRefreshMinutes(minutes int) error {
	if minutes < 1 || minutes > 24*60 {
		return errors.New("refresh interval must be between 1 and 1440 minutes")
	}
	_, err := a.cfg.Update(func(c *config.Config) { c.RefreshMinutes = minutes })
	if err != nil {
		return err
	}
	select {
	case a.wake <- struct{}{}:
	default:
	}
	return nil
}

// SetTheme saves the panel theme so it survives restarts. The frontend applies it immediately;
// nothing here redraws the window.
func (a *App) SetTheme(theme string) error {
	switch theme {
	case config.ThemeDark, config.ThemeLight, config.ThemeSystem:
	default:
		return errors.New("theme must be dark, light or system")
	}
	_, err := a.cfg.Update(func(c *config.Config) { c.Theme = theme })
	return err
}

// SetShowTimers saves whether session countdowns appear in the hours card. It is the same setting
// the classic tray's menu bar timer uses, so both stay in step.
func (a *App) SetShowTimers(on bool) error {
	_, err := a.cfg.Update(func(c *config.Config) { c.ShowTimers = on })
	return err
}

// SetBudgetUSD saves the spending ceiling the popover measures the last 30 days against. Zero
// turns the budget line off.
func (a *App) SetBudgetUSD(usd float64) error {
	if math.IsNaN(usd) || math.IsInf(usd, 0) || usd < 0 {
		return errors.New("budget must be a non-negative amount")
	}
	_, err := a.cfg.Update(func(c *config.Config) { c.BudgetUSD = usd })
	return err
}

// SetTrayTitle saves what the menu bar or tray tooltip shows. The classic tray's menu writes the
// same setting through its own checkboxes.
func (a *App) SetTrayTitle(choice string) error {
	switch choice {
	case config.TraySession, config.TrayHours, config.TrayTokens, config.TrayCost, config.TrayNone:
	default:
		return errors.New("tray title must be session, hours, tokens, cost or none")
	}
	if _, err := a.cfg.Update(func(c *config.Config) { c.TrayTitle = choice }); err != nil {
		return err
	}
	if snap := a.GetSnapshot(); snap != nil {
		a.updateTray(snap)
	}
	return nil
}

// SetShowProjects reveals the project grouping in the popover. It changes no measured data.
func (a *App) SetShowProjects(on bool) error {
	_, err := a.cfg.Update(func(c *config.Config) { c.ShowProjects = on })
	return err
}

// ExportCSV returns the retained daily rollups as CSV for the copy button.
func (a *App) ExportCSV() (string, error) {
	snap := a.GetSnapshot()
	if snap == nil {
		return "", errors.New("no usage has been read yet")
	}
	return usage.CSV(snap.Days), nil
}

// SetShowHistory saves whether the popover shows the 14-day strip. The tray menu writes the same
// setting, and whichever surface saves it tells the other one.
func (a *App) SetShowHistory(on bool) error {
	if _, err := a.cfg.Update(func(c *config.Config) { c.ShowHistory = on }); err != nil {
		return err
	}
	a.syncHistoryItem(on)
	return nil
}

// syncHistoryItem keeps the tray checkbox in step with the popover and asks an open popover to
// re-read its preferences.
func (a *App) syncHistoryItem(on bool) {
	a.mu.Lock()
	item := a.historyItem
	ctx := a.ctx
	a.mu.Unlock()
	if item != nil {
		if on {
			item.Check()
		} else {
			item.Uncheck()
		}
	}
	if ctx != nil {
		runtime.EventsEmit(ctx, "prefs")
	}
}

// toggleShowHistory flips the strip from the tray menu, where the item cannot report its own state
// until the click is processed.
func (a *App) toggleShowHistory() {
	on := !a.cfg.Load().ShowHistory
	if _, err := a.cfg.Update(func(c *config.Config) { c.ShowHistory = on }); err != nil {
		log.Printf("prefs: %v", err)
		return
	}
	a.syncHistoryItem(on)
}

func (a *App) SetStartAtLogin(on bool) error {
	if !on {
		return autostart.Disable()
	}
	entry, err := autostart.TrayEntry()
	if err != nil {
		return err
	}
	// Go's build cache is not a place a login item can point at; EnableFor refuses it rather than
	// registering a path that disappears at the next build.
	return autostart.EnableFor(entry)
}

// SetAutoUpdate saves the release-check policy the classic tray menu also edits.
func (a *App) SetAutoUpdate(policy string) error {
	switch policy {
	case config.UpdateOff, config.UpdateNotify, config.UpdateAuto:
	default:
		return errors.New("automatic updates must be off, notify or auto")
	}
	_, err := a.cfg.Update(func(c *config.Config) { c.AutoUpdate = policy })
	return err
}

// SetSkippedVersion stops announcements for one release. An empty version clears the skip, which
// is what the release line offers once a version has been skipped.
func (a *App) SetSkippedVersion(version string) error {
	_, err := a.cfg.Update(func(c *config.Config) { c.SkippedVersion = update.Normalize(version) })
	return err
}

// StatusText returns the report `freetokens status` prints, so the settings panel can copy it
// into a bug report without the user hunting for the command.
func (a *App) StatusText() (string, error) {
	a.mu.Lock()
	snap := a.snap
	a.mu.Unlock()
	if snap == nil {
		return "", errors.New("usage has not loaded yet")
	}
	return view.Text(snap, time.Now()), nil
}

// UpdateStatus is the result of a manual release check.
type UpdateStatus struct {
	Current   string `json:"current"`
	Latest    string `json:"latest"`
	Available bool   `json:"available"`
	DevBuild  bool   `json:"devBuild"`
	// Skipped is true when the latest release is the one the user asked not to hear about.
	Skipped bool `json:"skipped"`
	// Notes is the release body, so the settings panel can show what changed before linking out.
	Notes string `json:"notes,omitempty"`
	URL   string `json:"url,omitempty"`
}

func (a *App) CheckForUpdates() (*UpdateStatus, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	info, err := update.Check(ctx, a.version)
	if err != nil {
		return nil, err
	}
	skipped := update.IsSkipped(info.Latest, a.cfg.Load().SkippedVersion)
	return &UpdateStatus{
		Current:   info.Current,
		Latest:    info.Latest,
		Available: info.Available && !skipped,
		DevBuild:  !update.IsRelease(a.version),
		Skipped:   skipped,
		Notes:     info.Notes,
		URL:       info.URL,
	}, nil
}

func (a *App) OpenReleases() error {
	return browser.Open("https://github.com/" + update.Repo + "/releases")
}

// ToggleWindow opens the popover next to the tray icon, or closes it if it is open.
func (a *App) ToggleWindow() {
	a.mu.Lock()
	if a.hideTimer != nil {
		a.hideTimer.Stop()
		a.hideTimer = nil
	}
	visible := a.visible
	a.visible = !visible
	ctx := a.ctx
	a.mu.Unlock()
	a.syncShowItem(!visible)
	if ctx == nil {
		return
	}
	if visible {
		runtime.WindowHide(ctx)
		return
	}
	x, y := windowPosition(ctx)
	runtime.WindowSetPosition(ctx, x, y)
	runtime.WindowShow(ctx)
	runtime.WindowSetAlwaysOnTop(ctx, true)
	// A login or a finished turn may have landed since the scheduled refresh.
	a.refreshOnShow()
}

// refreshOnShow refreshes a snapshot older than showRefreshAge without blocking the window.
func (a *App) refreshOnShow() {
	a.mu.Lock()
	stale := a.snap == nil || time.Since(a.lastRefresh) > showRefreshAge
	a.mu.Unlock()
	if stale {
		go a.refresh(false)
	}
}

// suppressHide ignores the blur that a tray menu click causes.
func (a *App) suppressHide() {
	a.mu.Lock()
	a.suppressHideTill = time.Now().Add(trayMenuSuppression)
	a.mu.Unlock()
}

// RequestHide hides after a short delay so a tray click can cancel it.
func (a *App) RequestHide() {
	a.mu.Lock()
	if time.Now().Before(a.suppressHideTill) {
		a.mu.Unlock()
		return
	}
	if a.hideTimer != nil {
		a.hideTimer.Stop()
	}
	a.hideTimer = time.AfterFunc(hideDelay, func() {
		a.mu.Lock()
		a.hideTimer = nil
		a.mu.Unlock()
		a.hide()
	})
	a.mu.Unlock()
}

func (a *App) HideWindow() { a.hide() }

func (a *App) hide() {
	a.mu.Lock()
	if a.hideTimer != nil {
		a.hideTimer.Stop()
		a.hideTimer = nil
	}
	a.visible = false
	ctx := a.ctx
	a.mu.Unlock()
	a.syncShowItem(false)
	if ctx != nil {
		runtime.WindowHide(ctx)
	}
}

func (a *App) setVisible(v bool) {
	a.mu.Lock()
	a.visible = v
	a.mu.Unlock()
	a.syncShowItem(v)
}

func (a *App) syncShowItem(visible bool) {
	if a.showItem == nil {
		return
	}
	if visible {
		a.showItem.SetTitle("Hide FreeTokens")
	} else {
		a.showItem.SetTitle("Show FreeTokens")
	}
}

func (a *App) openSettings() {
	a.showWindow()
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "open-settings")
	}
}

func (a *App) showWindow() {
	a.mu.Lock()
	if a.hideTimer != nil {
		a.hideTimer.Stop()
		a.hideTimer = nil
	}
	a.visible = true
	ctx := a.ctx
	a.mu.Unlock()
	a.syncShowItem(true)
	if ctx == nil {
		return
	}
	x, y := windowPosition(ctx)
	runtime.WindowSetPosition(ctx, x, y)
	runtime.WindowShow(ctx)
	runtime.WindowSetAlwaysOnTop(ctx, true)
	// A login or a finished turn may have landed since the scheduled refresh.
	a.refreshOnShow()
}

// Quit ends the process from either the popover or the tray.
func (a *App) Quit() {
	a.mu.Lock()
	a.quitting = true
	ctx := a.ctx
	a.mu.Unlock()
	systray.Quit()
	if ctx != nil {
		runtime.Quit(ctx)
	}
}
