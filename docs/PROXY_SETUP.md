Proxy setup for local dev (Frontend at /, API at /api)

Goal
- Serve the frontend at http://localhost:4000/ and the API under http://localhost:4000/api/* while the API process listens on localhost:4001.
- Make this replicable for future dev machines without requiring root.

Approach (what worked)
- Let Next.js (frontend) run on port 4000 and use its rewrites feature to proxy /api/* to the backend at http://localhost:4001.
- Run the API on port 4001.

Files changed
- apps/web/next.config.mjs
  - Added a rewrites() rule:
    {
      source: '/api/:path*',
      destination: 'http://localhost:4001/:path*',
    }

Steps to reproduce (fresh machine)
1. Clone the repo and install dependencies
   - cd projects/PulseDock
   - npm ci

2. Configure env
   - Copy .env.example -> .env and set values
   - Ensure API_PORT=4001 (or set before starting the API)

3. Start the API
   - cd projects/PulseDock
   - NODE_ENV=development API_PORT=4001 npm run dev -w @pulsedock/api
   - Confirm API is serving: http://localhost:4001/docs (Swagger) or curl http://localhost:4001/v1/system/version

4. Build & start the frontend on port 4000
   - cd projects/PulseDock
   - npm run build -w @pulsedock/web
   - npx next start -p 4000 -C projects/PulseDock/apps/web
     (or: cd apps/web && npx next start -p 4000)
   - Confirm frontend: http://localhost:4000/

5. Verify proxying
   - curl http://localhost:4000/api/v1/system/version
   - Expect the API JSON (proxied through Next.js)

Notes & troubleshooting
- Why use Next rewrites?
  - No root required, so it works in CI/dev containers where changing system nginx isn't possible.
  - Good for local/dev and quick demos.

- Limitations
  - This is not a replacement for a production reverse proxy. For production or publicly reachable hosts, add an nginx (or other) reverse proxy that listens on the public port and forwards:
    - /api/ -> http://127.0.0.1:4001/ (note trailing slash to strip /api/ prefix)
    - / and /_next/ -> http://127.0.0.1:4000

- System nginx config (one-shot) — useful for ops (requires root)
  Save as /etc/nginx/conf.d/pulsedock.conf and reload nginx:

  server {
    listen 0.0.0.0:4000;
    server_name _;

    location /api/ {
      proxy_pass http://127.0.0.1:4001/; # trailing slash strips /api/
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_buffering off;
    }

    location /_next/ {
      proxy_pass http://127.0.0.1:4000;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
      proxy_pass http://127.0.0.1:4000;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
  }

- Automation suggestion
  - Add a start-dev script in the repo root (example):

    #!/bin/bash
    set -e
    cd projects/PulseDock
    (NODE_ENV=development API_PORT=4001 npm run dev -w @pulsedock/api) &
    sleep 2
    (cd apps/web && npx next build && npx next start -p 4000) &

  - Add a small smoke-test script that curls / and /api/v1/system/version and returns non-zero on failure.

Commit/Where to look
- This file: projects/PulseDock/PROXY_SETUP.md
- The Next config: projects/PulseDock/apps/web/next.config.mjs (contains the /api rewrite)

If you want, I can:
- Commit a start-dev + smoke-test script in the repo and push the commits.
- Create the system nginx config as a file under infra/ and a single sudo command you can run.

