import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function checkWalletBalances() {
  try {
    const networks = [
      {
        name: 'Sepolia',
        rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
        chainId: 11155111
      },
      {
        name: 'Amoy',
        rpcUrl: process.env.AMOY_RPC_URL || 'https://polygon-amoy-bor-rpc.publicnode.com',
        chainId: 80002
      }
    ];

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('PRIVATE_KEY not found in environment variables');
    }

    console.log('🔍 Checking wallet balances...\n');

    for (const network of networks) {
      try {
        const provider = new ethers.JsonRpcProvider(network.rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);
        
        console.log(`📊 ${network.name} Network (Chain ID: ${network.chainId})`);
        console.log(`   Wallet Address: ${wallet.address}`);
        
        // Get balance
        const balance = await provider.getBalance(wallet.address);
        const balanceInEther = ethers.formatEther(balance);
        
        console.log(`   Balance: ${balanceInEther} ${network.name === 'Sepolia' ? 'ETH' : 'MATIC'}`);
        console.log(`   Balance (Wei): ${balance.toString()}`);
        
        // Get current gas price
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice;
        if (gasPrice) {
          console.log(`   Current Gas Price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`);
          
          // Estimate cost for a simple transaction
          const estimatedGas = 100000n; // Typical gas for contract interaction
          const estimatedCost = gasPrice * estimatedGas;
          console.log(`   Estimated TX Cost: ${ethers.formatEther(estimatedCost)} ${network.name === 'Sepolia' ? 'ETH' : 'MATIC'}`);
          
          // Check if wallet has enough for at least one transaction
          if (balance < estimatedCost) {
            console.log(`   ⚠️  WARNING: Insufficient funds for transactions!`);
          } else {
            const possibleTxs = balance / estimatedCost;
            console.log(`   ✅ Can perform approximately ${possibleTxs.toString()} transactions`);
          }
        }
        
        console.log('');
      } catch (error) {
        console.error(`   ❌ Error checking ${network.name}:`, error);
        console.log('');
      }
    }

    // Provide faucet links
    console.log('💰 Testnet Faucets:');
    console.log('   Sepolia ETH: https://sepoliafaucet.com/');
    console.log('   Amoy MATIC: https://faucet.polygon.technology/');
    console.log('   Alternative Amoy: https://www.alchemy.com/faucets/polygon-amoy');
    console.log('\n   Wallet Address for faucets:', '0xD0F81690D1c481D9199F783d6E3d4F8F7fa2c73e');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the script
checkWalletBalances().catch(console.error);
