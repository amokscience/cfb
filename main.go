package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

var apiKey string
var redisService *RedisService

func main() {
	// Load .env (if present) so environment variables like CFBD_API_KEY are available.
	loadDotEnv()
	apiKey = os.Getenv("CFBD_API_KEY")

	// Initialize Redis service
	var err error
	redisService, err = NewRedisService()
	if err != nil {
		log.Printf("Warning: Redis connection failed: %v. Caching will be disabled.", err)
		redisService = nil
	} else {
		defer redisService.Close()
		log.Printf("Redis connected successfully")
	}

	// Preload teams into cache on startup
	if redisService != nil {
		if err := preloadTeamsCache(); err != nil {
			log.Printf("Warning: Failed to preload teams cache: %v", err)
		}

		// Preload rankings for all years from 1900 to current year
		if err := preloadRankingsCache(); err != nil {
			log.Printf("Warning: Failed to preload rankings cache: %v", err)
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/teams", teamsHandler)
	mux.HandleFunc("/api/rankings", rankingsHandler)
	mux.HandleFunc("/api/games", gamesHandler)
	// Serve static assets from React build output
	mux.Handle("/assets/", http.FileServer(http.Dir("frontend/dist")))
	// Serve index.html for all other routes (SPA fallback)
	mux.HandleFunc("/", spaHandler)

	port := os.Getenv("HTTP_PORT")
	if port == "" {
		port = "8080"
	}
	addr := fmt.Sprintf(":%s", port)
	log.Printf("Listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func spaHandler(w http.ResponseWriter, r *http.Request) {
	// Serve index.html for all routes (React Router handles client-side routing)
	data, err := ioutil.ReadFile("frontend/dist/index.html")
	if err != nil {
		http.Error(w, "index.html not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/html")
	w.Write(data)
}

// gamesHandler proxies requests to the College Football Data API `/games` endpoint.
func gamesHandler(w http.ResponseWriter, r *http.Request) {
	year := r.URL.Query().Get("year")
	if year == "" {
		year = fmt.Sprintf("%d", time.Now().Year())
	}
	team := r.URL.Query().Get("team")

	ctx := context.Background()

	// If a team is provided, attempt to serve from Redis cache first.
	var cacheKey string
	if team != "" && redisService != nil {
		// Normalize team into key-friendly string: uppercase and replace spaces with underscores
		keyTeam := strings.ToUpper(strings.ReplaceAll(team, " ", "_"))
		cacheKey = fmt.Sprintf("%s:%s", keyTeam, year)
		if exists, err := redisService.Exists(ctx, cacheKey); err == nil && exists {
			log.Printf("Redis key found: %s", cacheKey)
			var cached interface{}
			if err := redisService.Get(ctx, cacheKey, &cached); err == nil {
				w.Header().Set("Content-Type", "application/json")
				enc := json.NewEncoder(w)
				enc.SetIndent("", "  ")
				if err := enc.Encode(cached); err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
				}
				return
			}
			// If Get failed, fall through to fetch from API.
		}
	}

	apiURL := fmt.Sprintf("https://api.collegefootballdata.com/games?year=%s", year)
	if team != "" {
		apiURL += fmt.Sprintf("&team=%s", url.QueryEscape(team))
	}
	log.Printf("GET %s", apiURL)
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// If we have a cache key (team was provided) and Redis is available, store the response
	if cacheKey != "" && redisService != nil {
		var parsed interface{}
		if err := json.Unmarshal(body, &parsed); err == nil {
			if err := redisService.SetWithExpiration(ctx, cacheKey, parsed, 365*24*time.Hour); err != nil {
				log.Printf("Warning: Failed to cache games in Redis: %v", err)
			} else {
				log.Printf("Redis key written: %s", cacheKey)
			}
		} else {
			// As a fallback, store raw JSON string
			if err := redisService.SetWithExpiration(ctx, cacheKey, string(body), 365*24*time.Hour); err != nil {
				log.Printf("Warning: Failed to cache raw games JSON in Redis: %v", err)
			} else {
				log.Printf("Redis key written: %s", cacheKey)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(body)
}

// teamsHandler proxies requests to the College Football Data API `/teams` endpoint.
// Uses Redis cache if available to avoid API calls.
func teamsHandler(w http.ResponseWriter, r *http.Request) {
	year := r.URL.Query().Get("year")
	if year == "" {
		year = fmt.Sprintf("%d", time.Now().Year())
	}

	ctx := context.Background()

	// Try to get from Redis cache first
	if redisService != nil {
		exists, err := redisService.Exists(ctx, "CFB_TEAMS")
		if err == nil && exists {
			log.Printf("Redis key found: CFB_TEAMS")
			var teams []map[string]interface{}
			if err := redisService.Get(ctx, "CFB_TEAMS", &teams); err == nil {
				w.Header().Set("Content-Type", "application/json")
				enc := json.NewEncoder(w)
				enc.SetIndent("", "  ")
				if err := enc.Encode(teams); err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
				}
				return
			}
		}
	}

	// Cache miss or Redis unavailable - fetch from API
	url := fmt.Sprintf("https://api.collegefootballdata.com/teams?year=%s", year)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Try to parse the upstream response and extract common fields.
	var raw []map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		// If parsing fails, forward raw bytes and status.
		w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
		w.WriteHeader(resp.StatusCode)
		w.Write(body)
		return
	}

	// Simplify to only id and school/name where available.
	type Team struct {
		ID    interface{} `json:"id"`
		Name  string      `json:"name"`
		Alias string      `json:"school,omitempty"`
	}
	out := make([]Team, 0, len(raw))
	for _, t := range raw {
		var team Team
		if v, ok := t["id"]; ok {
			team.ID = v
		}
		if v, ok := t["school"]; ok {
			if s, ok := v.(string); ok {
				team.Name = s
				team.Alias = s
			}
		}
		if team.Name == "" {
			if v, ok := t["name"]; ok {
				if s, ok := v.(string); ok {
					team.Name = s
				}
			}
		}
		out = append(out, team)
	}

	// Cache the result in Redis for 1 year
	if redisService != nil {
		if err := redisService.SetWithExpiration(ctx, "CFB_TEAMS", out, 365*24*time.Hour); err != nil {
			log.Printf("Warning: Failed to cache teams in Redis: %v", err)
		} else {
			log.Printf("Redis key written: CFB_TEAMS")
		}
	}

	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	if err := enc.Encode(out); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// rankingsHandler proxies requests to the College Football Data API `/rankings` endpoint.
// Uses Redis cache if available to avoid API calls.
func rankingsHandler(w http.ResponseWriter, r *http.Request) {
	year := r.URL.Query().Get("year")
	if year == "" {
		year = fmt.Sprintf("%d", time.Now().Year())
	}

	ctx := context.Background()
	cacheKey := fmt.Sprintf("RANKINGS:%s", year)

	if redisService != nil {
		if exists, err := redisService.Exists(ctx, cacheKey); err == nil && exists {
			log.Printf("Redis key found: %s", cacheKey)
			var cached interface{}
			if err := redisService.Get(ctx, cacheKey, &cached); err == nil {
				w.Header().Set("Content-Type", "application/json")
				enc := json.NewEncoder(w)
				enc.SetIndent("", "  ")
				if err := enc.Encode(cached); err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
				}
				return
			}
		}
	}

	apiURL := fmt.Sprintf("https://api.collegefootballdata.com/rankings?year=%s", year)
	log.Printf("GET %s", apiURL)
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Cache the result in Redis for 1 year
	if redisService != nil {
		var parsed interface{}
		if err := json.Unmarshal(body, &parsed); err == nil {
			if err := redisService.SetWithExpiration(ctx, cacheKey, parsed, 365*24*time.Hour); err != nil {
				log.Printf("Warning: Failed to cache rankings in Redis: %v", err)
			} else {
				log.Printf("Redis key written: %s", cacheKey)
			}
		} else {
			if err := redisService.SetWithExpiration(ctx, cacheKey, string(body), 365*24*time.Hour); err != nil {
				log.Printf("Warning: Failed to cache raw rankings JSON in Redis: %v", err)
			} else {
				log.Printf("Redis key written: %s", cacheKey)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(body)
}

// loadDotEnv reads a local .env file (if present) and sets environment variables.
func loadDotEnv() {
	f, err := os.Open(".env")
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		// Remove optional surrounding quotes
		if strings.HasPrefix(val, "\"") && strings.HasSuffix(val, "\"") {
			val = strings.Trim(val, "\"")
		} else if strings.HasPrefix(val, "'") && strings.HasSuffix(val, "'") {
			val = strings.Trim(val, "'")
		}
		os.Setenv(key, val)
	}
}

// preloadTeamsCache fetches teams from the API and caches them in Redis on startup
func preloadTeamsCache() error {
	ctx := context.Background()

	// Check if cache already exists
	exists, err := redisService.Exists(ctx, "CFB_TEAMS")
	if err == nil && exists {
		log.Printf("CFB_TEAMS cache already exists")
		return nil
	}

	log.Printf("Preloading teams into cache...")

	year := fmt.Sprintf("%d", time.Now().Year())
	apiURL := fmt.Sprintf("https://api.collegefootballdata.com/teams?year=%s", year)

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to fetch teams: %w", err)
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	var raw []map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return fmt.Errorf("failed to unmarshal teams: %w", err)
	}

	// Simplify to only id and school/name where available.
	type Team struct {
		ID    interface{} `json:"id"`
		Name  string      `json:"name"`
		Alias string      `json:"school,omitempty"`
	}
	teams := make([]Team, 0, len(raw))
	for _, t := range raw {
		var team Team
		if v, ok := t["id"]; ok {
			team.ID = v
		}
		if v, ok := t["school"]; ok {
			if s, ok := v.(string); ok {
				team.Name = s
				team.Alias = s
			}
		}
		if team.Name == "" {
			if v, ok := t["name"]; ok {
				if s, ok := v.(string); ok {
					team.Name = s
				}
			}
		}
		teams = append(teams, team)
	}

	// Cache with 1 year expiration
	if err := redisService.SetWithExpiration(ctx, "CFB_TEAMS", teams, 365*24*time.Hour); err != nil {
		return fmt.Errorf("failed to cache teams: %w", err)
	}

	log.Printf("Redis key written: CFB_TEAMS")
	return nil
}

// preloadRankingsCache ensures RANKINGS:year keys exist in Redis for years 1900..current
func preloadRankingsCache() error {
	ctx := context.Background()
	current := time.Now().Year()
	for y := 1900; y <= current; y++ {
		yearStr := fmt.Sprintf("%d", y)
		key := fmt.Sprintf("RANKINGS:%s", yearStr)

		exists, err := redisService.Exists(ctx, key)
		if err == nil && exists {
			log.Printf("Redis key found: %s", key)
			continue
		}

		apiURL := fmt.Sprintf("https://api.collegefootballdata.com/rankings?year=%s", yearStr)
		req, err := http.NewRequest("GET", apiURL, nil)
		if err != nil {
			log.Printf("Warning: failed to create request for year %s: %v", yearStr, err)
			continue
		}
		if apiKey != "" {
			req.Header.Set("Authorization", "Bearer "+apiKey)
		}

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("Warning: failed to fetch rankings for %s: %v", yearStr, err)
			continue
		}
		body, err := ioutil.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			log.Printf("Warning: failed to read rankings response for %s: %v", yearStr, err)
			continue
		}

		var parsed interface{}
		if err := json.Unmarshal(body, &parsed); err == nil {
			if err := redisService.SetWithExpiration(ctx, key, parsed, 365*24*time.Hour); err != nil {
				log.Printf("Warning: failed to cache rankings %s: %v", yearStr, err)
				continue
			}
			log.Printf("Redis key written: %s", key)
		} else {
			if err := redisService.SetWithExpiration(ctx, key, string(body), 365*24*time.Hour); err != nil {
				log.Printf("Warning: failed to cache raw rankings %s: %v", yearStr, err)
				continue
			}
			log.Printf("Redis key written: %s", key)
		}
		// Small sleep to avoid hammering API
		time.Sleep(100 * time.Millisecond)
	}
	return nil
}
