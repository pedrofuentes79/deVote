// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";


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

//   /// @notice Decrements the counter by a specific value
//   function decrement(uint32 value) external {
//     require(_count >= value, "Counter: cannot decrement below zero");
//     _count -= value;
//   }



}
