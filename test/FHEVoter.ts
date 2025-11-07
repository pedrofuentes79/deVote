import { FHEVoter, FHEVoter__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { encryptKeystoreJson } from "ethers";
import { ethers, fhevm } from "hardhat";

import { HardhatFhevmRuntimeEnvironment } from "@fhevm/hardhat-plugin";
import * as hre from "hardhat";



type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("FHEVoter")) as FHEVoter__factory;
  const fheVoterContract = (await factory.deploy()) as FHEVoter;
  const fheVoterContractAddress = await fheVoterContract.getAddress();

  return { fheVoterContract, fheVoterContractAddress };
}

async function requestDecryptionAndGetCount(
  fheVoterContract: FHEVoter, 
  deployer: HardhatEthersSigner
): Promise<bigint> {
  
  await fheVoterContract.connect(deployer).closeVoting();

  const tx = await fheVoterContract.connect(deployer).requestDecryption();
  await tx.wait();

  // Use the built-in `awaitDecryptionOracle` helper to wait for the FHEVM public decryption oracle
  // to complete all pending Solidity public decryption requests.
  await fhevm.awaitDecryptionOracle();

  const clearCount = await fheVoterContract.connect(deployer).getDecryptedCount();
  return clearCount;
}

describe("FHEVoter", function () {
    let signers: Signers;
    let fheVoterContract: FHEVoter;
    let fheVoterContractAddress: string;

    before(async function () {
        const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
        signers = { 
            deployer: ethSigners[0], 
            alice: ethSigners[1], 
            bob: ethSigners[2] 
        };
    });

    beforeEach(async () => {
        ({ fheVoterContract, fheVoterContractAddress } = await deployFixture());
    });

    it("should be deployed", async function () {
        console.log(`FHEVoter has been deployed at address ${fheVoterContractAddress}`);
        expect(ethers.isAddress(fheVoterContractAddress)).to.eq(true);
    });
  

    it("allows to vote with true and to decrypt user vote", async function () {
        const clearVoteValue = true;
        const encryptedVoteValue = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .addBool(clearVoteValue)
            .encrypt();

        const tx = await fheVoterContract.connect(signers.alice).vote(encryptedVoteValue.handles[0], encryptedVoteValue.inputProof);
        await tx.wait();

        // verify that my vote was "true"
        const myVoteEncrypted = await fheVoterContract.connect(signers.alice).getMyVote();
        const clearMyVote = await fhevm.userDecryptEbool(
            myVoteEncrypted,
            fheVoterContractAddress,
            signers.alice
        );
        expect(clearMyVote).to.eq(clearVoteValue);
    });
    it("allows to vote with false and to decrypt user vote", async function () {
        const clearVoteValue = false;
        const encryptedVoteValue = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .addBool(clearVoteValue)
            .encrypt();
            
        const tx = await fheVoterContract.connect(signers.alice).vote(encryptedVoteValue.handles[0], encryptedVoteValue.inputProof);
        await tx.wait();

        const myVoteEncrypted = await fheVoterContract.connect(signers.alice).getMyVote();
        const clearMyVote = await fhevm.userDecryptEbool(
            myVoteEncrypted,
            fheVoterContractAddress,
            signers.alice
        );
        expect(clearMyVote).to.eq(clearVoteValue);
    });

    it("allows to see the final count", async function () {
        const aliceClearVoteValue = true;
        const bobClearVoteValue = false;

        const aliceEncryptedVoteValue = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .addBool(aliceClearVoteValue)
            .encrypt();
            
        let tx = await fheVoterContract.connect(signers.alice).vote(aliceEncryptedVoteValue.handles[0], aliceEncryptedVoteValue.inputProof);
        await tx.wait();

        const bobEncryptedVoteValue = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.bob.address)
            .addBool(bobClearVoteValue)
            .encrypt();
            
        tx = await fheVoterContract.connect(signers.bob).vote(bobEncryptedVoteValue.handles[0], bobEncryptedVoteValue.inputProof);
        await tx.wait();

        const clearCount = await requestDecryptionAndGetCount(fheVoterContract, signers.deployer);

        expect(clearCount).to.eq(1);
    });

    it("does not allow non-owner (alice or bob) to request decryption", async function () {
        // Have Alice and Bob cast votes to set up a normal scenario
        const aliceVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .addBool(true)
            .encrypt();
        let tx = await fheVoterContract.connect(signers.alice).vote(aliceVote.handles[0], aliceVote.inputProof);
        await tx.wait();

        const bobVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.bob.address)
            .addBool(false)
            .encrypt();
        tx = await fheVoterContract.connect(signers.bob).vote(bobVote.handles[0], bobVote.inputProof);
        await tx.wait();

        // owner closes voting
        await fheVoterContract.connect(signers.deployer).closeVoting();

        // Alice tries to request decryption
        await expect(
            fheVoterContract.connect(signers.alice).requestDecryption()
        ).to.be.revertedWith("Only owner can call this function");

        // Bob tries to request decryption
        await expect(
            fheVoterContract.connect(signers.bob).requestDecryption()
        ).to.be.revertedWith("Only owner can call this function");
    });

    it("does not allow to vote when voting is closed", async function () {
        const aliceVote = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .addBool(true)
            .encrypt();

        // owner closes voting
        await fheVoterContract.connect(signers.deployer).closeVoting();

        await expect(
            fheVoterContract.connect(signers.alice).vote(aliceVote.handles[0], aliceVote.inputProof)
        ).to.be.revertedWith("Voting is not open");
    });
    
    it("allows to vote twice and only the last vote counts", async function () {
        const aliceClearFirstVote = true;

        const aliceEncryptedVoteValue = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .addBool(aliceClearFirstVote)
            .encrypt();
        let tx = await fheVoterContract.connect(signers.alice).vote(aliceEncryptedVoteValue.handles[0], aliceEncryptedVoteValue.inputProof);
        await tx.wait();

        const aliceClearSecondVote = false;
        const aliceEncryptedSecondVoteValue = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .addBool(aliceClearSecondVote)
            .encrypt();
        tx = await fheVoterContract.connect(signers.alice).vote(aliceEncryptedSecondVoteValue.handles[0], aliceEncryptedSecondVoteValue.inputProof);
        await tx.wait();

        const clearCount = await requestDecryptionAndGetCount(fheVoterContract, signers.deployer);

        expect(clearCount).to.eq(0);
    });

});