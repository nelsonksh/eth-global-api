import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { ethers } from 'ethers'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// VaultGuard contract configuration
const CONTRACT_ADDRESS = "0x141fa614e6b3a24e8076777b56e22a447d156884"
const SEPOLIA_RPC_URL = "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161" // You can use a public RPC or add your own

// Load contract ABI
const contractABI = JSON.parse(fs.readFileSync(path.join(__dirname, 'vaultguard-abi.json'), 'utf8'))

const app = express()

// Middleware
app.use(express.json())

// Home route - HTML
app.get('/', (req, res) => {
  res.type('html').send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>Express on Vercel</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/api-data">API Data</a>
          <a href="/api/will/0">Check Will Details</a>
          <a href="/healthz">Health</a>
        </nav>
        <h1>Welcome to Express on Vercel 🚀</h1>
        <p>This is a minimal example without a database or forms.</p>
        <img src="/logo.png" alt="Logo" width="120" />
      </body>
    </html>
  `)
})

app.get('/about', function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'components', 'about.htm'))
})

// Example API endpoint - JSON
app.get('/api-data', (req, res) => {
  res.json({
    message: 'Here is some sample API data',
    items: ['apple', 'banana', 'cherry'],
  })
})

// VaultGuard Will Details endpoint
app.get('/api/will/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params
    
    // Validate tokenId
    if (!tokenId || isNaN(Number(tokenId))) {
      return res.status(400).json({
        error: 'Invalid token ID. Please provide a valid numeric token ID.'
      })
    }

    // Create provider and contract instance
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
    const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider)

    // Fetch will details from the blockchain
    console.log(`Fetching will details for token ID: ${tokenId}`)
    const willDetails = await contract.getWill(Number(tokenId))

    // Format the response
    const formattedWillDetails = {
      tokenId: Number(tokenId),
      deadline: {
        timestamp: Number(willDetails[0]),
        date: new Date(Number(willDetails[0]) * 1000).toISOString(),
        humanReadable: new Date(Number(willDetails[0]) * 1000).toLocaleString()
      },
      triggered: willDetails[1],
      nominees: willDetails[2],
      encryptedHash: willDetails[3],
      decryptedHash: willDetails[4],
      executed: willDetails[5],
      status: {
        isActive: !willDetails[1] && !willDetails[5], // Not triggered and not executed
        isTriggered: willDetails[1],
        isExecuted: willDetails[5],
        deadlinePassed: Date.now() > Number(willDetails[0]) * 1000
      }
    }

    res.json({
      success: true,
      data: formattedWillDetails,
      message: 'Will details retrieved successfully'
    })

  } catch (error) {
    console.error('Error fetching will details:', error)
    
    // Handle specific contract errors
    if (error.message.includes('ERC721: invalid token ID')) {
      return res.status(404).json({
        error: 'Will not found. The specified token ID does not exist.',
        tokenId: req.params.tokenId
      })
    }

    res.status(500).json({
      error: 'Failed to fetch will details from the blockchain',
      details: error.message
    })
  }
})

// Health check
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

export default app
