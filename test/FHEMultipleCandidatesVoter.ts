import { FHEMultipleCandidatesVoter, FHEMultipleCandidatesVoter__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  charlie: HardhatEthersSigner;
};

async function deployFixture(candidateCount: number) {
  const factory = (await ethers.getContractFactory("FHEMultipleCandidatesVoter")) as FHEMultipleCandidatesVoter__factory;
  const fheVoterContract = (await factory.deploy(candidateCount)) as FHEMultipleCandidatesVoter;
  const fheVoterContractAddress = await fheVoterContract.getAddress();

  return { fheVoterContract, fheVoterContractAddress };
}

async function requestDecryptionAndGetCounts(
  fheVoterContract: FHEMultipleCandidatesVoter, 
  deployer: HardhatEthersSigner
): Promise<bigint[]> {
  
  await fheVoterContract.connect(deployer).closeVoting();

  const tx = await fheVoterContract.connect(deployer).requestDecryption();
  await tx.wait();

  await fhevm.awaitDecryptionOracle();

  const clearCounts = await fheVoterContract.connect(deployer).getAllDecryptedCounts();
  return clearCounts;
}

describe("FHEMultipleCandidatesVoter", function () {
    let signers: Signers;
    let fheVoterContract: FHEMultipleCandidatesVoter;
    let fheVoterContractAddress: string;

    before(async function () {
        const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
        signers = { 
            deployer: ethSigners[0], 
            alice: ethSigners[1], 
            bob: ethSigners[2],
            charlie: ethSigners[3]
        };
    });

    beforeEach(async () => {
        ({ fheVoterContract, fheVoterContractAddress } = await deployFixture(3));
    });

    it("should be deployed with correct candidate count", async function () {
        console.log(`FHEMultipleCandidatesVoter has been deployed at address ${fheVoterContractAddress}`);
        expect(ethers.isAddress(fheVoterContractAddress)).to.eq(true);
        
        const candidateCount = await fheVoterContract.candidateCount();
        expect(candidateCount).to.eq(3);
    });

    it("allows to vote for candidate 0 and decrypt user vote", async function () {
        const clearVoteValue = 0;
        const encryptedVoteValue = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .add32(clearVoteValue)
            .encrypt();

        const tx = await fheVoterContract.connect(signers.alice).vote(encryptedVoteValue.handles[0], encryptedVoteValue.inputProof);
        await tx.wait();

        const myVoteEncrypted = await fheVoterContract.connect(signers.alice).getMyVote();
        const clearMyVote = await fhevm.userDecryptEuint(
            FhevmType.euint32,
            myVoteEncrypted,
            fheVoterContractAddress,
            signers.alice
        );
        expect(clearMyVote).to.eq(clearVoteValue);
    });

    it("allows to vote for candidate 1 and decrypt user vote", async function () {
        const clearVoteValue = 1;
        const encryptedVoteValue = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .add32(clearVoteValue)
            .encrypt();

        const tx = await fheVoterContract.connect(signers.alice).vote(encryptedVoteValue.handles[0], encryptedVoteValue.inputProof);
        await tx.wait();

        const myVoteEncrypted = await fheVoterContract.connect(signers.alice).getMyVote();
        const clearMyVote = await fhevm.userDecryptEuint(
            FhevmType.euint32,
            myVoteEncrypted,
            fheVoterContractAddress,
            signers.alice
        );
        expect(clearMyVote).to.eq(clearVoteValue);
    });

    it("allows to vote for candidate 2 and decrypt user vote", async function () {
        const clearVoteValue = 2;
        const encryptedVoteValue = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .add32(clearVoteValue)
            .encrypt();

        const tx = await fheVoterContract.connect(signers.alice).vote(encryptedVoteValue.handles[0], encryptedVoteValue.inputProof);
        await tx.wait();

        const myVoteEncrypted = await fheVoterContract.connect(signers.alice).getMyVote();
        const clearMyVote = await fhevm.userDecryptEuint(
            FhevmType.euint32,
            myVoteEncrypted,
            fheVoterContractAddress,
            signers.alice
        );
        expect(clearMyVote).to.eq(clearVoteValue);
    });

    it("correctly counts votes for multiple candidates", async function () {
        const aliceVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .add32(0)
            .encrypt();
        let tx = await fheVoterContract.connect(signers.alice).vote(aliceVote.handles[0], aliceVote.inputProof);
        await tx.wait();

        const bobVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.bob.address)
            .add32(1)
            .encrypt();
        tx = await fheVoterContract.connect(signers.bob).vote(bobVote.handles[0], bobVote.inputProof);
        await tx.wait();

        const charlieVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.charlie.address)
            .add32(0)
            .encrypt();
        tx = await fheVoterContract.connect(signers.charlie).vote(charlieVote.handles[0], charlieVote.inputProof);
        await tx.wait();

        const clearCounts = await requestDecryptionAndGetCounts(fheVoterContract, signers.deployer);

        expect(clearCounts[0]).to.eq(2);
        expect(clearCounts[1]).to.eq(1);
        expect(clearCounts[2]).to.eq(0);
    });

    it("allows to change vote and only the last vote counts", async function () {
        const aliceFirstVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .add32(0)
            .encrypt();
        let tx = await fheVoterContract.connect(signers.alice).vote(aliceFirstVote.handles[0], aliceFirstVote.inputProof);
        await tx.wait();

        const aliceSecondVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .add32(2)
            .encrypt();
        tx = await fheVoterContract.connect(signers.alice).vote(aliceSecondVote.handles[0], aliceSecondVote.inputProof);
        await tx.wait();

        const clearCounts = await requestDecryptionAndGetCounts(fheVoterContract, signers.deployer);

        expect(clearCounts[0]).to.eq(0);
        expect(clearCounts[1]).to.eq(0);
        expect(clearCounts[2]).to.eq(1);
    });

    it("allows multiple vote changes and correctly updates counts", async function () {
        const aliceVote1 = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .add32(0)
            .encrypt();
        let tx = await fheVoterContract.connect(signers.alice).vote(aliceVote1.handles[0], aliceVote1.inputProof);
        await tx.wait();

        const aliceVote2 = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .add32(1)
            .encrypt();
        tx = await fheVoterContract.connect(signers.alice).vote(aliceVote2.handles[0], aliceVote2.inputProof);
        await tx.wait();

        const aliceVote3 = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .add32(2)
            .encrypt();
        tx = await fheVoterContract.connect(signers.alice).vote(aliceVote3.handles[0], aliceVote3.inputProof);
        await tx.wait();

        const bobVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.bob.address)
            .add32(1)
            .encrypt();
        tx = await fheVoterContract.connect(signers.bob).vote(bobVote.handles[0], bobVote.inputProof);
        await tx.wait();

        const clearCounts = await requestDecryptionAndGetCounts(fheVoterContract, signers.deployer);

        expect(clearCounts[0]).to.eq(0);
        expect(clearCounts[1]).to.eq(1);
        expect(clearCounts[2]).to.eq(1);
    });

    it("does not allow non-owner to request decryption", async function () {
        const aliceVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .add32(0)
            .encrypt();
        let tx = await fheVoterContract.connect(signers.alice).vote(aliceVote.handles[0], aliceVote.inputProof);
        await tx.wait();

        await fheVoterContract.connect(signers.deployer).closeVoting();

        await expect(
            fheVoterContract.connect(signers.alice).requestDecryption()
        ).to.be.revertedWith("Only owner can call this function");

        await expect(
            fheVoterContract.connect(signers.bob).requestDecryption()
        ).to.be.revertedWith("Only owner can call this function");
    });

    it("does not allow voting when voting is closed", async function () {
        const aliceVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .add32(0)
            .encrypt();

        await fheVoterContract.connect(signers.deployer).closeVoting();

        await expect(
            fheVoterContract.connect(signers.alice).vote(aliceVote.handles[0], aliceVote.inputProof)
        ).to.be.revertedWith("Voting is not open");
    });

    it("allows getting individual candidate counts after voting closes", async function () {
        const aliceVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .add32(0)
            .encrypt();
        let tx = await fheVoterContract.connect(signers.alice).vote(aliceVote.handles[0], aliceVote.inputProof);
        await tx.wait();

        const bobVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.bob.address)
            .add32(1)
            .encrypt();
        tx = await fheVoterContract.connect(signers.bob).vote(bobVote.handles[0], bobVote.inputProof);
        await tx.wait();

        await fheVoterContract.connect(signers.deployer).closeVoting();
        tx = await fheVoterContract.connect(signers.deployer).requestDecryption();
        await tx.wait();
        await fhevm.awaitDecryptionOracle();

        const candidate0Count = await fheVoterContract.getDecryptedCount(0);
        const candidate1Count = await fheVoterContract.getDecryptedCount(1);
        const candidate2Count = await fheVoterContract.getDecryptedCount(2);

        expect(candidate0Count).to.eq(1);
        expect(candidate1Count).to.eq(1);
        expect(candidate2Count).to.eq(0);
    });

    it("handles all voters voting for the same candidate", async function () {
        const aliceVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .add32(1)
            .encrypt();
        let tx = await fheVoterContract.connect(signers.alice).vote(aliceVote.handles[0], aliceVote.inputProof);
        await tx.wait();

        const bobVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.bob.address)
            .add32(1)
            .encrypt();
        tx = await fheVoterContract.connect(signers.bob).vote(bobVote.handles[0], bobVote.inputProof);
        await tx.wait();

        const charlieVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.charlie.address)
            .add32(1)
            .encrypt();
        tx = await fheVoterContract.connect(signers.charlie).vote(charlieVote.handles[0], charlieVote.inputProof);
        await tx.wait();

        const clearCounts = await requestDecryptionAndGetCounts(fheVoterContract, signers.deployer);

        expect(clearCounts[0]).to.eq(0);
        expect(clearCounts[1]).to.eq(3);
        expect(clearCounts[2]).to.eq(0);
    });

    it("reverts when trying to get vote of non-voter", async function () {
        await expect(
            fheVoterContract.connect(signers.alice).getMyVote()
        ).to.be.revertedWith("You have not voted yet");
    });

    it("works with different number of candidates", async function () {
        const { fheVoterContract: contract5, fheVoterContractAddress: address5 } = await deployFixture(5);

        const aliceVote = await fhevm
            .createEncryptedInput(address5, signers.alice.address)
            .add32(3)
            .encrypt();
        let tx = await contract5.connect(signers.alice).vote(aliceVote.handles[0], aliceVote.inputProof);
        await tx.wait();

        const bobVote = await fhevm
            .createEncryptedInput(address5, signers.bob.address)
            .add32(4)
            .encrypt();
        tx = await contract5.connect(signers.bob).vote(bobVote.handles[0], bobVote.inputProof);
        await tx.wait();

        await contract5.connect(signers.deployer).closeVoting();
        tx = await contract5.connect(signers.deployer).requestDecryption();
        await tx.wait();
        await fhevm.awaitDecryptionOracle();

        const allCounts = await contract5.getAllDecryptedCounts();
        
        expect(allCounts.length).to.eq(5);
        expect(allCounts[0]).to.eq(0);
        expect(allCounts[1]).to.eq(0);
        expect(allCounts[2]).to.eq(0);
        expect(allCounts[3]).to.eq(1);
        expect(allCounts[4]).to.eq(1);
    });
});

