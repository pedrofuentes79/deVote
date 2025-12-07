// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32, ebool, externalEbool} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

contract FHEMultipleCandidatesVoter is SepoliaConfig {
    struct VoterState {
        uint256 lastElectionId;
        euint32 encryptedVote;
    }

    uint32 public candidateCount;

    mapping(uint32 => euint32) private candidateVoteCounts;
    mapping(address => VoterState) private voterStates;

    mapping(uint32 => uint32) private clearCandidateCounts;
    address private owner;
    bool private isVotingOpen;
    uint256 private electionId;

    euint32 private encryptedConstantOne;
    euint32 private encryptedConstantZero;
    mapping(uint32 => euint32) private encryptedCandidateIds;

    event CountsDecrypted(uint32[] counts);
    event VotingStarted();
    event VotingClosed();

    constructor(uint32 _candidateCount) {
        require(_candidateCount > 0, "Must have at least one candidate");
        owner = msg.sender;
        candidateCount = _candidateCount;
        isVotingOpen = true;
        electionId = 1;

        encryptedConstantOne = FHE.asEuint32(1);
        encryptedConstantZero = FHE.asEuint32(0);
        FHE.allowThis(encryptedConstantOne);
        FHE.allowThis(encryptedConstantZero);

        for (uint32 i = 0; i < candidateCount; ++i) {
            candidateVoteCounts[i] = FHE.asEuint32(0);
            FHE.allowThis(candidateVoteCounts[i]);
            encryptedCandidateIds[i] = FHE.asEuint32(i);
            FHE.allowThis(encryptedCandidateIds[i]);
        }

        emit VotingStarted();
    }

    modifier onlyWhenVotingOpen() {
        require(isVotingOpen, "Voting is not open");
        _;
    }

    modifier onlyWhenVotingClosed() {
        require(!isVotingOpen, "Voting is open");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    function closeVoting() external onlyWhenVotingOpen onlyOwner {
        isVotingOpen = false;
        emit VotingClosed();
    }

    function startVoting() external onlyOwner {
        isVotingOpen = true;
        electionId++;

        for (uint32 i = 0; i < candidateCount; ++i) {
            candidateVoteCounts[i] = FHE.asEuint32(0);
            FHE.allowThis(candidateVoteCounts[i]);
        }

        for (uint32 i = 0; i < candidateCount; ++i) {
            clearCandidateCounts[i] = 0;
        }

        emit VotingStarted();
    }

    function eboolToOneOrZero(ebool boolValue) private returns (euint32) {
        return FHE.select(boolValue, encryptedConstantOne, encryptedConstantZero);
    }

    function setVote(euint32 currentVote, address voter) private {
        voterStates[voter] = VoterState(electionId, currentVote);
        FHE.allow(currentVote, voter);
        FHE.allowThis(currentVote);
    }

    function vote(externalEuint32 encryptedCandidateId, bytes calldata proof) external onlyWhenVotingOpen {
        euint32 candidateId = FHE.fromExternal(encryptedCandidateId, proof);
        VoterState memory state = voterStates[msg.sender];

        if (state.lastElectionId == electionId) {
            euint32 previousCandidateId = state.encryptedVote;

            for (uint32 i = 0; i < candidateCount; ++i) {
                ebool isPreviousCandidate = FHE.eq(previousCandidateId, encryptedCandidateIds[i]);
                euint32 toSubtract = eboolToOneOrZero(isPreviousCandidate);
                candidateVoteCounts[i] = FHE.sub(candidateVoteCounts[i], toSubtract);
            }
        }

        for (uint32 i = 0; i < candidateCount; ++i) {
            ebool isThisCandidate = FHE.eq(candidateId, encryptedCandidateIds[i]);
            euint32 toAdd = eboolToOneOrZero(isThisCandidate);
            candidateVoteCounts[i] = FHE.add(candidateVoteCounts[i], toAdd);
            FHE.allowThis(candidateVoteCounts[i]);
        }

        setVote(candidateId, msg.sender);
    }

    function getCandidateCount(uint32 candidateId) external view onlyWhenVotingClosed returns (euint32) {
        require(candidateId < candidateCount, "Invalid candidate ID");
        return candidateVoteCounts[candidateId];
    }

    function getMyVote() external view returns (euint32) {
        VoterState memory state = voterStates[msg.sender];
        require(state.lastElectionId == electionId, "You have not voted yet");
        return state.encryptedVote;
    }

    function requestDecryption() external onlyWhenVotingClosed onlyOwner {
        bytes32[] memory cypherTexts = new bytes32[](candidateCount);

        // post increment to save gas. Done on all for loops of all contracts.
        for (uint32 i = 0; i < candidateCount; ++i) {
            cypherTexts[i] = FHE.toBytes32(candidateVoteCounts[i]);
        }

        FHE.requestDecryption(cypherTexts, this.callbackDecryptMultipleUint32.selector);
    }

    function getDecryptedCount(uint32 candidateId) external view onlyWhenVotingClosed returns (uint32) {
        require(candidateId < candidateCount, "Invalid candidate ID");
        return clearCandidateCounts[candidateId];
    }

    function getAllDecryptedCounts() external view onlyWhenVotingClosed returns (uint32[] memory) {
        uint32[] memory counts = new uint32[](candidateCount);
        for (uint32 i = 0; i < candidateCount; ++i) {
            counts[i] = clearCandidateCounts[i];
        }
        return counts;
    }

    function callbackDecryptMultipleUint32(
        uint256 requestID,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) external {
        FHE.checkSignatures(requestID, cleartexts, decryptionProof);

        // see docs/DECRYPTION_NOTES.md on why we need to manually extract the values
        uint32[] memory decryptedValues = new uint32[](candidateCount);

        for (uint32 i = 0; i < candidateCount; ++i) {
            uint32 value;
            assembly {
                // Load 32 bytes from cleartexts at offset (adding 32 for the length prefix)
                value := mload(add(add(cleartexts, 32), mul(i, 32)))
            }
            clearCandidateCounts[i] = value;
            decryptedValues[i] = value;
        }

        emit CountsDecrypted(decryptedValues);
    }
}
