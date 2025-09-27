Get all wills (default limit of 10):
```
curl https://eth-global-api.vercel.app/api/wills
```

Get wills with custom pagination:
```
curl "http://localhost:3000/api/wills?limit=5&offset=0"
```

Get wills owned by a specific address:
```
curl "http://localhost:3000/api/wills?owner=0x742d35Cc6634C0532925a3b8D395B9C8d6C04a38"
```

Get wills with owner filter and pagination:
```
curl "http://localhost:3000/api/wills?owner=0x742d35Cc6634C0532925a3b8D395B9C8d6C04a38&limit=20&offset=10"
```

