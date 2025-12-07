// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32, ebool, externalEbool} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
// inherits from SepoliaConfig to enable fhEVM support
contract SimplestFHEVoter is SepoliaConfig {

    euint32 private encryptedCount;
    mapping(address => euint32) private votes;
    mapping(address => bool) private hasVoted;
    address private owner;

    constructor() {
        encryptedCount = FHE.asEuint32(0);
        FHE.allowThis(encryptedCount);
        owner = msg.sender;
    }

    function vote(externalEuint32 externalVote, bytes calldata proof) external {
        require(!hasVoted[msg.sender], "You have already voted");
        hasVoted[msg.sender] = true;
        
        // 1. Validamos el voto del usuario
        euint32 currentVote = FHE.fromExternal(externalVote, proof);
        
        // 2. Lo sumamos al contador total
        encryptedCount = FHE.add(encryptedCount, currentVote);

        // 3.a. Le damos permisos al contrato para poder sumar
        FHE.allowThis(encryptedCount);
        // 3.b. Le damos permisos al usuario para que pueda decriptar su voto 
        FHE.allow(currentVote, msg.sender);

        // 4. Guardamos el voto del usuario
        votes[msg.sender] = currentVote;
    }

    function getMyVote() external view returns (euint32) {
        require(hasVoted[msg.sender], "You have not voted yet");
        return votes[msg.sender];
    }

}
