# Office Town sandbox container — extends the @cloudflare/sandbox base image
# which already includes the HTTP runner that @cloudflare/sandbox in the worker
# talks to. The -python variant gives us Python 3.12 alongside Node + Bash.
#
# First `wrangler deploy` after wiring this needs Docker running locally —
# Wrangler builds + pushes the image to Cloudflare's container registry.
# Subsequent deploys reuse the pushed image and are fast.
FROM docker.io/cloudflare/sandbox:0.10.3-python
