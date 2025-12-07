import { FHERankedVoter, FHERankedVoter__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const ethSigners = await ethers.getSigners();
  const signers: Signers = {
    deployer: ethSigners[0],
    alice: ethSigners[1],
    bob: ethSigners[2],
  };

  const candidateCount = 5;
  const maxVoteChoices = 3;
  const votePoints = [3, 2, 1];

  const factory = (await ethers.getContractFactory("FHERankedVoter")) as FHERankedVoter__factory;
  const fheVoterContract = (await factory.deploy(
    candidateCount,
    maxVoteChoices,
    votePoints
  )) as FHERankedVoter;
  const fheVoterContractAddress = await fheVoterContract.getAddress();

  return { fheVoterContract, fheVoterContractAddress, signers, candidateCount, maxVoteChoices, votePoints };
}

describe("FHERankedVoter", function () {
  let signers: Signers;
  let fheVoterContract: FHERankedVoter;
  let fheVoterContractAddress: string;

  beforeEach(async () => {
    ({ fheVoterContract, fheVoterContractAddress, signers } = await deployFixture());
  });

  it("should allow Alice to cast a ranked vote", async function () {
    // Alice votes for Candidate 0 (1st), Candidate 1 (2nd), Candidate 2 (3rd)
    // Points should be: Cand 0 += 3, Cand 1 += 2, Cand 2 += 1
    const input = fhevm.createEncryptedInput(fheVoterContractAddress, signers.alice.address);
    
    input.add32(0); // 1st choice
    input.add32(1); // 2nd choice
    input.add32(2); // 3rd choice
    
    const encryptedVote = await input.encrypt();

    // Pass all handles and the single proof
    const tx = await fheVoterContract.connect(signers.alice).vote(
      encryptedVote.handles,
      encryptedVote.inputProof
    );
    await tx.wait();

    // Verify MyVote
    const myVoteEncrypted = await fheVoterContract.connect(signers.alice).getMyVote();
    expect(myVoteEncrypted.length).to.eq(3);
    
    const choice1 = await fhevm.userDecryptEuint(
        FhevmType.euint32,
        myVoteEncrypted[0],
        fheVoterContractAddress,
        signers.alice
    );
    expect(choice1).to.eq(0);

    const choice2 = await fhevm.userDecryptEuint(
        FhevmType.euint32,
        myVoteEncrypted[1],
        fheVoterContractAddress,
        signers.alice
    );
    expect(choice2).to.eq(1);

    const choice3 = await fhevm.userDecryptEuint(
        FhevmType.euint32,
        myVoteEncrypted[2],
        fheVoterContractAddress,
        signers.alice
    );
    expect(choice3).to.eq(2);
  });

  it("should correctly tabulate points after voting closes", async function () {
    // Alice votes: 0 (3pts), 1 (2pts), 2 (1pt)
    const inputAlice = fhevm.createEncryptedInput(fheVoterContractAddress, signers.alice.address);
    inputAlice.add32(0).add32(1).add32(2);
    const encAlice = await inputAlice.encrypt();
    await (await fheVoterContract.connect(signers.alice).vote(encAlice.handles, encAlice.inputProof)).wait();

    // Bob votes: 1 (3pts), 2 (2pts), 0 (1pt)
    const inputBob = fhevm.createEncryptedInput(fheVoterContractAddress, signers.bob.address);
    inputBob.add32(1).add32(2).add32(0);
    const encBob = await inputBob.encrypt();
    await (await fheVoterContract.connect(signers.bob).vote(encBob.handles, encBob.inputProof)).wait();

    // Close voting and decrypt
    await fheVoterContract.connect(signers.deployer).closeVoting();
    await (await fheVoterContract.connect(signers.deployer).requestDecryption()).wait();
    await fhevm.awaitDecryptionOracle();

    const counts = await fheVoterContract.connect(signers.deployer).getAllDecryptedCounts();
    
    // Expected Totals:
    // Cand 0: 3 (Alice) + 1 (Bob) = 4
    // Cand 1: 2 (Alice) + 3 (Bob) = 5
    // Cand 2: 1 (Alice) + 2 (Bob) = 3
    // Cand 3: 0
    // Cand 4: 0

    expect(counts[0]).to.eq(4);
    expect(counts[1]).to.eq(5);
    expect(counts[2]).to.eq(3);
    expect(counts[3]).to.eq(0);
    expect(counts[4]).to.eq(0);
  });

  it("should allow double voting and only count the last vote", async function () {
    // Alice votes: 0 (3pts), 1 (2pts), 2 (1pt)
    const inputAlice1 = fhevm.createEncryptedInput(fheVoterContractAddress, signers.alice.address);
    inputAlice1.add32(0).add32(1).add32(2);
    const encAlice1 = await inputAlice1.encrypt();
    await (await fheVoterContract.connect(signers.alice).vote(encAlice1.handles, encAlice1.inputProof)).wait();

    // Alice re-votes: 1 (3pts), 0 (2pts), 2 (1pt)
    const inputAlice2 = fhevm.createEncryptedInput(fheVoterContractAddress, signers.alice.address);
    inputAlice2.add32(1).add32(0).add32(2);
    const encAlice2 = await inputAlice2.encrypt();
    await (await fheVoterContract.connect(signers.alice).vote(encAlice2.handles, encAlice2.inputProof)).wait();

    // Close voting and decrypt
    await fheVoterContract.connect(signers.deployer).closeVoting();
    await (await fheVoterContract.connect(signers.deployer).requestDecryption()).wait();
    await fhevm.awaitDecryptionOracle();

    const counts = await fheVoterContract.connect(signers.deployer).getAllDecryptedCounts();

    // Expected Totals (only 2nd vote counts):
    // Cand 0: 2
    // Cand 1: 3
    // Cand 2: 1
    
    expect(counts[0]).to.eq(2);
    expect(counts[1]).to.eq(3);
    expect(counts[2]).to.eq(1);
    expect(counts[3]).to.eq(0);
    expect(counts[4]).to.eq(0);
  });

  it("should reset votes and count when voting restarts", async function () {
    // Alice votes: 0 (3pts), 1 (2pts), 2 (1pt)
    const inputAlice = fhevm.createEncryptedInput(fheVoterContractAddress, signers.alice.address);
    inputAlice.add32(0).add32(1).add32(2);
    const encAlice = await inputAlice.encrypt();
    await (await fheVoterContract.connect(signers.alice).vote(encAlice.handles, encAlice.inputProof)).wait();

    await fheVoterContract.connect(signers.deployer).closeVoting();
    
    // Restart
    await fheVoterContract.connect(signers.deployer).startVoting();

    // Alice votes differently in new election: 1 (3pts), 0 (2pts), 2 (1pt)
    const inputAlice2 = fhevm.createEncryptedInput(fheVoterContractAddress, signers.alice.address);
    inputAlice2.add32(1).add32(0).add32(2);
    const encAlice2 = await inputAlice2.encrypt();
    await (await fheVoterContract.connect(signers.alice).vote(encAlice2.handles, encAlice2.inputProof)).wait();

    await fheVoterContract.connect(signers.deployer).closeVoting();
    await (await fheVoterContract.connect(signers.deployer).requestDecryption()).wait();
    await fhevm.awaitDecryptionOracle();

    const counts = await fheVoterContract.connect(signers.deployer).getAllDecryptedCounts();

    // Old votes should be gone. Only new votes count.
    // Cand 0: 2
    // Cand 1: 3
    // Cand 2: 1
    expect(counts[0]).to.eq(2);
    expect(counts[1]).to.eq(3);
    expect(counts[2]).to.eq(1);
  });

  it("should revert when calling getMyVote if user has not voted in current election", async function () {
    // Alice votes in first election
    const inputAlice = fhevm.createEncryptedInput(fheVoterContractAddress, signers.alice.address);
    inputAlice.add32(0).add32(1).add32(2);
    const encAlice = await inputAlice.encrypt();
    await (await fheVoterContract.connect(signers.alice).vote(encAlice.handles, encAlice.inputProof)).wait();

    // Check she can see her vote
    await fheVoterContract.connect(signers.alice).getMyVote();

    // Restart election
    await fheVoterContract.connect(signers.deployer).closeVoting();
    await fheVoterContract.connect(signers.deployer).startVoting();

    // Now she shouldn't be able to see her vote because she hasn't voted in *this* election yet
    await expect(
        fheVoterContract.connect(signers.alice).getMyVote()
    ).to.be.revertedWith("You have not voted yet");
  });
});
