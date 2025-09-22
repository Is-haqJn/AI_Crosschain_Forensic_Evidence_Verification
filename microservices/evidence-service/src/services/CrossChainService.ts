import { ethers } from 'ethers';
import { ConfigManager } from '../config/ConfigManager.js';
import { Logger } from '../utils/Logger.js';
import { Evidence } from '../models/Evidence.model.js';
import { AppError } from '../middleware/ErrorHandler.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Blockchain Service
 * Handles interactions with smart contracts
 */
export class CrossChainService {
  private config: ConfigManager;
  private logger: Logger;
  private providers: Map<string, ethers.JsonRpcProvider>;
  private wallets: Map<string, ethers.Wallet>;
  private contracts: Map<string, ethers.Contract>;

  constructor() {
    this.config = ConfigManager.getInstance();
    this.logger = Logger.getInstance();
    this.providers = new Map();
    this.wallets = new Map();
    this.contracts = new Map();
    this.initialize();
  }

  /**
   * Initialize blockchain connections
   */
  private initialize(): void {
    try {
      const blockchainConfig = this.config.get<any>('blockchain');
      
      // Initialize Sepolia
      if (blockchainConfig.networks.sepolia.rpcUrl) {
        this.initializeNetwork('sepolia', blockchainConfig.networks.sepolia);
      }
      
      // Initialize Amoy
      if (blockchainConfig.networks.amoy.rpcUrl) {
        this.initializeNetwork('amoy', blockchainConfig.networks.amoy);
      }
      
      this.logger.info('Blockchain service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize blockchain service', error);
    }
  }

  /**
   * Initialize a specific network
   */
  private initializeNetwork(network: string, networkConfig: any): void {
    try {
      // Create provider
      const provider = new ethers.JsonRpcProvider(
        networkConfig.rpcUrl,
        networkConfig.chainId
      );
      this.providers.set(network, provider);
      
      // Create wallet if private key is available
      const walletConfig = this.config.get<any>('blockchain.wallet');
      if (walletConfig.privateKey) {
        const wallet = new ethers.Wallet(walletConfig.privateKey, provider);
        this.wallets.set(network, wallet);
      }

      // Load contract if address is available (even without wallet; will connect signer on submit)
      const address = this.resolveContractAddress(network, networkConfig.contractAddress);
      if (address) this.loadContract(network, address);
      
      this.logger.info(`Network initialized: ${network}`);
    } catch (error) {
      this.logger.error(`Failed to initialize network ${network}`, error);
    }
  }

  /**
   * Health information for blockchain networks and contracts
   */
  public async health(): Promise<{
    networks: Record<string, { connected: boolean; contractLoaded: boolean; chainId?: number }>;
  }> {
    const result: Record<string, { connected: boolean; contractLoaded: boolean; chainId?: number }> = {};
    const networks = ['sepolia', 'amoy'];
    for (const n of networks) {
      const provider = this.providers.get(n);
      const contract = this.contracts.get(n);
      let connected = false;
      let chainId: number | undefined;
      try {
        if (provider) {
          const net = await provider.getNetwork();
          chainId = Number(net.chainId);
          connected = true;
        }
      } catch (_e) {
        connected = false;
      }
      result[n] = { connected, contractLoaded: Boolean(contract), chainId };
    }
    return { networks: result };
  }

  /**
   * Load contract ABI and create contract instance
   */
  private loadContract(network: string, contractAddress: string): void {
    try {
      // Load ABI from artifacts
      const abiPath = this.resolveAbiPath();
      
      if (abiPath && fs.existsSync(abiPath)) {
        const artifact = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
        const wallet = this.wallets.get(network);
        const provider = this.providers.get(network);

        if (!provider) {
          this.logger.error(`No provider available for ${network}, cannot load contract`);
          return;
        }

        const runner = wallet ?? provider;
        const contract = new ethers.Contract(
          contractAddress,
          artifact.abi,
          runner
        );
        this.contracts.set(network, contract);
        this.logger.info(`Contract loaded for ${network}: ${contractAddress} (runner=${wallet ? 'wallet' : 'provider'})`);
      }
    } catch (error) {
      this.logger.error(`Failed to load contract for ${network}`, error);
    }
  }

