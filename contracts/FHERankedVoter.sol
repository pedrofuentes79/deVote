// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32, ebool, externalEbool} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";


contract FHERankedVoter is SepoliaConfig {
    struct VoterState {
        uint256 lastElectionId;
        euint32[] encryptedVotes;
    }

    uint32 public candidateCount;
    uint32 public maxVoteChoices;
    uint32[] public votePoints;

    mapping(uint32 => euint32) private candidateVoteCounts;
    mapping(address => VoterState) private voterStates;

    mapping(uint32 => uint32) private clearCandidateCounts;
    address private owner;
    bool private isVotingOpen;
    uint256 private electionId;

    euint32 private encryptedConstantOne;
    euint32 private encryptedConstantZero;
    mapping(uint32 => euint32) private encryptedCandidateIds;
    mapping(uint32 => euint32) private encryptedVotePoints;

    event CountsDecrypted(uint32[] counts);
    event VotingStarted();
    event VotingClosed();

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

        for (uint32 i = 0; i < maxVoteChoices; ++i) {
            encryptedVotePoints[i] = FHE.asEuint32(votePoints[i]);
            FHE.allowThis(encryptedVotePoints[i]);
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

    function vote(externalEuint32[] memory encryptedVotes, bytes calldata proof) external onlyWhenVotingOpen {
        require(encryptedVotes.length == maxVoteChoices, "Invalid number of vote choices");

        VoterState storage state = voterStates[msg.sender];
        bool hasVotedBefore = state.lastElectionId == electionId;

        if (hasVotedBefore) {
            for (uint32 i = 0; i < maxVoteChoices; ++i) {
                euint32 previousCandidateId = state.encryptedVotes[i];

                for (uint32 j = 0; j < candidateCount; ++j) {
                    ebool isPreviousCandidate = FHE.eq(previousCandidateId, encryptedCandidateIds[j]);
                    euint32 toSubtract = FHE.select(isPreviousCandidate, encryptedVotePoints[i], encryptedConstantZero);
                    candidateVoteCounts[j] = FHE.sub(candidateVoteCounts[j], toSubtract);
                }
            }
        }

        // Clear old choices if this is a new election (user voted before but not in this election)
        if (!hasVotedBefore && state.encryptedVotes.length > 0) {
            delete state.encryptedVotes;
        }

        for (uint32 i = 0; i < maxVoteChoices; ++i) {
            euint32 candidateId = FHE.fromExternal(encryptedVotes[i], proof);

            if (hasVotedBefore) {
                state.encryptedVotes[i] = candidateId;
            } else {
                state.encryptedVotes.push(candidateId);
            }

            FHE.allow(state.encryptedVotes[i], msg.sender);
            FHE.allowThis(state.encryptedVotes[i]);

            for (uint32 j = 0; j < candidateCount; ++j) {
                ebool isThisCandidate = FHE.eq(candidateId, encryptedCandidateIds[j]);
                euint32 toAdd = FHE.select(isThisCandidate, encryptedVotePoints[i], encryptedConstantZero);
                candidateVoteCounts[j] = FHE.add(candidateVoteCounts[j], toAdd);
                FHE.allowThis(candidateVoteCounts[j]);
            }
        }

        state.lastElectionId = electionId;
    }

    function getCandidateCount(uint32 candidateId) external view onlyWhenVotingClosed returns (euint32) {
        require(candidateId < candidateCount, "Invalid candidate ID");
        return candidateVoteCounts[candidateId];
    }

    function getMyVote() external view returns (euint32[] memory) {
        VoterState storage state = voterStates[msg.sender];
        require(state.lastElectionId == electionId, "You have not voted yet");
        return state.encryptedVotes;
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
