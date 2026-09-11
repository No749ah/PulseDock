# Webhook Alert Channel

PulseDock can send alert notifications to any HTTP endpoint via webhooks. This document covers setup, payload format, signature verification, and troubleshooting.

## Setup

1. Go to **Alerts** → **Create Channel** → select **Webhook**
2. Enter your endpoint URL (must be HTTPS in production)
3. Optionally set a **Signing Secret** for payload verification
4. Optionally add **Custom Headers** (e.g., `Authorization: Bearer <token>`)
5. Optionally configure a **Payload Template** for custom formatting
6. Click **Test** to verify delivery

## Payload Format

### Default Payload

When no custom template is configured, PulseDock sends:

```json
{
  "text": "🚨 Monitor \"My API\" is DOWN — Connection refused (latency: 0ms)",
  "extra": {
    "monitor": {
      "id": "clxyz123",
      "name": "My API",
      "type": "HTTP",
      "target": "https://api.example.com/health"
    },
    "run": {
      "level": "red",
      "message": "Connection refused",
      "latencyMs": 0,
      "checkedAt": "2026-03-30T00:15:00.000Z"
    }
  }
}
```

### Level Values

| Level    | Meaning   | When                                    |
|----------|-----------|-----------------------------------------|
| `red`    | Down      | Check failed (connection error, 5xx, timeout) |
| `yellow` | Degraded  | Slow response, header assertion failed, flapping |
| `green`  | Recovered | Monitor back to healthy after outage    |

### Custom Payload Template

Use `{{token}}` placeholders in a custom JSON template:

```json
{
  "severity": "{{run.level}}",
  "service": "{{monitor.name}}",
  "message": "{{run.message}}",
  "latency": {{run.latencyMs}},
  "timestamp": "{{timestamp}}"
}
```

Available tokens:
- `{{monitor.name}}` — Monitor display name
- `{{monitor.type}}` — Monitor type (HTTP, TCP, SSL, etc.)
- `{{monitor.target}}` — Target URL/host
- `{{run.level}}` — red / yellow / green
- `{{run.message}}` — Human-readable status message
- `{{run.latencyMs}}` — Response time in milliseconds
- `{{timestamp}}` — ISO 8601 timestamp

## Signature Verification

When a **Signing Secret** is configured, every webhook request includes an `X-PulseDock-Signature` header:

```
X-PulseDock-Signature: sha256=<hex-encoded-hmac>
```

The signature is computed as `HMAC-SHA256(secret, raw_request_body)`.

### Verification Examples

#### Node.js

```javascript
const crypto = require('crypto');

function verifyWebhook(req, signingSecret) {
  const signature = req.headers['x-pulsedock-signature'];
  if (!signature) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', signingSecret)
    .update(req.rawBody) // Use raw body, not parsed JSON
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// Express example
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!verifyWebhook(req, process.env.PULSEDOCK_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  const payload = JSON.parse(req.body);
  console.log('Alert:', payload.text);
  res.status(200).send('OK');
});
```

#### Python

```python
import hmac
import hashlib

def verify_webhook(body: bytes, signature: str, secret: str) -> bool:
    expected = 'sha256=' + hmac.new(
        secret.encode(),
        body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)

# Flask example
from flask import Flask, request, abort

app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def webhook():
    signature = request.headers.get('X-PulseDock-Signature', '')
    if not verify_webhook(request.data, signature, os.environ['PULSEDOCK_WEBHOOK_SECRET']):
        abort(401)

    payload = request.get_json()
    print(f"Alert: {payload['text']}")
    return 'OK', 200
```

#### Go

```go
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
)

func verifyWebhook(body []byte, signature, secret string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(signature), []byte(expected))
}

func handler(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	sig := r.Header.Get("X-PulseDock-Signature")

	if !verifyWebhook(body, sig, os.Getenv("PULSEDOCK_WEBHOOK_SECRET")) {
		http.Error(w, "Invalid signature", http.StatusUnauthorized)
		return
	}

	fmt.Printf("Alert received: %s\n", string(body))
	w.WriteHeader(http.StatusOK)
}

func main() {
	http.HandleFunc("/webhook", handler)
	http.ListenAndServe(":8080", nil)
}
```

#### PHP

```php
<?php
function verifyWebhook(string $body, string $signature, string $secret): bool {
    $expected = 'sha256=' . hash_hmac('sha256', $body, $secret);
    return hash_equals($expected, $signature);
}

$body = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_PULSEDOCK_SIGNATURE'] ?? '';
$secret = getenv('PULSEDOCK_WEBHOOK_SECRET');

if (!verifyWebhook($body, $signature, $secret)) {
    http_response_code(401);
    exit('Invalid signature');
}

$payload = json_decode($body, true);
error_log("Alert: " . $payload['text']);
http_response_code(200);
echo 'OK';
```

## Request Headers

Every webhook request includes:

| Header                    | Value                              |
|---------------------------|------------------------------------|
| `Content-Type`            | `application/json`                 |
| `X-PulseDock-Signature`   | `sha256=<hex>` (if secret is set)  |
| Custom headers            | As configured in channel settings  |

Reserved headers (`Content-Type`, `Content-Length`, `Transfer-Encoding`, `Host`) cannot be overridden via custom headers.

## Retry Behavior

PulseDock uses a `sendWithRetry` strategy:

- **3 attempts** with exponential backoff (1s → 2s → 4s)
- Non-2xx responses are treated as failures
- Network errors trigger retries
- Failed deliveries are logged in the Alert Delivery History

## Troubleshooting

### Webhook not receiving requests

1. Verify the URL is reachable from the PulseDock server
2. Check that HTTPS is properly configured (self-signed certs may fail)
3. Use the **Test** button on the alert channel to send a test payload
4. Check **Alert Delivery History** for error messages

### Signature mismatch

1. Ensure you're using the **raw request body** (not parsed/re-serialized JSON)
2. Verify the signing secret matches exactly (no trailing whitespace)
3. Use `timingSafeEqual` (or equivalent) to prevent timing attacks

### Duplicate alerts

PulseDock includes deduplication via the alert grouping and confirmation system. If you still receive duplicates:

1. Check the `confirmations` setting on the monitor (default: 1)
2. Enable flapping detection if the monitor state oscillates
3. Review the `notifyOn` setting (EVERY_FAILURE vs FIRST_FAILURE)

## See Also

- [API Documentation](./API.md) — Full endpoint reference
- [Security](./SECURITY.md) — Security practices and hardening
- [Getting Started](./GETTING-STARTED.md) — Quick start guide
