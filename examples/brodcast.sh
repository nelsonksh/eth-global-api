curl -X POST https://eth-global-api.vercel.app/api/will/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "signedTransaction": "..."
  }'