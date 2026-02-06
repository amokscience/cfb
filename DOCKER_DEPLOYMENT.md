# Docker Build & Push to DockerHub

## Setup

### 1. Create DockerHub Credentials
1. Log in to [DockerHub](https://hub.docker.com) or create an account.
2. Navigate to **Account Settings** → **Security** → **Access Tokens**.
3. Create a new access token and copy it.

### 2. Add GitHub Secrets
In your GitHub repository:
1. Go to **Settings** → **Secrets and variables** → **Actions**.
2. Add two new secrets:
   - `DOCKERHUB_USERNAME`: Your DockerHub username.
   - `DOCKERHUB_TOKEN`: The access token from step 1.

### 3. Workflow Triggers

The workflow (`.github/workflows/docker-build-push.yml`) automatically:

**Builds and pushes** when:
- You push to `main` branch → tags as `latest` and branch name.
- You push to `dev` branch → tags as branch name.
- You create a git tag `v*.*.*` (semantic versioning) → tags as version and `latest` (if on main).

**Builds but does NOT push** for:
- Pull requests (tests the build without pushing).

### 4. Tagging Convention

Images will be pushed with tags like:
- `<username>/cfb:latest` (main branch)
- `<username>/cfb:main` (main branch)
- `<username>/cfb:dev` (dev branch)
- `<username>/cfb:v1.0.0` (git tag v1.0.0)
- `<username>/cfb:sha-abc123def` (commit SHA on any branch)

### 5. Manual Workflow Run

If needed, you can manually trigger the workflow via GitHub Actions UI:
1. Go to **Actions** → **Docker Build & Push**.
2. Click **Run workflow** and select your branch.

## Local Testing Before Push

Test the Docker build locally before committing:

```bash
# Build
docker build -t cfb:test .

# Run with example env vars
docker run --rm -p 8080:8080 \
  -e CFBD_API_KEY='your_key_here' \
  -e REDIS_ADDR='redis:6379' \
  -e HTTP_PORT='8080' \
  cfb:test

# Test endpoints
curl http://localhost:8080/healthz
curl http://localhost:8080/readyz
```

## Promotion Strategy (Optional)

If you want to promote images through environments (dev → staging → prod):

1. Add a second workflow file `.github/workflows/docker-promote.yml` that:
   - Triggers on releases or manual workflow_dispatch.
   - Re-tags an image from `dev` to `staging` or `prod`.
   - Example: `docker tag cfb:dev cfb:staging && docker push cfb:staging`.

2. For now, the current workflow covers basic needs:
   - Commits to `main` → `latest` (production).
   - Commits to `dev` → `dev` (development).
   - Git tags → semantic versions.

## Environment Variables at Runtime

When deploying the container, provide:

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `CFBD_API_KEY` | Yes | — | College Football Data API key. |
| `REDIS_ADDR` | No | `localhost:6379` | Redis endpoint for caching. |
| `CFBD_API_BASE` | No | `https://api.collegefootballdata.com` | Upstream API base URL. |
| `HTTP_PORT` | No | `8080` | Container HTTP port. |

## Troubleshooting

**Push fails with "authentication required":**
- Verify `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` are set correctly in GitHub Secrets.
- Ensure the token has read/write access to the repository.

**Build takes too long:**
- The workflow uses Docker layer caching (`buildcache` tag).
- First build may take ~2 min; subsequent builds reuse layers.

**Image not appearing on DockerHub:**
- Check the Actions tab for workflow logs.
- Ensure you pushed to `main` or a tag (PRs don't push).

