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
  

    it("allows to vote with true", async function () {
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
    it("allows to vote with false", async function () {
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

        tx = await fheVoterContract.requestDecryption()
        await tx.wait();

        // We use the FHEVM Hardhat plugin to simulate the asynchronous onchain
        // public decryption
        const fhevmEnvironment: HardhatFhevmRuntimeEnvironment = hre.fhevm;

        // Use the built-in `awaitDecryptionOracle` helper to wait for the FHEVM public decryption oracle
        // to complete all pending Solidity public decryption requests.
        await fhevmEnvironment.awaitDecryptionOracle();

        const clearCount = await fheVoterContract.connect(signers.deployer).getDecryptedCount();

        expect(clearCount).to.eq(1);

    });

});