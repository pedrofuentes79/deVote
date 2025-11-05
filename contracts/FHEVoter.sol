// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32, ebool, externalEbool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

// IDEA: usar ZKPs para verificar que lo que me da el usuario es un numero entre 0 y 1 (cuando esto sea un voting system


// inherits from SepoliaConfig to enable fhEVM support
contract FHEVoter is SepoliaConfig {

    euint32 private _count;
    mapping(address => bool) private _voters;
    euint32 private _constantOne;
    euint32 private _constantZero;

    constructor() {
        _constantOne = FHE.asEuint32(1);
        _constantZero = FHE.asEuint32(0);
        FHE.allowThis(_constantOne);
        FHE.allowThis(_constantZero);
    }


    // using a boolean allows us to ensure what we add is always 0 or 1
    function vote(externalEbool externalYesOrNo, bytes calldata proof) external {
        require(!_voters[msg.sender], "Voter already voted");
        ebool yesOrNo = FHE.fromExternal(externalYesOrNo, proof);
        euint32 voteToAdd = FHE.select(yesOrNo, _constantOne, _constantZero);

        _count = FHE.add(_count, voteToAdd);

        FHE.allowThis(_count);
        FHE.allow(_count, msg.sender);
        _voters[msg.sender] = true;
    }

    function getCount() external view returns (euint32) {
        return _count;
    }

}
