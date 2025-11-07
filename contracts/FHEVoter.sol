// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32, ebool, externalEbool} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

// inherits from SepoliaConfig to enable fhEVM support
contract FHEVoter is SepoliaConfig {
    euint32 private encryptedCount;
    euint32 private encryptedConstantOne;
    euint32 private encryptedConstantZero;
    mapping(address => ebool) private individualVotes;

    // it'd be better to not have this... since it's quite easy for someone compromising the contract
    // to get the list of voters. the individualVotes at least requires you to check every address...
    // we can remove it by having a "live tally" model, only keeping `individualVotes`.
    // when someone votes for the second (or more) time, we substract their previous vote from the total
    // and we then add the new vote.
    address[] private voters;

    mapping(address => bool) private hasVoted;
    uint32 private totalVotes; // =0 by default. It is only used when the owner calls "decryptCount"
    address private owner;
    bool private votesCounted;
    bool private isVotingOpen;

    event CountDecrypted(uint32 count);

    constructor() {
        owner = msg.sender;
        encryptedConstantOne = FHE.asEuint32(1);
        encryptedConstantZero = FHE.asEuint32(0);
        FHE.allowThis(encryptedConstantOne);
        FHE.allowThis(encryptedConstantZero);
        isVotingOpen = true;
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

    function closeVoting() external onlyWhenVotingOpen onlyOwner{
        isVotingOpen = false;
    }

    // using a boolean allows us to ensure what we add is always 0 or 1
    function vote(externalEbool externalYesOrNo, bytes calldata proof) external onlyWhenVotingOpen {
        ebool yesOrNo = FHE.fromExternal(externalYesOrNo, proof);

        individualVotes[msg.sender] = yesOrNo;
        if (!hasVoted[msg.sender]) {
            voters.push(msg.sender);
            hasVoted[msg.sender] = true;
        }

        FHE.allow(individualVotes[msg.sender], msg.sender); // allows the sender to decrypt ITS VOTE
        FHE.allowThis(individualVotes[msg.sender]); // allows the contract to use this value too
    }

    function getCount() external onlyWhenVotingClosed view returns (euint32) {
        return encryptedCount;
    }

    function getMyVote() external view returns (ebool) {
        return individualVotes[msg.sender];
    }

    function countVotes() private onlyWhenVotingClosed onlyOwner {
        if (votesCounted) return;

        for (uint256 i = 0; i < voters.length; i++) {
            euint32 voteToAdd = FHE.select(individualVotes[voters[i]], encryptedConstantOne, encryptedConstantZero);
            encryptedCount = FHE.add(encryptedCount, voteToAdd);
            FHE.allowThis(encryptedCount);
        }
        votesCounted = true;
    }

    function requestDecryption() external onlyWhenVotingClosed onlyOwner {
        countVotes();

        bytes32[] memory cypherTexts = new bytes32[](1);
        cypherTexts[0] = FHE.toBytes32(encryptedCount);
            FHE.requestDecryption(
            // the list of encrypted values we want to publc decrypt
            cypherTexts,
            // the function selector the FHEVM backend will callback with the clear values as arguments
            this.callbackDecryptSingleUint32.selector
        );
    }

    function getDecryptedCount() external onlyWhenVotingClosed view returns (uint32) {
        return totalVotes;
    }

    function callbackDecryptSingleUint32(
        uint256 requestID, 
        bytes memory cleartexts, 
        bytes memory decryptionProof
    ) external {
        // The `cleartexts` argument is an ABI encoding of the decrypted values associated to the
        // handles (using `abi.encode`). 
        // 
        // ===============================
        //    ☠️🔒 SECURITY WARNING! 🔒☠️
        // ===============================
        //
        // Must call `FHE.checkSignatures(...)` here!
        //            ------------------------
        //
        // This callback must only be called by the authorized FHEVM backend.
        // To enforce this, the contract author MUST verify the authenticity of the caller
        // by using the `FHE.checkSignatures` helper. This ensures that the provided signatures
        // match the expected FHEVM backend and prevents unauthorized or malicious calls.
        //
        // Failing to perform this verification allows anyone to invoke this function with
        // forged values, potentially compromising contract integrity.
        //
        // The responsibility for signature validation lies entirely with the contract author.
        // 
        // The signatures are included in the `decryptionProof` parameter.
        //
        FHE.checkSignatures(requestID, cleartexts, decryptionProof);

        (uint32 decryptedInput) = abi.decode(cleartexts, (uint32));
        totalVotes = decryptedInput;

        emit CountDecrypted(totalVotes);
    }


}
