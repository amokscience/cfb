# CFB Teams Example

Simple Go web server that proxies the College Football Data API and serves a React UI to select teams by year.

## Setup

### Prerequisites
- Go 1.20+
- Node.js and npm

### Building the Frontend

```bash
cd frontend
npm install
npm run build
cd ..
```

This builds the React app into `frontend/dist/`.

### Running the Server

Set your API key in a `.env` file (see `.env.example`):

```bash
cp .env.example .env
# Edit .env and add your CFBD_API_KEY
```

Then start the server:

```bash
go run main.go
```

Open http://localhost:8080 in your browser. The page defaults the year to the current year and loads teams into the dropdown.

### Development

For frontend development with hot reload:

```bash
cd frontend
npm run dev
```

This starts a Vite dev server on http://localhost:5173. The Go API server must still be running on http://localhost:8080 for API calls to work (configure proxy in vite.config.js if needed).

## Using a `.env` File

You can store `CFBD_API_KEY` in a local `.env` file. Copy `.env.example` to `.env` and add your key. The server loads `.env` automatically at startup. The repository's `.gitignore` excludes `.env` so your key won't be committed.

