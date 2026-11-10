package usage

import "time"

// Slot is one local hour-of-week bucket: Sunday 00:00 first, Saturday 23:00 last.
type Slot struct {
	Tokens       int64    `json:"tokens"`
	CostUSD      *float64 `json:"costUsd,omitempty"`
	CostComplete bool     `json:"costComplete"`
}

// Slots is the measured usage of the retained window by local weekday and hour.
type Slots [168]Slot

// BuildSlots folds the day rollups into the hour-of-week view. A day without hour detail adds
// nothing, so a source that never dated its turns can't invent a time for them.
func BuildSlots(days []Day) *Slots {
	var slots Slots
	for i := range slots {
		slots[i].CostComplete = true
	}
	any := false
	for _, day := range days {
		if len(day.Hours) == 0 {
			continue
		}
		at, err := time.ParseInLocation("2006-01-02", day.Date, time.Local)
		if err != nil {
			continue
		}
		weekday := int(at.Weekday())
		for _, hour := range day.Hours {
			if hour.Hour < 0 || hour.Hour > 23 {
				continue
			}
			slot := &slots[weekday*24+hour.Hour]
			slot.Tokens = satAdd(slot.Tokens, hour.Tokens)
			if hour.CostUSD != nil {
				slot.CostUSD = addCost(slot.CostUSD, hour.CostUSD)
			} else if hour.Tokens > 0 {
				slot.CostComplete = false
			}
			any = true
		}
	}
	if !any {
		return nil
	}
	return &slots
}
