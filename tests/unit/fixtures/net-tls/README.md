A self-signed test pair for `api.example.com` (`cert.pem`, `key.pem`): no secret, used only by `tests/unit/net-route.mjs`,
which serves a local TLS site with it and trusts `cert.pem` as its own `ca`.
