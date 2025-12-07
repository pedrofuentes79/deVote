# deVote

A privacy-preserving voting system built on Ethereum using Fully Homomorphic Encryption (FHE) technology from Zama. This project enables secure, verifiable, and coercion-resistant voting through blockchain smart contracts.

## Overview

deVote is a smart contract system that allows users to cast encrypted votes that can be tallied without revealing individual choices. The system provides vote verification for voters while maintaining privacy, and includes mechanisms to prevent vote coercion.

## Key Features

- **Private Voting**: Cast votes that remain encrypted on-chain using FHE
- **Vote Verification**: Voters can verify their vote was recorded correctly without revealing it to others
- **Coercion Resistance**: Voters can change their vote multiple times (only the last vote counts)
- **Transparent Tallying**: Final vote totals are publicly revealed after voting closes
- **Multiple Voting Schemes**: Support for simple yes/no votes, multiple candidates, and ranked-choice voting
- **Pseudonymous**: Users are identified by Ethereum addresses (identity verification assumed off-chain)

## How It Works

### Fully Homomorphic Encryption (FHE)

The system uses Zama's FHE technology to enable computation on encrypted data:

1. **Encrypted Storage**: Votes are stored as `ebool` (encrypted boolean) or `euint` (encrypted unsigned integer) types. These are actually handles/pointers to encrypted values stored in the FHE coprocessor.

2. **Encrypted Operations**: When tallying votes, the contract calls `FHE.add(totalEncrypted, currentVote)`. The coprocessor performs the addition on encrypted values and returns a new encrypted result.

3. **Access Control**: The contract uses Access Control Lists (ACL) to manage who can decrypt values:
   ```solidity
   FHE.allow(individualVotes[msg.sender], msg.sender);
   ```
   This allows voters to decrypt and verify their own votes, but nobody else can.

4. **Decryption**: After voting closes, the contract owner can request decryption of the final tally through the decryption oracle.

### Vote Verification

Voters can retrieve their encrypted vote and decrypt it locally because they are added to the ACL for their specific vote. The smart contract never decrypts individual votes - it only performs encrypted operations on them.

### Vote Modification

Users can vote multiple times, and only the last vote is counted. This prevents vote buying: even if a coercer watches a voter cast a vote, the voter can later change it.

## Contracts

The project includes several voting contract implementations:

- **`FHEVoter.sol`**: Enhanced yes/no voting with additional features
- **`FHEMultipleCandidatesVoter.sol`**: Vote for one candidate among multiple options
- **`FHERankedVoter.sol`**: Ranked-choice voting system

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/deVote.git
cd deVote

# Install dependencies
npm install
```

## Usage

### Compile Contracts

```bash
npx hardhat compile
```

### Run Tests

```bash
npx hardhat test
```

### Deploy

```bash
npx hardhat run deploy/deploy.ts --network <network-name>
```

## Testing

The project includes comprehensive tests for all voting contracts:

```bash
# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/FHEVoter.ts
```

## Security Considerations

### Threat Model

#### Passive Adversary

A passive adversary who observes blockchain transactions can:
- **See who voted**: Transaction senders are visible on-chain
- **See voting frequency**: If a user votes multiple times, this is observable

A passive adversary **cannot**:
- **See vote contents**: Votes are encrypted with FHE
- **Decrypt votes**: Decryption requires the voter's signature (for individual votes) or owner privileges (for final tally)

#### Active Adversary

##### Vote Coercion

**Attack**: An adversary attempts to buy votes by requiring voters to prove how they voted.

**Partial Mitigation**: Voters can cast multiple votes, with only the last one counting. After proving their vote to a coercer, they can vote again.

**Limitation**: If the coercer monitors blockchain activity, they can detect if a voter submits another transaction to the voting contract and refuse payment.

**Future Solutions** (see below):
- Mix networks to hide transaction origin
- Ring signatures to provide sender anonymity within a group
- Zero-knowledge proofs that a sender belongs to an authorized set without revealing which member

### Important Notes

- **FHE.select() Behavior**: When using `FHE.select(condition, value1, value2)`, the result is a new encrypted value with the same plaintext as the selected input, but it's not the identical ciphertext. This is important for security (see Section 3.2 of Zama's paper).
- **Off-chain Identity**: The system assumes identity verification happens off-chain through a trusted entity. Only verified users receive addresses authorized to vote.

## Known Vulnerabilities

### 1. Transaction Monitoring
While votes are encrypted, the act of voting is visible on-chain. This enables:
- Tracking which addresses have voted
- Detecting when someone votes multiple times
- Potential for coercion if combined with vote buying schemes

### 2. Timing Attacks
The timestamp of votes is visible, which could be combined with other metadata for analysis.

### 3. Gas Pattern Analysis
Different vote values might result in slightly different gas consumption patterns, potentially leaking information.

## Future Work

### Identity-verification system
Currently I have not implemented this. It depends heavily in the use case. There is a lot of research in this area that could be explored in the future.


### Anonymity Improvements

1. **Mix Networks**: Implement mix-nets to shuffle transactions and hide their origin, making it difficult to track who is voting or changing their vote.

2. **Ring Signatures**: Allow voters to prove they are part of an authorized group without revealing which specific member they are (similar to Monero's approach).

3. **Zero-Knowledge Proofs**: Implement ZK proofs to verify voter eligibility without revealing identity.

### Additional Features

1. **Quadratic Voting**: Allow voters to express preference intensity by allocating multiple votes across options.

2. **Delegation**: Enable voters to delegate their voting power to representatives.

3. **Time-locked Voting**: Implement vote encryption with time-lock puzzles for even stronger guarantees.

4. **Vote Weight**: Support weighted voting based on token holdings or other criteria.

5. **Multi-stage Voting**: Support for primary elections, runoffs, etc.

### Performance & UX

1. **Gas Optimization**: Reduce transaction costs for voting operations
2. **Batch Operations**: Allow batch decryption and tallying
3. **User Interface**: Develop a user-friendly frontend for voting
4. **Mobile Support**: Create mobile apps for easier access

## Technologies

- **Solidity**: Smart contract development
- **Hardhat**: Development environment and testing
- **Zama fhEVM**: Fully Homomorphic Encryption on Ethereum
- **TypeScript**: Testing and deployment scripts
- **Ethers.js**: Ethereum library for interactions

## Project Structure

```
deVote/
├── contracts/          # Solidity smart contracts
├── test/              # Test files
├── deploy/            # Deployment scripts
├── tasks/             # Hardhat tasks
├── docs/              # Documentation
└── types/             # TypeScript type definitions
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the terms specified in the LICENSE file.

## References

- [Zama fhEVM Documentation](https://docs.zama.ai/fhevm)
- [Fully Homomorphic Encryption](https://en.wikipedia.org/wiki/Homomorphic_encryption)
- [Hardhat Documentation](https://hardhat.org/getting-started/)

## Disclaimer

This is experimental software. Do not use in production without thorough security audits. The vulnerabilities and limitations described above should be carefully considered before any real-world deployment.

## Acknowledgments

Built with Zama's fhEVM technology, enabling practical fully homomorphic encryption on Ethereum.
