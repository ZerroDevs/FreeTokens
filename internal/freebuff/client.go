package freebuff

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// The bare host redirects to www and Go, like URLSession, drops Authorization across a host change.
const (
	SessionURL      = "https://www.codebuff.com/api/v1/freebuff/session"
	ModelCatalogURL = "https://www.codebuff.com/api/v1/freebuff/models"
	HistoryBaseURL  = "https://www.codebuff.com/api/v1/cloud/history/"
	DashboardURL    = "https://codebuff.com/account"
)

// Response is a raw HTTP result.
type Response struct {
	Status int
	Body   []byte
}

// Client performs read-only GETs against Freebuff's API.
type Client struct {
	HTTP      *http.Client
	TimeZone  func() string
	UserAgent string
	// BaseOverride rewrites https://www.codebuff.com for tests.
	BaseOverride string
}

// NewClient returns a client with a 15s timeout that refuses redirects (so a redirect can never
// strip the login header and make a fresh token look expired).
func NewClient(userAgent string, tz func() string) *Client {
	return &Client{
		HTTP: &http.Client{
			Timeout:       15 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
		TimeZone:  tz,
		UserAgent: userAgent,
	}
}

// FetchSession is the read-only GET poll. The POST route admits a session and is never used.
func (c *Client) FetchSession(ctx context.Context, a Auth) (Response, error) {
	return c.get(ctx, SessionURL, a, map[string]string{"x-freebuff-multi-session": "1"})
}

// FetchModelCatalog reads public model identities.
func (c *Client) FetchModelCatalog(ctx context.Context, a Auth) (Response, error) {
	return c.get(ctx, ModelCatalogURL, a, map[string]string{"x-freebuff-catalog-protocol": "1"})
}

// FetchHistory reads one page of the shared hosted history (also backs Desktop's On This Device mode).
func (c *Client) FetchHistory(ctx context.Context, path, cursor string, a Auth) (Response, error) {
	q := url.Values{}
	if strings.HasSuffix(path, "/events") {
		q.Set("limit", "500")
	} else {
		q.Set("limit", "100")
	}
	if cursor != "" {
		q.Set("cursor", cursor)
	}
	return c.get(ctx, HistoryBaseURL+path+"?"+q.Encode(), a, map[string]string{"x-freebuff-device-chats": "1"})
}

func (c *Client) get(ctx context.Context, rawURL string, a Auth, extra map[string]string) (Response, error) {
	if c.BaseOverride != "" {
		rawURL = strings.Replace(rawURL, "https://www.codebuff.com", c.BaseOverride, 1)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return Response{}, ErrInvalidResponse
	}
	req.Header.Set("Authorization", "Bearer "+a.Token)
	req.Header.Set("Accept", "application/json")
	if c.TimeZone != nil {
		req.Header.Set("x-fb-timezone", c.TimeZone())
	}
	if c.UserAgent != "" {
		req.Header.Set("User-Agent", c.UserAgent)
	}
	for k, v := range extra {
		req.Header.Set(k, v)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		if errors.Is(err, context.Canceled) || ctx.Err() != nil {
			return Response{}, context.Canceled
		}
		return Response{}, ErrConnection
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return Response{}, ErrConnection
	}
	return Response{Status: resp.StatusCode, Body: body}, nil
}
