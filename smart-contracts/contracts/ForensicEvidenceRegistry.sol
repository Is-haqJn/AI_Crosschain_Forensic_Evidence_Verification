// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

// ==================== Evidence Registry Contract ====================
contract ForensicEvidenceRegistry is AccessControl, ReentrancyGuard, Pausable {
    using Counters for Counters.Counter;
    using ECDSA for bytes32;

    // Roles
    bytes32 public constant INVESTIGATOR_ROLE = keccak256("INVESTIGATOR_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    // Evidence structure
    struct Evidence {
        uint256 id;
        string ipfsHash;
        bytes32 dataHash;
        address submitter;
        uint256 timestamp;
        EvidenceType evidenceType;
        EvidenceStatus status;
        string[] aiAnalysisHashes;
        uint256 chainId;
        bool crossChainVerified;
    }

    // Chain of custody entry
    struct CustodyEntry {
        address handler;
        uint256 timestamp;
        string action;
        string notes;
        bytes signature;
    }

    // Multi-signature approval
    struct ApprovalRequest {
        uint256 evidenceId;
        address[] approvers;
        address[] approved;
        uint256 requiredApprovals;
        bool executed;
        uint256 deadline;
    }

    enum EvidenceType {
        IMAGE,
        VIDEO,
        DOCUMENT,
        AUDIO,
        OTHER
    }

    enum EvidenceStatus {
        SUBMITTED,
        UNDER_REVIEW,
        AI_ANALYZED,
        VALIDATED,
        REJECTED,
        ARCHIVED
    }

    // State variables
    Counters.Counter private _evidenceIdCounter;
    Counters.Counter private _approvalIdCounter;
    
    mapping(uint256 => Evidence) public evidences;
    mapping(uint256 => CustodyEntry[]) public chainOfCustody;
    mapping(uint256 => ApprovalRequest) public approvalRequests;
    mapping(bytes32 => bool) public usedHashes;
    mapping(address => uint256[]) public userEvidences;
    mapping(uint256 => mapping(address => bool)) public evidenceAccess;
    
    // Merkle root for batch verification
    bytes32 public merkleRoot;
    
    // Events
    event EvidenceSubmitted(
        uint256 indexed evidenceId,
        address indexed submitter,
        string ipfsHash,
        bytes32 dataHash
    );
    
    event EvidenceStatusChanged(
        uint256 indexed evidenceId,
        EvidenceStatus oldStatus,
        EvidenceStatus newStatus
    );
    
    event CustodyTransferred(
        uint256 indexed evidenceId,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );
    
    event AIAnalysisAdded(
        uint256 indexed evidenceId,
        string analysisHash
    );
    
    event ApprovalRequestCreated(
        uint256 indexed approvalId,
        uint256 indexed evidenceId,
        uint256 requiredApprovals
    );
    
    event EvidenceApproved(
        uint256 indexed approvalId,
        address indexed approver
    );
    
    event CrossChainVerified(
        uint256 indexed evidenceId,
        uint256 sourceChain,
        uint256 targetChain
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(INVESTIGATOR_ROLE, msg.sender);
    }

    // ==================== Core Functions ====================
    
    function submitEvidence(
        string memory _ipfsHash,
        bytes32 _dataHash,
        EvidenceType _evidenceType
    ) public onlyRole(INVESTIGATOR_ROLE) whenNotPaused returns (uint256) {
        require(bytes(_ipfsHash).length > 0, "IPFS hash required");
        require(_dataHash != bytes32(0), "Data hash required");
        require(!usedHashes[_dataHash], "Evidence already exists");
        
        uint256 evidenceId = _evidenceIdCounter.current();
        _evidenceIdCounter.increment();
        
        Evidence storage newEvidence = evidences[evidenceId];
        newEvidence.id = evidenceId;
        newEvidence.ipfsHash = _ipfsHash;
        newEvidence.dataHash = _dataHash;
        newEvidence.submitter = msg.sender;
        newEvidence.timestamp = block.timestamp;
        newEvidence.evidenceType = _evidenceType;
        newEvidence.status = EvidenceStatus.SUBMITTED;
        newEvidence.chainId = block.chainid;
        
        usedHashes[_dataHash] = true;
        userEvidences[msg.sender].push(evidenceId);
        evidenceAccess[evidenceId][msg.sender] = true;
        
        // Initialize chain of custody
        _addCustodyEntry(evidenceId, msg.sender, "Evidence Submitted", "Initial submission");
        
        emit EvidenceSubmitted(evidenceId, msg.sender, _ipfsHash, _dataHash);
        
        return evidenceId;
    }
    
    function addAIAnalysis(
        uint256 _evidenceId,
        string memory _analysisHash
    ) public onlyRole(VALIDATOR_ROLE) {
        require(_evidenceId < _evidenceIdCounter.current(), "Invalid evidence ID");
        
        Evidence storage evidence = evidences[_evidenceId];
        evidence.aiAnalysisHashes.push(_analysisHash);
        
        if (evidence.status == EvidenceStatus.UNDER_REVIEW) {
            evidence.status = EvidenceStatus.AI_ANALYZED;
            emit EvidenceStatusChanged(_evidenceId, EvidenceStatus.UNDER_REVIEW, EvidenceStatus.AI_ANALYZED);
        }
        
        emit AIAnalysisAdded(_evidenceId, _analysisHash);
    }
    
    // ==================== Helper Functions ====================
    
    function _addCustodyEntry(
        uint256 _evidenceId,
        address _handler,
        string memory _action,
        string memory _notes
    ) private {
        CustodyEntry memory entry = CustodyEntry({
            handler: _handler,
            timestamp: block.timestamp,
            action: _action,
            notes: _notes,
            signature: ""
        });
        
        chainOfCustody[_evidenceId].push(entry);
    }
    
    // ==================== View Functions ====================
    
    function getEvidence(uint256 _evidenceId) public view returns (Evidence memory) {
        require(_evidenceId < _evidenceIdCounter.current(), "Invalid evidence ID");
        return evidences[_evidenceId];
    }
    
    function getChainOfCustody(uint256 _evidenceId) public view returns (CustodyEntry[] memory) {
        require(_evidenceId < _evidenceIdCounter.current(), "Invalid evidence ID");
        return chainOfCustody[_evidenceId];
    }
    
    function getUserEvidences(address _user) public view returns (uint256[] memory) {
        return userEvidences[_user];
    }
    
    // ==================== Admin Functions ====================
    
    function pause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    function unpause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
