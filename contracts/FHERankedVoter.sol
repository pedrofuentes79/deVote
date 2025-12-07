// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32, ebool, externalEbool} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

// TODO: implement multiple rounds of voting

contract FHERankedVoter is SepoliaConfig {
    uint32 public candidateCount;
    uint32 public maxVoteChoices;
    uint32[] public votePoints;

    mapping(uint32 => euint32) private candidateVoteCounts;
    mapping(address => euint32[]) private voterChoices;
    mapping(address => bool) private hasVoted;

    mapping(uint32 => uint32) private clearCandidateCounts;
    address private owner;
    bool private isVotingOpen;

    mapping(uint32 => euint32) private encryptedCandidateIds;
    mapping(uint32 => euint32) private encryptedVotePoints;

    event CountsDecrypted(uint32[] counts);

    constructor(uint32 _candidateCount, uint32 _maxVoteChoices, uint32[] memory _votePoints) {
        require(_candidateCount > 0, "Must have at least one candidate");
        require(_maxVoteChoices > 0, "Must have at least one vote choice");
        require(_votePoints.length == _maxVoteChoices, "Vote points must match max vote choices");
        require(
            _candidateCount >= _maxVoteChoices,
            "Candidate count must be greater than or equal to max vote choices"
        );

        owner = msg.sender;
        candidateCount = _candidateCount;
        maxVoteChoices = _maxVoteChoices;
        votePoints = _votePoints;
        isVotingOpen = true;

        for (uint32 i = 0; i < candidateCount; ++i) {
            candidateVoteCounts[i] = FHE.asEuint32(0);
            FHE.allowThis(candidateVoteCounts[i]);
            // should this be ran every time instead of saving it?
            encryptedCandidateIds[i] = FHE.asEuint32(i);
            FHE.allowThis(encryptedCandidateIds[i]);
        }

        for (uint32 i = 0; i < maxVoteChoices; ++i) {
            // should this be ran every time instead of saving it?
            encryptedVotePoints[i] = FHE.asEuint32(votePoints[i]);
            FHE.allowThis(encryptedVotePoints[i]);
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

    function vote(externalEuint32[] memory encryptedVotes, bytes calldata proof) external onlyWhenVotingOpen {
        require(encryptedVotes.length == maxVoteChoices, "Invalid number of vote choices");

        if (hasVoted[msg.sender]) {
            for (uint32 i = 0; i < maxVoteChoices; ++i) {
                euint32 previousCandidateId = voterChoices[msg.sender][i];

                for (uint32 j = 0; j < candidateCount; ++j) {
                    ebool isPreviousCandidate = FHE.eq(previousCandidateId, encryptedCandidateIds[j]);
                    euint32 toSubtract = FHE.select(isPreviousCandidate, encryptedVotePoints[i], FHE.asEuint32(0));
                    candidateVoteCounts[j] = FHE.sub(candidateVoteCounts[j], toSubtract);
                }
            }
        }

        for (uint32 i = 0; i < maxVoteChoices; ++i) {
            euint32 candidateId = FHE.fromExternal(encryptedVotes[i], proof);

            if (hasVoted[msg.sender]) {
                voterChoices[msg.sender][i] = candidateId;
            } else {
                // how can this fail?
                voterChoices[msg.sender].push(candidateId);
            }

            FHE.allow(voterChoices[msg.sender][i], msg.sender);
            FHE.allowThis(voterChoices[msg.sender][i]);

            for (uint32 j = 0; j < candidateCount; ++j) {
                ebool isThisCandidate = FHE.eq(candidateId, encryptedCandidateIds[j]);
                euint32 toAdd = FHE.select(isThisCandidate, encryptedVotePoints[i], FHE.asEuint32(0));
                candidateVoteCounts[j] = FHE.add(candidateVoteCounts[j], toAdd);
                FHE.allowThis(candidateVoteCounts[j]);
            }
        }

        hasVoted[msg.sender] = true;
    }

    function getCandidateCount(uint32 candidateId) external view onlyWhenVotingClosed returns (euint32) {
        require(candidateId < candidateCount, "Invalid candidate ID");
        return candidateVoteCounts[candidateId];
    }

    function getMyVote() external view returns (euint32[] memory) {
        require(hasVoted[msg.sender], "You have not voted yet");
        return voterChoices[msg.sender];
    }

    function requestDecryption() external onlyWhenVotingClosed onlyOwner {
        bytes32[] memory cypherTexts = new bytes32[](candidateCount);

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
        uint32 requestID,
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