  /** Resolve ABI path from mounted artifacts */
  private resolveAbiPath(): string | null {
    const candidates = [
      // Assets directory in the service
      path.join(__dirname, '../assets/contracts/ForensicEvidenceRegistry.json'),
      // When running from dist, __dirname is /app/dist/services
      path.join(__dirname, '../../../smart-contracts/artifacts/contracts/ForensicEvidenceRegistry.sol/ForensicEvidenceRegistry.json'),
      // In case relative resolution changes
      path.join(process.cwd(), 'smart-contracts/artifacts/contracts/ForensicEvidenceRegistry.sol/ForensicEvidenceRegistry.json'),
      // Mounted at container root
      '/smart-contracts/artifacts/contracts/ForensicEvidenceRegistry.sol/ForensicEvidenceRegistry.json'
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    this.logger.error('ABI file not found in expected locations');
    return null;
  }

  /** Resolve contract address from env or deployments JSON (normalize to EIP-55) */
  private resolveContractAddress(network: string, envAddress?: string): string | null {
    const normalize = (addr?: string): string | null => {
      if (!addr) return null;
      try {
        // Returns EIP-55 checksummed address if valid
        return ethers.getAddress(addr);
      } catch {
        // Fallback: allow all-lowercase hex
        const lower = addr.toLowerCase();
        return /^0x[0-9a-f]{40}$/.test(lower) ? lower : null;
      }
    };

    const fromEnv = normalize(envAddress);
    if (fromEnv) {
      if (fromEnv !== envAddress) {
        this.logger.warn('Normalized non-checksummed contract address from env', { network, env: envAddress, normalized: fromEnv });
      }
      return fromEnv;
    }

    try {
      const deploymentsPath = path.join(__dirname, '../../../smart-contracts/deployments', `${network}.json`);
      if (fs.existsSync(deploymentsPath)) {
        const j = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
        const addr = normalize(j?.contracts?.evidenceRegistry?.address);
        if (addr) return addr;
      }
      const altPath = `/smart-contracts/deployments/${network}.json`;
      if (fs.existsSync(altPath)) {
        const j = JSON.parse(fs.readFileSync(altPath, 'utf8'));
        const addr = normalize(j?.contracts?.evidenceRegistry?.address);
        if (addr) return addr;
      }
    } catch (e) {
      this.logger.error(`Failed to resolve contract address for ${network}`, e);
    }
    this.logger.error(`Contract address not set or invalid for ${network}`);
    return null;
  }

  /**
   * Submit evidence to blockchain
   */
  public async submitEvidence(
    evidenceId: string,
    network: string,
    _userId: string
  ): Promise<{
    transactionHash: string;
    blockNumber: number;
    gasUsed: string;
    network: string;
    bridge: { targetNetwork: string; transactionHash: string; chainId: number } | null;
  }> {
    try {
      // Get evidence from database
      const evidence = await Evidence.findOne({ 
        evidenceId, 
        isDeleted: false 
      });
      
      if (!evidence) {
        throw new AppError('Evidence not found', 404);
      }
      
      // Check if already on blockchain
      if (evidence.blockchainData && evidence.blockchainData.transactionHash) {
        throw new AppError('Evidence already on blockchain', 409);
      }
      
      // Get contract and wallet
      const baseContract = this.contracts.get(network);
      if (!baseContract) {
        throw new AppError(`Contract not available for network: ${network}`, 503);
      }
      const wallet = this.wallets.get(network);
      if (!wallet) {
        throw new AppError(`Wallet not configured for network: ${network}`, 503);
      }
      const contract = baseContract.connect(wallet);
      
      // Prepare transaction
      const dataHash = '0x' + evidence.dataHash;
      const evidenceType = this.mapEvidenceType(evidence.type);
      
      this.logger.info(`Submitting evidence to blockchain`, {
        evidenceId,
        network,
        dataHash
      });
      
      // Helper to submit with one safe retry for common RPC throttling
      const gasLimit = network === 'amoy' ? 500000 : parseInt(this.config.get<string>('blockchain.gasConfig.gasLimit'));
      const submitOnce = async () => (contract as any).submitEvidence(
        evidence.ipfsHash,
        dataHash,
        evidenceType,
        { gasLimit }
      );

      let tx: any;
      try {
        tx = await submitOnce();
      } catch (err: any) {
        const msg = (err?.message || '').toLowerCase();
        const code = (err?.code || '').toString();
        const retriable = code === '-32000' || msg.includes('in-flight transaction limit');
        if (retriable) {
          this.logger.warn('RPC throttled, retrying submit once...', { network, code: err?.code });
          await new Promise(res => setTimeout(res, 1500));
          tx = await submitOnce();
        } else {
          throw err;
        }
      }
      
      // Wait for confirmation
      const receipt = await tx.wait();
      const transactionHash = (receipt as any)?.transactionHash ?? (receipt as any)?.hash ?? tx.hash;
      if (!transactionHash) {
        this.logger.warn('Transaction hash missing from receipt', { evidenceId, network });
      }

      // Update evidence with blockchain data
      evidence.blockchainData = {
        transactionHash: transactionHash || tx.hash,
        blockNumber: receipt.blockNumber,
        chainId: Number((await contract.runner!.provider!.getNetwork()).chainId),
        contractAddress: await contract.getAddress(),
        timestamp: new Date(),
        network
      };
      
      evidence.status = 'VERIFIED' as any;
      await evidence.save();
      
      this.logger.info(`Evidence submitted to blockchain`, {
        evidenceId,
        transactionHash: transactionHash || tx.hash,
        blockNumber: receipt.blockNumber
      });
      
      // Auto-bridge to target network if enabled via env
      // CROSSCHAIN_AUTO_BRIDGE=true, CROSSCHAIN_TARGET_NETWORK=amoy
      let bridgeDetails: { targetNetwork: string; transactionHash: string; chainId: number } | null = null;
      try {
        const autoBridgeEnabled = (process.env.CROSSCHAIN_AUTO_BRIDGE || 'true') !== 'false';
        const targetNetwork = process.env.CROSSCHAIN_TARGET_NETWORK || 'amoy';
        if (autoBridgeEnabled && targetNetwork && targetNetwork !== network) {
          this.logger.info('Auto-bridging enabled. Starting bridge to target network...', {
            evidenceId,
            sourceNetwork: network,
            targetNetwork
          });
          bridgeDetails = await this.autoBridgeToTarget(evidence, targetNetwork);
        }
      } catch (bridgeErr) {
        this.logger.warn('Auto-bridge failed (continuing without blocking submit)', {
          evidenceId,
          error: bridgeErr instanceof Error ? bridgeErr.message : String(bridgeErr)
        });
      }

      return {
        transactionHash: transactionHash || tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        network,
        bridge: bridgeDetails
          ? {
              targetNetwork: bridgeDetails.targetNetwork,
              transactionHash: bridgeDetails.transactionHash,
              chainId: bridgeDetails.chainId
            }
          : null
      };
    } catch (error) {
      this.logger.error('Failed to submit evidence to blockchain', error);
      throw error;
    }
  }

  /**
   * Mirror the evidence onto a target network (simple bridge)
   * Submits the same dataHash to the EvidenceRegistry on the target chain,
   * then stores crossChainData on the evidence record.
   * This provides verifiable presence for Verify on the target network.
   */
  private async autoBridgeToTarget(
    evidence: any,
    targetNetwork: string
  ): Promise<{ targetNetwork: string; transactionHash: string; chainId: number }> {
    try {
      const contract = this.contracts.get(targetNetwork);
      const wallet = this.wallets.get(targetNetwork);
      const provider = this.providers.get(targetNetwork);
      if (!contract || !wallet || !provider) {
        throw new AppError(`Target network not fully configured for bridging: ${targetNetwork}`, 503);
      }

      const contractWithSigner = contract.connect(wallet);
      const dataHash = evidence.dataHash && evidence.dataHash.startsWith('0x') ? evidence.dataHash : '0x' + evidence.dataHash;
      const evidenceType = this.mapEvidenceType(evidence.type);

      this.logger.info('Submitting mirrored evidence on target network for bridging', {
        evidenceId: evidence.evidenceId,
        targetNetwork,
        dataHash
      });

      // Use lower gas limit for Amoy testnet
      const gasLimit = targetNetwork === 'amoy' ? 500000 : parseInt(this.config.get<string>('blockchain.gasConfig.gasLimit'));
      
      const tx = await (contractWithSigner as any).submitEvidence(
        evidence.ipfsHash,
        dataHash,
        evidenceType,
        { gasLimit }
      );
      const receipt = await tx.wait();
      const transactionHash = (receipt as any)?.transactionHash ?? (receipt as any)?.hash ?? tx.hash;

      // Persist cross-chain data
      const networkInfo = await provider.getNetwork();
      const targetChainId = Number(networkInfo.chainId);
      evidence.crossChainData = {
        bridged: true,
        targetChain: targetChainId,
        bridgeTransactionHash: transactionHash,
        bridgeTimestamp: new Date()
      };

      // Add to chain of custody
      try {
        const { CustodyUtils } = await import('../utils/CustodyUtils.js');
        const prev = evidence.chainOfCustody[evidence.chainOfCustody.length - 1] as any;
        const ev = CustodyUtils.buildEvent({
          evidenceId: evidence.evidenceId,
          dataHash: evidence.dataHash,
          previousEventHash: prev?.integrity?.eventHash,
          base: {
            eventType: 'OTHER',
            purpose: `Cross-chain bridge to ${targetNetwork}`,
            notes: `Mirrored on ${targetNetwork} - tx=${transactionHash}`
          }
        });
        evidence.chainOfCustody.push({ ...ev, action: 'CROSS_CHAIN_BRIDGE' } as any);
      } catch (e) {
        this.logger.warn('Failed to append custody entry for bridge', e);
      }

      await evidence.save();

      this.logger.info('Evidence bridged (mirrored) to target network', {
        evidenceId: evidence.evidenceId,
        targetNetwork,
        transactionHash
      });

      return { targetNetwork, transactionHash, chainId: targetChainId };
    } catch (error) {
      this.logger.error('Auto-bridge to target failed', error);
      throw error;
    }
  }

  /**
   * Verify evidence on blockchain
   */
  public async verifyEvidence(
    evidenceId: string,
    network: string
  ): Promise<{
    verified: boolean;
    onChain: boolean;
    blockchainData?: any;
  }> {
    try {
      // Get evidence from database
      const evidence = await Evidence.findOne({ 
        evidenceId, 
        isDeleted: false 
      });
      
      if (!evidence) {
        throw new AppError('Evidence not found', 404);
      }
      
      // Get contract
      const contract = this.contracts.get(network);
      if (!contract) {
        throw new AppError(`Contract not available for network: ${network}`, 503);
      }
      
      // If verifying on a different network than the submission, use usedHashes(dataHash)
      const provider = this.providers.get(network);
      if (!provider) {
        throw new Error('Provider not available');
      }

      const submittedNetwork = evidence.blockchainData?.network;
      const isCrossChain = submittedNetwork && submittedNetwork !== network;
      const dataHashHex = evidence.dataHash && evidence.dataHash.startsWith('0x')
        ? evidence.dataHash
        : `0x${evidence.dataHash}`;

      try {
        // Get target chain ID for network comparison
        const targetChainId = network === 'amoy' ? 80002 : network === 'sepolia' ? 11155111 : null;
        
        if (isCrossChain) {
          // For cross-chain verification, we need to actually check the blockchain
          // First, verify the evidence exists on the source chain
          const sourceNetwork = evidence.blockchainData?.network;
          if (sourceNetwork && sourceNetwork !== network) {
            // Verify on source chain first
            const sourceContract = this.contracts.get(sourceNetwork);
            if (sourceContract) {
              try {
                const existsOnSource = await sourceContract.usedHashes(dataHashHex);
                if (!existsOnSource) {
                  this.logger.warn('Evidence not found on source chain', {
                    evidenceId,
                    sourceNetwork,
                    dataHash: dataHashHex
                  });
                  return { verified: false, onChain: false };
                }
                this.logger.info('Evidence verified on source chain', {
                  evidenceId,
                  sourceNetwork,
                  dataHash: dataHashHex
                });
              } catch (sourceErr) {
                this.logger.warn('Failed to verify on source chain', {
                  evidenceId,
                  sourceNetwork,
                  error: sourceErr
                });
                // Continue with target chain verification
              }
            }
          }

          // Cross-chain verification: check if the same dataHash exists on target chain
          let exists = false;
          try {
            // usedHashes is a mapping, call it directly with the hash
            const contract = this.contracts.get(network);
            if (!contract) {
              throw new Error(`Contract not loaded for network ${network}`);
            }
            exists = await contract.usedHashes(dataHashHex);
            this.logger.info('Cross-chain verification check', {
              evidenceId,
              network,
              dataHash: dataHashHex,
              exists
            });
          } catch (contractErr: any) {
            // Contract might be using different ABI or function name, try alternate verification
            this.logger.warn('usedHashes failed, trying alternate verification', {
              evidenceId,
              network,
              error: contractErr?.message || String(contractErr),
              contractAddress: this.contracts.get(network)?.target
            });
            // Fall through to continue with auto-bridge attempt
          }
          if (exists) {
            return {
              verified: true,
              onChain: true,
              blockchainData: {
                dataHash: dataHashHex,
                network
              }
            };
          }

          // Optionally trigger an on-demand bridge to target if not present yet
          const autoBridgeEnabled = (process.env.CROSSCHAIN_AUTO_BRIDGE || 'true') !== 'false';
          if (autoBridgeEnabled) {
            this.logger.info('Cross-chain verify miss: attempting auto-bridge to target', {
              evidenceId: evidence.evidenceId,
              targetNetwork: network
            });
            try {
              await this.autoBridgeToTarget(evidence, network);
              // After successful bridging, verify the evidence actually exists on the target chain
              // Wait a moment for the transaction to be mined
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Re-fetch the evidence to get updated crossChainData
              const updatedEvidence = await Evidence.findOne({ evidenceId });
              if (updatedEvidence?.crossChainData?.bridged && updatedEvidence.crossChainData?.targetChain === targetChainId) {
                // Verify the evidence actually exists on the target chain
                try {
                  const existsAfterBridge = await contract.usedHashes(dataHashHex);
                  if (existsAfterBridge) {
                    this.logger.info('Evidence verified on target chain after bridging', {
                      evidenceId,
                      network,
                      dataHash: dataHashHex,
                      bridgeTx: updatedEvidence.crossChainData.bridgeTransactionHash
                    });
                    return {
                      verified: true,
                      onChain: true,
                      blockchainData: {
                        dataHash: dataHashHex,
                        network,
                        transactionHash: updatedEvidence.crossChainData.bridgeTransactionHash
                      }
                    };
                  }
                } catch (verifyErr) {
                  this.logger.warn('Failed to verify evidence on target chain after bridging', {
                    evidenceId,
                    network,
                    error: verifyErr
                  });
                }
              }
            } catch (bridgeErr) {
              this.logger.warn('Auto-bridge during verify failed', bridgeErr);
            }
          }

          return { verified: false, onChain: false };
        }

        // Same-chain verification: prefer tx hash, but fall back to usedHashes
        if (!evidence.blockchainData || !evidence.blockchainData.transactionHash) {
          const exists: boolean = await (this.contracts.get(network) as any).usedHashes(dataHashHex);
          return exists ? { verified: true, onChain: true, blockchainData: { dataHash: dataHashHex, network } } : { verified: false, onChain: false };
        }

        // Verify transaction exists on this network
        const tx = await provider.getTransaction(evidence.blockchainData.transactionHash);
        if (!tx) {
          const exists: boolean = await (this.contracts.get(network) as any).usedHashes(dataHashHex);
          return exists ? { verified: true, onChain: true, blockchainData: { dataHash: dataHashHex, network } } : { verified: false, onChain: false };
        }

        // Get transaction receipt
        const receipt = await provider.getTransactionReceipt(evidence.blockchainData.transactionHash);
        return {
          verified: true,
          onChain: true,
          blockchainData: {
            transactionHash: tx.hash,
            blockNumber: receipt?.blockNumber || 0,
            from: tx.from,
            to: tx.to,
            timestamp: evidence.blockchainData.timestamp,
            network
          }
        };
      } catch (error) {
        this.logger.error('Error verifying on blockchain', error);
        return { verified: false, onChain: false };
      }
    } catch (error) {
      this.logger.error('Failed to verify evidence on blockchain', error);
      throw error;
    }
  }

  /**
   * Get transaction details
   */
  public async getTransactionDetails(
    transactionHash: string,
    network: string
  ): Promise<any> {
    try {
      const provider = this.providers.get(network);
      if (!provider) {
        throw new AppError(`Provider not available for network: ${network}`, 503);
      }
      
      const tx = await provider.getTransaction(transactionHash);
      const receipt = await provider.getTransactionReceipt(transactionHash);
      
      return {
        transaction: tx,
        receipt: receipt
      };
    } catch (error) {
      this.logger.error('Failed to get transaction details', error);
      throw error;
    }
  }

  /**
   * Get current gas price
   */
  public async getGasPrice(network: string): Promise<string> {
    try {
      const provider = this.providers.get(network);
      if (!provider) {
        throw new AppError(`Provider not available for network: ${network}`, 503);
      }
      
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice;
      return gasPrice ? ethers.formatUnits(gasPrice, 'gwei') : '0';
    } catch (error) {
      this.logger.error('Failed to get gas price', error);
      throw error;
    }
  }

  /**
   * Get wallet balance
   */
  public async getBalance(network: string): Promise<string> {
    try {
      const wallet = this.wallets.get(network);
      if (!wallet) {
        throw new AppError(`Wallet not available for network: ${network}`, 503);
      }
      
      const balance = await wallet.provider!.getBalance(wallet.address);
      return ethers.formatEther(balance);
    } catch (error) {
      this.logger.error('Failed to get balance', error);
      throw error;
    }
  }

  /**
   * Map evidence type to contract enum
   */
  private mapEvidenceType(type: string): number {
    const typeMap: { [key: string]: number } = {
      'IMAGE': 0,
      'VIDEO': 1,
      'DOCUMENT': 2,
      'AUDIO': 3,
      'OTHER': 4
    };
    
    return typeMap[type] || 4;
  }

  /**
   * Check network status
   */
  public async checkNetworkStatus(_network: string): Promise<{
    connected: boolean;
    blockNumber?: number;
    chainId?: number;
  }> {
    try {
      const provider = this.providers.get(_network);
      if (!provider) {
        return { connected: false };
      }
      
      const blockNumber = await provider.getBlockNumber();
      const networkInfo = await provider.getNetwork();
      
      return {
        connected: true,
        blockNumber,
        chainId: Number(networkInfo.chainId)
      };
    } catch (error) {
      return { connected: false };
    }
  }
}

export default CrossChainService;

