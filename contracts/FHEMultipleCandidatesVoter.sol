// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32, ebool, externalEbool} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

contract FHEMultipleCandidatesVoter is SepoliaConfig {
    uint32 public candidateCount;

    mapping(uint32 => euint32) private candidateVoteCounts;
    mapping(address => euint32) private voterChoices;
    mapping(address => bool) private hasVoted;

    mapping(uint32 => uint32) private clearCandidateCounts;
    address private owner;
    bool private isVotingOpen;

    mapping(uint32 => euint32) private encryptedCandidateIds;

    event CountsDecrypted(uint32[] counts);

    constructor(uint32 _candidateCount) {
        require(_candidateCount > 0, "Must have at least one candidate");
        owner = msg.sender;
        candidateCount = _candidateCount;
        isVotingOpen = true;

        for (uint32 i = 0; i < candidateCount; i++) {
            candidateVoteCounts[i] = FHE.asEuint32(0);
            FHE.allowThis(candidateVoteCounts[i]);
            encryptedCandidateIds[i] = FHE.asEuint32(i);
            FHE.allowThis(encryptedCandidateIds[i]);
        }
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
    }

    function eboolToOneOrZero(ebool boolValue) private returns (euint32) {
        return FHE.select(boolValue, FHE.asEuint32(1), FHE.asEuint32(0));
    }

    function vote(externalEuint32 encryptedCandidateId, bytes calldata proof) external onlyWhenVotingOpen {
        euint32 candidateId = FHE.fromExternal(encryptedCandidateId, proof);

        if (hasVoted[msg.sender]) {
            euint32 previousCandidateId = voterChoices[msg.sender];

            for (uint32 i = 0; i < candidateCount; i++) {
                ebool isPreviousCandidate = FHE.eq(previousCandidateId, encryptedCandidateIds[i]);
                euint32 toSubtract = eboolToOneOrZero(isPreviousCandidate);
                candidateVoteCounts[i] = FHE.sub(candidateVoteCounts[i], toSubtract);
            }
        }

        for (uint32 i = 0; i < candidateCount; i++) {
            ebool isThisCandidate = FHE.eq(candidateId, encryptedCandidateIds[i]);
            euint32 toAdd = eboolToOneOrZero(isThisCandidate);
            candidateVoteCounts[i] = FHE.add(candidateVoteCounts[i], toAdd);
            FHE.allowThis(candidateVoteCounts[i]);
        }

        voterChoices[msg.sender] = candidateId;
        FHE.allow(voterChoices[msg.sender], msg.sender);
        FHE.allowThis(voterChoices[msg.sender]);

        hasVoted[msg.sender] = true;
    }

    function getCandidateCount(uint32 candidateId) external view onlyWhenVotingClosed returns (euint32) {
        require(candidateId < candidateCount, "Invalid candidate ID");
        return candidateVoteCounts[candidateId];
    }

    function getMyVote() external view returns (euint32) {
        require(hasVoted[msg.sender], "You have not voted yet");
        return voterChoices[msg.sender];
    }

    function requestDecryption() external onlyWhenVotingClosed onlyOwner {
        bytes32[] memory cypherTexts = new bytes32[](candidateCount);

        for (uint32 i = 0; i < candidateCount; i++) {
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
        for (uint32 i = 0; i < candidateCount; i++) {
            counts[i] = clearCandidateCounts[i];
        }
        return counts;
    }

    function callbackDecryptMultipleUint32(
        uint32 requestID,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) external {
        FHE.checkSignatures(requestID, cleartexts, decryptionProof);

        // see docs/DECRYPTION_NOTES.md on why we need to manually extract the values
        uint32[] memory decryptedValues = new uint32[](candidateCount);

        for (uint32 i = 0; i < candidateCount; i++) {
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
