// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

// IDEA: usar ZKPs para verificar que lo que me da el usuario es un numero entre 0 y 1 (cuando esto sea un voting system


// inherits from SepoliaConfig to enable fhEVM support
contract FHECounter is SepoliaConfig {
  euint32 private _count;

  /// @notice Returns the current count
  function getCount() external view returns (euint32) {
    return _count;
  }

  function increment(externalEuint32 inputEuint32, bytes calldata inputProof) external {
    euint32 evalue = FHE.fromExternal(inputEuint32, inputProof);
    _count = FHE.add(_count, evalue);
    
    // allows later operations on _count
    FHE.allowThis(_count);
    FHE.allow(_count, msg.sender);

  }

  function decrement(externalEuint32 inputEuint32, bytes calldata inputProof) external {
    euint32 evalue = FHE.fromExternal(inputEuint32, inputProof);
    _count = FHE.sub(_count, evalue);

    // allows later operations on _count
    FHE.allowThis(_count);
    FHE.allow(_count, msg.sender);

  }

}
