import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { ethers } from 'ethers'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// VaultGuard contract configuration
const CONTRACT_ADDRESS = "0x141fa614e6b3a24e8076777b56e22a447d156884"
const SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com"

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

// Get all wills endpoint
app.get('/api/wills', async (req, res) => {
  try {
    const { owner, limit = '10', offset = '0' } = req.query
    
    // Validate query parameters
    const limitNum = parseInt(limit as string)
    const offsetNum = parseInt(offset as string)
    
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        error: 'Invalid limit. Must be between 1 and 100.'
      })
    }
    
    if (isNaN(offsetNum) || offsetNum < 0) {
      return res.status(400).json({
        error: 'Invalid offset. Must be 0 or greater.'
      })
    }

    if (owner && !ethers.isAddress(owner as string)) {
      return res.status(400).json({
        error: 'Invalid owner address provided.'
      })
    }

    // Create provider and contract instance
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
    const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider)

    console.log(`🔍 Fetching wills with limit: ${limitNum}, offset: ${offsetNum}${owner ? `, owner: ${owner}` : ''}`)

    const wills = []
    let tokenId = offsetNum
    let checkedTokens = 0
    let existingTokens = 0
    let skippedDueToOwner = 0
    let invalidWills = 0
    const maxTokensToCheck = 10 // Prevent infinite loops

    console.log(`📋 Starting search from token ID: ${tokenId}`)

    // Iterate through token IDs to find existing wills
    // Note: This is a simple approach. In production, you'd want event indexing
    while (wills.length < limitNum && checkedTokens < maxTokensToCheck) {
      try {
        // First check if the token exists by calling ownerOf
        let tokenOwner
        try {
          tokenOwner = await contract.ownerOf(tokenId)
          existingTokens++
          console.log(`✅ Token ${tokenId} exists, owner: ${tokenOwner}`)
        } catch (ownerError) {
          // Token doesn't exist, skip to next
          console.log(`❌ Token ${tokenId} does not exist: ${ownerError.message}`)
          tokenId++
          checkedTokens++
          continue
        }

        // If owner filter is specified, check if this token matches
        if (owner && tokenOwner.toLowerCase() !== (owner as string).toLowerCase()) {
          console.log(`🔄 Token ${tokenId} owner ${tokenOwner} doesn't match filter ${owner}, skipping`)
          skippedDueToOwner++
          tokenId++
          checkedTokens++
          continue
        }

        // Token exists, now get will details
        console.log(`📄 Getting will details for token ${tokenId}`)
        const willDetails = await contract.getWill(tokenId)
        
        const deadline = Number(willDetails[0])
        console.log(`🕐 Token ${tokenId} will details:`, {
          deadline: deadline,
          deadlineDate: deadline > 0 ? new Date(deadline * 1000).toISOString() : 'Invalid',
          triggered: willDetails[1],
          nomineesCount: willDetails[2]?.length || 0,
          encryptedHash: willDetails[3],
          decryptedHash: willDetails[4],
          executed: willDetails[5]
        })
        
        // Validate that this is actually a will (check if deadline is set and reasonable)
        if (deadline === 0 || deadline < 1000000000) { // Basic sanity check for timestamp
          console.log(`⚠️  Token ${tokenId} has invalid deadline ${deadline}, skipping`)
          invalidWills++
          tokenId++
          checkedTokens++
          continue
        }

        // Format will details
        const formattedWill = {
          tokenId: tokenId,
          owner: tokenOwner,
          deadline: {
            timestamp: deadline,
            date: new Date(deadline * 1000).toISOString(),
            humanReadable: new Date(deadline * 1000).toLocaleString()
          },
          triggered: willDetails[1],
          nominees: willDetails[2],
          encryptedHash: willDetails[3],
          decryptedHash: willDetails[4],
          executed: willDetails[5],
          status: {
            isActive: !willDetails[1] && !willDetails[5],
            isTriggered: willDetails[1],
            isExecuted: willDetails[5],
            deadlinePassed: Date.now() > deadline * 1000
          }
        }

        console.log(`✅ Added valid will token ${tokenId} to results`)
        wills.push(formattedWill)
        
      } catch (error) {
        // Token doesn't exist or other error, continue to next
        console.log(`❌ Error checking token ${tokenId}:`, error.message)
      }
      
      tokenId++
      checkedTokens++
    }

    console.log(`📊 Search completed:`)
    console.log(`   - Tokens checked: ${checkedTokens}`)
    console.log(`   - Existing tokens found: ${existingTokens}`)
    console.log(`   - Skipped due to owner filter: ${skippedDueToOwner}`)
    console.log(`   - Invalid wills found: ${invalidWills}`)
    console.log(`   - Valid wills returned: ${wills.length}`)

    const response = {
      success: true,
      data: {
        wills,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          count: wills.length,
          hasMore: wills.length === limitNum // Might have more if we found exactly the limit
        },
        filters: {
          owner: owner || null
        }
      },
      message: `Found ${wills.length} will(s)`
    }

    res.json(response)

  } catch (error) {
    console.error('Error fetching wills:', error)
    res.status(500).json({
      error: 'Failed to fetch wills from the blockchain',
      details: error.message
    })
  }
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

    // Get owner information
    let owner = null
    try {
      owner = await contract.ownerOf(Number(tokenId))
    } catch (ownerError) {
      console.warn('Could not fetch owner for token:', tokenId)
    }

    // Format the response
    const formattedWillDetails = {
      tokenId: Number(tokenId),
      owner: owner,
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



// Create Will endpoint - accepts signed transaction
app.post('/api/will/broadcast', async (req, res) => {
  try {
    const { signedTransaction } = req.body

    // Validate required fields
    if (!signedTransaction) {
      return res.status(400).json({
        error: 'Signed transaction is required'
      })
    }

    // Create provider
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)

    console.log('Broadcasting signed transaction...')
    
    // Broadcast the signed transaction
    const txResponse = await provider.broadcastTransaction(signedTransaction)
    console.log(`Transaction sent: ${txResponse.hash}`)
    
    // Wait for transaction confirmation
    const receipt = await txResponse.wait()
    console.log(`Transaction confirmed in block: ${receipt.blockNumber}`)

    // Parse transaction to extract details
    const parsedTx = ethers.Transaction.from(signedTransaction)
    const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider)

    // Extract token ID from transaction logs
    let tokenId = null
    if (receipt.logs && receipt.logs.length > 0) {
      for (const log of receipt.logs) {
        try {
          const parsedLog = contract.interface.parseLog(log)
          if (parsedLog && (parsedLog.name === 'Transfer' || parsedLog.name === 'WillCreated')) {
            tokenId = Number(parsedLog.args.tokenId)
            break
          }
        } catch (e) {
          // Continue looking through logs
        }
      }
    }

    const response = {
      success: true,
      data: {
        transactionHash: txResponse.hash,
        blockNumber: receipt.blockNumber,
        tokenId: tokenId,
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: receipt.gasPrice?.toString(),
        contractAddress: CONTRACT_ADDRESS,
        from: parsedTx.from
      },
      message: 'Will created successfully on the blockchain'
    }

    res.status(201).json(response)

  } catch (error) {
    console.error('Error broadcasting transaction:', error)
    
    // Handle specific errors
    if (error.message.includes('insufficient funds')) {
      return res.status(400).json({
        error: 'Insufficient funds to pay for gas fees',
        details: error.message
      })
    }

    if (error.message.includes('nonce too low') || error.message.includes('nonce too high')) {
      return res.status(400).json({
        error: 'Invalid transaction nonce',
        details: error.message
      })
    }

    res.status(500).json({
      error: 'Failed to broadcast transaction to the blockchain',
      details: error.message
    })
  }
})

