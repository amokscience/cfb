package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

var apiKey string

func main() {
	// Load .env (if present) so environment variables like CFBD_API_KEY are available.
	loadDotEnv()
	apiKey = os.Getenv("CFBD_API_KEY")

	mux := http.NewServeMux()
	mux.HandleFunc("/api/teams", teamsHandler)
	// Serve static assets from React build output
	mux.Handle("/assets/", http.FileServer(http.Dir("frontend/dist")))
	// Serve index.html for all other routes (SPA fallback)
	mux.HandleFunc("/", spaHandler)

	addr := ":8070"
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

// teamsHandler proxies requests to the College Football Data API `/teams` endpoint.
func teamsHandler(w http.ResponseWriter, r *http.Request) {
	year := r.URL.Query().Get("year")
	if year == "" {
		year = fmt.Sprintf("%d", time.Now().Year())
	}

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

	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	if err := enc.Encode(out); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
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
