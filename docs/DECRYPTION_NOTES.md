# FHEVM Decryption Callback Notes

## The Question
Why do we need assembly code in `FHEMultipleCandidatesVoter` when `FHEVoter` uses simple `abi.decode`?

## The Answer

### Single Value Decryption ✅ (Works with `abi.decode`)
```solidity
// FHEVoter.sol - Single value
function callbackDecryptSingleUint32(
    uint256 requestID, 
    bytes memory cleartexts, 
    bytes memory decryptionProof
) external {
    FHE.checkSignatures(requestID, cleartexts, decryptionProof);
    (uint32 decryptedInput) = abi.decode(cleartexts, (uint32));
    clearCount = decryptedInput;
}
```

### Multiple Values - Fixed Size ✅ (Works with tuples)
According to [Zama's docs](https://docs.zama.ai/protocol/examples/basic/decryption/fhe-decrypt-multiple-values):
```solidity
// WORKS: Fixed tuple of known types
(bool decryptedBool, uint32 decryptedUint32, uint64 decryptedUint64) = 
    abi.decode(cleartexts, (bool, uint32, uint64));
```

### Multiple Values - Dynamic Size ❌ (Requires assembly)
```solidity
// DOES NOT WORK: Dynamic array
uint32[] memory decryptedValues = abi.decode(cleartexts, (uint32[]));
// ❌ Fails with "Transaction reverted without a reason string"
```

## Why Assembly is Needed

FHEVM's decryption oracle returns multiple values as **raw concatenated 32-byte words**, not as standard ABI-encoded arrays.

- **For tuples**: `abi.decode` works because the types are known at compile time
- **For arrays**: `abi.decode` expects ABI encoding with length prefix, but FHEVM doesn't provide it that way

### Our Solution
```solidity
function callbackDecryptMultipleUint32(...) external {
    FHE.checkSignatures(requestID, cleartexts, decryptionProof);
    
    uint32[] memory decryptedValues = new uint32[](candidateCount);
    
    for (uint32 i = 0; i < candidateCount; i++) {
        uint32 value;
        assembly {
            // Skip 32 bytes (length prefix) + i*32 bytes offset
            value := mload(add(add(cleartexts, 32), mul(i, 32)))
        }
        clearCandidateCounts[i] = value;
        decryptedValues[i] = value;
    }
}
```

## Alternative: Fixed-Size Tuples

If you always have exactly 3 candidates, you could use:
```solidity
constructor() {
    // Fixed at 3 candidates
    candidateCount = 3;
    // ... initialization
}

function callbackDecryptMultipleUint32(...) external {
    FHE.checkSignatures(requestID, cleartexts, decryptionProof);
    
    // This WOULD work for fixed size
    (uint32 count0, uint32 count1, uint32 count2) = 
        abi.decode(cleartexts, (uint32, uint32, uint32));
    
    clearCandidateCounts[0] = count0;
    clearCandidateCounts[1] = count1;
    clearCandidateCounts[2] = count2;
}
```

But this loses flexibility - can't deploy with different numbers of candidates.

## Conclusion

**The assembly code IS necessary** for dynamic-size arrays with FHEVM. It's not documented in Zama's examples because they only show:
1. Single value decryption (simple `abi.decode`)
2. Multiple fixed values (tuple `abi.decode`)

They don't have an example of **dynamic-length same-type arrays**, which is our use case.

## Testing Results

- ✅ Assembly approach: **All 13 tests passing**
- ❌ Standard `abi.decode(cleartexts, (uint32[]))`: **Transaction reverted**
- ✅ Single value `abi.decode(cleartexts, (uint32))`: **Works** (as seen in FHEVoter.sol)

The assembly code is safe, well-commented, and the only way to handle dynamic arrays in FHEVM decryption callbacks.