// Helper endpoint to prepare transaction data for client-side signing
app.post('/api/will/prepare', async (req, res) => {
  try {
    const { userAddress, nominees, deadlineSeconds, encryptedData } = req.body

    // Validate required fields
    if (!userAddress || !ethers.isAddress(userAddress)) {
      return res.status(400).json({
        error: 'Valid user address is required'
      })
    }

    if (!nominees || !Array.isArray(nominees) || nominees.length === 0) {
      return res.status(400).json({
        error: 'Nominees array is required and must contain at least one address'
      })
    }

    // Validate nominee addresses
    for (const nominee of nominees) {
      if (!ethers.isAddress(nominee)) {
        return res.status(400).json({
          error: `Invalid nominee address: ${nominee}`
        })
      }
    }

    // Set default deadline if not provided (30 seconds)
    const secondsFromNow = deadlineSeconds || (30)
    const deadline = Math.floor(Date.now() / 1000) + secondsFromNow

    // Create encrypted hash
    let encryptedHash
    if (encryptedData) {
      encryptedHash = ethers.keccak256(ethers.toUtf8Bytes(encryptedData))
    } else {
      // Default encrypted hash for demo purposes
      encryptedHash = ethers.keccak256(ethers.toUtf8Bytes(`default-encrypted-data-${Date.now()}`))
    }

    // Create provider and get network info
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL)
    const network = await provider.getNetwork()
    const nonce = await provider.getTransactionCount(userAddress, 'pending')
    const feeData = await provider.getFeeData()
    
    // Create contract interface to encode function data
    const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider)
    const functionData = contract.interface.encodeFunctionData('createWill', [
      deadline,
      nominees,
      encryptedHash
    ])

    // Estimate gas limit
    let gasLimit
    try {
      gasLimit = await provider.estimateGas({
        to: CONTRACT_ADDRESS,
        data: functionData,
        from: userAddress
      })
      // Add 20% buffer
      gasLimit = gasLimit * 120n / 100n
    } catch (error) {
      console.warn('Gas estimation failed, using default:', error.message)
      gasLimit = 300000n // Default gas limit
    }

    const transactionData = {
      to: CONTRACT_ADDRESS,
      data: functionData,
      nonce: nonce,
      gasLimit: gasLimit.toString(),
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
      chainId: Number(network.chainId),
      type: 2 // EIP-1559 transaction
    }

    res.json({
      success: true,
      data: {
        transactionData,
        contractAddress: CONTRACT_ADDRESS,
        functionName: 'createWill',
        parameters: {
          deadline,
          nominees,
          encryptedHash,
          deadlineHuman: new Date(deadline * 1000).toLocaleString()
        },
        gasEstimate: {
          gasLimit: gasLimit.toString(),
          maxFeePerGas: feeData.maxFeePerGas?.toString(),
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
          estimatedCostWei: (gasLimit * (feeData.maxFeePerGas || 0n)).toString(),
          estimatedCostEth: ethers.formatEther(gasLimit * (feeData.maxFeePerGas || 0n))
        }
      },
      message: 'Transaction data prepared for client-side signing'
    })

  } catch (error) {
    console.error('Error preparing transaction:', error)
    res.status(500).json({
      error: 'Failed to prepare transaction data',
      details: error.message
    })
  }
})

// Health check
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

export default app
