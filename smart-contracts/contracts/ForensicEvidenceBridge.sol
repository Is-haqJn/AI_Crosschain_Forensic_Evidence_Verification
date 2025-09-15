// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title ForensicEvidenceBridge
 * @dev Cross-chain bridge contract for evidence transfer between chains
 */
contract ForensicEvidenceBridge is AccessControl, ReentrancyGuard, Pausable {
    using ECDSA for bytes32;
    
    // Roles
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    
    // Bridge Request Structure
    struct BridgeRequest {
        uint256 requestId;
        uint256 evidenceId;
        bytes32 evidenceHash;
        uint256 sourceChain;
        uint256 targetChain;
        address sender;
        uint256 timestamp;
        BridgeStatus status;
        uint256 confirmations;
    }
    
    // Chain Configuration
    struct ChainConfig {
        address evidenceContract;
        uint256 requiredConfirmations;
        bool isActive;
        uint256 minBlockConfirmations;
    }
    
    // Bridge Status Enum
    enum BridgeStatus {
        PENDING,
        VALIDATED,
        EXECUTED,
        FAILED,
        CANCELLED
    }
    
    // State variables
    uint256 private requestCounter;
    uint256 public bridgeFee = 0.001 ether;
    uint256 public constant MAX_CHAIN_ID = 1000000;
    
    // Mappings
    mapping(uint256 => BridgeRequest) public bridgeRequests;
    mapping(uint256 => ChainConfig) public chainConfigs;
    mapping(bytes32 => bool) public processedHashes;
    mapping(uint256 => mapping(address => bool)) public requestValidations;
    mapping(address => uint256) public relayerBalances;
    mapping(uint256 => uint256) public chainNonces;
    
    // Events
    event BridgeRequestCreated(
        uint256 indexed requestId,
        uint256 indexed evidenceId,
        uint256 sourceChain,
        uint256 targetChain,
        address sender,
        bytes32 evidenceHash
    );
    
    event BridgeRequestValidated(
        uint256 indexed requestId,
        address indexed validator,
        uint256 confirmations
    );
    
    event BridgeRequestExecuted(
        uint256 indexed requestId,
        uint256 indexed evidenceId,
        uint256 targetChain,
        bytes32 transactionHash
    );
    
    event BridgeRequestFailed(
        uint256 indexed requestId,
        string reason
    );
    
    event ChainConfigUpdated(
        uint256 indexed chainId,
        address evidenceContract,
        uint256 requiredConfirmations
    );
    
    event BridgeFeeUpdated(
        uint256 oldFee,
        uint256 newFee
    );
    
    event RelayerRewardClaimed(
        address indexed relayer,
        uint256 amount
    );
    
    // Constructor
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RELAYER_ROLE, msg.sender);
        _grantRole(VALIDATOR_ROLE, msg.sender);
    }
    
    // ==================== Configuration Functions ====================
    
    /**
     * @dev Configure a chain for cross-chain transfers
     */
    function configureChain(
        uint256 _chainId,
        address _evidenceContract,
        uint256 _requiredConfirmations,
        uint256 _minBlockConfirmations
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_chainId > 0 && _chainId < MAX_CHAIN_ID, "Invalid chain ID");
        require(_evidenceContract != address(0), "Invalid contract address");
        require(_requiredConfirmations > 0, "Invalid confirmation count");
        
        chainConfigs[_chainId] = ChainConfig({
            evidenceContract: _evidenceContract,
            requiredConfirmations: _requiredConfirmations,
            isActive: true,
            minBlockConfirmations: _minBlockConfirmations
        });
        
        emit ChainConfigUpdated(_chainId, _evidenceContract, _requiredConfirmations);
    }
    
    /**
     * @dev Update bridge fee
     */
    function updateBridgeFee(uint256 _newFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldFee = bridgeFee;
        bridgeFee = _newFee;
        emit BridgeFeeUpdated(oldFee, _newFee);
    }
    
    // ==================== Bridge Functions ====================
    
    /**
     * @dev Initiate a bridge request
     */
    function initiateBridge(
        uint256 _evidenceId,
        bytes32 _evidenceHash,
        uint256 _targetChain
    ) external payable whenNotPaused nonReentrant returns (uint256) {
        require(msg.value >= bridgeFee, "Insufficient bridge fee");
        require(chainConfigs[_targetChain].isActive, "Target chain not active");
        require(chainConfigs[block.chainid].isActive, "Source chain not active");
        require(_targetChain != block.chainid, "Cannot bridge to same chain");
        
        // Create unique request hash
        bytes32 requestHash = keccak256(abi.encodePacked(
            _evidenceId,
            _evidenceHash,
            block.chainid,
            _targetChain,
            msg.sender,
            block.timestamp,
            chainNonces[block.chainid]++
        ));
        
        require(!processedHashes[requestHash], "Request already processed");
        
        uint256 requestId = requestCounter++;
        
        BridgeRequest storage request = bridgeRequests[requestId];
        request.requestId = requestId;
        request.evidenceId = _evidenceId;
        request.evidenceHash = _evidenceHash;
        request.sourceChain = block.chainid;
        request.targetChain = _targetChain;
        request.sender = msg.sender;
        request.timestamp = block.timestamp;
        request.status = BridgeStatus.PENDING;
        request.confirmations = 0;
        
        processedHashes[requestHash] = true;
        
        // Add fee to relayer rewards pool
        relayerBalances[address(this)] += msg.value;
        
        emit BridgeRequestCreated(
            requestId,
            _evidenceId,
            block.chainid,
            _targetChain,
            msg.sender,
            _evidenceHash
        );
        
        return requestId;
    }
    
    /**
     * @dev Validate a bridge request
     */
    function validateBridgeRequest(
        uint256 _requestId,
        bytes calldata _signature
    ) external onlyRole(VALIDATOR_ROLE) {
        BridgeRequest storage request = bridgeRequests[_requestId];
        require(request.status == BridgeStatus.PENDING, "Invalid request status");
        require(!requestValidations[_requestId][msg.sender], "Already validated");
        
        // Verify signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            request.evidenceId,
            request.evidenceHash,
            request.sourceChain,
            request.targetChain
        ));
        
        address signer = messageHash.toEthSignedMessageHash().recover(_signature);
        require(hasRole(VALIDATOR_ROLE, signer), "Invalid validator signature");
        
        requestValidations[_requestId][msg.sender] = true;
        request.confirmations++;
        
        emit BridgeRequestValidated(_requestId, msg.sender, request.confirmations);
        
        // Check if enough confirmations
        if (request.confirmations >= chainConfigs[request.targetChain].requiredConfirmations) {
            request.status = BridgeStatus.VALIDATED;
        }
    }
    
    /**
     * @dev Execute a validated bridge request
     */
    function executeBridge(
        uint256 _requestId,
        bytes calldata _proof
    ) external onlyRole(RELAYER_ROLE) nonReentrant {
        BridgeRequest storage request = bridgeRequests[_requestId];
        require(request.status == BridgeStatus.VALIDATED, "Request not validated");
        
        // Verify proof (simplified - implement proper verification in production)
        bytes32 proofHash = keccak256(_proof);
        require(proofHash != bytes32(0), "Invalid proof");
        
        // Mark as executed
        request.status = BridgeStatus.EXECUTED;
        
        // Reward relayer
        uint256 reward = bridgeFee / 2; // 50% of fee goes to relayer
        relayerBalances[msg.sender] += reward;
        
        emit BridgeRequestExecuted(
            _requestId,
            request.evidenceId,
            request.targetChain,
            proofHash
        );
    }
    
    /**
     * @dev Cancel a pending bridge request (only by sender)
     */
    function cancelBridgeRequest(uint256 _requestId) external {
        BridgeRequest storage request = bridgeRequests[_requestId];
        require(request.sender == msg.sender, "Not request sender");
        require(request.status == BridgeStatus.PENDING, "Cannot cancel");
        require(block.timestamp < request.timestamp + 1 hours, "Cancellation period expired");
        
        request.status = BridgeStatus.CANCELLED;
        
        // Refund bridge fee minus gas costs
        uint256 refund = bridgeFee * 90 / 100; // 90% refund
        payable(msg.sender).transfer(refund);
    }
    
    /**
     * @dev Mark a request as failed
     */
    function markRequestFailed(
        uint256 _requestId,
        string calldata _reason
    ) external onlyRole(RELAYER_ROLE) {
        BridgeRequest storage request = bridgeRequests[_requestId];
        require(
            request.status == BridgeStatus.PENDING || 
            request.status == BridgeStatus.VALIDATED,
            "Invalid status for failure"
        );
        
        request.status = BridgeStatus.FAILED;
        
        emit BridgeRequestFailed(_requestId, _reason);
        
        // Refund sender
        if (request.sender != address(0)) {
            payable(request.sender).transfer(bridgeFee * 80 / 100); // 80% refund
        }
    }
    
    // ==================== Relayer Functions ====================
    
    /**
     * @dev Claim relayer rewards
     */
    function claimRelayerRewards() external onlyRole(RELAYER_ROLE) nonReentrant {
        uint256 balance = relayerBalances[msg.sender];
        require(balance > 0, "No rewards to claim");
        
        relayerBalances[msg.sender] = 0;
        payable(msg.sender).transfer(balance);
        
        emit RelayerRewardClaimed(msg.sender, balance);
    }
    
    /**
     * @dev Get relayer balance
     */
    function getRelayerBalance(address _relayer) external view returns (uint256) {
        return relayerBalances[_relayer];
    }
    
    // ==================== View Functions ====================
    
    /**
     * @dev Get bridge request details
     */
    function getBridgeRequest(uint256 _requestId) external view returns (BridgeRequest memory) {
        return bridgeRequests[_requestId];
    }
    
    /**
     * @dev Get chain configuration
     */
    function getChainConfig(uint256 _chainId) external view returns (ChainConfig memory) {
        return chainConfigs[_chainId];
    }
    
    /**
     * @dev Check if validator has validated a request
     */
    function hasValidated(uint256 _requestId, address _validator) external view returns (bool) {
        return requestValidations[_requestId][_validator];
    }
    
    /**
     * @dev Get total bridge requests
     */
    function getTotalRequests() external view returns (uint256) {
        return requestCounter;
    }
    
    // ==================== Admin Functions ====================
    
    /**
     * @dev Pause the bridge
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @dev Unpause the bridge
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    
    /**
     * @dev Toggle chain active status
     */
    function toggleChain(uint256 _chainId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        chainConfigs[_chainId].isActive = !chainConfigs[_chainId].isActive;
    }
    
    /**
     * @dev Emergency withdraw
     */
    function emergencyWithdraw() external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        payable(msg.sender).transfer(balance);
    }
    
    /**
     * @dev Receive function to accept ETH
     */
    receive() external payable {}
}
