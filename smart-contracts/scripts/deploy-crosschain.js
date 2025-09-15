const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting Cross-Chain Forensic Evidence Deployment...");
  console.log("=====================================================");
  
  const networks = [
    { name: "sepolia", chainId: 11155111 },
    { name: "amoy", chainId: 80002 }
  ];
  
  const deployments = {};
  
  // Deploy to both networks
  for (const network of networks) {
    console.log(`\n🌐 Deploying to ${network.name.toUpperCase()}...`);
    console.log("=".repeat(50));
    
    try {
      // Switch to the network
      await hre.run("compile");
      
      // Get deployer account
      const [deployer] = await hre.ethers.getSigners();
      console.log(`👤 Deployer: ${deployer.address}`);
      
      // Check balance
      const balance = await hre.ethers.provider.getBalance(deployer.address);
      console.log(`💰 Balance: ${hre.ethers.formatEther(balance)} ETH`);
      
      if (balance === 0n) {
        console.error(`❌ No ETH on ${network.name}. Please fund the account.`);
        continue;
      }
      
      // Deploy Evidence Registry
      console.log(`\n📜 Deploying ForensicEvidenceRegistry...`);
      const EvidenceRegistry = await hre.ethers.getContractFactory("ForensicEvidenceRegistry");
      const registry = await EvidenceRegistry.deploy();
      await registry.waitForDeployment();
      
      const registryAddress = await registry.getAddress();
      console.log(`✅ Registry deployed: ${registryAddress}`);
      
      // Wait for confirmations
      const deployTx = registry.deploymentTransaction();
      if (deployTx) {
        await deployTx.wait(2); // Fewer confirmations for faster deployment
      }
      
      // Deploy Bridge
      console.log(`\n🌉 Deploying Cross-Chain Bridge...`);
      const Bridge = await hre.ethers.getContractFactory("ForensicEvidenceBridge");
      const bridge = await Bridge.deploy();
      await bridge.waitForDeployment();
      
      const bridgeAddress = await bridge.getAddress();
      console.log(`✅ Bridge deployed: ${bridgeAddress}`);
      
      // Wait for confirmations
      const bridgeTx = bridge.deploymentTransaction();
      if (bridgeTx) {
        await bridgeTx.wait(2);
      }
      
      // Grant bridge role
      console.log(`\n🔐 Setting up roles...`);
      const BRIDGE_ROLE = await registry.BRIDGE_ROLE();
      const tx = await registry.grantRole(BRIDGE_ROLE, bridgeAddress);
      await tx.wait();
      console.log(`✅ Granted BRIDGE_ROLE to bridge`);
      
      // Store deployment info
      deployments[network.name] = {
        chainId: network.chainId,
        deployer: deployer.address,
        registry: {
          address: registryAddress,
          contract: registry
        },
        bridge: {
          address: bridgeAddress,
          contract: bridge
        }
      };
      
      console.log(`✅ ${network.name.toUpperCase()} deployment completed!`);
      
    } catch (error) {
      console.error(`❌ Failed to deploy to ${network.name}:`, error.message);
      continue;
    }
  }
  
  // Link the bridges
  console.log(`\n🔗 Linking Cross-Chain Bridges...`);
  console.log("=".repeat(50));
  
  try {
    // Configure Sepolia bridge for Amoy
    if (deployments.sepolia && deployments.amoy) {
      console.log(`🔧 Configuring Sepolia bridge for Amoy...`);
      const sepoliaBridge = deployments.sepolia.bridge.contract;
      const amoyRegistry = deployments.amoy.registry.address;
      
      const tx1 = await sepoliaBridge.configureChain(
        deployments.amoy.chainId,
        amoyRegistry,
        3, // Required confirmations
        5  // Min block confirmations
      );
      await tx1.wait();
      console.log(`✅ Sepolia bridge configured for Amoy`);
    }
    
    // Configure Amoy bridge for Sepolia
    if (deployments.amoy && deployments.sepolia) {
      console.log(`🔧 Configuring Amoy bridge for Sepolia...`);
      const amoyBridge = deployments.amoy.bridge.contract;
      const sepoliaRegistry = deployments.sepolia.registry.address;
      
      const tx2 = await amoyBridge.configureChain(
        deployments.sepolia.chainId,
        sepoliaRegistry,
        3, // Required confirmations
        5  // Min block confirmations
      );
      await tx2.wait();
      console.log(`✅ Amoy bridge configured for Sepolia`);
    }
    
  } catch (error) {
    console.error(`❌ Failed to link bridges:`, error.message);
  }
  
  // Save deployment info
  console.log(`\n💾 Saving deployment info...`);
  
  const deploymentInfo = {
    timestamp: new Date().toISOString(),
    networks: {}
  };
  
  for (const [networkName, deployment] of Object.entries(deployments)) {
    deploymentInfo.networks[networkName] = {
      chainId: deployment.chainId,
      deployer: deployment.deployer,
      contracts: {
        evidenceRegistry: {
          address: deployment.registry.address,
          transactionHash: deployment.registry.contract.deploymentTransaction()?.hash,
          blockNumber: deployment.registry.contract.deploymentTransaction()?.blockNumber
        },
        bridge: {
          address: deployment.bridge.address,
          transactionHash: deployment.bridge.contract.deploymentTransaction()?.hash,
          blockNumber: deployment.bridge.contract.deploymentTransaction()?.blockNumber
        }
      }
    };
  }
  
  // Create deployments directory
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  // Save cross-chain deployment info
  const crossChainFile = path.join(deploymentsDir, "cross-chain.json");
  fs.writeFileSync(crossChainFile, JSON.stringify(deploymentInfo, null, 2));
  
  // Save individual network files
  for (const [networkName, deployment] of Object.entries(deployments)) {
    const networkFile = path.join(deploymentsDir, `${networkName}.json`);
    fs.writeFileSync(networkFile, JSON.stringify(deploymentInfo.networks[networkName], null, 2));
  }
  
  console.log(`✅ Deployment info saved to: ${crossChainFile}`);
  
  // Display summary
  console.log(`\n========================================`);
  console.log(`📊 CROSS-CHAIN DEPLOYMENT SUMMARY`);
  console.log(`========================================`);
  
  for (const [networkName, deployment] of Object.entries(deployments)) {
    console.log(`\n🌐 ${networkName.toUpperCase()} (Chain ID: ${deployment.chainId})`);
    console.log(`   Registry: ${deployment.registry.address}`);
    console.log(`   Bridge:   ${deployment.bridge.address}`);
    console.log(`   Deployer: ${deployment.deployer}`);
  }
  
  console.log(`\n========================================`);
  console.log(`✨ Cross-chain deployment completed!`);
  
  // Output environment variables
  console.log(`\n📝 Update your .env file with:`);
  console.log(`================================`);
  for (const [networkName, deployment] of Object.entries(deployments)) {
    const upperName = networkName.toUpperCase();
    console.log(`CONTRACT_ADDRESS_${upperName}=${deployment.registry.address}`);
    console.log(`BRIDGE_ADDRESS_${upperName}=${deployment.bridge.address}`);
  }
  console.log(`================================`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Cross-chain deployment failed:", error);
    process.exit(1);
  });
