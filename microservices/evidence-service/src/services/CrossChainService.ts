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

  /** Resolve contract address from env or deployments JSON */
  private resolveContractAddress(network: string, envAddress?: string): string | null {
    if (envAddress && /^0x[a-fA-F0-9]{40}$/.test(envAddress)) return envAddress;
    try {
      const deploymentsPath = path.join(__dirname, '../../../smart-contracts/deployments', `${network}.json`);
      if (fs.existsSync(deploymentsPath)) {
        const j = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
        const addr = j?.contracts?.evidenceRegistry?.address;
        if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) return addr;
      }
      const altPath = `/smart-contracts/deployments/${network}.json`;
      if (fs.existsSync(altPath)) {
        const j = JSON.parse(fs.readFileSync(altPath, 'utf8'));
        const addr = j?.contracts?.evidenceRegistry?.address;
        if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) return addr;
      }
    } catch (e) {
      this.logger.error(`Failed to resolve contract address for ${network}`, e);
    }
    this.logger.error(`Contract address not set for ${network}`);
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
      
      // Submit to blockchain
      const tx = await (contract as any).submitEvidence(
        evidence.ipfsHash,
        dataHash,
        evidenceType,
        {
          gasLimit: this.config.get<string>('blockchain.gasConfig.gasLimit')
        }
      );
      
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
      
      return {
        transactionHash: transactionHash || tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      this.logger.error('Failed to submit evidence to blockchain', error);
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
      
      // Check if evidence exists on chain
      if (!evidence.blockchainData || !evidence.blockchainData.transactionHash) {
        return {
          verified: false,
          onChain: false
        };
      }
      
      try {
        // Get evidence from blockchain
        // Note: This assumes the contract has a method to get evidence by some identifier
        // You may need to adjust based on your actual contract implementation
        const provider = this.providers.get(network);
        if (!provider) {
          throw new Error('Provider not available');
        }
        
        // Verify transaction exists
        const tx = await provider.getTransaction(evidence.blockchainData.transactionHash);
        
        if (!tx) {
          return {
            verified: false,
            onChain: false
          };
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
        return {
          verified: false,
          onChain: false
        };
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

