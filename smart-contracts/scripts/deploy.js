const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting Forensic Evidence Contract Deployment...");
  console.log("================================================");
  
  // Get network info
  const network = hre.network.name;
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  
  console.log(`📍 Network: ${network}`);
  console.log(`🔗 Chain ID: ${chainId}`);
  
  // Get deployer account
  const [deployer, investigator, validator] = await hre.ethers.getSigners();
  console.log(`👤 Deployer address: ${deployer.address}`);
  
  // Check balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`💰 Deployer balance: ${hre.ethers.formatEther(balance)} ETH`);
  
  if (balance === 0n) {
    console.error("❌ Deployer has no ETH. Please fund the account first.");
    process.exit(1);
  }
  
  console.log("\n📜 Deploying ForensicEvidenceRegistry...");
  
  // Deploy Evidence Registry Contract
  const EvidenceRegistry = await hre.ethers.getContractFactory("ForensicEvidenceRegistry");
  const registry = await EvidenceRegistry.deploy();
  await registry.waitForDeployment();
  
  console.log(`✅ Evidence Registry deployed to: ${await registry.getAddress()}`);
  
  // Wait for confirmations
  console.log("⏳ Waiting for confirmations...");
  const deployTx = registry.deploymentTransaction();
  if (deployTx) {
    // Use fewer confirmations for local networks
    const confirmations = (network === "hardhat" || network === "localhost") ? 1 : 5;
    await deployTx.wait(confirmations);
  }
  
  // Setup roles
  console.log("\n🔐 Setting up roles...");
  
  const INVESTIGATOR_ROLE = await registry.INVESTIGATOR_ROLE();
  const VALIDATOR_ROLE = await registry.VALIDATOR_ROLE();
  const AUDITOR_ROLE = await registry.AUDITOR_ROLE();
  
  // Grant roles to additional addresses if available
  if (investigator) {
    const tx1 = await registry.grantRole(INVESTIGATOR_ROLE, investigator.address);
    await tx1.wait();
    console.log(`✅ Granted INVESTIGATOR_ROLE to: ${investigator.address}`);
  }
  
  if (validator) {
    const tx2 = await registry.grantRole(VALIDATOR_ROLE, validator.address);
    await tx2.wait();
    console.log(`✅ Granted VALIDATOR_ROLE to: ${validator.address}`);
  }
  
  // Deploy Cross-Chain Bridge Contract (if not on local network)
  let bridgeAddress = null;
  if (network !== "hardhat" && network !== "localhost") {
    console.log("\n🌉 Deploying Cross-Chain Bridge...");
    
    const Bridge = await hre.ethers.getContractFactory("ForensicEvidenceBridge");
    const bridge = await Bridge.deploy();
    await bridge.waitForDeployment();
    
    bridgeAddress = await bridge.getAddress();
    console.log(`✅ Bridge Contract deployed to: ${bridgeAddress}`);
    
    // Grant bridge role to bridge contract
    const BRIDGE_ROLE = await registry.BRIDGE_ROLE();
    const tx3 = await registry.grantRole(BRIDGE_ROLE, bridgeAddress);
    await tx3.wait();
    console.log(`✅ Granted BRIDGE_ROLE to bridge contract`);
    
    // Configure bridge for target chain (skip for now - configure manually after both chains are deployed)
    console.log(`ℹ️  Bridge deployed. Configure target chain manually after deploying to both networks.`);
    console.log(`   Use: bridge.configureChain(targetChainId, registryAddress, 3, 5)`);
  }
  
  // Save deployment info
  console.log("\n💾 Saving deployment info...");
  
  const deploymentInfo = {
    network: network,
    chainId: chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      evidenceRegistry: {
        address: await registry.getAddress(),
        transactionHash: registry.deploymentTransaction()?.hash,
        blockNumber: registry.deploymentTransaction()?.blockNumber
      },
      bridge: bridgeAddress ? {
        address: bridgeAddress,
        // Add bridge deployment details if deployed
      } : null
    },
    roles: {
      DEFAULT_ADMIN_ROLE: await registry.DEFAULT_ADMIN_ROLE(),
      INVESTIGATOR_ROLE: INVESTIGATOR_ROLE,
      VALIDATOR_ROLE: VALIDATOR_ROLE,
      AUDITOR_ROLE: AUDITOR_ROLE,
      BRIDGE_ROLE: await registry.BRIDGE_ROLE()
    }
  };
  
  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  // Save deployment info to file
  const deploymentFile = path.join(deploymentsDir, `${network}.json`);
  fs.writeFileSync(
    deploymentFile,
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log(`✅ Deployment info saved to: ${deploymentFile}`);
  
  // Verify contract on Etherscan (if not local)
  if (network !== "hardhat" && network !== "localhost") {
    console.log("\n🔍 Verifying contract on Etherscan...");
    
    try {
      await hre.run("verify:verify", {
        address: await registry.getAddress(),
        constructorArguments: []
      });
      console.log("✅ Contract verified on Etherscan");
    } catch (error) {
      console.log("⚠️  Contract verification failed:", error.message);
      console.log("You can verify manually later using:");
      console.log(`npx hardhat verify --network ${network} ${await registry.getAddress()}`);
    }
  }
  
  // Display summary
  console.log("\n========================================");
  console.log("📊 DEPLOYMENT SUMMARY");
  console.log("========================================");
  console.log(`Network: ${network} (Chain ID: ${chainId})`);
  console.log(`Evidence Registry: ${await registry.getAddress()}`);
  if (bridgeAddress) {
    console.log(`Bridge Contract: ${bridgeAddress}`);
  }
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Deployment file: ${deploymentFile}`);
  console.log("========================================");
  
  console.log("\n✨ Deployment completed successfully!");
  
  // Output environment variables to update
  console.log("\n📝 Update your .env file with:");
  console.log("================================");
  if (network === "sepolia") {
    console.log(`CONTRACT_ADDRESS_SEPOLIA=${await registry.getAddress()}`);
    if (bridgeAddress) {
      console.log(`BRIDGE_ADDRESS_SEPOLIA=${bridgeAddress}`);
    }
  } else if (network === "amoy") {
    console.log(`CONTRACT_ADDRESS_AMOY=${await registry.getAddress()}`);
    if (bridgeAddress) {
      console.log(`BRIDGE_ADDRESS_AMOY=${bridgeAddress}`);
    }
  }
  console.log("================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
