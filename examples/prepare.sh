curl -X POST https://eth-global-api.vercel.app/api/will/prepare \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x0B80f1bf7ED4e33DD6AB6Ddbb4437fC3CE97F8A1",
    "nominees": [
      "0x1234567890123456789012345678901234567890",
      "0x0987654321098765432109876543210987654321"
    ],
    "deadlineDays": 30,
    "encryptedData": "my-secret-will-data"
  }'